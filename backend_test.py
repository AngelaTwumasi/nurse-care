#!/usr/bin/env python3
"""
NurseCare Backend API Test Suite
Tests all backend endpoints including real AI generation
"""

import requests
import json
import time
from typing import List, Dict, Any

# Configuration
BASE_URL = "https://web-nurse-app.preview.emergentagent.com/api"
TIMEOUT = 10  # Default timeout for most requests
AI_TIMEOUT = 90  # Extended timeout for AI generation

class TestResults:
    def __init__(self):
        self.passed = []
        self.failed = []
        self.created_patient_ids = []
    
    def add_pass(self, test_name: str, details: str = ""):
        self.passed.append(f"✅ {test_name}: {details}")
        print(f"✅ PASS: {test_name}")
        if details:
            print(f"   {details}")
    
    def add_fail(self, test_name: str, details: str):
        self.failed.append(f"❌ {test_name}: {details}")
        print(f"❌ FAIL: {test_name}")
        print(f"   {details}")
    
    def print_summary(self):
        print("\n" + "="*80)
        print("TEST SUMMARY")
        print("="*80)
        print(f"Total Passed: {len(self.passed)}")
        print(f"Total Failed: {len(self.failed)}")
        print("\nPassed Tests:")
        for p in self.passed:
            print(f"  {p}")
        if self.failed:
            print("\nFailed Tests:")
            for f in self.failed:
                print(f"  {f}")
        print("="*80)

results = TestResults()

def cleanup_patients():
    """Delete all test patients to ensure clean state"""
    print("\n🧹 Cleaning up test patients...")
    try:
        response = requests.get(f"{BASE_URL}/patients", timeout=TIMEOUT)
        if response.status_code == 200:
            patients = response.json()
            for patient in patients:
                patient_id = patient.get('id')
                if patient_id:
                    del_response = requests.delete(f"{BASE_URL}/patients/{patient_id}", timeout=TIMEOUT)
                    if del_response.status_code == 200:
                        print(f"   Deleted patient: {patient.get('name', 'Unknown')} (ID: {patient_id})")
            print("✅ Cleanup complete")
        else:
            print(f"⚠️  Could not fetch patients for cleanup: {response.status_code}")
    except Exception as e:
        print(f"⚠️  Cleanup error: {str(e)}")

def test_1_get_patients_empty():
    """Test 1: GET /api/patients returns array (initially empty after cleanup)"""
    print("\n" + "="*80)
    print("TEST 1: GET /api/patients (should return empty array)")
    print("="*80)
    try:
        response = requests.get(f"{BASE_URL}/patients", timeout=TIMEOUT)
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, list):
                results.add_pass("GET /api/patients", f"Returns array with {len(data)} patients")
                return True
            else:
                results.add_fail("GET /api/patients", f"Expected array, got {type(data)}")
                return False
        else:
            results.add_fail("GET /api/patients", f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        results.add_fail("GET /api/patients", f"Exception: {str(e)}")
        return False

def test_2_create_patient():
    """Test 2: POST /api/patients with valid data returns patient with uuid"""
    print("\n" + "="*80)
    print("TEST 2: POST /api/patients (create patient)")
    print("="*80)
    try:
        patient_data = {
            "name": "Margaret Chen",
            "bed": "Bed 12",
            "age": "72",
            "diagnosis": "Congestive heart failure exacerbation"
        }
        response = requests.post(f"{BASE_URL}/patients", json=patient_data, timeout=TIMEOUT)
        if response.status_code == 200:
            patient = response.json()
            if 'id' in patient and patient['id']:
                if 'name' in patient and patient['name'] == patient_data['name']:
                    results.created_patient_ids.append(patient['id'])
                    results.add_pass("POST /api/patients", f"Created patient with ID: {patient['id']}")
                    return patient
                else:
                    results.add_fail("POST /api/patients", "Patient data mismatch")
                    return None
            else:
                results.add_fail("POST /api/patients", "No uuid 'id' in response")
                return None
        else:
            results.add_fail("POST /api/patients", f"Status {response.status_code}: {response.text}")
            return None
    except Exception as e:
        results.add_fail("POST /api/patients", f"Exception: {str(e)}")
        return None

def test_3_create_patient_missing_name():
    """Test 3: POST /api/patients without name returns 400"""
    print("\n" + "="*80)
    print("TEST 3: POST /api/patients (missing name - should return 400)")
    print("="*80)
    try:
        patient_data = {
            "bed": "Bed 5",
            "age": "45",
            "diagnosis": "Pneumonia"
        }
        response = requests.post(f"{BASE_URL}/patients", json=patient_data, timeout=TIMEOUT)
        if response.status_code == 400:
            results.add_pass("POST /api/patients (no name)", "Correctly returns 400 error")
            return True
        else:
            results.add_fail("POST /api/patients (no name)", f"Expected 400, got {response.status_code}")
            return False
    except Exception as e:
        results.add_fail("POST /api/patients (no name)", f"Exception: {str(e)}")
        return False

def test_4_max_4_patients():
    """Test 4: Create patients until 4 exist, then verify 5th returns 400"""
    print("\n" + "="*80)
    print("TEST 4: Max 4 patients enforcement")
    print("="*80)
    try:
        # Get current count
        response = requests.get(f"{BASE_URL}/patients", timeout=TIMEOUT)
        current_count = len(response.json()) if response.status_code == 200 else 0
        print(f"   Current patient count: {current_count}")
        
        # Create patients until we have 4
        patients_to_create = 4 - current_count
        for i in range(patients_to_create):
            patient_data = {
                "name": f"Test Patient {i+1}",
                "bed": f"Bed {i+1}",
                "age": "65",
                "diagnosis": "Test diagnosis"
            }
            response = requests.post(f"{BASE_URL}/patients", json=patient_data, timeout=TIMEOUT)
            if response.status_code == 200:
                patient = response.json()
                results.created_patient_ids.append(patient['id'])
                print(f"   Created patient {i+1}: {patient['name']}")
            else:
                results.add_fail("Max 4 enforcement", f"Failed to create patient {i+1}: {response.status_code}")
                return False
        
        # Verify we have 4 patients
        response = requests.get(f"{BASE_URL}/patients", timeout=TIMEOUT)
        if response.status_code == 200:
            patients = response.json()
            print(f"   Total patients now: {len(patients)}")
            if len(patients) != 4:
                results.add_fail("Max 4 enforcement", f"Expected 4 patients, got {len(patients)}")
                return False
        
        # Try to create 5th patient - should fail with 400
        print("   Attempting to create 5th patient (should fail)...")
        patient_data = {
            "name": "Fifth Patient (should fail)",
            "bed": "Bed 5",
            "age": "50",
            "diagnosis": "Should not be created"
        }
        response = requests.post(f"{BASE_URL}/patients", json=patient_data, timeout=TIMEOUT)
        if response.status_code == 400:
            error_msg = response.json().get('error', '')
            if 'full' in error_msg.lower() or 'max' in error_msg.lower():
                results.add_pass("Max 4 enforcement", f"Correctly blocked 5th patient: {error_msg}")
                return True
            else:
                results.add_fail("Max 4 enforcement", f"Got 400 but unclear error: {error_msg}")
                return False
        else:
            results.add_fail("Max 4 enforcement", f"Expected 400, got {response.status_code}")
            return False
    except Exception as e:
        results.add_fail("Max 4 enforcement", f"Exception: {str(e)}")
        return False

def test_5_get_patient_by_id(patient_id: str):
    """Test 5: GET /api/patients/:id returns patient"""
    print("\n" + "="*80)
    print(f"TEST 5: GET /api/patients/{patient_id}")
    print("="*80)
    try:
        response = requests.get(f"{BASE_URL}/patients/{patient_id}", timeout=TIMEOUT)
        if response.status_code == 200:
            patient = response.json()
            if patient.get('id') == patient_id:
                results.add_pass("GET /api/patients/:id", f"Retrieved patient: {patient.get('name')}")
                return patient
            else:
                results.add_fail("GET /api/patients/:id", "ID mismatch in response")
                return None
        else:
            results.add_fail("GET /api/patients/:id", f"Status {response.status_code}: {response.text}")
            return None
    except Exception as e:
        results.add_fail("GET /api/patients/:id", f"Exception: {str(e)}")
        return None

def test_6_update_patient(patient_id: str):
    """Test 6: PUT /api/patients/:id updates patient"""
    print("\n" + "="*80)
    print(f"TEST 6: PUT /api/patients/{patient_id}")
    print("="*80)
    try:
        update_data = {
            "diagnosis": "Updated diagnosis: Heart failure with improved ejection fraction"
        }
        response = requests.put(f"{BASE_URL}/patients/{patient_id}", json=update_data, timeout=TIMEOUT)
        if response.status_code == 200:
            patient = response.json()
            if patient.get('diagnosis') == update_data['diagnosis']:
                results.add_pass("PUT /api/patients/:id", f"Updated diagnosis successfully")
                return patient
            else:
                results.add_fail("PUT /api/patients/:id", "Diagnosis not updated")
                return None
        else:
            results.add_fail("PUT /api/patients/:id", f"Status {response.status_code}: {response.text}")
            return None
    except Exception as e:
        results.add_fail("PUT /api/patients/:id", f"Exception: {str(e)}")
        return None

def test_7_add_document(patient_id: str):
    """Test 7: POST /api/patients/:id/documents adds document with uuid"""
    print("\n" + "="*80)
    print(f"TEST 7: POST /api/patients/{patient_id}/documents")
    print("="*80)
    try:
        doc_data = {
            "documents": [
                {
                    "name": "Vital Signs Assessment",
                    "category": "vitals",
                    "kind": "text",
                    "textContent": "BP 150/95, HR 92, SpO2 94%, RR 22, mild shortness of breath on exertion"
                }
            ]
        }
        response = requests.post(f"{BASE_URL}/patients/{patient_id}/documents", json=doc_data, timeout=TIMEOUT)
        if response.status_code == 200:
            patient = response.json()
            documents = patient.get('documents', [])
            if len(documents) > 0:
                doc = documents[-1]  # Get last added document
                if 'id' in doc and doc['id']:
                    results.add_pass("POST /api/patients/:id/documents", f"Added document with ID: {doc['id']}")
                    return doc['id']
                else:
                    results.add_fail("POST /api/patients/:id/documents", "Document missing uuid 'id'")
                    return None
            else:
                results.add_fail("POST /api/patients/:id/documents", "No documents in response")
                return None
        else:
            results.add_fail("POST /api/patients/:id/documents", f"Status {response.status_code}: {response.text}")
            return None
    except Exception as e:
        results.add_fail("POST /api/patients/:id/documents", f"Exception: {str(e)}")
        return None

def test_8_add_care_plan_document(patient_id: str):
    """Test 8: Add a care plan document for AI generation"""
    print("\n" + "="*80)
    print(f"TEST 8: POST /api/patients/{patient_id}/documents (care plan)")
    print("="*80)
    try:
        doc_data = {
            "documents": [
                {
                    "name": "Nursing Care Plan",
                    "category": "care_plan",
                    "kind": "text",
                    "textContent": """NURSING CARE PLAN
Patient: Margaret Chen, 72 years old
Diagnosis: Congestive Heart Failure (CHF) Exacerbation

ASSESSMENT:
- Bilateral lower extremity edema (2+ pitting)
- Crackles in bilateral lung bases
- Dyspnea on exertion
- Weight gain of 5kg over past week
- JVP elevated at 8cm

NURSING DIAGNOSES:
1. Decreased cardiac output related to impaired ventricular function
2. Excess fluid volume related to decreased cardiac output
3. Activity intolerance related to imbalance between oxygen supply and demand

INTERVENTIONS:
- Monitor vital signs q4h
- Daily weights (same time, same scale)
- Strict I&O monitoring
- Fluid restriction 1500mL/day
- Low sodium diet
- Elevate HOB 30-45 degrees
- Oxygen therapy to maintain SpO2 >92%
- Monitor for signs of respiratory distress
- Administer diuretics as ordered
- Monitor electrolytes, especially potassium

MEDICATIONS:
- Furosemide 40mg IV BD
- Ramipril 5mg PO daily
- Metoprolol 25mg PO BD
- Spironolactone 25mg PO daily

GOALS:
- Patient will demonstrate improved cardiac output
- Patient will achieve fluid balance
- Patient will tolerate activity without dyspnea"""
                }
            ]
        }
        response = requests.post(f"{BASE_URL}/patients/{patient_id}/documents", json=doc_data, timeout=TIMEOUT)
        if response.status_code == 200:
            patient = response.json()
            documents = patient.get('documents', [])
            results.add_pass("POST care plan document", f"Total documents now: {len(documents)}")
            return True
        else:
            results.add_fail("POST care plan document", f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        results.add_fail("POST care plan document", f"Exception: {str(e)}")
        return False

def test_9_delete_document(patient_id: str, doc_id: str):
    """Test 9: DELETE /api/patients/:id/documents/:docId removes document"""
    print("\n" + "="*80)
    print(f"TEST 9: DELETE /api/patients/{patient_id}/documents/{doc_id}")
    print("="*80)
    try:
        # Get current document count
        response = requests.get(f"{BASE_URL}/patients/{patient_id}", timeout=TIMEOUT)
        if response.status_code != 200:
            results.add_fail("DELETE document (pre-check)", "Could not fetch patient")
            return False
        
        before_count = len(response.json().get('documents', []))
        print(f"   Documents before delete: {before_count}")
        
        # Delete document
        response = requests.delete(f"{BASE_URL}/patients/{patient_id}/documents/{doc_id}", timeout=TIMEOUT)
        if response.status_code == 200:
            patient = response.json()
            after_count = len(patient.get('documents', []))
            print(f"   Documents after delete: {after_count}")
            
            # Verify document was removed
            doc_ids = [d['id'] for d in patient.get('documents', [])]
            if doc_id not in doc_ids and after_count == before_count - 1:
                results.add_pass("DELETE /api/patients/:id/documents/:docId", f"Document removed successfully")
                return True
            else:
                results.add_fail("DELETE /api/patients/:id/documents/:docId", "Document not properly removed")
                return False
        else:
            results.add_fail("DELETE /api/patients/:id/documents/:docId", f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        results.add_fail("DELETE /api/patients/:id/documents/:docId", f"Exception: {str(e)}")
        return False

def test_10_ai_generation(patient_id: str):
    """Test 10: POST /api/patients/:id/generate calls real Gemini and returns aiOutput"""
    print("\n" + "="*80)
    print(f"TEST 10: POST /api/patients/{patient_id}/generate (REAL AI - may take 15-40s)")
    print("="*80)
    print("⏳ Calling Gemini 2.5 Pro via Emergent LLM proxy...")
    print("   This may take up to 90 seconds...")
    
    try:
        start_time = time.time()
        response = requests.post(f"{BASE_URL}/patients/{patient_id}/generate", timeout=AI_TIMEOUT)
        elapsed = time.time() - start_time
        print(f"   Response received in {elapsed:.1f} seconds")
        
        if response.status_code == 200:
            data = response.json()
            
            # Check for required top-level keys
            if 'aiOutput' not in data or 'aiGeneratedAt' not in data:
                results.add_fail("AI generation", "Missing aiOutput or aiGeneratedAt in response")
                return False
            
            ai_output = data['aiOutput']
            
            # Check for all required keys in aiOutput
            required_keys = [
                'patientSummary',
                'priorities',
                'interventions',
                'isbar',
                'medications',
                'redFlags',
                'newGradTips',
                'safetyNotice'
            ]
            
            missing_keys = [key for key in required_keys if key not in ai_output]
            if missing_keys:
                results.add_fail("AI generation", f"Missing keys in aiOutput: {missing_keys}")
                return False
            
            # Verify isbar structure
            isbar = ai_output.get('isbar', {})
            isbar_keys = ['identify', 'situation', 'background', 'assessment', 'recommendation']
            missing_isbar = [key for key in isbar_keys if key not in isbar]
            if missing_isbar:
                results.add_fail("AI generation", f"Missing ISBAR keys: {missing_isbar}")
                return False
            
            # Verify arrays
            if not isinstance(ai_output.get('priorities'), list):
                results.add_fail("AI generation", "priorities is not an array")
                return False
            
            if not isinstance(ai_output.get('interventions'), list):
                results.add_fail("AI generation", "interventions is not an array")
                return False
            
            # Check if priorities have required structure
            if len(ai_output['priorities']) > 0:
                priority = ai_output['priorities'][0]
                if not all(k in priority for k in ['priority', 'rationale', 'urgency']):
                    results.add_fail("AI generation", "Priority objects missing required fields")
                    return False
            
            print(f"   ✓ patientSummary: {ai_output['patientSummary'][:80]}...")
            print(f"   ✓ priorities: {len(ai_output['priorities'])} items")
            print(f"   ✓ interventions: {len(ai_output['interventions'])} items")
            print(f"   ✓ medications: {len(ai_output['medications'])} items")
            print(f"   ✓ redFlags: {len(ai_output['redFlags'])} items")
            print(f"   ✓ newGradTips: {len(ai_output['newGradTips'])} items")
            print(f"   ✓ ISBAR: all 5 sections present")
            
            results.add_pass("AI generation", f"Generated complete nursing care output in {elapsed:.1f}s")
            return True
        else:
            results.add_fail("AI generation", f"Status {response.status_code}: {response.text[:200]}")
            return False
    except requests.exceptions.Timeout:
        results.add_fail("AI generation", f"Request timed out after {AI_TIMEOUT}s")
        return False
    except Exception as e:
        results.add_fail("AI generation", f"Exception: {str(e)}")
        return False

def test_11_ai_persisted(patient_id: str):
    """Test 11: Verify aiOutput was persisted to patient record"""
    print("\n" + "="*80)
    print(f"TEST 11: GET /api/patients/{patient_id} (verify AI persisted)")
    print("="*80)
    try:
        response = requests.get(f"{BASE_URL}/patients/{patient_id}", timeout=TIMEOUT)
        if response.status_code == 200:
            patient = response.json()
            if 'aiOutput' in patient and patient['aiOutput']:
                if 'aiGeneratedAt' in patient and patient['aiGeneratedAt']:
                    results.add_pass("AI persistence", "aiOutput and aiGeneratedAt saved to patient record")
                    return True
                else:
                    results.add_fail("AI persistence", "aiGeneratedAt not saved")
                    return False
            else:
                results.add_fail("AI persistence", "aiOutput not saved to patient")
                return False
        else:
            results.add_fail("AI persistence", f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        results.add_fail("AI persistence", f"Exception: {str(e)}")
        return False

def test_12_delete_patient(patient_id: str):
    """Test 12: DELETE /api/patients/:id removes patient"""
    print("\n" + "="*80)
    print(f"TEST 12: DELETE /api/patients/{patient_id}")
    print("="*80)
    try:
        response = requests.delete(f"{BASE_URL}/patients/{patient_id}", timeout=TIMEOUT)
        if response.status_code == 200:
            data = response.json()
            if data.get('success') == True:
                results.add_pass("DELETE /api/patients/:id", "Patient deleted successfully")
                return True
            else:
                results.add_fail("DELETE /api/patients/:id", "Response missing success:true")
                return False
        else:
            results.add_fail("DELETE /api/patients/:id", f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        results.add_fail("DELETE /api/patients/:id", f"Exception: {str(e)}")
        return False

def main():
    print("="*80)
    print("NURSECARE BACKEND API TEST SUITE")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Testing against: Next.js backend with MongoDB")
    print(f"AI Model: gemini/gemini-2.5-pro via Emergent LLM proxy")
    print("="*80)
    
    # Cleanup first
    cleanup_patients()
    
    # Test 1: GET patients (empty)
    test_1_get_patients_empty()
    
    # Test 2: Create first patient
    patient1 = test_2_create_patient()
    if not patient1:
        print("\n❌ CRITICAL: Cannot continue without creating a patient")
        results.print_summary()
        return
    
    patient1_id = patient1['id']
    
    # Test 3: Create patient without name (should fail)
    test_3_create_patient_missing_name()
    
    # Test 4: Max 4 patients enforcement
    test_4_max_4_patients()
    
    # Test 5: Get patient by ID
    test_5_get_patient_by_id(patient1_id)
    
    # Test 6: Update patient
    test_6_update_patient(patient1_id)
    
    # Test 7: Add document (vitals)
    doc_id = test_7_add_document(patient1_id)
    
    # Test 8: Add care plan document (for AI generation)
    test_8_add_care_plan_document(patient1_id)
    
    # Test 9: Delete document (if we got a doc_id)
    if doc_id:
        test_9_delete_document(patient1_id, doc_id)
    
    # Test 10: AI generation (CRITICAL - real Gemini call)
    ai_success = test_10_ai_generation(patient1_id)
    
    # Test 11: Verify AI output was persisted
    if ai_success:
        test_11_ai_persisted(patient1_id)
    
    # Test 12: Delete patient
    test_12_delete_patient(patient1_id)
    
    # Final cleanup
    cleanup_patients()
    
    # Print summary
    results.print_summary()
    
    # Exit with appropriate code
    if len(results.failed) > 0:
        print("\n❌ TESTS FAILED")
        exit(1)
    else:
        print("\n✅ ALL TESTS PASSED")
        exit(0)

if __name__ == "__main__":
    main()
