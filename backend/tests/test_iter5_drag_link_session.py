"""Iter5 backend tests for drag-from-sidebar-to-grid flow on Planning Global.

Validates the chained flow used by frontend dropActivityOnDay:
  1. POST /api/sessions  (create session for that day)
  2. POST /api/fiches-projet/{fiche_id}/activites/{activite_id}/link-session
     -> sets session_id on the targeted activity in fiches_projet

Also covers edge cases:
  - link-session with non-existent fiche -> 404
  - link-session with non-existent activite_id -> 404
  - link-session is admin-only (no token -> 401/403)
  - unlink-session reverses link-session
"""
import os
import uuid
from datetime import date

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
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def base_refs(auth_headers):
    refs = {}
    for coll in ("promotions", "ues"):
        r = requests.get(f"{API}/{coll}", headers=auth_headers)
        assert r.status_code == 200
        refs[coll] = r.json()
    if not refs["promotions"] or not refs["ues"]:
        pytest.skip("Seed data missing")
    return refs


# ---------- helpers ----------
def _create_fiche_with_activity(headers, base_refs, with_session_id=False):
    promo_id = base_refs["promotions"][0]["id"]
    ue_id = base_refs["ues"][0]["id"]
    fiche_payload = {
        "nom": f"TEST_iter5_fiche_{uuid.uuid4().hex[:6]}",
        "ue_id": ue_id,
        "promotion_id": promo_id,
        "activites": [
            {
                "nom": f"TEST_iter5_act_{uuid.uuid4().hex[:6]}",
                "duree": 2.0,
                "promotion_id": promo_id,
                # no semaine_souhaitee -> appears in À programmer
            }
        ],
    }
    r = requests.post(f"{API}/fiches-projet", headers=headers, json=fiche_payload)
    assert r.status_code in (200, 201), r.text
    return r.json(), promo_id, ue_id


def _get_fiche(headers, fiche_id):
    r = requests.get(f"{API}/fiches-projet", headers=headers)
    assert r.status_code == 200
    for f in r.json():
        if f["id"] == fiche_id:
            return f
    return None


# ---------- Drag flow ----------
class TestDragFromSidebarFlow:
    def test_post_session_then_link_session(self, auth_headers, base_refs):
        """Simulate drag-from-sidebar: create session, then link to fiche.activite."""
        fiche, promo_id, ue_id = _create_fiche_with_activity(auth_headers, base_refs)
        activite_id = fiche["activites"][0]["id"]
        sid = None
        try:
            # Step 1: create the session (with a non-matching intitule so there's NO auto-link)
            session_payload = {
                "intitule": "TEST_iter5_unrelated_drag_target",
                "promotion_id": promo_id,
                "ue_id": ue_id,
                "date": date.today().isoformat(),
                "heure_debut": "08:00",
                "heure_fin": "10:00",
                "formateur_ids": [],
                "statut": "Prevu",
            }
            cr = requests.post(f"{API}/sessions", headers=auth_headers, json=session_payload)
            assert cr.status_code in (200, 201), cr.text
            sess = cr.json()
            sid = sess["id"]
            assert "id" in sess
            assert sess["date"] == date.today().isoformat()

            # Sanity: activite not auto-linked yet (different intitule)
            f0 = _get_fiche(auth_headers, fiche["id"])
            assert not any(a.get("session_id") == sid for a in f0["activites"]), \
                "Auto-link unexpectedly happened for non-matching intitule"

            # Step 2: explicit link-session (this is what frontend does)
            lr = requests.post(
                f"{API}/fiches-projet/{fiche['id']}/activites/{activite_id}/link-session",
                headers=auth_headers,
                json={"session_id": sid},
            )
            assert lr.status_code == 200, lr.text
            ldata = lr.json()
            assert ldata.get("session_id") == sid

            # Step 3: verify session_id persisted on the activity
            f1 = _get_fiche(auth_headers, fiche["id"])
            target_act = next((a for a in f1["activites"] if a["id"] == activite_id), None)
            assert target_act is not None
            assert target_act.get("session_id") == sid, \
                f"link-session did not write session_id; got {target_act}"
        finally:
            if sid:
                requests.delete(f"{API}/sessions/{sid}", headers=auth_headers)
            requests.delete(f"{API}/fiches-projet/{fiche['id']}", headers=auth_headers)

    def test_link_session_404_unknown_fiche(self, auth_headers):
        r = requests.post(
            f"{API}/fiches-projet/__nope__/activites/__nope__/link-session",
            headers=auth_headers,
            json={"session_id": "fakesid"},
        )
        assert r.status_code == 404

    def test_link_session_404_unknown_activite(self, auth_headers, base_refs):
        fiche, _, _ = _create_fiche_with_activity(auth_headers, base_refs)
        try:
            r = requests.post(
                f"{API}/fiches-projet/{fiche['id']}/activites/__bogus_act__/link-session",
                headers=auth_headers,
                json={"session_id": "fakesid"},
            )
            assert r.status_code == 404
        finally:
            requests.delete(f"{API}/fiches-projet/{fiche['id']}", headers=auth_headers)

    def test_link_session_requires_admin(self, base_refs, auth_headers):
        # Create fiche with admin first
        fiche, _, _ = _create_fiche_with_activity(auth_headers, base_refs)
        activite_id = fiche["activites"][0]["id"]
        try:
            # No auth header
            r = requests.post(
                f"{API}/fiches-projet/{fiche['id']}/activites/{activite_id}/link-session",
                json={"session_id": "x"},
            )
            assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}"
        finally:
            requests.delete(f"{API}/fiches-projet/{fiche['id']}", headers=auth_headers)

    def test_unlink_session_reverses_link(self, auth_headers, base_refs):
        fiche, promo_id, ue_id = _create_fiche_with_activity(auth_headers, base_refs)
        activite_id = fiche["activites"][0]["id"]
        sid = None
        try:
            # Create + link
            cr = requests.post(f"{API}/sessions", headers=auth_headers, json={
                "intitule": "TEST_iter5_unlink",
                "promotion_id": promo_id,
                "ue_id": ue_id,
                "date": date.today().isoformat(),
                "heure_debut": "11:00", "heure_fin": "12:00",
                "formateur_ids": [], "statut": "Prevu",
            })
            sid = cr.json()["id"]
            requests.post(
                f"{API}/fiches-projet/{fiche['id']}/activites/{activite_id}/link-session",
                headers=auth_headers, json={"session_id": sid},
            )
            f1 = _get_fiche(auth_headers, fiche["id"])
            assert any(a.get("session_id") == sid for a in f1["activites"])

            # Unlink
            ur = requests.post(
                f"{API}/fiches-projet/{fiche['id']}/activites/{activite_id}/unlink-session",
                headers=auth_headers,
            )
            assert ur.status_code == 200

            f2 = _get_fiche(auth_headers, fiche["id"])
            target_act = next(a for a in f2["activites"] if a["id"] == activite_id)
            assert "session_id" not in target_act or not target_act.get("session_id")
        finally:
            if sid:
                requests.delete(f"{API}/sessions/{sid}", headers=auth_headers)
            requests.delete(f"{API}/fiches-projet/{fiche['id']}", headers=auth_headers)
