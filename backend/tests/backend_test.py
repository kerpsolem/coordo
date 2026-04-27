"""
Backend tests for IFSI app: access requests, change password, user delete, recap charts.
Uses production REACT_APP_BACKEND_URL.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://pedagog-planner.preview.emergentagent.com').rstrip('/')
ADMIN_EMAIL = "admin@ifsi.fr"
ADMIN_PASSWORD = "Admin123!"


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin_token(api_client):
    r = api_client.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data
    return data["token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ---------- Health / Auth ----------
class TestHealth:
    def test_login_admin(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        d = r.json()
        assert d["email"] == ADMIN_EMAIL
        assert d["role"] == "super_admin"
        assert "token" in d

    def test_login_invalid(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong!"})
        assert r.status_code == 401


# ---------- Access Requests with password ----------
class TestAccessRequests:
    suffix = uuid.uuid4().hex[:8]
    test_email = f"test_acc_{suffix}@ifsi.fr"
    test_password = "InitPass123!"
    new_password = "ChangedPass456!"
    request_id = None
    user_id = None

    def test_create_access_request_with_password(self, api_client):
        payload = {
            "nom": "TESTNom",
            "prenom": "TESTPrenom",
            "email": TestAccessRequests.test_email,
            "message": "Demande de test automatise",
            "password": TestAccessRequests.test_password,
            "password_confirm": TestAccessRequests.test_password,
        }
        r = api_client.post(f"{BASE_URL}/api/access-requests", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["email"] == TestAccessRequests.test_email
        assert data["status"] == "en_attente"
        assert "password_hash" not in data  # must not leak
        assert "password" not in data
        TestAccessRequests.request_id = data["id"]

    def test_list_access_requests_admin(self, api_client, admin_headers):
        r = api_client.get(f"{BASE_URL}/api/access-requests", headers=admin_headers)
        assert r.status_code == 200
        ids = [x["id"] for x in r.json()]
        assert TestAccessRequests.request_id in ids

    def test_accept_access_request_creates_user(self, api_client, admin_headers):
        assert TestAccessRequests.request_id is not None
        r = api_client.patch(
            f"{BASE_URL}/api/access-requests/{TestAccessRequests.request_id}",
            json={"status": "acceptee", "create_account": True, "role": "formateur"},
            headers=admin_headers,
        )
        assert r.status_code == 200, r.text

        # New user can login with original password from access request
        login = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TestAccessRequests.test_email, "password": TestAccessRequests.test_password},
        )
        assert login.status_code == 200, f"Login failed after accept: {login.text}"
        d = login.json()
        assert d["email"] == TestAccessRequests.test_email
        assert d["role"] == "formateur"
        TestAccessRequests.user_id = d["id"]


# ---------- Change Password ----------
class TestChangePassword:
    def test_change_password_then_login(self, api_client):
        # Login as the test user created above
        email = TestAccessRequests.test_email
        old_pw = TestAccessRequests.test_password
        new_pw = TestAccessRequests.new_password

        login = api_client.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": old_pw})
        assert login.status_code == 200
        token = login.json()["token"]
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

        # Change password
        r = api_client.post(
            f"{BASE_URL}/api/auth/change-password",
            json={"old_password": old_pw, "new_password": new_pw},
            headers=headers,
        )
        assert r.status_code == 200, r.text
        assert "succes" in r.json()["message"].lower() or "success" in r.json()["message"].lower()

        # Old password rejected
        bad = api_client.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": old_pw})
        assert bad.status_code == 401

        # New password works
        good = api_client.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": new_pw})
        assert good.status_code == 200

    def test_change_password_wrong_old(self, api_client, admin_headers):
        # Use admin token but wrong old pw -> 400
        r = api_client.post(
            f"{BASE_URL}/api/auth/change-password",
            json={"old_password": "wrong_old_pw", "new_password": "Whatever123!"},
            headers=admin_headers,
        )
        assert r.status_code == 400

    def test_change_password_too_short(self, api_client, admin_headers):
        r = api_client.post(
            f"{BASE_URL}/api/auth/change-password",
            json={"old_password": ADMIN_PASSWORD, "new_password": "abc"},
            headers=admin_headers,
        )
        assert r.status_code == 400


# ---------- User Delete ----------
class TestUserDelete:
    def test_super_admin_cannot_delete_self(self, api_client, admin_headers, admin_token):
        # find admin user id
        me = api_client.get(f"{BASE_URL}/api/auth/me", headers=admin_headers)
        assert me.status_code == 200
        admin_id = me.json()["id"]
        r = api_client.delete(f"{BASE_URL}/api/users/{admin_id}", headers=admin_headers)
        assert r.status_code == 400

    def test_delete_test_user(self, api_client, admin_headers):
        # locate created user via list
        users = api_client.get(f"{BASE_URL}/api/users", headers=admin_headers).json()
        target = next((u for u in users if u["email"] == TestAccessRequests.test_email), None)
        assert target is not None, "Test user not found"
        r = api_client.delete(f"{BASE_URL}/api/users/{target['id']}", headers=admin_headers)
        assert r.status_code == 200

        # Verify deletion: login should fail
        login = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TestAccessRequests.test_email, "password": TestAccessRequests.new_password},
        )
        assert login.status_code == 401

    def test_delete_user_unauthorized(self, api_client):
        # No auth header
        r = api_client.delete(f"{BASE_URL}/api/users/some-id")
        assert r.status_code == 401

    def test_cleanup_access_request(self, api_client, admin_headers):
        if TestAccessRequests.request_id:
            api_client.delete(
                f"{BASE_URL}/api/access-requests/{TestAccessRequests.request_id}",
                headers=admin_headers,
            )


# ---------- Recap (charts) ----------
class TestRecap:
    def test_recap_returns_all_chart_keys(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/recap")
        assert r.status_code == 200
        d = r.json()
        for k in ["par_formateur", "par_promotion", "par_type_activite", "par_semaine", "par_semestre", "par_ue", "total_heures", "total_seances"]:
            assert k in d, f"Missing key {k}"
        assert isinstance(d["par_formateur"], dict)
        assert isinstance(d["par_promotion"], dict)
        assert isinstance(d["par_type_activite"], dict)
        assert isinstance(d["par_semaine"], dict)
        assert isinstance(d["par_semestre"], dict)
        assert isinstance(d["par_ue"], dict)

    def test_recap_with_filters(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/recap", params={"semestre": "S1"})
        assert r.status_code == 200
        # ensure shape preserved
        d = r.json()
        assert "par_semestre" in d
