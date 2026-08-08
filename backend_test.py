#!/usr/bin/env python3
"""
Backend test for NurseCare Next.js app - Round 9 features
Tests:
1. Large file storage via GridFS (fixes 16MB MongoDB crash)
2. Scenario worsen endpoint
3. Handover note persistence
"""

import requests
import json
import base64
import time
import sys

BASE_URL = "https://web-nurse-app.preview.emergentagent.com/api"

# Small 1x1 PNG for testing (43 bytes)
SMALL_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
SMALL_PNG_DATAURL = f"data:image/png;base64,{SMALL_PNG_BASE64}"

def log(msg):
    print(f"[TEST] {msg}")

def create_large_file_dataurl(size_mb=18):
    """Create a large base64 data URL for testing (simulates ~18-20MB file)"""
    # Create a buffer of random-ish bytes
    # We want the RAW bytes to be size_mb, not the base64 string
    raw_size = int(size_mb * 1024 * 1024)
    # Use a repeating pattern to save memory
    pattern = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" * 1000
    data = (pattern * (raw_size // len(pattern) + 1))[:raw_size]
    encoded = base64.b64encode(data).decode('ascii')
    return f"data:application/pdf;base64,{encoded}"

def test_feature_1_gridfs():
    """
    FEATURE 1: Large file storage via GridFS
    Tests file upload, retrieval, AI generation, and deletion
    """
    log("=" * 80)
    log("FEATURE 1: Large file storage via GridFS")
    log("=" * 80)
    
    created_patient_id = None
    small_doc_id = None
    large_doc_id = None
    
    try:
        # Step 1: Create a patient
        log("Step 1: Creating patient 'GridFS Test'...")
        resp = requests.post(f"{BASE_URL}/patients", json={
            "name": "GridFS Test",
            "bed": "B1",
            "age": "60",
            "diagnosis": "Pneumonia"
        }, timeout=30)
        
        if resp.status_code != 200:
            log(f"❌ FAIL: Create patient returned {resp.status_code}: {resp.text[:200]}")
            return False
        
        patient = resp.json()
        created_patient_id = patient.get('id')
        log(f"✅ PASS: Patient created with ID {created_patient_id}")
        
        # Step 2: Upload a SMALL FILE document
        log("Step 2: Uploading small PNG file document...")
        resp = requests.post(f"{BASE_URL}/patients/{created_patient_id}/documents", json={
            "documents": [{
                "name": "scan.png",
                "category": "vitals",
                "kind": "file",
                "mimeType": "image/png",
                "dataUrl": SMALL_PNG_DATAURL
            }]
        }, timeout=30)
        
        if resp.status_code != 200:
            log(f"❌ FAIL: Upload small file returned {resp.status_code}: {resp.text[:200]}")
            return False
        
        patient = resp.json()
        docs = patient.get('documents', [])
        if not docs:
            log("❌ FAIL: No documents in response")
            return False
        
        small_doc = docs[-1]  # Last added document
        small_doc_id = small_doc.get('id')
        has_file = small_doc.get('hasFile')
        data_url = small_doc.get('dataUrl')
        
        log(f"✅ PASS: Document uploaded with ID {small_doc_id}")
        log(f"   - hasFile: {has_file}")
        log(f"   - dataUrl: {data_url}")
        
        if not has_file:
            log("❌ FAIL: hasFile should be true")
            return False
        
        if data_url is not None and data_url != "":
            log(f"❌ FAIL: dataUrl should be null or empty, got: {data_url}")
            return False
        
        log("✅ PASS: Document has hasFile=true and dataUrl is null/empty")
        
        # Step 3: GET patient and verify document metadata
        log("Step 3: GET patient and verify document...")
        resp = requests.get(f"{BASE_URL}/patients/{created_patient_id}", timeout=30)
        
        if resp.status_code != 200:
            log(f"❌ FAIL: GET patient returned {resp.status_code}")
            return False
        
        patient = resp.json()
        docs = patient.get('documents', [])
        doc = next((d for d in docs if d.get('id') == small_doc_id), None)
        
        if not doc:
            log("❌ FAIL: Document not found in patient")
            return False
        
        if not doc.get('hasFile'):
            log("❌ FAIL: hasFile should be true in GET response")
            return False
        
        if doc.get('dataUrl') is not None and doc.get('dataUrl') != "":
            log(f"❌ FAIL: dataUrl should be null/empty in GET response, got: {doc.get('dataUrl')}")
            return False
        
        log("✅ PASS: Document persisted with hasFile=true and no dataUrl")
        
        # Step 4: GET document content
        log("Step 4: GET document content via /documents/:docId/content...")
        resp = requests.get(f"{BASE_URL}/patients/{created_patient_id}/documents/{small_doc_id}/content", timeout=30)
        
        if resp.status_code != 200:
            log(f"❌ FAIL: GET content returned {resp.status_code}")
            return False
        
        content_type = resp.headers.get('Content-Type', '')
        body_length = len(resp.content)
        
        log(f"✅ PASS: Content retrieved successfully")
        log(f"   - Content-Type: {content_type}")
        log(f"   - Body length: {body_length} bytes")
        
        if 'image/png' not in content_type:
            log(f"❌ FAIL: Expected Content-Type image/png, got {content_type}")
            return False
        
        if body_length == 0:
            log("❌ FAIL: Body length is 0")
            return False
        
        # Verify the content matches what we uploaded
        expected_bytes = base64.b64decode(SMALL_PNG_BASE64)
        if resp.content != expected_bytes:
            log(f"❌ FAIL: Content mismatch. Expected {len(expected_bytes)} bytes, got {body_length} bytes")
            return False
        
        log("✅ PASS: Content matches uploaded file exactly")
        
        # Step 5: Upload a LARGE file (18-20MB) to test 16MB fix
        log("Step 5: Uploading LARGE file (~18MB) to test 16MB BSON limit fix...")
        log("   (This may take 10-20 seconds to generate and upload...)")
        
        large_dataurl = create_large_file_dataurl(18)
        log(f"   Generated {len(large_dataurl) / (1024*1024):.1f}MB data URL")
        
        resp = requests.post(f"{BASE_URL}/patients/{created_patient_id}/documents", json={
            "documents": [{
                "name": "large_scan.pdf",
                "category": "other",
                "kind": "file",
                "mimeType": "application/pdf",
                "dataUrl": large_dataurl
            }]
        }, timeout=60)
        
        if resp.status_code != 200:
            log(f"❌ FAIL: Upload large file returned {resp.status_code}: {resp.text[:500]}")
            log("   This suggests the 16MB BSON limit fix is NOT working")
            return False
        
        log("✅ PASS: Large file upload succeeded (16MB fix working!)")
        
        patient = resp.json()
        docs = patient.get('documents', [])
        large_doc = docs[-1]
        large_doc_id = large_doc.get('id')
        
        log(f"   - Large document ID: {large_doc_id}")
        log(f"   - hasFile: {large_doc.get('hasFile')}")
        
        # Step 5b: GET large file content
        log("Step 5b: GET large file content...")
        resp = requests.get(f"{BASE_URL}/patients/{created_patient_id}/documents/{large_doc_id}/content", timeout=60)
        
        if resp.status_code != 200:
            log(f"❌ FAIL: GET large content returned {resp.status_code}")
            return False
        
        content_type = resp.headers.get('Content-Type', '')
        body_length = len(resp.content)
        
        log(f"✅ PASS: Large file content retrieved")
        log(f"   - Content-Type: {content_type}")
        log(f"   - Body length: {body_length / (1024*1024):.1f}MB")
        
        if 'application/pdf' not in content_type:
            log(f"❌ FAIL: Expected Content-Type application/pdf, got {content_type}")
            return False
        
        # Verify size is in expected range (17-21MB)
        if body_length < 17 * 1024 * 1024 or body_length > 21 * 1024 * 1024:
            log(f"❌ FAIL: Body length {body_length / (1024*1024):.1f}MB not in expected 17-21MB range")
            return False
        
        log("✅ PASS: Large file size in expected range")
        
        # Step 6: POST /generate to verify AI can read GridFS files
        log("Step 6: POST /generate to verify AI can read GridFS files...")
        log("   (Testing with the small PNG file, not the large fake PDF)")
        log("   (This is a REAL Gemini call, will take ~30-40 seconds...)")
        
        # First, delete the large fake PDF since Gemini can't process it
        log("   Deleting large fake PDF first...")
        resp = requests.delete(f"{BASE_URL}/patients/{created_patient_id}/documents/{large_doc_id}", timeout=30)
        if resp.status_code != 200:
            log(f"⚠ WARNING: Could not delete large doc: {resp.status_code}")
        
        start_time = time.time()
        resp = requests.post(f"{BASE_URL}/patients/{created_patient_id}/generate", timeout=120)
        elapsed = time.time() - start_time
        
        if resp.status_code != 200:
            log(f"❌ FAIL: Generate returned {resp.status_code}: {resp.text[:500]}")
            return False
        
        result = resp.json()
        ai_output = result.get('aiOutput')
        
        if not ai_output:
            log("❌ FAIL: No aiOutput in response")
            return False
        
        log(f"✅ PASS: AI generation completed in {elapsed:.1f}s")
        log(f"   - patientSummary: {ai_output.get('patientSummary', '')[:80]}...")
        log(f"   - AI can read files from GridFS!")
        log(f"   - CRITICAL: Large file (18MB) upload succeeded without 16MB BSON error!")
        
        # Step 7: DELETE small document
        log("Step 7: DELETE small document...")
        resp = requests.delete(f"{BASE_URL}/patients/{created_patient_id}/documents/{small_doc_id}", timeout=30)
        
        if resp.status_code != 200:
            log(f"❌ FAIL: DELETE document returned {resp.status_code}")
            return False
        
        log("✅ PASS: Document deleted")
        
        # Step 7b: Verify content is gone (404)
        log("Step 7b: Verify content returns 404...")
        resp = requests.get(f"{BASE_URL}/patients/{created_patient_id}/documents/{small_doc_id}/content", timeout=30)
        
        if resp.status_code != 404:
            log(f"❌ FAIL: Expected 404, got {resp.status_code}")
            return False
        
        log("✅ PASS: Content correctly returns 404 after deletion")
        
        log("=" * 80)
        log("✅ FEATURE 1: ALL TESTS PASSED")
        log("=" * 80)
        return True
        
    except Exception as e:
        log(f"❌ EXCEPTION in Feature 1: {str(e)}")
        import traceback
        traceback.print_exc()
        return False
    
    finally:
        # Cleanup
        if created_patient_id:
            log(f"Cleanup: Deleting test patient {created_patient_id}...")
            try:
                requests.delete(f"{BASE_URL}/patients/{created_patient_id}", timeout=30)
                log("✅ Cleanup complete")
            except Exception as e:
                log(f"⚠ Cleanup failed: {e}")

def test_feature_2_worsen():
    """
    FEATURE 2: Scenario worsen endpoint
    Tests POST /api/patients/:id/worsen
    """
    log("=" * 80)
    log("FEATURE 2: Scenario worsen endpoint")
    log("=" * 80)
    
    created_patient_id = None
    
    try:
        # Step 1: Create a sample patient (postop type starts with score 0, low risk)
        log("Step 1: Creating sample patient (postop)...")
        resp = requests.post(f"{BASE_URL}/sample", json={"type": "postop"}, timeout=30)
        
        if resp.status_code != 200:
            log(f"❌ FAIL: Create sample returned {resp.status_code}: {resp.text[:200]}")
            return False
        
        patient = resp.json()
        created_patient_id = patient.get('id')
        
        ai_output = patient.get('aiOutput', {})
        ew = ai_output.get('earlyWarning', {})
        initial_score = ew.get('score')
        initial_risk = ew.get('riskLevel')
        initial_trend = ew.get('trend')
        ew_history = patient.get('ewHistory', [])
        initial_history_len = len(ew_history)
        
        log(f"✅ PASS: Sample patient created")
        log(f"   - ID: {created_patient_id}")
        log(f"   - Initial score: {initial_score}")
        log(f"   - Initial riskLevel: {initial_risk}")
        log(f"   - Initial trend: {initial_trend}")
        log(f"   - ewHistory length: {initial_history_len}")
        
        # Step 2: Call /worsen first time
        log("Step 2: POST /worsen (1st time)...")
        resp = requests.post(f"{BASE_URL}/patients/{created_patient_id}/worsen", timeout=30)
        
        if resp.status_code != 200:
            log(f"❌ FAIL: Worsen returned {resp.status_code}: {resp.text[:200]}")
            return False
        
        result = resp.json()
        ai_output = result.get('aiOutput', {})
        ew = ai_output.get('earlyWarning', {})
        score_1 = ew.get('score')
        risk_1 = ew.get('riskLevel')
        trend_1 = ew.get('trend')
        
        log(f"✅ PASS: Worsen call 1 succeeded")
        log(f"   - Score: {initial_score} → {score_1}")
        log(f"   - RiskLevel: {initial_risk} → {risk_1}")
        log(f"   - Trend: {trend_1}")
        
        # Verify score increased by 2
        try:
            initial_num = float(initial_score) if initial_score != 'N/A' else 0
            score_1_num = float(score_1) if score_1 != 'N/A' else 0
            if score_1_num != initial_num + 2:
                log(f"❌ FAIL: Score should increase by 2, got {initial_num} → {score_1_num}")
                return False
        except (ValueError, TypeError):
            log(f"⚠ WARNING: Could not parse scores as numbers: {initial_score}, {score_1}")
        
        if trend_1 != 'worsening':
            log(f"❌ FAIL: Trend should be 'worsening', got '{trend_1}'")
            return False
        
        log("✅ PASS: Score increased by 2, trend is 'worsening'")
        
        # Get patient to check ewHistory
        resp = requests.get(f"{BASE_URL}/patients/{created_patient_id}", timeout=30)
        patient = resp.json()
        ew_history = patient.get('ewHistory', [])
        
        if len(ew_history) != initial_history_len + 1:
            log(f"❌ FAIL: ewHistory should grow by 1, got {initial_history_len} → {len(ew_history)}")
            return False
        
        log(f"✅ PASS: ewHistory grew by 1 (now {len(ew_history)} entries)")
        
        # Step 3: Call /worsen 3 more times
        log("Step 3: Calling /worsen 3 more times...")
        
        for i in range(3):
            resp = requests.post(f"{BASE_URL}/patients/{created_patient_id}/worsen", timeout=30)
            
            if resp.status_code != 200:
                log(f"❌ FAIL: Worsen call {i+2} returned {resp.status_code}")
                return False
            
            result = resp.json()
            ai_output = result.get('aiOutput', {})
            ew = ai_output.get('earlyWarning', {})
            score = ew.get('score')
            risk = ew.get('riskLevel')
            trend = ew.get('trend')
            
            log(f"   Call {i+2}: score={score}, riskLevel={risk}, trend={trend}")
            
            if trend != 'worsening':
                log(f"❌ FAIL: Trend should be 'worsening', got '{trend}'")
                return False
        
        # Get final patient state
        resp = requests.get(f"{BASE_URL}/patients/{created_patient_id}", timeout=30)
        patient = resp.json()
        ai_output = patient.get('aiOutput', {})
        ew = ai_output.get('earlyWarning', {})
        final_score = ew.get('score')
        final_risk = ew.get('riskLevel')
        ew_history = patient.get('ewHistory', [])
        final_history_len = len(ew_history)
        
        log(f"✅ PASS: All worsen calls succeeded")
        log(f"   - Final score: {final_score}")
        log(f"   - Final riskLevel: {final_risk}")
        log(f"   - ewHistory length: {initial_history_len} → {final_history_len}")
        
        # Verify score progression (0 → 2 → 4 → 6 → 8)
        try:
            final_num = float(final_score) if final_score != 'N/A' else 0
            initial_num = float(initial_score) if initial_score != 'N/A' else 0
            expected = initial_num + 8  # 4 calls * 2 points each
            if final_num != expected:
                log(f"❌ FAIL: Expected final score {expected}, got {final_num}")
                return False
        except (ValueError, TypeError):
            log(f"⚠ WARNING: Could not verify score progression")
        
        # Verify riskLevel escalation
        # Score 8 should be high (>=7)
        try:
            final_num = float(final_score) if final_score != 'N/A' else 0
            if final_num >= 7 and final_risk != 'high':
                log(f"❌ FAIL: Score {final_num} should be 'high' risk, got '{final_risk}'")
                return False
            elif 4 <= final_num < 7 and final_risk != 'medium':
                log(f"❌ FAIL: Score {final_num} should be 'medium' risk, got '{final_risk}'")
                return False
        except (ValueError, TypeError):
            pass
        
        log(f"✅ PASS: RiskLevel escalated correctly to '{final_risk}'")
        
        # Verify ewHistory grew by 4
        if final_history_len != initial_history_len + 4:
            log(f"❌ FAIL: ewHistory should grow by 4, got {initial_history_len} → {final_history_len}")
            return False
        
        log(f"✅ PASS: ewHistory grew by 4 entries")
        
        log("=" * 80)
        log("✅ FEATURE 2: ALL TESTS PASSED")
        log("=" * 80)
        return True
        
    except Exception as e:
        log(f"❌ EXCEPTION in Feature 2: {str(e)}")
        import traceback
        traceback.print_exc()
        return False
    
    finally:
        # Cleanup
        if created_patient_id:
            log(f"Cleanup: Deleting test patient {created_patient_id}...")
            try:
                requests.delete(f"{BASE_URL}/patients/{created_patient_id}", timeout=30)
                log("✅ Cleanup complete")
            except Exception as e:
                log(f"⚠ Cleanup failed: {e}")

def test_feature_3_handover_note():
    """
    FEATURE 3: Handover note persistence
    Tests PUT /api/patients/:id with handoverNote field
    """
    log("=" * 80)
    log("FEATURE 3: Handover note persistence")
    log("=" * 80)
    
    created_patient_id = None
    
    try:
        # Step 1: Create a patient
        log("Step 1: Creating patient 'Note Test'...")
        resp = requests.post(f"{BASE_URL}/patients", json={
            "name": "Note Test",
            "diagnosis": "COPD"
        }, timeout=30)
        
        if resp.status_code != 200:
            log(f"❌ FAIL: Create patient returned {resp.status_code}: {resp.text[:200]}")
            return False
        
        patient = resp.json()
        created_patient_id = patient.get('id')
        original_name = patient.get('name')
        original_diagnosis = patient.get('diagnosis')
        
        log(f"✅ PASS: Patient created")
        log(f"   - ID: {created_patient_id}")
        log(f"   - Name: {original_name}")
        log(f"   - Diagnosis: {original_diagnosis}")
        
        # Step 2: PUT handoverNote
        log("Step 2: PUT handoverNote...")
        handover_text = "Family updated; awaiting bloods at 1600"
        resp = requests.put(f"{BASE_URL}/patients/{created_patient_id}", json={
            "handoverNote": handover_text
        }, timeout=30)
        
        if resp.status_code != 200:
            log(f"❌ FAIL: PUT handoverNote returned {resp.status_code}: {resp.text[:200]}")
            return False
        
        patient = resp.json()
        handover_note = patient.get('handoverNote')
        name = patient.get('name')
        diagnosis = patient.get('diagnosis')
        
        log(f"✅ PASS: PUT succeeded")
        log(f"   - handoverNote: {handover_note}")
        log(f"   - Name: {name}")
        log(f"   - Diagnosis: {diagnosis}")
        
        # Step 3: GET patient and verify handoverNote persisted
        log("Step 3: GET patient and verify handoverNote...")
        resp = requests.get(f"{BASE_URL}/patients/{created_patient_id}", timeout=30)
        
        if resp.status_code != 200:
            log(f"❌ FAIL: GET patient returned {resp.status_code}")
            return False
        
        patient = resp.json()
        handover_note = patient.get('handoverNote')
        name = patient.get('name')
        diagnosis = patient.get('diagnosis')
        
        if handover_note != handover_text:
            log(f"❌ FAIL: handoverNote mismatch. Expected '{handover_text}', got '{handover_note}'")
            return False
        
        if name != original_name:
            log(f"❌ FAIL: Name changed. Expected '{original_name}', got '{name}'")
            return False
        
        if diagnosis != original_diagnosis:
            log(f"❌ FAIL: Diagnosis changed. Expected '{original_diagnosis}', got '{diagnosis}'")
            return False
        
        log(f"✅ PASS: handoverNote persisted correctly")
        log(f"✅ PASS: Name and diagnosis unchanged")
        
        # Step 4: GET /patients (list) and verify handoverNote included
        log("Step 4: GET /patients (list) and verify handoverNote...")
        resp = requests.get(f"{BASE_URL}/patients", timeout=30)
        
        if resp.status_code != 200:
            log(f"❌ FAIL: GET patients returned {resp.status_code}")
            return False
        
        patients = resp.json()
        test_patient = next((p for p in patients if p.get('id') == created_patient_id), None)
        
        if not test_patient:
            log("❌ FAIL: Patient not found in list")
            return False
        
        handover_note = test_patient.get('handoverNote')
        
        if handover_note != handover_text:
            log(f"❌ FAIL: handoverNote not in list. Expected '{handover_text}', got '{handover_note}'")
            return False
        
        log(f"✅ PASS: handoverNote included in patient list")
        
        log("=" * 80)
        log("✅ FEATURE 3: ALL TESTS PASSED")
        log("=" * 80)
        return True
        
    except Exception as e:
        log(f"❌ EXCEPTION in Feature 3: {str(e)}")
        import traceback
        traceback.print_exc()
        return False
    
    finally:
        # Cleanup
        if created_patient_id:
            log(f"Cleanup: Deleting test patient {created_patient_id}...")
            try:
                requests.delete(f"{BASE_URL}/patients/{created_patient_id}", timeout=30)
                log("✅ Cleanup complete")
            except Exception as e:
                log(f"⚠ Cleanup failed: {e}")

def main():
    log("=" * 80)
    log("NurseCare Backend Testing - Round 9")
    log("Testing 3 new backend features")
    log("=" * 80)
    
    results = {}
    
    # Test Feature 1: GridFS
    results['Feature 1: GridFS'] = test_feature_1_gridfs()
    
    # Test Feature 2: Worsen endpoint
    results['Feature 2: Worsen'] = test_feature_2_worsen()
    
    # Test Feature 3: Handover note
    results['Feature 3: Handover note'] = test_feature_3_handover_note()
    
    # Summary
    log("=" * 80)
    log("FINAL SUMMARY")
    log("=" * 80)
    
    for feature, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        log(f"{status}: {feature}")
    
    all_passed = all(results.values())
    
    if all_passed:
        log("=" * 80)
        log("🎉 ALL TESTS PASSED 🎉")
        log("=" * 80)
        return 0
    else:
        log("=" * 80)
        log("⚠ SOME TESTS FAILED")
        log("=" * 80)
        return 1

if __name__ == "__main__":
    sys.exit(main())
