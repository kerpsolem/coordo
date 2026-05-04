"""Tests for the IFSI Coordination refactor (iter3).
Covers:
- /api/fiches-projet/a-programmer returns NEW fields (formateur_ids, semaine_souhaitee,
  methodologie, objectifs, remarques, obligatoire, taille_groupe, type_activite_id).
- POST /api/fiches-projet accepts new schema.
- POST /api/fiches-projet/{fiche_id}/activites/{activite_id}/link-session removes
  the activity from a-programmer.
- DELETE /api/sessions/{id} regression.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://pedagog-planner.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def admin_headers():
    r = requests.post(f"{API}/auth/login", json={"email": "admin@ifsi.fr", "password": "Admin123!"})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    token = r.json()["token"]
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture
def fiche_with_new_fields(admin_headers):
    payload = {
        "titre": "TEST_RefactorFiche",
        "semestre": "S1",
        "ue_id": "ue-test-refactor",
        "promotion_id": "promo-test-refactor",
        "activites": [
            {
                "nom": "TEST_ActFull",
                "heures": 3,
                "ordre": 1,
                "type_activite_id": "td",
                "obligatoire": True,
                "semaine_souhaitee": "S38",
                "taille_groupe": "groupe_td",
                "formateur_ids": ["f-1", "f-2"],
                "methodologie": "Apprentissage par projet",
                "objectifs": "Comprendre la coordination",
                "remarques": "Salle TP demandee",
            },
            {
                "nom": "TEST_ActMinimal",
                "heures": 1,
                "ordre": 2,
            },
        ],
    }
    r = requests.post(f"{API}/fiches-projet", json=payload, headers=admin_headers)
    assert r.status_code == 200, r.text
    fiche = r.json()
    yield fiche
    # cleanup
    try:
        requests.delete(f"{API}/fiches-projet/{fiche['id']}", headers=admin_headers)
    except Exception:
        pass


# ---------- 1. POST /api/fiches-projet with new fields ----------
class TestCreateFicheNewSchema:
    def test_create_persists_new_fields(self, admin_headers, fiche_with_new_fields):
        f = fiche_with_new_fields
        assert f["titre"] == "TEST_RefactorFiche"
        # Activities have ids generated
        assert len(f["activites"]) == 2
        for a in f["activites"]:
            assert a.get("id")
        # Full activity has the new fields persisted
        full = next(a for a in f["activites"] if a["nom"] == "TEST_ActFull")
        assert full["type_activite_id"] == "td"
        assert full["obligatoire"] is True
        assert full["semaine_souhaitee"] == "S38"
        assert full["taille_groupe"] == "groupe_td"
        assert full["formateur_ids"] == ["f-1", "f-2"]
        assert full["methodologie"] == "Apprentissage par projet"
        assert full["objectifs"] == "Comprendre la coordination"
        assert full["remarques"] == "Salle TP demandee"

    def test_get_fiche_returns_new_fields(self, admin_headers, fiche_with_new_fields):
        # GET to verify persistence (data assertion rule)
        r = requests.get(f"{API}/fiches-projet", headers=admin_headers,
                         params={"promotion_id": "promo-test-refactor"})
        assert r.status_code == 200
        items = r.json()
        match = next((x for x in items if x["id"] == fiche_with_new_fields["id"]), None)
        assert match is not None
        full = next(a for a in match["activites"] if a["nom"] == "TEST_ActFull")
        assert full["formateur_ids"] == ["f-1", "f-2"]
        assert full["methodologie"] == "Apprentissage par projet"


# ---------- 2. /api/fiches-projet/a-programmer returns new fields ----------
class TestAProgrammerNewFields:
    def test_a_programmer_includes_new_fields(self, admin_headers, fiche_with_new_fields):
        r = requests.get(f"{API}/fiches-projet/a-programmer", headers=admin_headers)
        assert r.status_code == 200
        items = r.json()
        # Find the entry for our fiche / "TEST_ActFull"
        target = next(
            (i for i in items
             if i["fiche_id"] == fiche_with_new_fields["id"] and i["nom"] == "TEST_ActFull"),
            None,
        )
        assert target is not None, f"TEST_ActFull not found in a-programmer items"

        # Validate ALL expected new fields are returned by the endpoint
        expected_keys = [
            "fiche_id", "ue_id", "semestre", "promotion_id", "activite_id",
            "nom", "heures", "taille_groupe", "ordre",
            "type_activite_id", "obligatoire", "semaine_souhaitee",
            "formateur_ids", "methodologie", "objectifs", "remarques",
        ]
        for k in expected_keys:
            assert k in target, f"Missing key '{k}' in a-programmer payload"

        # Validate values
        assert target["type_activite_id"] == "td"
        assert target["obligatoire"] is True
        assert target["semaine_souhaitee"] == "S38"
        assert target["taille_groupe"] == "groupe_td"
        assert target["formateur_ids"] == ["f-1", "f-2"]
        assert target["methodologie"] == "Apprentissage par projet"
        assert target["objectifs"] == "Comprendre la coordination"
        assert target["remarques"] == "Salle TP demandee"

    def test_a_programmer_defaults_for_minimal_activity(self, admin_headers, fiche_with_new_fields):
        r = requests.get(f"{API}/fiches-projet/a-programmer", headers=admin_headers)
        assert r.status_code == 200
        target = next(
            (i for i in r.json()
             if i["fiche_id"] == fiche_with_new_fields["id"] and i["nom"] == "TEST_ActMinimal"),
            None,
        )
        assert target is not None
        # Defaults
        assert target["formateur_ids"] == []
        assert target["methodologie"] == ""
        assert target["objectifs"] == ""
        assert target["remarques"] == ""
        assert target["semaine_souhaitee"] == ""
        assert target["obligatoire"] is True


# ---------- 3. link-session removes from a-programmer ----------
class TestLinkSessionFlow:
    def test_link_session_removes_from_a_programmer(self, admin_headers, fiche_with_new_fields):
        fid = fiche_with_new_fields["id"]
        full_act = next(a for a in fiche_with_new_fields["activites"] if a["nom"] == "TEST_ActFull")
        aid = full_act["id"]

        # Sanity: present before linking
        r = requests.get(f"{API}/fiches-projet/a-programmer", headers=admin_headers)
        assert any(i["activite_id"] == aid for i in r.json())

        # Link
        r = requests.post(
            f"{API}/fiches-projet/{fid}/activites/{aid}/link-session",
            json={"session_id": "TEST_session_link_id"},
            headers=admin_headers,
        )
        assert r.status_code == 200, r.text

        # Should disappear from a-programmer
        r = requests.get(f"{API}/fiches-projet/a-programmer", headers=admin_headers)
        items = r.json()
        assert not any(i["activite_id"] == aid for i in items), \
            "Linked activity still present in a-programmer"
        # The other (minimal) activity should still be there
        assert any(i["fiche_id"] == fid and i["nom"] == "TEST_ActMinimal" for i in items)


# ---------- 4. DELETE /api/sessions/{id} regression ----------
class TestSessionDeleteRegression:
    def test_create_then_delete_session(self, admin_headers):
        promos = requests.get(f"{API}/promotions").json()
        promo_id = promos[0]["id"] if promos else None

        payload = {
            "intitule": "TEST_RegressionSession",
            "date": "2026-04-13",
            "heure_debut": "09:00",
            "heure_fin": "12:00",
            "duree": 3,
            "promotion_id": promo_id,
            "semestre": "S1",
        }
        r = requests.post(f"{API}/sessions", json=payload, headers=admin_headers)
        assert r.status_code == 200, r.text
        sid = r.json()["id"]

        # GET to verify creation (no GET-by-id endpoint for sessions, so list-filter)
        all_sessions = requests.get(f"{API}/sessions", headers=admin_headers).json()
        assert any(s["id"] == sid for s in all_sessions)

        # DELETE
        r = requests.delete(f"{API}/sessions/{sid}", headers=admin_headers)
        assert r.status_code in (200, 204), r.text

        # Verify removed
        all_sessions = requests.get(f"{API}/sessions", headers=admin_headers).json()
        assert not any(s["id"] == sid for s in all_sessions)
