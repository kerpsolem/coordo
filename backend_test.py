#!/usr/bin/env python3
"""
Comprehensive backend API testing for IFSI Planning application
Tests all major endpoints and functionality
"""

import requests
import sys
import json
from datetime import datetime, date, timedelta

class IFSIAPITester:
    def __init__(self, base_url="https://pedagog-planner.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []
        self.session = requests.Session()
        
    def log(self, message):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}")
        
    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        test_headers = {'Content-Type': 'application/json'}
        
        if self.token:
            test_headers['Authorization'] = f'Bearer {self.token}'
        if headers:
            test_headers.update(headers)

        self.tests_run += 1
        self.log(f"🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = self.session.get(url, headers=test_headers)
            elif method == 'POST':
                response = self.session.post(url, json=data, headers=test_headers)
            elif method == 'PUT':
                response = self.session.put(url, json=data, headers=test_headers)
            elif method == 'DELETE':
                response = self.session.delete(url, headers=test_headers)
            elif method == 'PATCH':
                response = self.session.patch(url, json=data, headers=test_headers)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                self.log(f"✅ {name} - Status: {response.status_code}")
                try:
                    return True, response.json() if response.content else {}
                except:
                    return True, {}
            else:
                self.log(f"❌ {name} - Expected {expected_status}, got {response.status_code}")
                self.log(f"   Response: {response.text[:200]}")
                self.failed_tests.append(f"{name}: Expected {expected_status}, got {response.status_code}")
                return False, {}

        except Exception as e:
            self.log(f"❌ {name} - Error: {str(e)}")
            self.failed_tests.append(f"{name}: {str(e)}")
            return False, {}

    def test_auth_flow(self):
        """Test authentication endpoints"""
        self.log("\n=== TESTING AUTHENTICATION ===")
        
        # Test login with correct credentials
        success, response = self.run_test(
            "Admin Login",
            "POST",
            "auth/login",
            200,
            data={"email": "admin@ifsi.fr", "password": "Admin123!"}
        )
        
        if success and 'token' in response:
            self.token = response['token']
            self.log(f"✅ Token obtained: {self.token[:20]}...")
            
            # Test auth/me endpoint
            self.run_test("Get Current User", "GET", "auth/me", 200)
            
            # Test logout
            self.run_test("Logout", "POST", "auth/logout", 200)
            
            return True
        else:
            self.log("❌ Failed to get authentication token")
            return False

    def test_dashboard(self):
        """Test dashboard endpoint"""
        self.log("\n=== TESTING DASHBOARD ===")
        
        today = date.today()
        date_debut = today.strftime('%Y-%m-%d')
        date_fin = (today + timedelta(days=7)).strftime('%Y-%m-%d')
        
        success, data = self.run_test(
            "Dashboard Data",
            "GET",
            f"dashboard?date_debut={date_debut}&date_fin={date_fin}",
            200
        )
        
        if success:
            required_fields = ['saint_du_jour', 'citation', 'total_heures', 'total_seances', 'total_formateurs']
            for field in required_fields:
                if field not in data:
                    self.log(f"⚠️  Missing dashboard field: {field}")
                    
        return success

    def test_crud_endpoints(self):
        """Test CRUD operations for all entities"""
        self.log("\n=== TESTING CRUD ENDPOINTS ===")
        
        # Test GET endpoints for all entities
        entities = [
            'formateurs', 'promotions', 'groups', 'sites', 
            'activity-types', 'domains', 'ues', 'sessions',
            'absences', 'copy-attributions', 'sticky-notes', 'school-years'
        ]
        
        for entity in entities:
            self.run_test(f"List {entity}", "GET", entity, 200)
            
        # Test users endpoint (admin only)
        self.run_test("List Users", "GET", "users", 200)
        
        return True

    def test_sessions_functionality(self):
        """Test sessions with filters and operations"""
        self.log("\n=== TESTING SESSIONS FUNCTIONALITY ===")
        
        # Get sessions with various filters
        today = date.today()
        date_debut = today.strftime('%Y-%m-%d')
        date_fin = (today + timedelta(days=30)).strftime('%Y-%m-%d')
        
        # Test basic sessions list
        success, sessions_data = self.run_test(
            "Sessions List",
            "GET",
            f"sessions?date_debut={date_debut}&date_fin={date_fin}",
            200
        )
        
        if success and sessions_data:
            # Test session filters
            self.run_test("Sessions by Semestre", "GET", "sessions?semestre=S1", 200)
            self.run_test("Sessions Pair", "GET", "sessions?semestre=pair", 200)
            self.run_test("Sessions Impair", "GET", "sessions?semestre=impair", 200)
            
            # If we have sessions, test operations on first session
            if len(sessions_data) > 0:
                session_id = sessions_data[0]['id']
                
                # Test session toggle operations
                self.run_test(
                    "Toggle Session Status",
                    "PATCH",
                    f"sessions/{session_id}/toggle",
                    200,
                    data={"field": "statut", "value": "Valide"}
                )
                
                self.run_test(
                    "Toggle Session Saisi",
                    "PATCH", 
                    f"sessions/{session_id}/toggle",
                    200,
                    data={"field": "saisi", "value": True}
                )
                
                # Test session duplication
                self.run_test(
                    "Duplicate Session",
                    "POST",
                    f"sessions/{session_id}/duplicate",
                    200
                )
        
        return True

    def test_absences_functionality(self):
        """Test absences endpoints"""
        self.log("\n=== TESTING ABSENCES FUNCTIONALITY ===")
        
        # Test absences list
        self.run_test("List Absences", "GET", "absences", 200)
        self.run_test("Active Absences", "GET", "absences?active=true", 200)
        
        # Test absences for period
        today = date.today()
        date_debut = today.strftime('%Y-%m-%d')
        date_fin = (today + timedelta(days=30)).strftime('%Y-%m-%d')
        
        self.run_test(
            "Absences for Period",
            "GET",
            f"absences/for-period?date_debut={date_debut}&date_fin={date_fin}",
            200
        )
        
        return True

    def test_recap_and_workload(self):
        """Test recap and workload endpoints"""
        self.log("\n=== TESTING RECAP AND WORKLOAD ===")
        
        today = date.today()
        date_debut = today.strftime('%Y-%m-%d')
        date_fin = (today + timedelta(days=30)).strftime('%Y-%m-%d')
        
        # Test recap endpoint
        self.run_test(
            "Recap Hours",
            "GET",
            f"recap?date_debut={date_debut}&date_fin={date_fin}",
            200
        )
        
        # Test workload endpoint
        self.run_test(
            "Workload Analysis",
            "GET",
            f"workload?date_debut={date_debut}&date_fin={date_fin}",
            200
        )
        
        return True

    def test_alerts(self):
        """Test alerts endpoint"""
        self.log("\n=== TESTING ALERTS ===")
        
        today = date.today()
        date_debut = today.strftime('%Y-%m-%d')
        date_fin = (today + timedelta(days=30)).strftime('%Y-%m-%d')
        
        self.run_test(
            "Get Alerts",
            "GET",
            f"alerts?date_debut={date_debut}&date_fin={date_fin}",
            200
        )
        
        return True

    def test_seed_data(self):
        """Test seed data functionality"""
        self.log("\n=== TESTING SEED DATA ===")
        
        success, response = self.run_test(
            "Seed Demo Data",
            "POST",
            "seed",
            200
        )
        
        if success:
            self.log(f"✅ Seed data created: {response.get('stats', {})}")
            
        return success

    def run_all_tests(self):
        """Run all tests in sequence"""
        self.log("🚀 Starting IFSI Planning API Tests")
        self.log(f"Testing against: {self.base_url}")
        
        # Test authentication first
        if not self.test_auth_flow():
            self.log("❌ Authentication failed - stopping tests")
            return False
            
        # Run all other tests
        test_methods = [
            self.test_dashboard,
            self.test_crud_endpoints,
            self.test_sessions_functionality,
            self.test_absences_functionality,
            self.test_recap_and_workload,
            self.test_alerts,
            self.test_seed_data
        ]
        
        for test_method in test_methods:
            try:
                test_method()
            except Exception as e:
                self.log(f"❌ Test method {test_method.__name__} failed: {str(e)}")
                self.failed_tests.append(f"{test_method.__name__}: {str(e)}")
        
        # Print final results
        self.print_results()
        return self.tests_passed == self.tests_run

    def print_results(self):
        """Print test results summary"""
        self.log("\n" + "="*50)
        self.log("📊 TEST RESULTS SUMMARY")
        self.log("="*50)
        self.log(f"Total tests run: {self.tests_run}")
        self.log(f"Tests passed: {self.tests_passed}")
        self.log(f"Tests failed: {len(self.failed_tests)}")
        self.log(f"Success rate: {(self.tests_passed/self.tests_run*100):.1f}%" if self.tests_run > 0 else "0%")
        
        if self.failed_tests:
            self.log("\n❌ FAILED TESTS:")
            for i, failure in enumerate(self.failed_tests, 1):
                self.log(f"  {i}. {failure}")
        else:
            self.log("\n🎉 ALL TESTS PASSED!")

def main():
    tester = IFSIAPITester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())