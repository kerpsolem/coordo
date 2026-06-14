"""
Iter20 backend tests - nb_formateurs_requis feature
"""
import os
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@ifsi.fr"
ADMIN_PASSWORD = "Admin123!"


@pytest.fixture(scope="module")
def admin_client():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text[:200]}"
    return s


@pytest.fixture(scope="module")
def activity_types(admin_client):
    """Get first match per nom (avoids duplicates) and computes expected nb_form_requis."""
    r = admin_client.get(f"{API}/activity-types")
    assert r.status_code == 200
    res = {}
    for a in r.json():
        nm = (a.get("nom") or "").strip()
        if not nm or nm in res:
            continue
        # Compute expected default from server logic
        is_cours = bool(a.get("is_cours"))
        expected = 0 if nm.upper() == "TPG" else (1 if is_cours else 0)
        res[nm] = {**a, "_expected_nb": expected}
    return res


@pytest.fixture(scope="module")
def context_ids(admin_client):
    sites = admin_client.get(f"{API}/sites").json()
    promos = admin_client.get(f"{API}/promotions").json()
    ues = admin_client.get(f"{API}/ues").json()
    schoolyears = admin_client.get(f"{API}/school-years").json()
    return {
        "site_id": sites[0]["id"] if sites else None,
        "promotion_id": promos[0]["id"] if promos else None,
        "ue_id": ues[0]["id"] if ues else None,
        "school_year_id": schoolyears[0]["id"] if schoolyears else None,
    }


def _payload(ctx, type_id, **overrides):
    base = {
        "date": "2026-04-15",
        "heure_debut": "08:00",
        "heure_fin": "09:00",
        "type_activite_id": type_id,
        "ue_id": ctx["ue_id"],
        "promotion_id": ctx["promotion_id"],
        "site_id": ctx["site_id"],
        "annee_scolaire_id": ctx["school_year_id"],
        "semestre": "S2",
        "intitule": "TEST_iter20_session",
        "formateur_ids": [],
        "group_ids": [],
    }
    base.update(overrides)
    return base


def _fetch_session(admin_client, sid):
    """Fallback: list all sessions and find by id (since GET /sessions/{id} returns 405)."""
    r = admin_client.get(f"{API}/sessions", params={"date_debut": "2026-04-01", "date_fin": "2026-04-30"})
    assert r.status_code == 200
    for s in r.json():
        if s["id"] == sid:
            return s
    return None


# -------------------- MIGRATION --------------------
class TestMigration:
    def test_backfill_returns_count(self, admin_client):
        r = admin_client.post(f"{API}/migrations/backfill-nb-formateurs-requis")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "updated" in data and isinstance(data["updated"], int)
        # Re-run → idempotent
        r2 = admin_client.post(f"{API}/migrations/backfill-nb-formateurs-requis")
        assert r2.json()["updated"] == 0

    def test_all_sessions_have_field(self, admin_client):
        r = admin_client.get(f"{API}/sessions")
        sessions = r.json()
        missing = [s["id"] for s in sessions if s.get("nb_formateurs_requis") is None]
        assert not missing, f"{len(missing)}/{len(sessions)} sessions missing nb_formateurs_requis"


# -------------------- POST auto-default --------------------
class TestCreateAutoDefault:
    created_ids = []

    @pytest.mark.parametrize("type_nom", ["TPG", "TD", "TP", "CM", "CMo", "EVAL"])
    def test_auto_default(self, admin_client, activity_types, context_ids, type_nom):
        at = activity_types.get(type_nom)
        if not at:
            pytest.skip(f"Activity type {type_nom} not present")
        expected = at["_expected_nb"]
        payload = _payload(context_ids, at["id"], intitule=f"TEST_iter20_{type_nom}")
        r = admin_client.post(f"{API}/sessions", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("nb_formateurs_requis") == expected, (
            f"Type {type_nom} (is_cours={at.get('is_cours')}): expected {expected}, got {data.get('nb_formateurs_requis')}"
        )
        TestCreateAutoDefault.created_ids.append(data["id"])

        # Verify persistence
        s = _fetch_session(admin_client, data["id"])
        assert s is not None
        assert s.get("nb_formateurs_requis") == expected

    def test_explicit_value_not_overwritten(self, admin_client, activity_types, context_ids):
        td = activity_types.get("TD")
        assert td, "TD required"
        payload = _payload(context_ids, td["id"], intitule="TEST_iter20_explicit", nb_formateurs_requis=3)
        r = admin_client.post(f"{API}/sessions", json=payload)
        assert r.status_code == 200, r.text
        assert r.json().get("nb_formateurs_requis") == 3
        TestCreateAutoDefault.created_ids.append(r.json()["id"])

    def test_put_updates_field(self, admin_client, activity_types, context_ids):
        td = activity_types.get("TD")
        payload = _payload(context_ids, td["id"], intitule="TEST_iter20_put")
        r = admin_client.post(f"{API}/sessions", json=payload)
        sid = r.json()["id"]
        TestCreateAutoDefault.created_ids.append(sid)

        rp = admin_client.put(f"{API}/sessions/{sid}", json={"nb_formateurs_requis": 2})
        assert rp.status_code == 200, rp.text
        assert rp.json().get("nb_formateurs_requis") == 2

        s = _fetch_session(admin_client, sid)
        assert s and s.get("nb_formateurs_requis") == 2


# -------------------- WORKLOAD --------------------
class TestWorkload:
    def test_workload_new_fields(self, admin_client):
        r = admin_client.get(f"{API}/workload")
        assert r.status_code == 200
        d = r.json()
        for k in ["total_cours_global", "total_cours_requis", "total_cours_assignees",
                  "heures_a_pourvoir", "capacite_totale", "formateurs"]:
            assert k in d, f"missing field {k}"
        if d["formateurs"]:
            f0 = d["formateurs"][0]
            for k in ["formateur_id", "heures_cours", "reference", "ecart", "statut"]:
                assert k in f0
            assert f0["statut"] in ("equilibre", "surcharge", "sous-charge")

    def test_workload_consistency(self, admin_client):
        d = admin_client.get(f"{API}/workload").json()
        expected = max(0.0, d["total_cours_requis"] - d["total_cours_assignees"])
        assert abs(d["heures_a_pourvoir"] - round(expected, 2)) < 0.05

    def test_workload_statut_tolerance(self, admin_client):
        """Validate statut logic against ecart and tolerance for each formateur."""
        d = admin_client.get(f"{API}/workload").json()
        for f in d["formateurs"]:
            ref = f["reference"]
            ecart = f["ecart"]
            tol = max(ref * 0.10, 5.0)
            if abs(ecart) <= tol:
                assert f["statut"] == "equilibre", f"{f['nom']}: ecart={ecart}, tol={tol}, got {f['statut']}"
            elif ecart > 0:
                assert f["statut"] == "surcharge"
            else:
                assert f["statut"] == "sous-charge"


# -------------------- ALERTS --------------------
class TestAlertsSurcharge:
    def test_alerts_structure(self, admin_client):
        r = admin_client.get(f"{API}/alerts", params={
            "date_debut": "2025-09-01", "date_fin": "2026-08-31",
        })
        assert r.status_code == 200
        alerts = r.json()
        assert isinstance(alerts, list)
        for a in alerts:
            assert "category" in a and "message" in a
        surcharge = [a for a in alerts if a.get("category") == "surcharge"]
        # Validate message shape for surcharge alerts
        for a in surcharge:
            msg = a["message"]
            assert "écart" in msg, f"unexpected surcharge message: {msg}"
            assert "référence" in msg, f"unexpected surcharge message: {msg}"
            assert ">" in msg, f"unexpected surcharge message: {msg}"
        print(f"\n  Surcharge alerts found: {len(surcharge)}")
        if surcharge:
            print(f"  Sample: {surcharge[0]['message']}")


# -------------------- Cleanup --------------------
@pytest.fixture(scope="module", autouse=True)
def cleanup(admin_client):
    yield
    for sid in TestCreateAutoDefault.created_ids:
        try:
            admin_client.delete(f"{API}/sessions/{sid}")
        except Exception:
            pass
