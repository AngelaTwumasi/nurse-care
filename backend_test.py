#!/usr/bin/env python3
"""
Comprehensive backend regression test after refactor.
Tests ALL endpoints to ensure NO regressions from the modular split.
"""

import requests
import json
import base64
import time
import sys
from datetime import datetime

# Base URL from environment
BASE_URL = "https://web-nurse-app.preview.emergentagent.com/api"

# IMPORTANT: Preserve these 4 real patients
PROTECTED_PATIENTS = ["LAITHANG SILAS", "YIM SOLNAE", "JOHNSTONE JOHN", "ARMSTRONG DENIS"]

# Test results tracking
test_results = []
created_patient_ids = []

def log_test(test_name, passed, message=""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    result = f"{status}: {test_name}"
    if message:
        result += f" - {message}"
    print(result)
    test_results.append({"test": test_name, "passed": passed, "message": message})
    return passed

def cleanup_test_patients():
    """Delete all test patients created during testing, preserve protected patients"""
    print("\n🧹 Cleaning up test patients...")
    try:
        response = requests.get(f"{BASE_URL}/patients")
        if response.status_code == 200:
            patients = response.json()
            for patient in patients:
                # Only delete patients we created during testing
                if patient['id'] in created_patient_ids:
                    try:
                        del_resp = requests.delete(f"{BASE_URL}/patients/{patient['id']}")
                        if del_resp.status_code == 200:
                            print(f"  Deleted test patient: {patient['name']} (ID: {patient['id']})")
                    except Exception as e:
                        print(f"  Warning: Could not delete {patient['name']}: {e}")
    except Exception as e:
        print(f"Warning: Cleanup error: {e}")

def test_1_get_patients():
    """Test 1: GET /api/patients - returns array with documents stripped of dataUrl"""
    print("\n📋 Test 1: GET /api/patients")
    try:
        response = requests.get(f"{BASE_URL}/patients")
        if response.status_code != 200:
            return log_test("GET /patients", False, f"Expected 200, got {response.status_code}")
        
        patients = response.json()
        if not isinstance(patients, list):
            return log_test("GET /patients", False, "Response is not an array")
        
        # Check that documents don't have dataUrl
        for patient in patients:
            if 'documents' in patient:
                for doc in patient['documents']:
                    if 'dataUrl' in doc and doc['dataUrl'] is not None:
                        return log_test("GET /patients", False, f"Document has dataUrl (should be stripped): {doc}")
        
        return log_test("GET /patients", True, f"Returned {len(patients)} patients, documents stripped correctly")
    except Exception as e:
        return log_test("GET /patients", False, f"Exception: {e}")

def test_2_post_patient_validation():
    """Test 2: POST /api/patients - missing name returns 400"""
    print("\n📋 Test 2: POST /api/patients - validation")
    try:
        # Test missing name
        response = requests.post(f"{BASE_URL}/patients", json={})
        if response.status_code != 400:
            return log_test("POST /patients - missing name", False, f"Expected 400, got {response.status_code}")
        
        error_data = response.json()
        if 'error' not in error_data:
            return log_test("POST /patients - missing name", False, "No error message in response")
        
        return log_test("POST /patients - missing name", True, f"Correctly returned 400: {error_data['error']}")
    except Exception as e:
        return log_test("POST /patients - missing name", False, f"Exception: {e}")

def test_3_post_patient_create():
    """Test 3: POST /api/patients - creates patient with UUID"""
    print("\n📋 Test 3: POST /api/patients - create patient")
    try:
        patient_data = {
            "name": "TEST_REGRESSION_1",
            "bed": "Bed 1",
            "age": "65",
            "diagnosis": "Test diagnosis"
        }
        response = requests.post(f"{BASE_URL}/patients", json=patient_data)
        if response.status_code != 200:
            return log_test("POST /patients - create", False, f"Expected 200, got {response.status_code}")
        
        patient = response.json()
        if 'id' not in patient:
            return log_test("POST /patients - create", False, "No id in response")
        
        # Check UUID format (36 chars with dashes)
        if len(patient['id']) != 36 or patient['id'].count('-') != 4:
            return log_test("POST /patients - create", False, f"Invalid UUID format: {patient['id']}")
        
        created_patient_ids.append(patient['id'])
        return log_test("POST /patients - create", True, f"Created patient with UUID: {patient['id']}")
    except Exception as e:
        return log_test("POST /patients - create", False, f"Exception: {e}")

def test_4_max_patients_enforcement():
    """Test 4: POST /api/patients - enforce max 10 patients"""
    print("\n📋 Test 4: POST /api/patients - max 10 enforcement")
    temp_patient_ids = []
    try:
        # Get current count
        response = requests.get(f"{BASE_URL}/patients")
        current_count = len(response.json())
        print(f"  Current patient count: {current_count}")
        
        # Create patients up to max 10
        while current_count < 10:
            patient_data = {
                "name": f"TEST_REGRESSION_FILL_{current_count}",
                "bed": f"Bed {current_count}",
                "age": "70",
                "diagnosis": "Test"
            }
            resp = requests.post(f"{BASE_URL}/patients", json=patient_data)
            if resp.status_code == 200:
                pid = resp.json()['id']
                created_patient_ids.append(pid)
                temp_patient_ids.append(pid)
                current_count += 1
                print(f"  Created patient {current_count}/10")
            else:
                return log_test("POST /patients - max 10", False, f"Failed to create patient at count {current_count}")
        
        # Try to create 11th patient
        patient_data = {
            "name": "TEST_REGRESSION_11TH",
            "bed": "Bed 11",
            "age": "70",
            "diagnosis": "Should fail"
        }
        response = requests.post(f"{BASE_URL}/patients", json=patient_data)
        
        if response.status_code != 400:
            return log_test("POST /patients - max 10", False, f"Expected 400 for 11th patient, got {response.status_code}")
        
        error_data = response.json()
        error_msg = error_data.get('error', '').lower()
        
        # Check error message mentions 'max 10' and 'full'
        if 'max 10' not in error_msg and 'max 10' not in error_msg.replace(' ', ''):
            return log_test("POST /patients - max 10", False, f"Error message doesn't mention 'max 10': {error_data['error']}")
        
        if 'full' not in error_msg:
            return log_test("POST /patients - max 10", False, f"Error message doesn't mention 'full': {error_data['error']}")
        
        result = log_test("POST /patients - max 10", True, f"11th patient correctly rejected: {error_data['error']}")
        
        # Clean up immediately to allow other tests to run
        print("  Cleaning up temp patients to allow other tests...")
        for pid in temp_patient_ids:
            try:
                requests.delete(f"{BASE_URL}/patients/{pid}")
                created_patient_ids.remove(pid)
            except Exception:
                pass
        
        return result
    except Exception as e:
        # Clean up on error
        for pid in temp_patient_ids:
            try:
                requests.delete(f"{BASE_URL}/patients/{pid}")
                if pid in created_patient_ids:
                    created_patient_ids.remove(pid)
            except Exception:
                pass
        return log_test("POST /patients - max 10", False, f"Exception: {e}")

def test_5_get_patient_by_id():
    """Test 5: GET /api/patients/:id - retrieve patient"""
    print("\n📋 Test 5: GET /api/patients/:id")
    try:
        if not created_patient_ids:
            return log_test("GET /patients/:id", False, "No test patients created")
        
        patient_id = created_patient_ids[0]
        response = requests.get(f"{BASE_URL}/patients/{patient_id}")
        
        if response.status_code != 200:
            return log_test("GET /patients/:id", False, f"Expected 200, got {response.status_code}")
        
        patient = response.json()
        if patient['id'] != patient_id:
            return log_test("GET /patients/:id", False, f"Wrong patient returned")
        
        return log_test("GET /patients/:id", True, f"Retrieved patient: {patient['name']}")
    except Exception as e:
        return log_test("GET /patients/:id", False, f"Exception: {e}")

def test_6_put_patient():
    """Test 6: PUT /api/patients/:id - update fields"""
    print("\n📋 Test 6: PUT /api/patients/:id - update fields")
    try:
        if not created_patient_ids:
            return log_test("PUT /patients/:id", False, "No test patients created")
        
        patient_id = created_patient_ids[0]
        
        # Update patient
        update_data = {
            "name": "TEST_REGRESSION_UPDATED",
            "bed": "Bed 99",
            "age": "75",
            "diagnosis": "Updated diagnosis"
        }
        response = requests.put(f"{BASE_URL}/patients/{patient_id}", json=update_data)
        
        if response.status_code != 200:
            return log_test("PUT /patients/:id", False, f"Expected 200, got {response.status_code}")
        
        # Verify update
        get_resp = requests.get(f"{BASE_URL}/patients/{patient_id}")
        patient = get_resp.json()
        
        if patient['name'] != update_data['name']:
            return log_test("PUT /patients/:id", False, f"Name not updated: {patient['name']}")
        
        return log_test("PUT /patients/:id", True, "Patient updated successfully")
    except Exception as e:
        return log_test("PUT /patients/:id", False, f"Exception: {e}")

def test_7_put_handover_note():
    """Test 7: PUT /api/patients/:id - handoverNote sets handoverNoteAt"""
    print("\n📋 Test 7: PUT /api/patients/:id - handoverNote timestamp")
    try:
        if not created_patient_ids:
            return log_test("PUT handoverNote", False, "No test patients created")
        
        patient_id = created_patient_ids[0]
        
        # Set handover note
        update_data = {"handoverNote": "Test handover note"}
        response = requests.put(f"{BASE_URL}/patients/{patient_id}", json=update_data)
        
        if response.status_code != 200:
            return log_test("PUT handoverNote", False, f"Expected 200, got {response.status_code}")
        
        # Get patient and check timestamp
        get_resp = requests.get(f"{BASE_URL}/patients/{patient_id}")
        patient = get_resp.json()
        
        if 'handoverNoteAt' not in patient:
            return log_test("PUT handoverNote", False, "handoverNoteAt not set")
        
        # Verify it's a valid ISO timestamp
        try:
            datetime.fromisoformat(patient['handoverNoteAt'].replace('Z', '+00:00'))
        except Exception:
            return log_test("PUT handoverNote", False, f"Invalid timestamp: {patient['handoverNoteAt']}")
        
        # Update handover note again and verify timestamp changes
        time.sleep(1)
        update_data2 = {"handoverNote": "Updated handover note"}
        response2 = requests.put(f"{BASE_URL}/patients/{patient_id}", json=update_data2)
        get_resp2 = requests.get(f"{BASE_URL}/patients/{patient_id}")
        patient2 = get_resp2.json()
        
        if patient2['handoverNoteAt'] == patient['handoverNoteAt']:
            return log_test("PUT handoverNote", False, "handoverNoteAt not updated on subsequent PUT")
        
        # PUT without handoverNote should leave it intact
        update_data3 = {"age": "80"}
        response3 = requests.put(f"{BASE_URL}/patients/{patient_id}", json=update_data3)
        get_resp3 = requests.get(f"{BASE_URL}/patients/{patient_id}")
        patient3 = get_resp3.json()
        
        if patient3['handoverNote'] != update_data2['handoverNote']:
            return log_test("PUT handoverNote", False, "handoverNote changed when not in PUT body")
        
        return log_test("PUT handoverNote", True, "handoverNoteAt correctly set and updated")
    except Exception as e:
        return log_test("PUT handoverNote", False, f"Exception: {e}")

def test_8_delete_patient():
    """Test 8: DELETE /api/patients/:id - returns {success:true}"""
    print("\n📋 Test 8: DELETE /api/patients/:id")
    try:
        # Create a patient to delete
        patient_data = {
            "name": "TEST_DELETE",
            "bed": "Bed 1",
            "age": "65",
            "diagnosis": "Test"
        }
        create_resp = requests.post(f"{BASE_URL}/patients", json=patient_data)
        if create_resp.status_code != 200:
            return log_test("DELETE /patients/:id", False, f"Could not create test patient: {create_resp.status_code}")
        patient_id = create_resp.json()['id']
        
        # Delete patient
        response = requests.delete(f"{BASE_URL}/patients/{patient_id}")
        
        if response.status_code != 200:
            return log_test("DELETE /patients/:id", False, f"Expected 200, got {response.status_code}")
        
        result = response.json()
        if result.get('success') != True:
            return log_test("DELETE /patients/:id", False, f"Expected {{success:true}}, got {result}")
        
        # Verify patient is gone
        get_resp = requests.get(f"{BASE_URL}/patients/{patient_id}")
        if get_resp.status_code != 404:
            return log_test("DELETE /patients/:id", False, "Patient still exists after delete")
        
        return log_test("DELETE /patients/:id", True, "Patient deleted successfully")
    except Exception as e:
        return log_test("DELETE /patients/:id", False, f"Exception: {e}")

def test_9_sample_sepsis():
    """Test 9: POST /api/sample {type:'sepsis'} - full patient with all fields"""
    print("\n📋 Test 9: POST /api/sample - sepsis")
    try:
        response = requests.post(f"{BASE_URL}/sample", json={"type": "sepsis"})
        
        if response.status_code != 200:
            return log_test("POST /sample sepsis", False, f"Expected 200, got {response.status_code}")
        
        patient = response.json()
        
        # Check basic fields
        if not patient.get('id') or len(patient['id']) != 36:
            return log_test("POST /sample sepsis", False, "Invalid UUID")
        
        if patient.get('isSample') != True:
            return log_test("POST /sample sepsis", False, "isSample not true")
        
        if not patient.get('documents') or len(patient['documents']) < 1:
            return log_test("POST /sample sepsis", False, "No documents")
        
        if not patient.get('ewHistory') or len(patient['ewHistory']) < 3:
            return log_test("POST /sample sepsis", False, "ewHistory missing or too short")
        
        # Check aiOutput has all required keys
        ai = patient.get('aiOutput', {})
        required_keys = [
            'patientSummary', 'priorities', 'interventions', 'isbar', 'medications',
            'medicationTimes', 'vitalsTimeline', 'careSchedule', 'earlyWarning',
            'redFlags', 'newGradTips', 'safetyNotice', 'handoverHeader', 'criticalActions',
            'drsabcd', 'dietMobility', 'assessments', 'linesDevices', 'edd',
            'recommendations', 'outstandingTasks', 'abbreviations'
        ]
        
        missing_keys = [key for key in required_keys if key not in ai]
        if missing_keys:
            return log_test("POST /sample sepsis", False, f"Missing aiOutput keys: {missing_keys}")
        
        # Check handoverHeader subfields
        hh = ai.get('handoverHeader', {})
        if not all(k in hh for k in ['alerts', 'diagnosis', 'background', 'age', 'attendingDoctor']):
            return log_test("POST /sample sepsis", False, "handoverHeader missing subfields")
        
        # Check isbar sections
        isbar = ai.get('isbar', {})
        if not all(k in isbar for k in ['identify', 'situation', 'background', 'assessment', 'recommendation']):
            return log_test("POST /sample sepsis", False, "isbar missing sections")
        
        # Check drsabcd fields
        drs = ai.get('drsabcd', {})
        if not all(k in drs for k in ['danger', 'response', 'sendForHelp', 'airway', 'breathing', 'circulation', 'disability', 'exposure']):
            return log_test("POST /sample sepsis", False, "drsabcd missing fields")
        
        # Check medications have times array
        meds = ai.get('medications', [])
        if not meds:
            return log_test("POST /sample sepsis", False, "No medications")
        
        for med in meds:
            if 'times' not in med or not isinstance(med['times'], list):
                return log_test("POST /sample sepsis", False, f"Medication missing times array: {med}")
        
        # Check interventions have howToMonitor
        interventions = ai.get('interventions', [])
        for interv in interventions:
            if 'howToMonitor' not in interv:
                return log_test("POST /sample sepsis", False, "Intervention missing howToMonitor")
        
        # Check abbreviations is non-empty array
        abbr = ai.get('abbreviations', [])
        if not isinstance(abbr, list) or len(abbr) == 0:
            return log_test("POST /sample sepsis", False, "abbreviations not a non-empty array")
        
        for ab in abbr:
            if 'abbr' not in ab or 'meaning' not in ab:
                return log_test("POST /sample sepsis", False, "abbreviation missing abbr/meaning")
        
        # Check earlyWarning riskLevel is high
        ew = ai.get('earlyWarning', {})
        if ew.get('riskLevel') != 'high':
            return log_test("POST /sample sepsis", False, f"Expected high risk, got {ew.get('riskLevel')}")
        
        created_patient_ids.append(patient['id'])
        result = log_test("POST /sample sepsis", True, f"All fields present and valid, risk={ew.get('riskLevel')}")
        
        # Clean up immediately to free space for other tests
        try:
            requests.delete(f"{BASE_URL}/patients/{patient['id']}")
            created_patient_ids.remove(patient['id'])
        except Exception:
            pass
        
        return result
    except Exception as e:
        return log_test("POST /sample sepsis", False, f"Exception: {e}")

def test_10_sample_postop():
    """Test 10: POST /api/sample {type:'postop'} - low risk"""
    print("\n📋 Test 10: POST /api/sample - postop")
    try:
        response = requests.post(f"{BASE_URL}/sample", json={"type": "postop"})
        
        if response.status_code != 200:
            return log_test("POST /sample postop", False, f"Expected 200, got {response.status_code}")
        
        patient = response.json()
        ai = patient.get('aiOutput', {})
        ew = ai.get('earlyWarning', {})
        
        if ew.get('riskLevel') != 'low':
            return log_test("POST /sample postop", False, f"Expected low risk, got {ew.get('riskLevel')}")
        
        created_patient_ids.append(patient['id'])
        result = log_test("POST /sample postop", True, f"Postop sample created, risk={ew.get('riskLevel')}")
        
        # Clean up immediately
        try:
            requests.delete(f"{BASE_URL}/patients/{patient['id']}")
            created_patient_ids.remove(patient['id'])
        except Exception:
            pass
        
        return result
    except Exception as e:
        return log_test("POST /sample postop", False, f"Exception: {e}")

def test_11_sample_chf_default():
    """Test 11: POST /api/sample (no body) - CHF default, high risk"""
    print("\n📋 Test 11: POST /api/sample - CHF default")
    try:
        response = requests.post(f"{BASE_URL}/sample", json={})
        
        if response.status_code != 200:
            return log_test("POST /sample CHF", False, f"Expected 200, got {response.status_code}")
        
        patient = response.json()
        ai = patient.get('aiOutput', {})
        ew = ai.get('earlyWarning', {})
        
        if ew.get('riskLevel') != 'high':
            return log_test("POST /sample CHF", False, f"Expected high risk, got {ew.get('riskLevel')}")
        
        created_patient_ids.append(patient['id'])
        result = log_test("POST /sample CHF", True, f"CHF sample created, risk={ew.get('riskLevel')}")
        
        # Clean up immediately
        try:
            requests.delete(f"{BASE_URL}/patients/{patient['id']}")
            created_patient_ids.remove(patient['id'])
        except Exception:
            pass
        
        return result
    except Exception as e:
        return log_test("POST /sample CHF", False, f"Exception: {e}")

def test_12_document_text_upload():
    """Test 12: POST /api/patients/:id/documents - text note"""
    print("\n📋 Test 12: POST /documents - text note")
    try:
        # Create a patient first
        patient_data = {"name": "TEST_DOC", "bed": "Bed 1", "age": "65", "diagnosis": "Test"}
        create_resp = requests.post(f"{BASE_URL}/patients", json=patient_data)
        if create_resp.status_code != 200:
            return log_test("POST documents - text", False, f"Could not create test patient: {create_resp.status_code}")
        patient_id = create_resp.json()['id']
        created_patient_ids.append(patient_id)
        
        # Add text document
        doc_data = {
            "documents": [{
                "name": "Test Note",
                "category": "vitals",
                "kind": "text",
                "textContent": "Test vitals: HR 80, BP 120/80"
            }]
        }
        response = requests.post(f"{BASE_URL}/patients/{patient_id}/documents", json=doc_data)
        
        if response.status_code != 200:
            return log_test("POST documents - text", False, f"Expected 200, got {response.status_code}")
        
        patient = response.json()
        if not patient.get('documents') or len(patient['documents']) == 0:
            return log_test("POST documents - text", False, "No documents in response")
        
        doc = patient['documents'][0]
        if doc.get('kind') != 'text':
            return log_test("POST documents - text", False, f"Wrong kind: {doc.get('kind')}")
        
        result = log_test("POST documents - text", True, "Text document added successfully")
        
        # Clean up immediately
        try:
            requests.delete(f"{BASE_URL}/patients/{patient_id}")
            created_patient_ids.remove(patient_id)
        except Exception:
            pass
        
        return result
    except Exception as e:
        return log_test("POST documents - text", False, f"Exception: {e}")

def test_13_document_file_upload():
    """Test 13: POST /api/patients/:id/documents - base64 image (GridFS)"""
    print("\n📋 Test 13: POST /documents - base64 image (GridFS)")
    try:
        # Create a patient first
        patient_data = {"name": "TEST_GRIDFS", "bed": "Bed 1", "age": "65", "diagnosis": "Test"}
        create_resp = requests.post(f"{BASE_URL}/patients", json=patient_data)
        if create_resp.status_code != 200:
            return log_test("POST documents - file", False, f"Could not create test patient: {create_resp.status_code}")
        patient_id = create_resp.json()['id']
        created_patient_ids.append(patient_id)
        
        # Create a small PNG (1x1 red pixel)
        png_bytes = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==")
        data_url = f"data:image/png;base64,{base64.b64encode(png_bytes).decode()}"
        
        # Add file document
        doc_data = {
            "documents": [{
                "name": "Test Image",
                "category": "other",
                "kind": "file",
                "mimeType": "image/png",
                "dataUrl": data_url
            }]
        }
        response = requests.post(f"{BASE_URL}/patients/{patient_id}/documents", json=doc_data)
        
        if response.status_code != 200:
            return log_test("POST documents - file", False, f"Expected 200, got {response.status_code}")
        
        patient = response.json()
        doc = patient['documents'][0]
        
        if doc.get('hasFile') != True:
            return log_test("POST documents - file", False, "hasFile not true")
        
        if doc.get('dataUrl') is not None:
            return log_test("POST documents - file", False, "dataUrl should be null (stored in GridFS)")
        
        # Test GET content
        doc_id = doc['id']
        content_resp = requests.get(f"{BASE_URL}/patients/{patient_id}/documents/{doc_id}/content")
        
        if content_resp.status_code != 200:
            return log_test("POST documents - file", False, f"GET content failed: {content_resp.status_code}")
        
        if content_resp.headers.get('Content-Type') != 'image/png':
            return log_test("POST documents - file", False, f"Wrong Content-Type: {content_resp.headers.get('Content-Type')}")
        
        if len(content_resp.content) != len(png_bytes):
            return log_test("POST documents - file", False, f"Wrong content length: {len(content_resp.content)} vs {len(png_bytes)}")
        
        result = log_test("POST documents - file", True, "File stored in GridFS and retrieved correctly")
        
        # Clean up immediately
        try:
            requests.delete(f"{BASE_URL}/patients/{patient_id}")
            created_patient_ids.remove(patient_id)
        except Exception:
            pass
        
        return result
    except Exception as e:
        return log_test("POST documents - file", False, f"Exception: {e}")

def test_14_document_large_file():
    """Test 14: POST /api/patients/:id/documents - larger file (~1-2MB)"""
    print("\n📋 Test 14: POST /documents - large file (GridFS)")
    try:
        # Create a patient first
        patient_data = {"name": "TEST_LARGE_FILE", "bed": "Bed 1", "age": "65", "diagnosis": "Test"}
        create_resp = requests.post(f"{BASE_URL}/patients", json=patient_data)
        if create_resp.status_code != 200:
            return log_test("POST documents - large file", False, f"Could not create test patient: {create_resp.status_code}")
        patient_id = create_resp.json()['id']
        created_patient_ids.append(patient_id)
        
        # Create a ~1MB file (base64 encoded will be larger)
        large_data = b"X" * (1024 * 1024)  # 1MB
        data_url = f"data:application/octet-stream;base64,{base64.b64encode(large_data).decode()}"
        
        print(f"  Uploading {len(large_data)} bytes (~1MB)...")
        
        # Add large file document
        doc_data = {
            "documents": [{
                "name": "Large Test File",
                "category": "other",
                "kind": "file",
                "mimeType": "application/octet-stream",
                "dataUrl": data_url
            }]
        }
        response = requests.post(f"{BASE_URL}/patients/{patient_id}/documents", json=doc_data, timeout=60)
        
        if response.status_code != 200:
            return log_test("POST documents - large file", False, f"Expected 200, got {response.status_code}: {response.text[:200]}")
        
        patient = response.json()
        doc = patient['documents'][0]
        
        if doc.get('hasFile') != True:
            return log_test("POST documents - large file", False, "hasFile not true")
        
        # Test GET content
        doc_id = doc['id']
        content_resp = requests.get(f"{BASE_URL}/patients/{patient_id}/documents/{doc_id}/content", timeout=60)
        
        if content_resp.status_code != 200:
            return log_test("POST documents - large file", False, f"GET content failed: {content_resp.status_code}")
        
        if len(content_resp.content) != len(large_data):
            return log_test("POST documents - large file", False, f"Wrong content length: {len(content_resp.content)} vs {len(large_data)}")
        
        result = log_test("POST documents - large file", True, f"Large file ({len(large_data)} bytes) stored and retrieved correctly")
        
        # Clean up immediately
        try:
            requests.delete(f"{BASE_URL}/patients/{patient_id}")
            created_patient_ids.remove(patient_id)
        except Exception:
            pass
        
        return result
    except Exception as e:
        return log_test("POST documents - large file", False, f"Exception: {e}")

def test_15_document_delete():
    """Test 15: DELETE /api/patients/:id/documents/:docId"""
    print("\n📋 Test 15: DELETE /documents/:docId")
    try:
        # Create a patient with a document
        patient_data = {"name": "TEST_DOC_DELETE", "bed": "Bed 1", "age": "65", "diagnosis": "Test"}
        create_resp = requests.post(f"{BASE_URL}/patients", json=patient_data)
        if create_resp.status_code != 200:
            return log_test("DELETE documents/:docId", False, f"Could not create test patient: {create_resp.status_code}")
        patient_id = create_resp.json()['id']
        created_patient_ids.append(patient_id)
        
        # Add document
        doc_data = {
            "documents": [{
                "name": "To Delete",
                "category": "other",
                "kind": "text",
                "textContent": "Delete me"
            }]
        }
        add_resp = requests.post(f"{BASE_URL}/patients/{patient_id}/documents", json=doc_data)
        doc_id = add_resp.json()['documents'][0]['id']
        
        # Delete document
        del_resp = requests.delete(f"{BASE_URL}/patients/{patient_id}/documents/{doc_id}")
        
        if del_resp.status_code != 200:
            return log_test("DELETE documents/:docId", False, f"Expected 200, got {del_resp.status_code}")
        
        # Verify document is gone
        get_resp = requests.get(f"{BASE_URL}/patients/{patient_id}")
        patient = get_resp.json()
        
        if any(d['id'] == doc_id for d in patient.get('documents', [])):
            return log_test("DELETE documents/:docId", False, "Document still exists after delete")
        
        # Verify content endpoint returns 404
        content_resp = requests.get(f"{BASE_URL}/patients/{patient_id}/documents/{doc_id}/content")
        if content_resp.status_code != 404:
            return log_test("DELETE documents/:docId", False, f"Content endpoint should return 404, got {content_resp.status_code}")
        
        result = log_test("DELETE documents/:docId", True, "Document deleted successfully")
        
        # Clean up patient
        try:
            requests.delete(f"{BASE_URL}/patients/{patient_id}")
            created_patient_ids.remove(patient_id)
        except Exception:
            pass
        
        return result
    except Exception as e:
        return log_test("DELETE documents/:docId", False, f"Exception: {e}")

def test_16_ingest_multi_patient():
    """Test 16: POST /api/ingest - multi-patient document"""
    print("\n📋 Test 16: POST /api/ingest - multi-patient")
    try:
        # Create a document with 3-4 patients
        doc_text = """
SHIFT ALLOCATION - WARD 3B

Patient 1: John Smith, Bed 12, 68 years old
Diagnosis: Community acquired pneumonia
Obs: HR 92, BP 135/82, RR 22, SpO2 93% on 2L O2

Patient 2: Mary Johnson, Bed 14, 72 years old
Diagnosis: Post-op day 2 total knee replacement
Obs: HR 78, BP 128/76, RR 16, SpO2 98% RA

Patient 3: Ahmed Khan, Bed 16, 55 years old
Diagnosis: COPD exacerbation
Obs: HR 88, BP 142/88, RR 24, SpO2 89% on 4L O2

Patient 4: Rosa Diaz, Bed 18, 63 years old
Diagnosis: UTI with confusion
Obs: HR 102, BP 118/72, RR 20, SpO2 96% RA
"""
        
        ingest_data = {
            "documents": [{
                "name": "Shift Allocation",
                "category": "other",
                "kind": "text",
                "textContent": doc_text
            }]
        }
        
        print("  Calling AI to detect patients (may take 10-20s)...")
        response = requests.post(f"{BASE_URL}/ingest", json=ingest_data, timeout=60)
        
        if response.status_code != 200:
            return log_test("POST /ingest - multi", False, f"Expected 200, got {response.status_code}: {response.text[:200]}")
        
        result = response.json()
        
        # Check response structure
        if 'detectedCount' not in result or 'created' not in result or 'truncated' not in result:
            return log_test("POST /ingest - multi", False, f"Missing fields in response: {result.keys()}")
        
        if result['detectedCount'] < 3:
            return log_test("POST /ingest - multi", False, f"Expected to detect 3-4 patients, got {result['detectedCount']}")
        
        if result['created'] < 3:
            return log_test("POST /ingest - multi", False, f"Expected to create 3+ patients, got {result['created']}")
        
        # Check patients have focusHint
        patients = result.get('patients', [])
        for p in patients:
            created_patient_ids.append(p['id'])
            if not p.get('focusHint'):
                return log_test("POST /ingest - multi", False, f"Patient missing focusHint: {p['name']}")
            if not p.get('documents') or len(p['documents']) == 0:
                return log_test("POST /ingest - multi", False, f"Patient missing documents: {p['name']}")
        
        result_msg = log_test("POST /ingest - multi", True, f"Detected {result['detectedCount']}, created {result['created']}, truncated={result['truncated']}")
        
        # Clean up immediately to free space
        for p in patients:
            try:
                requests.delete(f"{BASE_URL}/patients/{p['id']}")
                created_patient_ids.remove(p['id'])
            except Exception:
                pass
        
        return result_msg
    except Exception as e:
        return log_test("POST /ingest - multi", False, f"Exception: {e}")

def test_17_ingest_single_patient():
    """Test 17: POST /api/ingest - single patient (focusHint=null)"""
    print("\n📋 Test 17: POST /api/ingest - single patient")
    try:
        doc_text = """
Patient: Tim Green, Bed 20, 45 years old
Diagnosis: Acute pancreatitis
Obs: HR 88, BP 132/78, RR 18, SpO2 97% RA
"""
        
        ingest_data = {
            "documents": [{
                "name": "Single Patient",
                "category": "other",
                "kind": "text",
                "textContent": doc_text
            }]
        }
        
        print("  Calling AI to detect patients (may take 10-20s)...")
        response = requests.post(f"{BASE_URL}/ingest", json=ingest_data, timeout=60)
        
        if response.status_code != 200:
            return log_test("POST /ingest - single", False, f"Expected 200, got {response.status_code}")
        
        result = response.json()
        
        if result['detectedCount'] != 1:
            return log_test("POST /ingest - single", False, f"Expected detectedCount=1, got {result['detectedCount']}")
        
        if result['created'] != 1:
            return log_test("POST /ingest - single", False, f"Expected created=1, got {result['created']}")
        
        patient = result['patients'][0]
        created_patient_ids.append(patient['id'])
        
        if patient.get('focusHint') is not None:
            return log_test("POST /ingest - single", False, f"Single patient should have focusHint=null, got {patient.get('focusHint')}")
        
        result_msg = log_test("POST /ingest - single", True, "Single patient ingested with focusHint=null")
        
        # Clean up immediately
        try:
            requests.delete(f"{BASE_URL}/patients/{patient['id']}")
            created_patient_ids.remove(patient['id'])
        except Exception:
            pass
        
        return result_msg
    except Exception as e:
        return log_test("POST /ingest - single", False, f"Exception: {e}")

def test_18_ingest_empty_documents():
    """Test 18: POST /api/ingest - empty documents returns 400"""
    print("\n📋 Test 18: POST /api/ingest - empty documents")
    try:
        response = requests.post(f"{BASE_URL}/ingest", json={"documents": []})
        
        if response.status_code != 400:
            return log_test("POST /ingest - empty", False, f"Expected 400, got {response.status_code}")
        
        error_data = response.json()
        if 'error' not in error_data:
            return log_test("POST /ingest - empty", False, "No error message in response")
        
        return log_test("POST /ingest - empty", True, f"Correctly returned 400: {error_data['error']}")
    except Exception as e:
        return log_test("POST /ingest - empty", False, f"Exception: {e}")

def test_19_generate_real_gemini():
    """Test 19: POST /api/patients/:id/generate - REAL Gemini 2.5 Pro call"""
    print("\n📋 Test 19: POST /generate - REAL Gemini 2.5 Pro")
    try:
        # Create a patient with documents
        patient_data = {
            "name": "TEST_GENERATE",
            "bed": "Bed 1",
            "age": "70",
            "diagnosis": "COPD exacerbation"
        }
        create_resp = requests.post(f"{BASE_URL}/patients", json=patient_data)
        if create_resp.status_code != 200:
            return log_test("POST /generate", False, f"Could not create test patient: {create_resp.status_code}")
        patient_id = create_resp.json()['id']
        created_patient_ids.append(patient_id)
        
        # Add document with vitals and meds
        doc_text = """
COPD exacerbation. Increasing SOB.
Medications: Salbutamol neb QID (0600 1200 1800 2400), Prednisolone 40mg PO daily (0800)
Vitals 0600: HR 88, BP 138/82, RR 22, SpO2 91% on 2L O2, Temp 37.1
Vitals 1000: HR 96, BP 132/78, RR 24, SpO2 89% on 2L O2, Temp 37.4
"""
        doc_data = {
            "documents": [{
                "name": "Care Plan",
                "category": "careplan",
                "kind": "text",
                "textContent": doc_text
            }]
        }
        requests.post(f"{BASE_URL}/patients/{patient_id}/documents", json=doc_data)
        
        # Generate AI care plan
        print("  Calling REAL Gemini 2.5 Pro (expect 30-40s)...")
        start_time = time.time()
        response = requests.post(f"{BASE_URL}/patients/{patient_id}/generate", timeout=120)
        elapsed = time.time() - start_time
        
        if response.status_code != 200:
            return log_test("POST /generate", False, f"Expected 200, got {response.status_code}: {response.text[:200]}")
        
        result = response.json()
        
        if 'aiOutput' not in result or 'aiGeneratedAt' not in result:
            return log_test("POST /generate", False, "Missing aiOutput or aiGeneratedAt")
        
        ai = result['aiOutput']
        
        # Check all required keys
        required_keys = [
            'patientSummary', 'priorities', 'interventions', 'isbar', 'medications',
            'medicationTimes', 'vitalsTimeline', 'careSchedule', 'earlyWarning',
            'redFlags', 'newGradTips', 'safetyNotice', 'handoverHeader', 'criticalActions',
            'drsabcd', 'dietMobility', 'assessments', 'linesDevices', 'edd',
            'recommendations', 'outstandingTasks', 'abbreviations'
        ]
        
        missing_keys = [key for key in required_keys if key not in ai]
        if missing_keys:
            return log_test("POST /generate", False, f"Missing aiOutput keys: {missing_keys}")
        
        # Verify data persisted
        get_resp = requests.get(f"{BASE_URL}/patients/{patient_id}")
        patient = get_resp.json()
        
        if not patient.get('aiOutput'):
            return log_test("POST /generate", False, "aiOutput not persisted")
        
        if not patient.get('ewHistory') or len(patient['ewHistory']) == 0:
            return log_test("POST /generate", False, "ewHistory not appended")
        
        return log_test("POST /generate", True, f"AI generation completed in {elapsed:.1f}s, all keys present and persisted")
    except Exception as e:
        return log_test("POST /generate", False, f"Exception: {e}")

def test_20_worsen_endpoint():
    """Test 20: POST /api/patients/:id/worsen - score +2, risk escalates"""
    print("\n📋 Test 20: POST /worsen")
    try:
        # Create a postop sample (starts at score 0, low risk)
        sample_resp = requests.post(f"{BASE_URL}/sample", json={"type": "postop"})
        patient = sample_resp.json()
        patient_id = patient['id']
        created_patient_ids.append(patient_id)
        
        initial_score = int(patient['aiOutput']['earlyWarning']['score'])
        initial_risk = patient['aiOutput']['earlyWarning']['riskLevel']
        initial_hist_len = len(patient['ewHistory'])
        
        print(f"  Initial: score={initial_score}, risk={initial_risk}, ewHistory length={initial_hist_len}")
        
        # Call worsen
        worsen_resp = requests.post(f"{BASE_URL}/patients/{patient_id}/worsen")
        
        if worsen_resp.status_code != 200:
            return log_test("POST /worsen", False, f"Expected 200, got {worsen_resp.status_code}")
        
        result = worsen_resp.json()
        ai = result['aiOutput']
        ew = ai['earlyWarning']
        
        new_score = int(ew['score'])
        new_risk = ew['riskLevel']
        
        if new_score != initial_score + 2:
            return log_test("POST /worsen", False, f"Score should increase by 2: {initial_score} -> {new_score}")
        
        if ew['trend'] != 'worsening':
            return log_test("POST /worsen", False, f"Trend should be 'worsening', got {ew['trend']}")
        
        # Verify persisted
        get_resp = requests.get(f"{BASE_URL}/patients/{patient_id}")
        patient = get_resp.json()
        
        if len(patient['ewHistory']) != initial_hist_len + 1:
            return log_test("POST /worsen", False, f"ewHistory should grow by 1: {initial_hist_len} -> {len(patient['ewHistory'])}")
        
        # Call worsen multiple times to test escalation
        for i in range(3):
            requests.post(f"{BASE_URL}/patients/{patient_id}/worsen")
        
        get_resp = requests.get(f"{BASE_URL}/patients/{patient_id}")
        patient = get_resp.json()
        final_score = int(patient['aiOutput']['earlyWarning']['score'])
        final_risk = patient['aiOutput']['earlyWarning']['riskLevel']
        
        print(f"  After 4 worsen calls: score={final_score}, risk={final_risk}")
        
        # Score should be 0 + 2*4 = 8 (high risk)
        if final_score < 7:
            return log_test("POST /worsen", False, f"Score should escalate to >=7 for high risk, got {final_score}")
        
        if final_risk != 'high':
            return log_test("POST /worsen", False, f"Risk should escalate to high, got {final_risk}")
        
        return log_test("POST /worsen", True, f"Score escalated {initial_score}->{final_score}, risk {initial_risk}->{final_risk}")
    except Exception as e:
        return log_test("POST /worsen", False, f"Exception: {e}")

def test_21_improve_endpoint():
    """Test 21: POST /api/patients/:id/improve - score -2, risk de-escalates"""
    print("\n📋 Test 21: POST /improve")
    try:
        # Create a sepsis sample (starts at score 8, high risk)
        sample_resp = requests.post(f"{BASE_URL}/sample", json={"type": "sepsis"})
        patient = sample_resp.json()
        patient_id = patient['id']
        created_patient_ids.append(patient_id)
        
        initial_score = int(patient['aiOutput']['earlyWarning']['score'])
        initial_risk = patient['aiOutput']['earlyWarning']['riskLevel']
        initial_hist_len = len(patient['ewHistory'])
        
        print(f"  Initial: score={initial_score}, risk={initial_risk}, ewHistory length={initial_hist_len}")
        
        # Call improve multiple times
        for i in range(5):
            improve_resp = requests.post(f"{BASE_URL}/patients/{patient_id}/improve")
            if improve_resp.status_code != 200:
                return log_test("POST /improve", False, f"Expected 200, got {improve_resp.status_code}")
        
        # Get final state
        get_resp = requests.get(f"{BASE_URL}/patients/{patient_id}")
        patient = get_resp.json()
        
        final_score = int(patient['aiOutput']['earlyWarning']['score'])
        final_risk = patient['aiOutput']['earlyWarning']['riskLevel']
        final_trend = patient['aiOutput']['earlyWarning']['trend']
        final_hist_len = len(patient['ewHistory'])
        
        print(f"  After 5 improve calls: score={final_score}, risk={final_risk}, trend={final_trend}")
        
        # Score should be 8 - 2*5 = -2, but floored at 0
        if final_score != 0:
            return log_test("POST /improve", False, f"Score should floor at 0, got {final_score}")
        
        if final_risk != 'low':
            return log_test("POST /improve", False, f"Risk should de-escalate to low, got {final_risk}")
        
        if final_trend != 'stable':
            return log_test("POST /improve", False, f"Trend should be 'stable' at score 0, got {final_trend}")
        
        if final_hist_len != initial_hist_len + 5:
            return log_test("POST /improve", False, f"ewHistory should grow by 5: {initial_hist_len} -> {final_hist_len}")
        
        return log_test("POST /improve", True, f"Score de-escalated {initial_score}->{final_score}, risk {initial_risk}->{final_risk}, trend={final_trend}")
    except Exception as e:
        return log_test("POST /improve", False, f"Exception: {e}")

def main():
    """Run all tests"""
    print("=" * 80)
    print("BACKEND REGRESSION TEST - POST REFACTOR")
    print("Testing ALL endpoints after modular split")
    print("=" * 80)
    
    try:
        # Run all tests
        test_1_get_patients()
        test_2_post_patient_validation()
        test_3_post_patient_create()
        test_4_max_patients_enforcement()
        test_5_get_patient_by_id()
        test_6_put_patient()
        test_7_put_handover_note()
        test_8_delete_patient()
        test_9_sample_sepsis()
        test_10_sample_postop()
        test_11_sample_chf_default()
        test_12_document_text_upload()
        test_13_document_file_upload()
        test_14_document_large_file()
        test_15_document_delete()
        test_16_ingest_multi_patient()
        test_17_ingest_single_patient()
        test_18_ingest_empty_documents()
        test_19_generate_real_gemini()
        test_20_worsen_endpoint()
        test_21_improve_endpoint()
        
    finally:
        # Always cleanup
        cleanup_test_patients()
    
    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    
    passed = sum(1 for r in test_results if r['passed'])
    failed = sum(1 for r in test_results if not r['passed'])
    total = len(test_results)
    
    print(f"\nTotal: {total} tests")
    print(f"✅ Passed: {passed}")
    print(f"❌ Failed: {failed}")
    
    if failed > 0:
        print("\n❌ FAILED TESTS:")
        for r in test_results:
            if not r['passed']:
                print(f"  - {r['test']}: {r['message']}")
    
    print("\n" + "=" * 80)
    
    if failed == 0:
        print("✅ ALL TESTS PASSED - NO REGRESSIONS DETECTED")
        return 0
    else:
        print("❌ SOME TESTS FAILED - REGRESSIONS DETECTED")
        return 1

if __name__ == "__main__":
    sys.exit(main())
