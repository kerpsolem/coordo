"""Tests for new features: holidays, sessions/bulk, fiches-projet."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://pedagog-planner.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": "admin@ifsi.fr", "password": "Admin123!"})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json().get("token")


@pytest.fixture
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ===================== HOLIDAYS =====================
class TestHolidays:
    def test_holidays_year_2026(self):
        r = requests.get(f"{API}/holidays", params={"year": 2026})
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 11, f"Expected 11 French holidays, got {len(data)}"
        for h in data:
            assert "date" in h and "nom" in h
        names = [h["nom"] for h in data]
        assert "Jour de l'An" in names
        assert "Fete du travail" in names
        assert "Noel" in names
        # Check May 1, 2026
        may1 = next((h for h in data if h["date"] == "2026-05-01"), None)
        assert may1 is not None
        assert may1["nom"] == "Fete du travail"

    def test_holidays_date_range(self):
        r = requests.get(f"{API}/holidays", params={"date_debut": "2026-01-01", "date_fin": "2026-06-30"})
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert all("2026-01-01" <= h["date"] <= "2026-06-30" for h in data)
        assert len(data) >= 4


# ===================== SESSIONS BULK =====================
class TestSessionsBulk:
    @pytest.fixture(autouse=True)
    def _setup(self, admin_token):
        self.headers = {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}
        # Get promotion for testing
        promos = requests.get(f"{API}/promotions").json()
        self.promo_id = promos[0]["id"] if promos else None

    def _cleanup_sessions(self, created):
        for s in created:
            try:
                requests.delete(f"{API}/sessions/{s['id']}", headers=self.headers)
            except Exception:
                pass

    def test_bulk_multi_day_with_holiday_exclusion(self):
        # Week containing May 1 2026 (Friday, Labor Day)
        payload = {
            "date_debut": "2026-04-27",
            "date_fin": "2026-05-01",
            "heure_debut": "09:00",
            "heure_fin": "12:00",
            "mode": "multi_day",
            "exclude_holidays": True,
            "promotion_id": self.promo_id,
            "semestre": "S1",
        }
        r = requests.post(f"{API}/sessions/bulk", json=payload, headers=self.headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "total_heures" in data
        assert "total_sessions" in data
        assert "jours_feries_exclus" in data
        assert "2026-05-01" in data["jours_feries_exclus"]
        # Mon-Thu = 4 weekdays, Fri (May 1) excluded
        assert data["total_sessions"] == 4
        assert data["total_heures"] == 12  # 4 days * 3h
        self._cleanup_sessions(data["created"])

    def test_bulk_multi_day_without_exclusion(self):
        payload = {
            "date_debut": "2026-04-27",
            "date_fin": "2026-05-01",
            "heure_debut": "09:00",
            "heure_fin": "12:00",
            "mode": "multi_day",
            "exclude_holidays": False,
            "promotion_id": self.promo_id,
            "semestre": "S1",
        }
        r = requests.post(f"{API}/sessions/bulk", json=payload, headers=self.headers)
        assert r.status_code == 200
        data = r.json()
        assert data["total_sessions"] == 5
        assert data["jours_feries_exclus"] == []
        self._cleanup_sessions(data["created"])

    def test_bulk_stage_mode_35h_cap(self):
        # Full week stage
        payload = {
            "date_debut": "2026-03-02",
            "date_fin": "2026-03-06",
            "mode": "stage",
            "exclude_holidays": True,
            "promotion_id": self.promo_id,
            "semestre": "S1",
            "journee_entiere": True,
        }
        r = requests.post(f"{API}/sessions/bulk", json=payload, headers=self.headers)
        assert r.status_code == 200, r.text
        data = r.json()
        # 5 days * 7h = 35h, capped at 35
        assert data["total_sessions"] == 5
        assert data["total_heures"] <= 35.01, f"Stage exceeded 35h: {data['total_heures']}"
        self._cleanup_sessions(data["created"])

    def test_bulk_journee_entiere_defaults(self):
        payload = {
            "date_debut": "2026-02-02",
            "date_fin": "2026-02-03",
            "mode": "multi_day",
            "journee_entiere": True,
            "promotion_id": self.promo_id,
            "semestre": "S1",
        }
        r = requests.post(f"{API}/sessions/bulk", json=payload, headers=self.headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["total_sessions"] == 2
        # Each day = 7h (8:30-16:30 with 1h pause)
        assert data["total_heures"] == 14
        self._cleanup_sessions(data["created"])

    def test_bulk_invalid_dates(self):
        payload = {"date_debut": "2026-05-10", "date_fin": "2026-05-01", "mode": "multi_day"}
        r = requests.post(f"{API}/sessions/bulk", json=payload, headers=self.headers)
        assert r.status_code == 400


# ===================== FICHES PROJET =====================
class TestFichesProjet:
    @pytest.fixture(autouse=True)
    def _setup(self, admin_token):
        self.headers = {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}
        self.created_ids = []
        yield
        for fid in self.created_ids:
            try:
                requests.delete(f"{API}/fiches-projet/{fid}", headers=self.headers)
            except Exception:
                pass

    def test_create_list_update_delete_fiche(self):
        # CREATE
        payload = {
            "titre": "TEST_Fiche1",
            "semestre": "S1",
            "ue_id": "ue-test",
            "promotion_id": "promo-test",
            "activites": [
                {"nom": "TEST_Act1", "heures": 2, "taille_groupe": "promo_entiere", "ordre": 1},
                {"nom": "TEST_Act2", "heures": 3, "taille_groupe": "groupe_td", "ordre": 2},
            ],
        }
        r = requests.post(f"{API}/fiches-projet", json=payload, headers=self.headers)
        assert r.status_code == 200, r.text
        fiche = r.json()
        assert "id" in fiche
        fid = fiche["id"]
        self.created_ids.append(fid)
        # activities auto IDs
        for act in fiche["activites"]:
            assert "id" in act and act["id"]

        # LIST
        r = requests.get(f"{API}/fiches-projet", headers=self.headers)
        assert r.status_code == 200
        assert any(f["id"] == fid for f in r.json())

        # UPDATE
        update_payload = {
            "titre": "TEST_Fiche1_Updated",
            "semestre": "S1",
            "activites": [
                {"nom": "TEST_Act1", "heures": 4, "taille_groupe": "promo_entiere", "ordre": 1},
            ],
        }
        r = requests.put(f"{API}/fiches-projet/{fid}", json=update_payload, headers=self.headers)
        assert r.status_code == 200
        updated = r.json()
        assert updated["titre"] == "TEST_Fiche1_Updated"
        assert len(updated["activites"]) == 1
        assert updated["activites"][0]["id"]  # auto id on new activity

        # DELETE
        r = requests.delete(f"{API}/fiches-projet/{fid}", headers=self.headers)
        assert r.status_code == 200
        self.created_ids.remove(fid)

        # Verify removed
        r = requests.get(f"{API}/fiches-projet", headers=self.headers)
        assert not any(f["id"] == fid for f in r.json())

    def test_a_programmer_and_link_unlink(self):
        # Create fiche with 2 activites (none linked)
        payload = {
            "titre": "TEST_Prog",
            "semestre": "S1",
            "ue_id": "ue-prog-test",
            "promotion_id": "promo-prog-test",
            "activites": [
                {"nom": "TEST_Prog1", "heures": 2, "ordre": 1},
                {"nom": "TEST_Prog2", "heures": 2, "ordre": 2},
            ],
        }
        r = requests.post(f"{API}/fiches-projet", json=payload, headers=self.headers)
        assert r.status_code == 200
        fiche = r.json()
        fid = fiche["id"]
        self.created_ids.append(fid)
        act1_id = fiche["activites"][0]["id"]

        # a-programmer should include both
        r = requests.get(f"{API}/fiches-projet/a-programmer", headers=self.headers)
        assert r.status_code == 200
        items = r.json()
        matching = [i for i in items if i["fiche_id"] == fid]
        assert len(matching) == 2

        # Link one
        r = requests.post(
            f"{API}/fiches-projet/{fid}/activites/{act1_id}/link-session",
            json={"session_id": "fake-session-id"},
            headers=self.headers,
        )
        assert r.status_code == 200

        # a-programmer should exclude linked
        r = requests.get(f"{API}/fiches-projet/a-programmer", headers=self.headers)
        matching = [i for i in r.json() if i["fiche_id"] == fid]
        assert len(matching) == 1
        assert matching[0]["activite_id"] != act1_id

        # Unlink
        r = requests.post(
            f"{API}/fiches-projet/{fid}/activites/{act1_id}/unlink-session",
            headers=self.headers,
        )
        assert r.status_code == 200

        # a-programmer should include it again
        r = requests.get(f"{API}/fiches-projet/a-programmer", headers=self.headers)
        matching = [i for i in r.json() if i["fiche_id"] == fid]
        assert len(matching) == 2


# ===================== REGRESSION =====================
class TestRegression:
    def test_login_returns_token(self):
        r = requests.post(f"{API}/auth/login", json={"email": "admin@ifsi.fr", "password": "Admin123!"})
        assert r.status_code == 200
        data = r.json()
        assert "token" in data
        assert data.get("role") == "super_admin"

    def test_change_password_wrong_old(self, auth_headers):
        r = requests.post(f"{API}/auth/change-password", json={"old_password": "wrong", "new_password": "newpass123"}, headers=auth_headers)
        assert r.status_code == 400

    def test_access_request_with_password(self):
        r = requests.post(f"{API}/access-requests", json={
            "nom": "TEST_AR", "prenom": "Regression", "email": "test_ar_regression@example.com",
            "motivation": "test", "password": "Test1234!"
        })
        assert r.status_code == 200
        data = r.json()
        assert "password" not in data and "password_hash" not in data
