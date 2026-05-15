"""Iter6 backend tests:
 - GET /api/recap-ue with formateur-time formula heures × max(1, nb_formateurs) × nb_groupes
 - POST /api/fiches-projet/import-sessions auto-fills semaine_souhaitee (SXX ISO week),
   nb_formateurs (len(formateur_ids) or None), formateur_ids, group_ids=[group_id]
 - Activity schema accepts nb_formateurs / group_ids (persistence via POST + GET fiche)
"""
import os
import uuid
from datetime import date, datetime

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": "admin@ifsi.fr", "password": "Admin123!"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def refs(headers):
    out = {}
    coll_to_route = {
        "promotions": "promotions",
        "ues": "ues",
        "activity_types": "activity-types",
        "formateurs": "formateurs",
        "groups": "groups",
    }
    for key, route in coll_to_route.items():
        r = requests.get(f"{API}/{route}", headers=headers)
        assert r.status_code == 200, f"{route}: {r.text}"
        out[key] = r.json()
    if not out["promotions"] or not out["ues"] or not out["activity_types"]:
        pytest.skip("Seed data missing")
    return out


# ---------- helpers ----------
def _make_fiche_payload(refs, activites):
    return {
        "nom": f"TEST_iter6_fiche_{uuid.uuid4().hex[:6]}",
        "ue_id": refs["ues"][0]["id"],
        "promotion_id": refs["promotions"][0]["id"],
        "semestre": "S1",
        "activites": activites,
    }


def _create_fiche(headers, payload):
    r = requests.post(f"{API}/fiches-projet", headers=headers, json=payload)
    assert r.status_code == 200, r.text
    return r.json()


def _delete_fiche(headers, fid):
    try:
        requests.delete(f"{API}/fiches-projet/{fid}", headers=headers, timeout=5)
    except Exception:
        pass


# ============================================================
# Test 1 — Activity schema persists nb_formateurs + group_ids
# ============================================================
class TestActivitySchemaIter6:
    def test_persist_nb_formateurs_and_group_ids(self, headers, refs):
        ue_id = refs["ues"][0]["id"]
        promo_id = refs["promotions"][0]["id"]
        type_id = refs["activity_types"][0]["id"]
        gids = [g["id"] for g in refs["groups"][:2]] if len(refs["groups"]) >= 2 else []
        activites = [{
            "id": str(uuid.uuid4()),
            "nom": "TEST_iter6_act_schema",
            "heures": 2,
            "promotion_id": promo_id,
            "taille_groupe": "1/4 promo",
            "type_activite_id": type_id,
            "nb_formateurs": 3,
            "group_ids": gids,
        }]
        payload = _make_fiche_payload(refs, activites)
        created = _create_fiche(headers, payload)
        fid = created["id"]
        try:
            # GET via list
            r = requests.get(f"{API}/fiches-projet", headers=headers)
            assert r.status_code == 200
            found = next((f for f in r.json() if f["id"] == fid), None)
            assert found, "Fiche not found in list"
            assert len(found["activites"]) == 1
            act = found["activites"][0]
            assert act["nb_formateurs"] == 3
            assert act["group_ids"] == gids
            assert act["taille_groupe"] == "1/4 promo"
        finally:
            _delete_fiche(headers, fid)


# ============================================================
# Test 2 — GET /api/recap-ue formula: 3 representative cases
# ============================================================
class TestRecapUEFormula:
    """Cases:
       (a) 1 formateur / 1h / promo entière  -> tf = 1
       (b) 1 formateur / 1h / 1/8           -> tf = 8
       (c) 2 formateurs / 2h / 1/4          -> tf = 16
    """

    def _build_fiche_with_three_acts(self, refs):
        promo_id = refs["promotions"][0]["id"]
        type_id = refs["activity_types"][0]["id"]
        return {
            "nom": f"TEST_iter6_recap_{uuid.uuid4().hex[:6]}",
            "ue_id": refs["ues"][0]["id"],
            "promotion_id": promo_id,
            "semestre": "S1",
            "activites": [
                {  # case (a)
                    "id": str(uuid.uuid4()),
                    "nom": "TEST_iter6_case_a",
                    "heures": 1,
                    "promotion_id": promo_id,
                    "taille_groupe": "Promo entière",
                    "type_activite_id": type_id,
                    "nb_formateurs": 1,
                },
                {  # case (b)
                    "id": str(uuid.uuid4()),
                    "nom": "TEST_iter6_case_b",
                    "heures": 1,
                    "promotion_id": promo_id,
                    "taille_groupe": "1/8",
                    "type_activite_id": type_id,
                    "nb_formateurs": 1,
                },
                {  # case (c)
                    "id": str(uuid.uuid4()),
                    "nom": "TEST_iter6_case_c",
                    "heures": 2,
                    "promotion_id": promo_id,
                    "taille_groupe": "1/4 promo",
                    "type_activite_id": type_id,
                    "nb_formateurs": 2,
                },
            ],
        }

    def test_recap_ue_three_cases(self, headers, refs):
        payload = self._build_fiche_with_three_acts(refs)
        created = _create_fiche(headers, payload)
        fid = created["id"]
        try:
            r = requests.get(
                f"{API}/recap-ue",
                params={"promotion_id": refs["promotions"][0]["id"], "semestre": "S1"},
                headers=headers,
            )
            assert r.status_code == 200, r.text
            data = r.json()
            assert "rows" in data and "total_heures" in data and "total_temps_formateur" in data
            # Find our UE row
            ue_id = refs["ues"][0]["id"]
            row = next((x for x in data["rows"] if x["ue_id"] == ue_id), None)
            assert row, "Our UE row not present"
            # The row aggregates all sessions+fiches for that UE — focus on details from our fiche
            our_details = [
                d for d in row["details"]
                if d.get("source") == "fiche"
                and (d.get("nom", "") or "").startswith("TEST_iter6_case_")
            ]
            assert len(our_details) == 3, f"expected 3 our acts, got {len(our_details)}"
            by_name = {d["nom"]: d for d in our_details}

            a = by_name["TEST_iter6_case_a"]
            assert a["heures"] == 1 and a["nb_formateurs"] == 1 and a["nb_groupes"] == 1
            assert a["temps_formateur"] == 1, f"case a: expected 1, got {a['temps_formateur']}"

            b = by_name["TEST_iter6_case_b"]
            assert b["heures"] == 1 and b["nb_formateurs"] == 1 and b["nb_groupes"] == 8
            assert b["temps_formateur"] == 8, f"case b: expected 8, got {b['temps_formateur']}"

            c = by_name["TEST_iter6_case_c"]
            assert c["heures"] == 2 and c["nb_formateurs"] == 2 and c["nb_groupes"] == 4
            assert c["temps_formateur"] == 16, f"case c: expected 16, got {c['temps_formateur']}"
        finally:
            _delete_fiche(headers, fid)

    def test_recap_ue_group_ids_overrides_taille(self, headers, refs):
        """When group_ids is set, nb_groupes = len(group_ids) overrides taille_groupe."""
        if len(refs["groups"]) < 3:
            pytest.skip("Need at least 3 groups in seed")
        promo_id = refs["promotions"][0]["id"]
        type_id = refs["activity_types"][0]["id"]
        gids = [g["id"] for g in refs["groups"][:3]]
        payload = {
            "nom": f"TEST_iter6_override_{uuid.uuid4().hex[:6]}",
            "ue_id": refs["ues"][0]["id"],
            "promotion_id": promo_id,
            "semestre": "S1",
            "activites": [{
                "id": str(uuid.uuid4()),
                "nom": "TEST_iter6_override_act",
                "heures": 1,
                "promotion_id": promo_id,
                "taille_groupe": "Promo entière",  # would normally give 1
                "type_activite_id": type_id,
                "nb_formateurs": 1,
                "group_ids": gids,  # override -> 3
            }],
        }
        created = _create_fiche(headers, payload)
        fid = created["id"]
        try:
            r = requests.get(f"{API}/recap-ue", headers=headers)
            assert r.status_code == 200
            row = next((x for x in r.json()["rows"] if x["ue_id"] == refs["ues"][0]["id"]), None)
            assert row
            d = next((x for x in row["details"] if x.get("nom") == "TEST_iter6_override_act"), None)
            assert d, "override activity not in details"
            assert d["nb_groupes"] == 3, f"expected 3 (len(group_ids)), got {d['nb_groupes']}"
            assert d["temps_formateur"] == 3
        finally:
            _delete_fiche(headers, fid)

    def test_recap_ue_response_shape(self, headers):
        r = requests.get(f"{API}/recap-ue", headers=headers)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data.get("rows"), list)
        assert "total_heures" in data
        assert "total_temps_formateur" in data
        if data["rows"]:
            row = data["rows"][0]
            for k in ("ue_id", "ue_code", "ue_intitule", "domain_nom",
                      "total_heures", "total_temps_formateur",
                      "par_type", "par_type_tf", "details"):
                assert k in row, f"missing key {k} in row"


# ============================================================
# Test 3 — POST /api/fiches-projet/import-sessions enriched
# ============================================================
class TestImportSessionsEnriched:
    def test_import_session_fills_semaine_nb_formateurs_groupids(self, headers, refs):
        # 1) Create a fresh session with known date, formateurs, group_id, ue
        promo_id = refs["promotions"][0]["id"]
        ue_id = refs["ues"][0]["id"]
        type_id = refs["activity_types"][0]["id"]
        formateurs = refs["formateurs"]
        groups = refs["groups"]
        if not formateurs or not groups:
            pytest.skip("Need formateurs and groups in seed")
        # Pick a date easy to verify ISO week: 2026-01-12 -> ISO week 3 (Mon)
        target_date = "2026-01-12"
        expected_iso_week = date(2026, 1, 12).isocalendar()[1]
        formateur_ids = [formateurs[0]["id"]]
        if len(formateurs) > 1:
            formateur_ids.append(formateurs[1]["id"])
        group_id = groups[0]["id"]

        s_payload = {
            "date": target_date,
            "intitule": f"TEST_iter6_sess_{uuid.uuid4().hex[:6]}",
            "duree": 2,
            "heure_debut": "08:00",
            "heure_fin": "10:00",
            "promotion_id": promo_id,
            "ue_id": ue_id,
            "type_activite_id": type_id,
            "semestre": "S1",
            "formateur_ids": formateur_ids,
            "group_id": group_id,
        }
        rs = requests.post(f"{API}/sessions", headers=headers, json=s_payload)
        assert rs.status_code == 200, rs.text
        sess = rs.json()
        session_id = sess["id"]

        try:
            # 2) Call import-sessions
            ri = requests.post(f"{API}/fiches-projet/import-sessions", headers=headers)
            assert ri.status_code == 200, ri.text

            # 3) Fetch fiches and find the activity linked to this session
            rf = requests.get(f"{API}/fiches-projet", headers=headers)
            assert rf.status_code == 200
            fiches = rf.json()
            matching = []
            for f in fiches:
                for a in f.get("activites", []):
                    if a.get("session_id") == session_id:
                        matching.append((f, a))
            assert len(matching) == 1, f"expected 1 imported activity, got {len(matching)}"
            f, a = matching[0]

            # Validate enrichment
            assert a.get("semaine_souhaitee") == f"S{expected_iso_week}", a
            assert a.get("nb_formateurs") == len(formateur_ids), a
            assert a.get("formateur_ids") == formateur_ids, a
            assert a.get("group_ids") == [group_id], a
        finally:
            # Cleanup: delete session, then auto-cleanup any newly created fiche (auto_imported)
            try:
                requests.delete(f"{API}/sessions/{session_id}", headers=headers, timeout=5)
            except Exception:
                pass
            # Remove the activity we just inserted to keep DB clean
            try:
                rf = requests.get(f"{API}/fiches-projet", headers=headers)
                for f in rf.json():
                    new_acts = [a for a in f.get("activites", []) if a.get("session_id") != session_id]
                    if len(new_acts) != len(f.get("activites", [])):
                        if f.get("auto_imported") and not new_acts:
                            requests.delete(f"{API}/fiches-projet/{f['id']}", headers=headers, timeout=5)
                        else:
                            payload = {**f, "activites": new_acts}
                            payload.pop("id", None); payload.pop("_id", None)
                            requests.put(f"{API}/fiches-projet/{f['id']}", headers=headers, json=payload, timeout=5)
            except Exception:
                pass

    def test_import_session_no_formateur_yields_null_nbform(self, headers, refs):
        promo_id = refs["promotions"][0]["id"]
        ue_id = refs["ues"][0]["id"]
        type_id = refs["activity_types"][0]["id"]
        target_date = "2026-02-09"  # ISO week 7
        expected_week = date(2026, 2, 9).isocalendar()[1]
        s_payload = {
            "date": target_date,
            "intitule": f"TEST_iter6_sess2_{uuid.uuid4().hex[:6]}",
            "duree": 1,
            "heure_debut": "08:00",
            "heure_fin": "09:00",
            "promotion_id": promo_id,
            "ue_id": ue_id,
            "type_activite_id": type_id,
            "semestre": "S1",
            "formateur_ids": [],
        }
        rs = requests.post(f"{API}/sessions", headers=headers, json=s_payload)
        assert rs.status_code == 200, rs.text
        session_id = rs.json()["id"]
        try:
            ri = requests.post(f"{API}/fiches-projet/import-sessions", headers=headers)
            assert ri.status_code == 200
            rf = requests.get(f"{API}/fiches-projet", headers=headers)
            assert rf.status_code == 200
            found = None
            for f in rf.json():
                for a in f.get("activites", []):
                    if a.get("session_id") == session_id:
                        found = a
                        break
            assert found is not None, "imported activity not found"
            assert found.get("semaine_souhaitee") == f"S{expected_week}"
            # nb_formateurs should be None (len([]) or None -> None)
            assert found.get("nb_formateurs") in (None, 0), f"expected None/0, got {found.get('nb_formateurs')}"
            assert found.get("group_ids") in ([], None)
        finally:
            try:
                requests.delete(f"{API}/sessions/{session_id}", headers=headers, timeout=5)
            except Exception:
                pass
            try:
                rf = requests.get(f"{API}/fiches-projet", headers=headers)
                for f in rf.json():
                    new_acts = [a for a in f.get("activites", []) if a.get("session_id") != session_id]
                    if len(new_acts) != len(f.get("activites", [])):
                        if f.get("auto_imported") and not new_acts:
                            requests.delete(f"{API}/fiches-projet/{f['id']}", headers=headers, timeout=5)
                        else:
                            payload = {**f, "activites": new_acts}
                            payload.pop("id", None); payload.pop("_id", None)
                            requests.put(f"{API}/fiches-projet/{f['id']}", headers=headers, json=payload, timeout=5)
            except Exception:
                pass
