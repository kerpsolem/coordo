"""Iter7 backend tests:
- POST /api/sessions accepts optional field `group_ids` (list) and persists it
- POST /api/sessions still accepts legacy `group_id` (singular) for backward compat
- GET /api/sessions returns group_ids as stored
- GET /api/recap-ue uses len(group_ids) for nb_groupes (multi-group sessions)
"""
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


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
    routes = {"promotions": "promotions", "ues": "ues",
              "activity_types": "activity-types", "formateurs": "formateurs",
              "groups": "groups"}
    for key, route in routes.items():
        r = requests.get(f"{API}/{route}", headers=headers)
        assert r.status_code == 200, f"{route}: {r.text}"
        out[key] = r.json()
    if not out["promotions"] or not out["ues"] or not out["activity_types"] or not out["groups"]:
        pytest.skip("Seed data missing")
    return out


def _cleanup_session(headers, sid):
    try:
        requests.delete(f"{API}/sessions/{sid}", headers=headers, timeout=5)
    except Exception:
        pass


class TestSessionGroupIdsCRUD:
    def test_create_with_group_ids_persists(self, headers, refs):
        promo_id = refs["promotions"][0]["id"]
        type_id = refs["activity_types"][0]["id"]
        ue_id = refs["ues"][0]["id"]
        gids = [g["id"] for g in refs["groups"][:2]]
        assert len(gids) == 2, "Need at least 2 groups for test"
        payload = {
            "date": "2026-03-09",
            "intitule": f"TEST_iter7_sess_{uuid.uuid4().hex[:6]}",
            "heure_debut": "08:00",
            "heure_fin": "10:00",
            "promotion_id": promo_id,
            "ue_id": ue_id,
            "type_activite_id": type_id,
            "semestre": "S1",
            "group_ids": gids,
        }
        r = requests.post(f"{API}/sessions", headers=headers, json=payload)
        assert r.status_code == 200, r.text
        created = r.json()
        sid = created["id"]
        try:
            assert created.get("group_ids") == gids, f"created.group_ids={created.get('group_ids')}"
            # GET via list and verify persistence
            rl = requests.get(f"{API}/sessions", headers=headers)
            assert rl.status_code == 200
            found = next((s for s in rl.json() if s["id"] == sid), None)
            assert found is not None, "session not in list"
            assert found.get("group_ids") == gids
            assert found.get("intitule") == payload["intitule"]
        finally:
            _cleanup_session(headers, sid)

    def test_create_with_legacy_group_id_only(self, headers, refs):
        """Backward compat: session created with only group_id (singular) still works."""
        promo_id = refs["promotions"][0]["id"]
        type_id = refs["activity_types"][0]["id"]
        ue_id = refs["ues"][0]["id"]
        gid = refs["groups"][0]["id"]
        payload = {
            "date": "2026-03-10",
            "intitule": f"TEST_iter7_legacy_{uuid.uuid4().hex[:6]}",
            "heure_debut": "08:00",
            "heure_fin": "10:00",
            "promotion_id": promo_id,
            "ue_id": ue_id,
            "type_activite_id": type_id,
            "semestre": "S1",
            "group_id": gid,
        }
        r = requests.post(f"{API}/sessions", headers=headers, json=payload)
        assert r.status_code == 200, r.text
        created = r.json()
        sid = created["id"]
        try:
            assert created.get("group_id") == gid
            rl = requests.get(f"{API}/sessions", headers=headers)
            found = next((s for s in rl.json() if s["id"] == sid), None)
            assert found is not None
            assert found.get("group_id") == gid
        finally:
            _cleanup_session(headers, sid)

    def test_create_without_groups_promo_entiere(self, headers, refs):
        """Session can be created without any group (Promo entière)."""
        promo_id = refs["promotions"][0]["id"]
        type_id = refs["activity_types"][0]["id"]
        ue_id = refs["ues"][0]["id"]
        payload = {
            "date": "2026-03-11",
            "intitule": f"TEST_iter7_promo_{uuid.uuid4().hex[:6]}",
            "heure_debut": "08:00",
            "heure_fin": "10:00",
            "promotion_id": promo_id,
            "ue_id": ue_id,
            "type_activite_id": type_id,
            "semestre": "S1",
        }
        r = requests.post(f"{API}/sessions", headers=headers, json=payload)
        assert r.status_code == 200, r.text
        sid = r.json()["id"]
        try:
            data = r.json()
            assert data.get("group_ids") in (None, [])
            assert data.get("group_id") in (None, "")
        finally:
            _cleanup_session(headers, sid)

    def test_update_session_group_ids(self, headers, refs):
        """PUT session updates group_ids."""
        promo_id = refs["promotions"][0]["id"]
        type_id = refs["activity_types"][0]["id"]
        ue_id = refs["ues"][0]["id"]
        gids2 = [g["id"] for g in refs["groups"][:2]]
        payload = {
            "date": "2026-03-12", "intitule": f"TEST_iter7_upd_{uuid.uuid4().hex[:6]}",
            "heure_debut": "08:00", "heure_fin": "10:00",
            "promotion_id": promo_id, "ue_id": ue_id,
            "type_activite_id": type_id, "semestre": "S1",
            "group_ids": [gids2[0]],
        }
        r = requests.post(f"{API}/sessions", headers=headers, json=payload)
        assert r.status_code == 200
        sid = r.json()["id"]
        try:
            payload["group_ids"] = gids2  # now 2
            ru = requests.put(f"{API}/sessions/{sid}", headers=headers, json=payload)
            assert ru.status_code == 200, ru.text
            assert ru.json().get("group_ids") == gids2
            rl = requests.get(f"{API}/sessions", headers=headers)
            found = next((s for s in rl.json() if s["id"] == sid), None)
            assert found and found.get("group_ids") == gids2
        finally:
            _cleanup_session(headers, sid)


class TestRecapUESessionGroupIds:
    def test_recap_ue_counts_session_group_ids(self, headers, refs):
        """A session with group_ids=[g1, g2] should give nb_groupes=2 in recap-ue."""
        promo_id = refs["promotions"][0]["id"]
        type_id = refs["activity_types"][0]["id"]
        ue_id = refs["ues"][0]["id"]
        gids = [g["id"] for g in refs["groups"][:2]]
        intitule = f"TEST_iter7_recap_{uuid.uuid4().hex[:6]}"
        payload = {
            "date": "2026-03-13",
            "intitule": intitule,
            "heure_debut": "08:00",
            "heure_fin": "10:00",  # 2h
            "promotion_id": promo_id,
            "ue_id": ue_id,
            "type_activite_id": type_id,
            "semestre": "S1",
            "formateur_ids": [refs["formateurs"][0]["id"]] if refs["formateurs"] else [],
            "group_ids": gids,
        }
        r = requests.post(f"{API}/sessions", headers=headers, json=payload)
        assert r.status_code == 200, r.text
        sid = r.json()["id"]
        try:
            rr = requests.get(f"{API}/recap-ue",
                              params={"promotion_id": promo_id, "semestre": "S1"},
                              headers=headers)
            assert rr.status_code == 200
            data = rr.json()
            row = next((x for x in data["rows"] if x["ue_id"] == ue_id), None)
            assert row, "UE row missing"
            our = next((d for d in row["details"]
                        if d.get("source") == "session" and d.get("id") == sid),
                       None)
            assert our is not None, f"our session detail not found; sid={sid} sample={row['details'][:3]}"
            assert our.get("nb_groupes") == 2, f"expected nb_groupes=2, got {our.get('nb_groupes')}"
            # heures=2, nb_form=1, nb_groupes=2 -> tf = 4
            assert our.get("temps_formateur") == 4, our
        finally:
            _cleanup_session(headers, sid)
