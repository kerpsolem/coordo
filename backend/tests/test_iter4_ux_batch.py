"""Iter4 UX batch backend tests:
- GET /api/alerts enriched fields (category/title/context/auto/heure_*)
- POST /api/sessions/{id}/deprogrammer unlinks fiche.activite.session_id
- PUT /api/sessions/{id} still auto-links (no regression)
- DELETE /api/sessions/{id} still unlinks (no regression)
"""
import os
import uuid
from datetime import date, timedelta

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://pedagog-planner.preview.emergentagent.com").rstrip("/")
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
    """Get any existing promotion + ue + formateur to build sessions/fiches."""
    refs = {}
    for coll in ("promotions", "ues", "formateurs"):
        r = requests.get(f"{API}/{coll}", headers=auth_headers)
        assert r.status_code == 200, f"{coll}: {r.status_code} {r.text}"
        items = r.json()
        refs[coll] = items
    if not refs["promotions"] or not refs["ues"] or not refs["formateurs"]:
        pytest.skip("Seed data missing (promotions/ues/formateurs)")
    return refs


# ---------- ALERTS ----------
class TestAlertsEnriched:
    def test_alerts_returns_list_with_enriched_fields(self, auth_headers):
        r = requests.get(f"{API}/alerts", headers=auth_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        if not data:
            pytest.skip("No alerts in current window")
        a = data[0]
        # Backward compat
        assert "type" in a
        assert "message" in a
        # New enriched fields
        for f in ("category", "title", "context", "auto"):
            assert f in a, f"Missing field {f} in alert: {a}"
        # heure_debut / heure_fin keys present (may be None for surcharge)
        assert "heure_debut" in a
        assert "heure_fin" in a
        # category in expected enum
        assert a["category"] in {"chevauchement", "surcharge", "sans_formateur", "conflit_absence", "autre"}
        assert isinstance(a["auto"], bool)

    def test_alerts_categories_distribution(self, auth_headers, base_refs):
        # Force a sans_formateur alert by creating a session without formateur_ids today
        promo_id = base_refs["promotions"][0]["id"]
        ue_id = base_refs["ues"][0]["id"]
        today = date.today().isoformat()
        payload = {
            "intitule": "TEST_iter4_alert_session",
            "promotion_id": promo_id,
            "ue_id": ue_id,
            "date": today,
            "heure_debut": "09:00",
            "heure_fin": "10:00",
            "formateur_ids": [],
            "statut": "Prevu",
        }
        cr = requests.post(f"{API}/sessions", headers=auth_headers, json=payload)
        assert cr.status_code in (200, 201), cr.text
        sid = cr.json()["id"]
        try:
            r = requests.get(f"{API}/alerts", headers=auth_headers)
            assert r.status_code == 200
            cats = {a["category"] for a in r.json()}
            assert "sans_formateur" in cats, f"Expected sans_formateur category in {cats}"
            # Find our specific alert
            ours = [a for a in r.json() if a.get("session_id") == sid]
            assert ours, "Did not find alert for our test session"
            assert ours[0]["category"] == "sans_formateur"
            assert ours[0]["auto"] is True
            assert ours[0]["title"]
        finally:
            requests.delete(f"{API}/sessions/{sid}", headers=auth_headers)


# ---------- DEPROGRAMMER & UNLINK ----------
class TestDeprogrammerUnlink:
    def _make_fiche_with_activity(self, headers, base_refs):
        promo_id = base_refs["promotions"][0]["id"]
        ue_id = base_refs["ues"][0]["id"]
        unique = f"TEST_iter4_act_{uuid.uuid4().hex[:8]}"
        fiche_payload = {
            "nom": f"TEST_iter4_fiche_{uuid.uuid4().hex[:6]}",
            "ue_id": ue_id,
            "promotion_id": promo_id,
            "activites": [
                {
                    "nom": unique,
                    "duree": 2.0,
                    "promotion_id": promo_id,
                }
            ],
        }
        r = requests.post(f"{API}/fiches-projet", headers=headers, json=fiche_payload)
        assert r.status_code in (200, 201), r.text
        fiche = r.json()
        return fiche, unique, promo_id, ue_id

    def _create_matching_session(self, headers, intitule, promo_id, ue_id):
        payload = {
            "intitule": intitule,
            "promotion_id": promo_id,
            "ue_id": ue_id,
            "date": date.today().isoformat(),
            "heure_debut": "14:00",
            "heure_fin": "16:00",
            "formateur_ids": [],
            "statut": "Prevu",
        }
        r = requests.post(f"{API}/sessions", headers=headers, json=payload)
        assert r.status_code in (200, 201), r.text
        return r.json()

    def _get_fiche(self, headers, fiche_id):
        r = requests.get(f"{API}/fiches-projet", headers=headers)
        assert r.status_code == 200
        for f in r.json():
            if f["id"] == fiche_id:
                return f
        return None

    def test_deprogrammer_unlinks_activity(self, auth_headers, base_refs):
        fiche, intitule, promo_id, ue_id = self._make_fiche_with_activity(auth_headers, base_refs)
        try:
            sess = self._create_matching_session(auth_headers, intitule, promo_id, ue_id)
            sid = sess["id"]
            # Verify auto-link worked
            f1 = self._get_fiche(auth_headers, fiche["id"])
            linked = [a for a in f1["activites"] if a.get("session_id") == sid]
            assert linked, f"Auto-link failed; activites={f1['activites']}"

            # Now déprogrammer
            r = requests.post(f"{API}/sessions/{sid}/deprogrammer", headers=auth_headers)
            assert r.status_code in (200, 204), r.text

            # Session should be gone
            list_r = requests.get(f"{API}/sessions", headers=auth_headers)
            assert sid not in [s["id"] for s in list_r.json()]

            # Fiche.activite must no longer reference the session_id
            f2 = self._get_fiche(auth_headers, fiche["id"])
            still_linked = [a for a in f2["activites"] if a.get("session_id") == sid]
            assert not still_linked, f"Activity still linked after deprogrammer: {f2['activites']}"
        finally:
            requests.delete(f"{API}/fiches-projet/{fiche['id']}", headers=auth_headers)

    def test_put_session_still_auto_links(self, auth_headers, base_refs):
        fiche, intitule, promo_id, ue_id = self._make_fiche_with_activity(auth_headers, base_refs)
        sid = None
        try:
            # Create session with different name first (won't link)
            other_payload = {
                "intitule": "TEST_iter4_unrelated_intitule",
                "promotion_id": promo_id,
                "ue_id": ue_id,
                "date": date.today().isoformat(),
                "heure_debut": "10:00",
                "heure_fin": "11:00",
                "formateur_ids": [],
                "statut": "Prevu",
            }
            cr = requests.post(f"{API}/sessions", headers=auth_headers, json=other_payload)
            assert cr.status_code in (200, 201)
            sid = cr.json()["id"]

            f1 = self._get_fiche(auth_headers, fiche["id"])
            assert not any(a.get("session_id") == sid for a in f1["activites"])

            # PUT to rename to matching intitule -> should auto-link
            other_payload["intitule"] = intitule
            ur = requests.put(f"{API}/sessions/{sid}", headers=auth_headers, json=other_payload)
            assert ur.status_code == 200, ur.text

            f2 = self._get_fiche(auth_headers, fiche["id"])
            assert any(a.get("session_id") == sid for a in f2["activites"]), \
                f"PUT did not auto-link: {f2['activites']}"
        finally:
            if sid:
                requests.delete(f"{API}/sessions/{sid}", headers=auth_headers)
            requests.delete(f"{API}/fiches-projet/{fiche['id']}", headers=auth_headers)

    def test_delete_session_still_unlinks(self, auth_headers, base_refs):
        fiche, intitule, promo_id, ue_id = self._make_fiche_with_activity(auth_headers, base_refs)
        try:
            sess = self._create_matching_session(auth_headers, intitule, promo_id, ue_id)
            sid = sess["id"]
            f1 = self._get_fiche(auth_headers, fiche["id"])
            assert any(a.get("session_id") == sid for a in f1["activites"])

            dr = requests.delete(f"{API}/sessions/{sid}", headers=auth_headers)
            assert dr.status_code in (200, 204)

            f2 = self._get_fiche(auth_headers, fiche["id"])
            assert not any(a.get("session_id") == sid for a in f2["activites"])
        finally:
            requests.delete(f"{API}/fiches-projet/{fiche['id']}", headers=auth_headers)
