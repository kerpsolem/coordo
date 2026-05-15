"""Iter8 - Group promotion_id passthrough tests.

Verifies POST/PUT/GET on /api/groups accept and persist optional promotion_id.
"""
import os
import requests
import pytest

BASE_URL = os.environ['REACT_APP_BACKEND_URL'].rstrip('/') if os.environ.get('REACT_APP_BACKEND_URL') else 'https://pedagog-planner.preview.emergentagent.com'
ADMIN_EMAIL = "admin@ifsi.fr"
ADMIN_PW = "Admin123!"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW}, timeout=15)
    assert r.status_code == 200, f"Login failed {r.status_code} {r.text}"
    tok = r.json().get("token")
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def promo_id(session):
    r = session.get(f"{BASE_URL}/api/promotions")
    assert r.status_code == 200
    promos = r.json()
    assert len(promos) > 0, "Need at least 1 promotion seeded"
    return promos[0]["id"]


def _cleanup(session, gid):
    try:
        session.delete(f"{BASE_URL}/api/groups/{gid}")
    except Exception:
        pass


# Test 1: create generic group (no promotion_id)
def test_create_generic_group(session):
    payload = {"libelle": "TEST_iter8_generic"}
    r = session.post(f"{BASE_URL}/api/groups", json=payload)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["libelle"] == "TEST_iter8_generic"
    assert "id" in data
    # promotion_id absent OR empty string both acceptable for generic
    assert not data.get("promotion_id"), f"Expected falsy promotion_id, got {data.get('promotion_id')!r}"
    gid = data["id"]
    # Verify GET returns same
    r2 = session.get(f"{BASE_URL}/api/groups")
    assert r2.status_code == 200
    found = next((g for g in r2.json() if g["id"] == gid), None)
    assert found is not None
    assert not found.get("promotion_id")
    _cleanup(session, gid)


# Test 2: create group with explicit empty promotion_id
def test_create_group_with_empty_promotion(session):
    payload = {"libelle": "TEST_iter8_empty", "promotion_id": ""}
    r = session.post(f"{BASE_URL}/api/groups", json=payload)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["libelle"] == "TEST_iter8_empty"
    # Should persist as empty string (no coercion)
    assert data.get("promotion_id", "") == "", f"Expected empty, got {data.get('promotion_id')!r}"
    _cleanup(session, data["id"])


# Test 3: create group linked to a promotion
def test_create_group_with_promotion(session, promo_id):
    payload = {"libelle": "TEST_iter8_linked", "promotion_id": promo_id}
    r = session.post(f"{BASE_URL}/api/groups", json=payload)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["promotion_id"] == promo_id
    gid = data["id"]
    # Verify via GET
    r2 = session.get(f"{BASE_URL}/api/groups")
    found = next((g for g in r2.json() if g["id"] == gid), None)
    assert found is not None
    assert found["promotion_id"] == promo_id
    _cleanup(session, gid)


# Test 4: PUT updates promotion_id (link generic -> promotion)
def test_update_group_set_promotion(session, promo_id):
    # create generic
    r = session.post(f"{BASE_URL}/api/groups", json={"libelle": "TEST_iter8_upd"})
    assert r.status_code == 200
    gid = r.json()["id"]
    # update
    r2 = session.put(f"{BASE_URL}/api/groups/{gid}", json={"libelle": "TEST_iter8_upd", "promotion_id": promo_id})
    assert r2.status_code == 200, r2.text
    assert r2.json()["promotion_id"] == promo_id
    # verify persistence
    r3 = session.get(f"{BASE_URL}/api/groups")
    found = next((g for g in r3.json() if g["id"] == gid), None)
    assert found["promotion_id"] == promo_id
    _cleanup(session, gid)


# Test 5: PUT clears promotion_id back to '' (link promotion -> generic)
def test_update_group_clear_promotion(session, promo_id):
    r = session.post(f"{BASE_URL}/api/groups", json={"libelle": "TEST_iter8_clr", "promotion_id": promo_id})
    assert r.status_code == 200
    gid = r.json()["id"]
    r2 = session.put(f"{BASE_URL}/api/groups/{gid}", json={"libelle": "TEST_iter8_clr", "promotion_id": ""})
    assert r2.status_code == 200
    assert r2.json().get("promotion_id", "") == ""
    r3 = session.get(f"{BASE_URL}/api/groups")
    found = next((g for g in r3.json() if g["id"] == gid), None)
    assert not found.get("promotion_id")
    _cleanup(session, gid)


# Test 6: NON-REGRESSION - iter7 multi-group sessions still works
def test_iter7_session_group_ids_regression(session, promo_id):
    payload = {
        "intitule": "TEST_iter8_regress",
        "date": "2026-02-15",
        "heure_debut": "09:00",
        "heure_fin": "12:00",
        "promotion_id": promo_id,
        "group_ids": ["gA", "gB"],
        "group_id": "gA",
        "formateur_ids": [],
    }
    r = session.post(f"{BASE_URL}/api/sessions", json=payload)
    assert r.status_code == 200, r.text
    sid = r.json()["id"]
    assert r.json().get("group_ids") == ["gA", "gB"]
    # cleanup
    session.delete(f"{BASE_URL}/api/sessions/{sid}")
