#!/usr/bin/env python3
"""
Comprehensive backend test: Audio transcription (NEW) + Regression tests
Tests audio upload/transcription, generate with audio, and all core endpoints.
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
                # Also delete by name pattern (in case ID tracking failed)
                elif patient['name'].startswith('TEST_') or patient['name'].startswith('Audio Test'):
                    if patient['name'] not in PROTECTED_PATIENTS:
                        try:
                            del_resp = requests.delete(f"{BASE_URL}/patients/{patient['id']}")
                            if del_resp.status_code == 200:
                                print(f"  Deleted test patient by name: {patient['name']}")
                        except Exception as e:
                            print(f"  Warning: Could not delete {patient['name']}: {e}")
    except Exception as e:
        print(f"Warning: Cleanup error: {e}")

# ============================================================================
# NEW FEATURE TESTS: AUDIO TRANSCRIPTION
# ============================================================================

def test_audio_1_transcription():
    """Test 1 (NEW): Audio upload transcription - POST /documents with audio/wav"""
    print("\n🎤 Test 1 (NEW): Audio transcription")
    try:
        # Create a patient
        patient_data = {
            "name": "Audio Test Patient",
            "bed": "Bed 4",
            "age": "65",
            "diagnosis": "Post-op monitoring"
        }
        create_resp = requests.post(f"{BASE_URL}/patients", json=patient_data)
        if create_resp.status_code != 200:
            return log_test("Audio transcription", False, f"Could not create patient: {create_resp.status_code}")
        patient_id = create_resp.json()['id']
        created_patient_ids.append(patient_id)
        
        # Read the test audio file
        try:
            with open('/app/test_handover.wav', 'rb') as f:
                audio_bytes = f.read()
        except Exception as e:
            return log_test("Audio transcription", False, f"Could not read test_handover.wav: {e}")
        
        # Create base64 data URL
        audio_b64 = base64.b64encode(audio_bytes).decode()
        data_url = f"data:audio/wav;base64,{audio_b64}"
        
        print(f"  Uploading audio file ({len(audio_bytes)} bytes)...")
        
        # Upload audio document
        doc_data = {
            "documents": [{
                "name": "handover.wav",
                "category": "handover",
                "kind": "file",
                "mimeType": "audio/wav",
                "dataUrl": data_url
            }]
        }
        
        print("  Waiting for transcription (expect 5-20s)...")
        start_time = time.time()
        response = requests.post(f"{BASE_URL}/patients/{patient_id}/documents", json=doc_data, timeout=60)
        elapsed = time.time() - start_time
        
        if response.status_code != 200:
            return log_test("Audio transcription", False, f"Expected 200, got {response.status_code}: {response.text[:200]}")
        
        patient = response.json()
        if not patient.get('documents') or len(patient['documents']) == 0:
            return log_test("Audio transcription", False, "No documents in response")
        
        doc = patient['documents'][0]
        
        # Check hasFile
        if doc.get('hasFile') != True:
            return log_test("Audio transcription", False, f"hasFile should be true, got {doc.get('hasFile')}")
        
        # Check transcript exists and is non-empty
        if not doc.get('transcript'):
            return log_test("Audio transcription", False, "transcript is empty or missing")
        
        transcript = doc['transcript']
        print(f"  Transcript ({len(transcript)} chars): {transcript[:100]}...")
        
        # Check transcript contains expected content from test_handover.wav
        # Expected: "Handover for patient in bed four. Heart rate is ninety-two..."
        transcript_lower = transcript.lower()
        expected_phrases = ['bed four', 'heart rate', 'neurological']
        found_phrases = [phrase for phrase in expected_phrases if phrase in transcript_lower]
        
        if len(found_phrases) < 2:
            return log_test("Audio transcription", False, f"Transcript doesn't contain expected content. Found {found_phrases} out of {expected_phrases}. Transcript: {transcript[:200]}")
        
        # Check transcribedAt timestamp
        if not doc.get('transcribedAt'):
            return log_test("Audio transcription", False, "transcribedAt is missing")
        
        try:
            datetime.fromisoformat(doc['transcribedAt'].replace('Z', '+00:00'))
        except Exception:
            return log_test("Audio transcription", False, f"Invalid transcribedAt timestamp: {doc['transcribedAt']}")
        
        # Check textContent equals transcript
        if doc.get('textContent') != transcript:
            return log_test("Audio transcription", False, f"textContent should equal transcript")
        
        # Test GET content endpoint - should stream audio bytes
        doc_id = doc['id']
        content_resp = requests.get(f"{BASE_URL}/patients/{patient_id}/documents/{doc_id}/content")
        
        if content_resp.status_code != 200:
            return log_test("Audio transcription", False, f"GET content failed: {content_resp.status_code}")
        
        # Check Content-Type
        content_type = content_resp.headers.get('Content-Type', '')
        if not content_type.startswith('audio/wav'):
            return log_test("Audio transcription", False, f"Wrong Content-Type: {content_type}, expected audio/wav")
        
        # Check Content-Disposition is inline
        content_disp = content_resp.headers.get('Content-Disposition', '')
        if 'inline' not in content_disp:
            return log_test("Audio transcription", False, f"Content-Disposition should be inline, got: {content_disp}")
        
        # Check content length matches original
        if len(content_resp.content) != len(audio_bytes):
            return log_test("Audio transcription", False, f"Content length mismatch: {len(content_resp.content)} vs {len(audio_bytes)}")
        
        return log_test("Audio transcription", True, f"Transcription completed in {elapsed:.1f}s. Found phrases: {found_phrases}. hasFile=true, transcript non-empty, textContent=transcript, content streams audio/wav inline")
    
    except Exception as e:
        return log_test("Audio transcription", False, f"Exception: {e}")

def test_audio_2_generate_reads_audio():
    """Test 2 (NEW): Generate reads audio - POST /generate with audio doc"""
    print("\n🎤 Test 2 (NEW): Generate reads audio document")
    try:
        # Use the patient from test 1 if it exists, otherwise create new
        if not created_patient_ids:
            return log_test("Generate reads audio", False, "No patient from audio test 1")
        
        patient_id = created_patient_ids[-1]  # Use the last created patient (audio test patient)
        
        # Generate AI care plan
        print("  Calling REAL Gemini 2.5 Pro to generate care plan from audio (expect 30-50s)...")
        start_time = time.time()
        response = requests.post(f"{BASE_URL}/patients/{patient_id}/generate", timeout=120)
        elapsed = time.time() - start_time
        
        if response.status_code != 200:
            return log_test("Generate reads audio", False, f"Expected 200, got {response.status_code}: {response.text[:200]}")
        
        result = response.json()
        
        if 'aiOutput' not in result:
            return log_test("Generate reads audio", False, "Missing aiOutput")
        
        ai = result['aiOutput']
        
        # Check all required schema keys are present
        required_keys = [
            'patientSummary', 'priorities', 'interventions', 'isbar', 'medications',
            'medicationTimes', 'vitalsTimeline', 'careSchedule', 'earlyWarning',
            'redFlags', 'newGradTips', 'safetyNotice', 'handoverHeader', 'criticalActions',
            'drsabcd', 'dietMobility', 'assessments', 'linesDevices', 'edd',
            'recommendations', 'outstandingTasks', 'abbreviations'
        ]
        
        missing_keys = [key for key in required_keys if key not in ai]
        if missing_keys:
            return log_test("Generate reads audio", False, f"Missing aiOutput keys: {missing_keys}")
        
        # Check that the AI output reflects the spoken handover content
        # Expected content from test_handover.wav: bed four, heart rate 92, BP 120/80, SpO2 96%, 
        # hourly neurological observations, analgesia
        
        # Convert all text fields to lowercase for searching
        all_text = json.dumps(ai).lower()
        
        # Look for references to the spoken content
        expected_content = [
            ('neurological', 'hourly neurological observations'),
            ('analgesia', 'analgesia/pain management'),
        ]
        
        found_content = []
        for keyword, description in expected_content:
            if keyword in all_text:
                found_content.append(description)
        
        if len(found_content) < 1:
            return log_test("Generate reads audio", False, f"AI output doesn't reflect spoken handover content. Expected references to neurological observations and/or analgesia. AI output sample: {ai.get('patientSummary', '')[:200]}")
        
        # Check isbar sections exist
        isbar = ai.get('isbar', {})
        if not all(k in isbar for k in ['identify', 'situation', 'background', 'assessment', 'recommendation']):
            return log_test("Generate reads audio", False, "isbar missing required sections")
        
        # Check interventions/priorities/careSchedule have content
        if not ai.get('interventions') or len(ai['interventions']) == 0:
            return log_test("Generate reads audio", False, "interventions is empty")
        
        if not ai.get('priorities') or len(ai['priorities']) == 0:
            return log_test("Generate reads audio", False, "priorities is empty")
        
        return log_test("Generate reads audio", True, f"AI generation completed in {elapsed:.1f}s. Full schema present (22 keys). Content reflects spoken handover: {found_content}")
    
    except Exception as e:
        return log_test("Generate reads audio", False, f"Exception: {e}")

# ============================================================================
# REGRESSION TESTS: DOCUMENTS
# ============================================================================

def test_reg_1_text_note():
    """Test 3 (REGRESSION): POST text note"""
    print("\n📋 Test 3 (REGRESSION): Text note upload")
    try:
        # Create a patient
        patient_data = {"name": "TEST_REG_TEXT", "bed": "Bed 1", "age": "65", "diagnosis": "Test"}
        create_resp = requests.post(f"{BASE_URL}/patients", json=patient_data)
        if create_resp.status_code != 200:
            return log_test("Text note", False, f"Could not create patient: {create_resp.status_code}")
        patient_id = create_resp.json()['id']
        created_patient_ids.append(patient_id)
        
        # Add text note
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
            return log_test("Text note", False, f"Expected 200, got {response.status_code}")
        
        patient = response.json()
        doc = patient['documents'][0]
        
        if doc.get('kind') != 'text':
            return log_test("Text note", False, f"Wrong kind: {doc.get('kind')}")
        
        if doc.get('textContent') != "Test vitals: HR 80, BP 120/80":
            return log_test("Text note", False, "textContent mismatch")
        
        return log_test("Text note", True, "Text note stored correctly")
    
    except Exception as e:
        return log_test("Text note", False, f"Exception: {e}")

def test_reg_2_png_image():
    """Test 4 (REGRESSION): POST base64 PNG image"""
    print("\n📋 Test 4 (REGRESSION): PNG image upload")
    try:
        # Use existing patient or create new
        if not created_patient_ids:
            patient_data = {"name": "TEST_REG_PNG", "bed": "Bed 1", "age": "65", "diagnosis": "Test"}
            create_resp = requests.post(f"{BASE_URL}/patients", json=patient_data)
            patient_id = create_resp.json()['id']
            created_patient_ids.append(patient_id)
        else:
            patient_id = created_patient_ids[-1]
        
        # Create a small PNG (1x1 red pixel)
        png_bytes = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==")
        data_url = f"data:image/png;base64,{base64.b64encode(png_bytes).decode()}"
        
        # Upload image
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
            return log_test("PNG image", False, f"Expected 200, got {response.status_code}")
        
        patient = response.json()
        doc = [d for d in patient['documents'] if d['name'] == 'Test Image'][0]
        
        # Check hasFile=true
        if doc.get('hasFile') != True:
            return log_test("PNG image", False, f"hasFile should be true, got {doc.get('hasFile')}")
        
        # Check dataUrl is null (stored in GridFS)
        if doc.get('dataUrl') is not None:
            return log_test("PNG image", False, "dataUrl should be null (stored in GridFS)")
        
        # Test GET content
        doc_id = doc['id']
        content_resp = requests.get(f"{BASE_URL}/patients/{patient_id}/documents/{doc_id}/content")
        
        if content_resp.status_code != 200:
            return log_test("PNG image", False, f"GET content failed: {content_resp.status_code}")
        
        if content_resp.headers.get('Content-Type') != 'image/png':
            return log_test("PNG image", False, f"Wrong Content-Type: {content_resp.headers.get('Content-Type')}")
        
        # Check Content-Disposition is inline
        content_disp = content_resp.headers.get('Content-Disposition', '')
        if 'inline' not in content_disp:
            return log_test("PNG image", False, f"Content-Disposition should be inline, got: {content_disp}")
        
        return log_test("PNG image", True, "PNG stored in GridFS, hasFile=true, no dataUrl, content streams image/png inline")
    
    except Exception as e:
        return log_test("PNG image", False, f"Exception: {e}")

def test_reg_3_delete_doc():
    """Test 5 (REGRESSION): DELETE document"""
    print("\n📋 Test 5 (REGRESSION): Delete document")
    try:
        # Use existing patient
        if not created_patient_ids:
            return log_test("Delete document", False, "No test patient available")
        
        patient_id = created_patient_ids[-1]
        
        # Get patient to find a document
        get_resp = requests.get(f"{BASE_URL}/patients/{patient_id}")
        patient = get_resp.json()
        
        if not patient.get('documents') or len(patient['documents']) == 0:
            return log_test("Delete document", False, "No documents to delete")
        
        doc_id = patient['documents'][0]['id']
        
        # Delete document
        del_resp = requests.delete(f"{BASE_URL}/patients/{patient_id}/documents/{doc_id}")
        
        if del_resp.status_code != 200:
            return log_test("Delete document", False, f"Expected 200, got {del_resp.status_code}")
        
        # Verify document is gone
        get_resp2 = requests.get(f"{BASE_URL}/patients/{patient_id}")
        patient2 = get_resp2.json()
        
        if any(d['id'] == doc_id for d in patient2.get('documents', [])):
            return log_test("Delete document", False, "Document still exists after delete")
        
        # Verify content endpoint returns 404
        content_resp = requests.get(f"{BASE_URL}/patients/{patient_id}/documents/{doc_id}/content")
        if content_resp.status_code != 404:
            return log_test("Delete document", False, f"Content endpoint should return 404, got {content_resp.status_code}")
        
        return log_test("Delete document", True, "Document deleted, content returns 404")
    
    except Exception as e:
        return log_test("Delete document", False, f"Exception: {e}")

def test_reg_4_sec003_30mb_rejection():
    """Test 6 (REGRESSION): SEC-003 - Reject >30MB upload with 413"""
    print("\n📋 Test 6 (REGRESSION): SEC-003 - 30MB upload limit")
    try:
        # Create a patient
        patient_data = {"name": "TEST_SEC003", "bed": "Bed 1", "age": "65", "diagnosis": "Test"}
        create_resp = requests.post(f"{BASE_URL}/patients", json=patient_data)
        if create_resp.status_code != 200:
            return log_test("SEC-003 30MB limit", False, f"Could not create patient: {create_resp.status_code}")
        patient_id = create_resp.json()['id']
        created_patient_ids.append(patient_id)
        
        # Create a >30MB file (31MB)
        print("  Creating 31MB file...")
        large_data = b"X" * (31 * 1024 * 1024)  # 31MB
        data_url = f"data:application/octet-stream;base64,{base64.b64encode(large_data).decode()}"
        
        print("  Uploading 31MB file (should be rejected)...")
        
        # Try to upload
        doc_data = {
            "documents": [{
                "name": "Too Large",
                "category": "other",
                "kind": "file",
                "mimeType": "application/octet-stream",
                "dataUrl": data_url
            }]
        }
        response = requests.post(f"{BASE_URL}/patients/{patient_id}/documents", json=doc_data, timeout=60)
        
        # Should return 413
        if response.status_code != 413:
            return log_test("SEC-003 30MB limit", False, f"Expected 413, got {response.status_code}")
        
        error_data = response.json()
        if 'error' not in error_data:
            return log_test("SEC-003 30MB limit", False, "No error message in response")
        
        error_msg = error_data['error'].lower()
        if 'large' not in error_msg and '30' not in error_msg:
            return log_test("SEC-003 30MB limit", False, f"Error message doesn't mention size limit: {error_data['error']}")
        
        return log_test("SEC-003 30MB limit", True, f"31MB upload correctly rejected with 413: {error_data['error']}")
    
    except Exception as e:
        return log_test("SEC-003 30MB limit", False, f"Exception: {e}")

def test_reg_5_sec002_html_security():
    """Test 7 (REGRESSION): SEC-002 - text/html served as octet-stream + attachment"""
    print("\n📋 Test 7 (REGRESSION): SEC-002 - HTML security")
    try:
        # Use existing patient or create new
        if not created_patient_ids:
            patient_data = {"name": "TEST_SEC002", "bed": "Bed 1", "age": "65", "diagnosis": "Test"}
            create_resp = requests.post(f"{BASE_URL}/patients", json=patient_data)
            patient_id = create_resp.json()['id']
            created_patient_ids.append(patient_id)
        else:
            patient_id = created_patient_ids[-1]
        
        # Create an HTML file
        html_content = b"<html><body><script>alert('XSS')</script></body></html>"
        data_url = f"data:text/html;base64,{base64.b64encode(html_content).decode()}"
        
        # Upload HTML file
        doc_data = {
            "documents": [{
                "name": "test.html",
                "category": "other",
                "kind": "file",
                "mimeType": "text/html",
                "dataUrl": data_url
            }]
        }
        response = requests.post(f"{BASE_URL}/patients/{patient_id}/documents", json=doc_data)
        
        if response.status_code != 200:
            return log_test("SEC-002 HTML security", False, f"Upload failed: {response.status_code}")
        
        patient = response.json()
        doc = [d for d in patient['documents'] if d['name'] == 'test.html'][0]
        doc_id = doc['id']
        
        # Get content
        content_resp = requests.get(f"{BASE_URL}/patients/{patient_id}/documents/{doc_id}/content")
        
        if content_resp.status_code != 200:
            return log_test("SEC-002 HTML security", False, f"GET content failed: {content_resp.status_code}")
        
        # Check Content-Type is application/octet-stream (NOT text/html)
        content_type = content_resp.headers.get('Content-Type', '')
        if content_type != 'application/octet-stream':
            return log_test("SEC-002 HTML security", False, f"Content-Type should be application/octet-stream, got: {content_type}")
        
        # Check Content-Disposition is attachment (NOT inline)
        content_disp = content_resp.headers.get('Content-Disposition', '')
        if 'attachment' not in content_disp:
            return log_test("SEC-002 HTML security", False, f"Content-Disposition should be attachment, got: {content_disp}")
        
        # Check X-Content-Type-Options: nosniff
        nosniff = content_resp.headers.get('X-Content-Type-Options', '')
        if nosniff != 'nosniff':
            return log_test("SEC-002 HTML security", False, f"X-Content-Type-Options should be nosniff, got: {nosniff}")
        
        return log_test("SEC-002 HTML security", True, "HTML served as application/octet-stream + attachment + nosniff")
    
    except Exception as e:
        return log_test("SEC-002 HTML security", False, f"Exception: {e}")

# ============================================================================
# REGRESSION TESTS: CORE ENDPOINTS
# ============================================================================

def test_reg_6_get_patients():
    """Test 8 (REGRESSION): GET /api/patients"""
    print("\n📋 Test 8 (REGRESSION): GET /api/patients")
    try:
        response = requests.get(f"{BASE_URL}/patients")
        if response.status_code != 200:
            return log_test("GET /patients", False, f"Expected 200, got {response.status_code}")
        
        patients = response.json()
        if not isinstance(patients, list):
            return log_test("GET /patients", False, "Response is not an array")
        
        return log_test("GET /patients", True, f"Returned {len(patients)} patients")
    except Exception as e:
        return log_test("GET /patients", False, f"Exception: {e}")

def test_reg_7_post_patient():
    """Test 9 (REGRESSION): POST /api/patients - create + validation"""
    print("\n📋 Test 9 (REGRESSION): POST /api/patients")
    try:
        # Test missing name validation
        response = requests.post(f"{BASE_URL}/patients", json={})
        if response.status_code != 400:
            return log_test("POST /patients validation", False, f"Expected 400 for missing name, got {response.status_code}")
        
        # Create valid patient
        patient_data = {
            "name": "TEST_REG_POST",
            "bed": "Bed 1",
            "age": "65",
            "diagnosis": "Test"
        }
        response = requests.post(f"{BASE_URL}/patients", json=patient_data)
        if response.status_code != 200:
            return log_test("POST /patients", False, f"Expected 200, got {response.status_code}")
        
        patient = response.json()
        if 'id' not in patient or len(patient['id']) != 36:
            return log_test("POST /patients", False, "Invalid UUID")
        
        created_patient_ids.append(patient['id'])
        return log_test("POST /patients", True, "Missing name returns 400, valid patient created with UUID")
    except Exception as e:
        return log_test("POST /patients", False, f"Exception: {e}")

def test_reg_8_max_10_enforcement():
    """Test 10 (REGRESSION): POST /api/patients - max 10 enforcement"""
    print("\n📋 Test 10 (REGRESSION): Max 10 patients enforcement")
    temp_patient_ids = []
    try:
        # Get current count
        response = requests.get(f"{BASE_URL}/patients")
        current_count = len(response.json())
        print(f"  Current patient count: {current_count}")
        
        # Create patients up to max 10
        while current_count < 10:
            patient_data = {
                "name": f"TEST_MAX10_{current_count}",
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
            else:
                # Clean up and fail
                for pid in temp_patient_ids:
                    try:
                        requests.delete(f"{BASE_URL}/patients/{pid}")
                        created_patient_ids.remove(pid)
                    except Exception:
                        pass
                return log_test("Max 10 enforcement", False, f"Failed to create patient at count {current_count}")
        
        # Try to create 11th patient
        patient_data = {
            "name": "TEST_11TH",
            "bed": "Bed 11",
            "age": "70",
            "diagnosis": "Should fail"
        }
        response = requests.post(f"{BASE_URL}/patients", json=patient_data)
        
        if response.status_code != 400:
            # Clean up
            for pid in temp_patient_ids:
                try:
                    requests.delete(f"{BASE_URL}/patients/{pid}")
                    created_patient_ids.remove(pid)
                except Exception:
                    pass
            return log_test("Max 10 enforcement", False, f"Expected 400 for 11th patient, got {response.status_code}")
        
        error_data = response.json()
        error_msg = error_data.get('error', '').lower()
        
        # Check error message
        if 'max 10' not in error_msg and 'max 10' not in error_msg.replace(' ', ''):
            # Clean up
            for pid in temp_patient_ids:
                try:
                    requests.delete(f"{BASE_URL}/patients/{pid}")
                    created_patient_ids.remove(pid)
                except Exception:
                    pass
            return log_test("Max 10 enforcement", False, f"Error message doesn't mention 'max 10': {error_data['error']}")
        
        result = log_test("Max 10 enforcement", True, f"11th patient correctly rejected: {error_data['error']}")
        
        # Clean up immediately
        print("  Cleaning up temp patients...")
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
        return log_test("Max 10 enforcement", False, f"Exception: {e}")

def test_reg_9_put_patient():
    """Test 11 (REGRESSION): PUT /api/patients/:id - handoverNote sets handoverNoteAt"""
    print("\n📋 Test 11 (REGRESSION): PUT /api/patients/:id")
    try:
        # Create a patient
        patient_data = {"name": "TEST_PUT", "bed": "Bed 1", "age": "65", "diagnosis": "Test"}
        create_resp = requests.post(f"{BASE_URL}/patients", json=patient_data)
        if create_resp.status_code != 200:
            return log_test("PUT patient", False, f"Could not create patient: {create_resp.status_code}")
        patient_id = create_resp.json()['id']
        created_patient_ids.append(patient_id)
        
        # Set handover note
        update_data = {"handoverNote": "Test handover note"}
        response = requests.put(f"{BASE_URL}/patients/{patient_id}", json=update_data)
        
        if response.status_code != 200:
            return log_test("PUT patient", False, f"Expected 200, got {response.status_code}")
        
        # Get patient and check timestamp
        get_resp = requests.get(f"{BASE_URL}/patients/{patient_id}")
        patient = get_resp.json()
        
        if 'handoverNoteAt' not in patient:
            return log_test("PUT patient", False, "handoverNoteAt not set")
        
        # Verify it's a valid ISO timestamp
        try:
            datetime.fromisoformat(patient['handoverNoteAt'].replace('Z', '+00:00'))
        except Exception:
            return log_test("PUT patient", False, f"Invalid timestamp: {patient['handoverNoteAt']}")
        
        return log_test("PUT patient", True, "handoverNote sets handoverNoteAt timestamp")
    except Exception as e:
        return log_test("PUT patient", False, f"Exception: {e}")

def test_reg_10_sample_endpoints():
    """Test 12 (REGRESSION): POST /api/sample - chf/sepsis/postop"""
    print("\n📋 Test 12 (REGRESSION): POST /api/sample")
    try:
        # Test CHF
        resp_chf = requests.post(f"{BASE_URL}/sample", json={"type": "chf"})
        if resp_chf.status_code != 200:
            return log_test("POST /sample", False, f"CHF sample failed: {resp_chf.status_code}")
        chf = resp_chf.json()
        created_patient_ids.append(chf['id'])
        
        # Test sepsis
        resp_sepsis = requests.post(f"{BASE_URL}/sample", json={"type": "sepsis"})
        if resp_sepsis.status_code != 200:
            return log_test("POST /sample", False, f"Sepsis sample failed: {resp_sepsis.status_code}")
        sepsis = resp_sepsis.json()
        created_patient_ids.append(sepsis['id'])
        
        # Test postop
        resp_postop = requests.post(f"{BASE_URL}/sample", json={"type": "postop"})
        if resp_postop.status_code != 200:
            return log_test("POST /sample", False, f"Postop sample failed: {resp_postop.status_code}")
        postop = resp_postop.json()
        created_patient_ids.append(postop['id'])
        
        # Check all have full aiOutput with abbreviations
        for patient, name in [(chf, 'CHF'), (sepsis, 'Sepsis'), (postop, 'Postop')]:
            ai = patient.get('aiOutput', {})
            if 'abbreviations' not in ai:
                return log_test("POST /sample", False, f"{name} missing abbreviations")
            if not isinstance(ai['abbreviations'], list) or len(ai['abbreviations']) == 0:
                return log_test("POST /sample", False, f"{name} abbreviations not a non-empty array")
        
        # Clean up immediately
        for pid in [chf['id'], sepsis['id'], postop['id']]:
            try:
                requests.delete(f"{BASE_URL}/patients/{pid}")
                created_patient_ids.remove(pid)
            except Exception:
                pass
        
        return log_test("POST /sample", True, "CHF/sepsis/postop samples created with full aiOutput incl abbreviations")
    except Exception as e:
        return log_test("POST /sample", False, f"Exception: {e}")

def test_reg_11_ingest():
    """Test 13 (REGRESSION): POST /api/ingest - multi-patient document"""
    print("\n📋 Test 13 (REGRESSION): POST /api/ingest")
    try:
        doc_text = """
SHIFT ALLOCATION
Patient 1: John Smith, Bed 12, 68yo - Pneumonia
Patient 2: Mary Johnson, Bed 14, 72yo - Post-op knee replacement
Patient 3: Ahmed Khan, Bed 16, 55yo - COPD exacerbation
"""
        
        ingest_data = {
            "documents": [{
                "name": "Allocation",
                "category": "other",
                "kind": "text",
                "textContent": doc_text
            }]
        }
        
        print("  Calling AI to detect patients (may take 10-20s)...")
        response = requests.post(f"{BASE_URL}/ingest", json=ingest_data, timeout=60)
        
        if response.status_code != 200:
            return log_test("POST /ingest", False, f"Expected 200, got {response.status_code}")
        
        result = response.json()
        
        if result.get('detectedCount', 0) < 3:
            return log_test("POST /ingest", False, f"Expected to detect 3 patients, got {result.get('detectedCount')}")
        
        if result.get('created', 0) < 3:
            return log_test("POST /ingest", False, f"Expected to create 3 patients, got {result.get('created')}")
        
        # Track created patients for cleanup
        for p in result.get('patients', []):
            created_patient_ids.append(p['id'])
        
        # Clean up immediately
        for p in result.get('patients', []):
            try:
                requests.delete(f"{BASE_URL}/patients/{p['id']}")
                created_patient_ids.remove(p['id'])
            except Exception:
                pass
        
        return log_test("POST /ingest", True, f"Detected {result['detectedCount']}, created {result['created']}")
    except Exception as e:
        return log_test("POST /ingest", False, f"Exception: {e}")

def test_reg_12_worsen():
    """Test 14 (REGRESSION): POST /api/patients/:id/worsen - +2 cap 14"""
    print("\n📋 Test 14 (REGRESSION): POST /worsen")
    try:
        # Create a postop sample (starts at score 0)
        sample_resp = requests.post(f"{BASE_URL}/sample", json={"type": "postop"})
        patient = sample_resp.json()
        patient_id = patient['id']
        created_patient_ids.append(patient_id)
        
        initial_score = int(patient['aiOutput']['earlyWarning']['score'])
        
        # Call worsen twice
        for i in range(2):
            requests.post(f"{BASE_URL}/patients/{patient_id}/worsen")
        
        # Get final state
        get_resp = requests.get(f"{BASE_URL}/patients/{patient_id}")
        patient = get_resp.json()
        
        final_score = int(patient['aiOutput']['earlyWarning']['score'])
        
        # Score should be 0 + 2*2 = 4
        if final_score != initial_score + 4:
            return log_test("POST /worsen", False, f"Score should increase by 4: {initial_score} -> {final_score}")
        
        # Clean up
        try:
            requests.delete(f"{BASE_URL}/patients/{patient_id}")
            created_patient_ids.remove(patient_id)
        except Exception:
            pass
        
        return log_test("POST /worsen", True, f"Score increased by +2 per call: {initial_score} -> {final_score}")
    except Exception as e:
        return log_test("POST /worsen", False, f"Exception: {e}")

def test_reg_13_improve():
    """Test 15 (REGRESSION): POST /api/patients/:id/improve - -2 floor 0"""
    print("\n📋 Test 15 (REGRESSION): POST /improve")
    try:
        # Create a sepsis sample (starts at score 8)
        sample_resp = requests.post(f"{BASE_URL}/sample", json={"type": "sepsis"})
        patient = sample_resp.json()
        patient_id = patient['id']
        created_patient_ids.append(patient_id)
        
        initial_score = int(patient['aiOutput']['earlyWarning']['score'])
        
        # Call improve twice
        for i in range(2):
            requests.post(f"{BASE_URL}/patients/{patient_id}/improve")
        
        # Get final state
        get_resp = requests.get(f"{BASE_URL}/patients/{patient_id}")
        patient = get_resp.json()
        
        final_score = int(patient['aiOutput']['earlyWarning']['score'])
        
        # Score should be 8 - 2*2 = 4
        if final_score != initial_score - 4:
            return log_test("POST /improve", False, f"Score should decrease by 4: {initial_score} -> {final_score}")
        
        # Clean up
        try:
            requests.delete(f"{BASE_URL}/patients/{patient_id}")
            created_patient_ids.remove(patient_id)
        except Exception:
            pass
        
        return log_test("POST /improve", True, f"Score decreased by -2 per call: {initial_score} -> {final_score}")
    except Exception as e:
        return log_test("POST /improve", False, f"Exception: {e}")

def main():
    """Run all tests"""
    print("=" * 80)
    print("BACKEND TEST: AUDIO TRANSCRIPTION (NEW) + REGRESSION")
    print("=" * 80)
    
    try:
        # NEW FEATURE TESTS: AUDIO TRANSCRIPTION
        print("\n" + "=" * 80)
        print("NEW FEATURE TESTS: AUDIO TRANSCRIPTION")
        print("=" * 80)
        test_audio_1_transcription()
        test_audio_2_generate_reads_audio()
        
        # REGRESSION TESTS: DOCUMENTS
        print("\n" + "=" * 80)
        print("REGRESSION TESTS: DOCUMENTS")
        print("=" * 80)
        test_reg_1_text_note()
        test_reg_2_png_image()
        test_reg_3_delete_doc()
        test_reg_4_sec003_30mb_rejection()
        test_reg_5_sec002_html_security()
        
        # REGRESSION TESTS: CORE ENDPOINTS
        print("\n" + "=" * 80)
        print("REGRESSION TESTS: CORE ENDPOINTS")
        print("=" * 80)
        test_reg_6_get_patients()
        test_reg_7_post_patient()
        test_reg_8_max_10_enforcement()
        test_reg_9_put_patient()
        test_reg_10_sample_endpoints()
        test_reg_11_ingest()
        test_reg_12_worsen()
        test_reg_13_improve()
        
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
        print("✅ ALL TESTS PASSED")
        return 0
    else:
        print("❌ SOME TESTS FAILED")
        return 1

if __name__ == "__main__":
    sys.exit(main())
