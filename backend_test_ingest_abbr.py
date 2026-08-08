#!/usr/bin/env python3
"""
Backend test for NEW features:
1. Multi-patient ingest (POST /api/ingest) - MOST IMPORTANT
2. Abbreviation reader in AI output + samples
"""

import requests
import json
import time
import sys

BASE_URL = "https://web-nurse-app.preview.emergentagent.com/api"

def log(msg):
    print(f"[TEST] {msg}")

def get_patients():
    """Get all patients"""
    r = requests.get(f"{BASE_URL}/patients")
    if r.status_code != 200:
        log(f"❌ GET /patients failed: {r.status_code}")
        return []
    return r.json()

def delete_patient(patient_id):
    """Delete a patient by ID"""
    r = requests.delete(f"{BASE_URL}/patients/{patient_id}")
    return r.status_code == 200

def cleanup_all_except_protected():
    """Delete all patients except 'm' and 'paul'"""
    patients = get_patients()
    protected = ['m', 'paul']
    deleted = 0
    for p in patients:
        name = p.get('name', '').lower()
        if name not in protected:
            if delete_patient(p['id']):
                deleted += 1
                log(f"Cleaned up patient: {p['name']} (ID: {p['id']})")
    log(f"Cleanup complete: {deleted} patients deleted")
    return deleted

def test_multi_patient_ingest():
    """
    FEATURE 1: Multi-patient ingest - POST /api/ingest
    Test that a single document describing 4 patients creates 4 distinct patient records
    """
    log("\n" + "="*80)
    log("FEATURE 1: MULTI-PATIENT INGEST - POST /api/ingest")
    log("="*80)
    
    # Step 1: Ensure shift is empty of test patients
    log("\nStep 1: Cleanup existing patients (except 'm'/'paul')")
    cleanup_all_except_protected()
    
    patients_before = get_patients()
    count_before = len(patients_before)
    log(f"Current patient count: {count_before}")
    
    # Step 2: Multi-patient ingest with 4 patients
    log("\nStep 2: POST /api/ingest with document describing FOUR patients")
    
    multi_patient_doc = {
        "documents": [{
            "name": "Shift sheet",
            "category": "handover",
            "kind": "text",
            "textContent": """NURSE ALLOCATION - AM SHIFT
Bed 1: John Smith, 72M, community acquired pneumonia, on IV antibiotics and oxygen.
Bed 2: Mary Jones, 65F, day 2 post total knee replacement, mobilising with physio.
Bed 3: Ahmed Khan, 58M, exacerbation of COPD, nebulisers QID.
Bed 4: Rosa Diaz, 80F, UTI with delirium, falls risk, IDC in situ."""
        }]
    }
    
    r = requests.post(f"{BASE_URL}/ingest", json=multi_patient_doc)
    
    if r.status_code != 200:
        log(f"❌ FAIL: POST /api/ingest returned {r.status_code}")
        log(f"Response: {r.text}")
        return False
    
    result = r.json()
    log(f"✅ POST /api/ingest returned 200")
    log(f"Response keys: {list(result.keys())}")
    log(f"detectedCount: {result.get('detectedCount')}")
    log(f"created: {result.get('created')}")
    log(f"truncated: {result.get('truncated')}")
    
    # Verify response structure
    if 'patients' not in result:
        log(f"❌ FAIL: Response missing 'patients' array")
        return False
    
    patients = result['patients']
    log(f"Number of patients returned: {len(patients)}")
    
    # Verify detectedCount
    detected_count = result.get('detectedCount', 0)
    if detected_count != 4:
        log(f"⚠️  WARNING: detectedCount={detected_count}, expected 4")
    else:
        log(f"✅ detectedCount == 4")
    
    # Verify created count matches available slots
    created_count = result.get('created', 0)
    available_slots = 4 - count_before
    if created_count != min(4, available_slots):
        log(f"❌ FAIL: created={created_count}, expected {min(4, available_slots)}")
        return False
    log(f"✅ created == {created_count} (matches available slots)")
    
    # Verify we got 4 distinct patients
    if len(patients) != 4:
        log(f"❌ FAIL: Expected 4 patients in response, got {len(patients)}")
        return False
    log(f"✅ Response contains 4 distinct patients")
    
    # Verify patient details
    expected_names = ['smith', 'jones', 'khan', 'diaz']
    expected_beds = ['1', '2', '3', '4']
    
    log("\nVerifying patient details:")
    for i, p in enumerate(patients):
        name = p.get('name', '').lower()
        bed = p.get('bed', '').lower()
        diagnosis = p.get('diagnosis', '').lower()
        focus_hint = p.get('focusHint')
        documents = p.get('documents', [])
        patient_id = p.get('id', '')
        
        log(f"\nPatient {i+1}:")
        log(f"  ID: {patient_id}")
        log(f"  Name: {p.get('name')}")
        log(f"  Bed: {p.get('bed')}")
        log(f"  Diagnosis: {p.get('diagnosis')}")
        log(f"  focusHint: {focus_hint}")
        log(f"  Documents: {len(documents)}")
        
        # Check name contains expected substring
        name_found = any(exp in name for exp in expected_names)
        if not name_found:
            log(f"  ⚠️  WARNING: Name doesn't contain expected names (Smith/Jones/Khan/Diaz)")
        else:
            log(f"  ✅ Name contains expected substring")
        
        # Check bed number
        bed_found = any(exp in bed for exp in expected_beds)
        if not bed_found:
            log(f"  ⚠️  WARNING: Bed doesn't contain expected bed numbers (1-4)")
        else:
            log(f"  ✅ Bed contains expected number")
        
        # Check focusHint is non-empty
        if not focus_hint:
            log(f"  ❌ FAIL: focusHint is empty or null")
            return False
        log(f"  ✅ focusHint is non-empty")
        
        # Check documents attached
        if len(documents) < 1:
            log(f"  ❌ FAIL: No documents attached")
            return False
        log(f"  ✅ Document attached (count: {len(documents)})")
        
        # Check document structure
        doc = documents[0]
        if doc.get('hasFile') is not False:
            log(f"  ⚠️  WARNING: hasFile={doc.get('hasFile')}, expected False for text document")
        if doc.get('dataUrl') is not None:
            log(f"  ⚠️  WARNING: dataUrl should be null for text document")
        
        # Check valid UUID
        if len(patient_id) != 36:
            log(f"  ❌ FAIL: Invalid UUID length: {len(patient_id)}")
            return False
        log(f"  ✅ Valid UUID id")
    
    log("\n✅ STEP 2 PASSED: Multi-patient ingest created 4 distinct patients with focusHint")
    
    # Step 3: Test AI generation for 2 patients to verify focusHint works
    log("\nStep 3: Generate AI care plans for 2 patients to verify focusHint works")
    
    # Get the first two patients (John Smith - pneumonia, Mary Jones - knee replacement)
    test_patients = patients[:2]
    
    for idx, p in enumerate(test_patients):
        patient_id = p['id']
        patient_name = p['name']
        diagnosis = p.get('diagnosis', '')
        
        log(f"\nGenerating AI for patient {idx+1}: {patient_name}")
        log(f"  Expected diagnosis focus: {diagnosis}")
        
        start_time = time.time()
        r = requests.post(f"{BASE_URL}/patients/{patient_id}/generate")
        elapsed = time.time() - start_time
        
        if r.status_code != 200:
            log(f"  ❌ FAIL: POST /generate returned {r.status_code}")
            log(f"  Response: {r.text[:500]}")
            return False
        
        log(f"  ✅ AI generation completed in {elapsed:.1f}s")
        
        result = r.json()
        ai_output = result.get('aiOutput', {})
        
        # Verify AI output is specific to THIS patient
        patient_summary = ai_output.get('patientSummary', '').lower()
        handover_header = ai_output.get('handoverHeader', {})
        header_diagnosis = handover_header.get('diagnosis', '').lower()
        
        log(f"  Patient summary: {patient_summary[:100]}...")
        log(f"  Header diagnosis: {header_diagnosis}")
        
        # Check if the AI output is about the correct patient
        diagnosis_lower = diagnosis.lower()
        
        if idx == 0:  # John Smith - pneumonia
            if 'pneumonia' in patient_summary or 'pneumonia' in header_diagnosis:
                log(f"  ✅ AI output is specific to pneumonia patient (correct)")
            else:
                log(f"  ❌ FAIL: AI output doesn't mention pneumonia for pneumonia patient")
                log(f"  This suggests focusHint is NOT working - AI mixed up patients")
                return False
            
            # Make sure it's NOT about knee replacement
            if 'knee' in patient_summary or 'replacement' in patient_summary:
                log(f"  ❌ FAIL: AI output mentions knee replacement for pneumonia patient")
                log(f"  This proves focusHint is NOT working - AI mixed up patients")
                return False
        
        elif idx == 1:  # Mary Jones - knee replacement
            if 'knee' in patient_summary or 'knee' in header_diagnosis or 'replacement' in patient_summary:
                log(f"  ✅ AI output is specific to knee replacement patient (correct)")
            else:
                log(f"  ❌ FAIL: AI output doesn't mention knee/replacement for knee patient")
                log(f"  This suggests focusHint is NOT working - AI mixed up patients")
                return False
            
            # Make sure it's NOT about pneumonia
            if 'pneumonia' in patient_summary:
                log(f"  ❌ FAIL: AI output mentions pneumonia for knee replacement patient")
                log(f"  This proves focusHint is NOT working - AI mixed up patients")
                return False
    
    log("\n✅ STEP 3 PASSED: AI generation is patient-specific (focusHint works!)")
    
    # Step 4: Cleanup - delete all 4 patients
    log("\nStep 4: Cleanup - delete all 4 test patients")
    for p in patients:
        if delete_patient(p['id']):
            log(f"  Deleted: {p['name']}")
    
    log("\n✅ STEP 4 PASSED: Cleanup complete")
    
    return True

def test_single_patient_ingest():
    """Test single-patient ingest (focusHint should be null)"""
    log("\n" + "="*80)
    log("FEATURE 1 (continued): SINGLE-PATIENT INGEST")
    log("="*80)
    
    log("\nStep 5: POST /api/ingest with document describing ONE patient")
    
    single_patient_doc = {
        "documents": [{
            "name": "Care plan",
            "category": "careplan",
            "kind": "text",
            "textContent": "Mr Tim Green, 55M, admitted with acute pancreatitis, NBM, IV fluids, pain managed with PRN analgesia."
        }]
    }
    
    r = requests.post(f"{BASE_URL}/ingest", json=single_patient_doc)
    
    if r.status_code != 200:
        log(f"❌ FAIL: POST /api/ingest returned {r.status_code}")
        return False
    
    result = r.json()
    log(f"✅ POST /api/ingest returned 200")
    log(f"detectedCount: {result.get('detectedCount')}")
    log(f"created: {result.get('created')}")
    
    # Verify single patient
    if result.get('detectedCount') != 1:
        log(f"⚠️  WARNING: detectedCount={result.get('detectedCount')}, expected 1")
    else:
        log(f"✅ detectedCount == 1")
    
    if result.get('created') != 1:
        log(f"❌ FAIL: created={result.get('created')}, expected 1")
        return False
    log(f"✅ created == 1")
    
    patients = result.get('patients', [])
    if len(patients) != 1:
        log(f"❌ FAIL: Expected 1 patient, got {len(patients)}")
        return False
    
    patient = patients[0]
    focus_hint = patient.get('focusHint')
    
    log(f"Patient name: {patient.get('name')}")
    log(f"focusHint: {focus_hint}")
    
    # For single patient, focusHint should be null
    if focus_hint is not None:
        log(f"❌ FAIL: focusHint should be null for single patient, got: {focus_hint}")
        return False
    
    log(f"✅ focusHint == null (correct for single patient)")
    
    # Cleanup
    delete_patient(patient['id'])
    log(f"Cleaned up patient: {patient['name']}")
    
    log("\n✅ STEP 5 PASSED: Single-patient ingest works correctly")
    
    return True

def test_empty_documents_error():
    """Test that empty documents array returns 400 error"""
    log("\n" + "="*80)
    log("FEATURE 1 (continued): EMPTY DOCUMENTS ERROR")
    log("="*80)
    
    log("\nStep 6: POST /api/ingest with empty documents array")
    
    r = requests.post(f"{BASE_URL}/ingest", json={"documents": []})
    
    if r.status_code != 400:
        log(f"❌ FAIL: Expected 400 error, got {r.status_code}")
        return False
    
    log(f"✅ POST /api/ingest with empty documents returned 400 (correct)")
    log(f"Error message: {r.text}")
    
    log("\n✅ STEP 6 PASSED: Empty documents validation works")
    
    return True

def test_abbreviations_in_samples():
    """
    FEATURE 2: Abbreviation reader in AI output + samples
    Test that sample presets include abbreviations array
    """
    log("\n" + "="*80)
    log("FEATURE 2: ABBREVIATION READER IN SAMPLES")
    log("="*80)
    
    sample_types = ['sepsis', 'postop', 'chf']
    
    for sample_type in sample_types:
        log(f"\nStep 7.{sample_types.index(sample_type)+1}: POST /api/sample with type='{sample_type}'")
        
        r = requests.post(f"{BASE_URL}/sample", json={"type": sample_type})
        
        if r.status_code != 200:
            log(f"❌ FAIL: POST /api/sample returned {r.status_code}")
            return False
        
        patient = r.json()
        ai_output = patient.get('aiOutput', {})
        abbreviations = ai_output.get('abbreviations', [])
        
        log(f"✅ Sample '{sample_type}' created")
        log(f"Patient name: {patient.get('name')}")
        log(f"Abbreviations count: {len(abbreviations)}")
        
        # Verify abbreviations is a non-empty array
        if not isinstance(abbreviations, list):
            log(f"❌ FAIL: abbreviations is not an array, got type: {type(abbreviations)}")
            return False
        
        if len(abbreviations) == 0:
            log(f"❌ FAIL: abbreviations array is empty")
            return False
        
        log(f"✅ abbreviations is a non-empty array ({len(abbreviations)} items)")
        
        # Verify each abbreviation has abbr and meaning
        for i, abbr_obj in enumerate(abbreviations[:3]):  # Check first 3
            abbr = abbr_obj.get('abbr', '')
            meaning = abbr_obj.get('meaning', '')
            
            log(f"  Abbreviation {i+1}: {abbr} = {meaning[:50]}...")
            
            if not abbr or not meaning:
                log(f"  ❌ FAIL: Abbreviation missing abbr or meaning")
                return False
            
            log(f"  ✅ Has non-empty abbr and meaning")
        
        # Cleanup
        delete_patient(patient['id'])
        log(f"Cleaned up sample patient: {patient['name']}")
    
    log("\n✅ STEP 7 PASSED: All 3 sample presets have abbreviations arrays")
    
    return True

def test_abbreviations_in_real_generation():
    """
    Test that real AI generation includes abbreviations array
    """
    log("\n" + "="*80)
    log("FEATURE 2 (continued): ABBREVIATIONS IN REAL AI GENERATION")
    log("="*80)
    
    log("\nStep 8: Create patient with abbreviations-rich document and generate AI")
    
    # Create patient
    patient_data = {
        "name": "Abbr Test Patient",
        "bed": "Bed 1",
        "age": "65",
        "diagnosis": "COPD exacerbation"
    }
    
    r = requests.post(f"{BASE_URL}/patients", json=patient_data)
    if r.status_code != 200:
        log(f"❌ FAIL: POST /patients returned {r.status_code}")
        return False
    
    patient = r.json()
    patient_id = patient['id']
    log(f"✅ Created patient: {patient['name']} (ID: {patient_id})")
    
    # Add document with many abbreviations
    doc_data = {
        "documents": [{
            "name": "Clinical notes",
            "category": "careplan",
            "kind": "text",
            "textContent": """Patient with COPD exacerbation. Currently on IV abx (Ceftriaxone 1g daily). 
Obs QID: HR 92, BP 128/78, RR 24, SpO2 92% on RA. 
IDC in situ for strict fluid balance. 
DVT prophylaxis given (Enoxaparin 40mg SC daily).
BGL monitoring QID due to steroid therapy.
Chest physio BD for secretion clearance.
MET criteria: call if SpO2 < 90% or RR > 30."""
        }]
    }
    
    r = requests.post(f"{BASE_URL}/patients/{patient_id}/documents", json=doc_data)
    if r.status_code != 200:
        log(f"❌ FAIL: POST /documents returned {r.status_code}")
        delete_patient(patient_id)
        return False
    
    log(f"✅ Added document with abbreviations")
    
    # Generate AI
    log(f"Generating AI care plan (REAL Gemini, ~30-45s)...")
    start_time = time.time()
    r = requests.post(f"{BASE_URL}/patients/{patient_id}/generate")
    elapsed = time.time() - start_time
    
    if r.status_code != 200:
        log(f"❌ FAIL: POST /generate returned {r.status_code}")
        log(f"Response: {r.text[:500]}")
        delete_patient(patient_id)
        return False
    
    log(f"✅ AI generation completed in {elapsed:.1f}s")
    
    result = r.json()
    ai_output = result.get('aiOutput', {})
    
    # Check abbreviations array
    abbreviations = ai_output.get('abbreviations', [])
    
    log(f"Abbreviations count: {len(abbreviations)}")
    
    if not isinstance(abbreviations, list):
        log(f"❌ FAIL: abbreviations is not an array")
        delete_patient(patient_id)
        return False
    
    if len(abbreviations) == 0:
        log(f"❌ FAIL: abbreviations array is empty")
        delete_patient(patient_id)
        return False
    
    log(f"✅ abbreviations is a non-empty array ({len(abbreviations)} items)")
    
    # Check for expected abbreviations
    expected_abbrs = ['copd', 'iv', 'qid', 'spo2', 'idc', 'dvt', 'bgl', 'met']
    found_abbrs = [a.get('abbr', '').lower() for a in abbreviations]
    
    log(f"\nFound abbreviations:")
    for abbr_obj in abbreviations:
        abbr = abbr_obj.get('abbr', '')
        meaning = abbr_obj.get('meaning', '')
        log(f"  {abbr}: {meaning[:80]}...")
        
        if not abbr or not meaning:
            log(f"  ❌ FAIL: Abbreviation missing abbr or meaning")
            delete_patient(patient_id)
            return False
    
    # Check if at least some expected abbreviations are present
    matches = [exp for exp in expected_abbrs if any(exp in fa for fa in found_abbrs)]
    log(f"\nExpected abbreviations found: {matches}")
    
    if len(matches) < 3:
        log(f"⚠️  WARNING: Only {len(matches)} expected abbreviations found (expected at least 3)")
    else:
        log(f"✅ Found {len(matches)} expected abbreviations")
    
    # Verify all previously-tested schema keys are still present
    log(f"\nVerifying full schema integrity (all previous keys still present):")
    
    required_keys = [
        'patientSummary', 'priorities', 'interventions', 'isbar', 'medications',
        'medicationTimes', 'vitalsTimeline', 'careSchedule', 'earlyWarning',
        'redFlags', 'newGradTips', 'safetyNotice', 'handoverHeader', 'criticalActions',
        'drsabcd', 'dietMobility', 'assessments', 'linesDevices', 'edd',
        'recommendations', 'outstandingTasks', 'abbreviations'
    ]
    
    missing_keys = [k for k in required_keys if k not in ai_output]
    
    if missing_keys:
        log(f"❌ FAIL: Missing keys: {missing_keys}")
        delete_patient(patient_id)
        return False
    
    log(f"✅ All {len(required_keys)} required keys present")
    
    # Check interventions have howToMonitor
    interventions = ai_output.get('interventions', [])
    if interventions:
        first_intervention = interventions[0]
        if 'howToMonitor' not in first_intervention:
            log(f"❌ FAIL: interventions missing 'howToMonitor' field")
            delete_patient(patient_id)
            return False
        log(f"✅ interventions have 'howToMonitor' field")
    
    # Cleanup
    delete_patient(patient_id)
    log(f"Cleaned up test patient")
    
    log("\n✅ STEP 8 PASSED: Real AI generation includes abbreviations array")
    
    return True

def main():
    """Run all tests"""
    log("="*80)
    log("BACKEND TESTING: NEW FEATURES")
    log("="*80)
    log("Testing:")
    log("  1. Multi-patient ingest (POST /api/ingest) - MOST IMPORTANT")
    log("  2. Abbreviation reader in AI output + samples")
    log("="*80)
    
    all_passed = True
    
    try:
        # Feature 1: Multi-patient ingest
        if not test_multi_patient_ingest():
            log("\n❌ FEATURE 1 FAILED: Multi-patient ingest")
            all_passed = False
        else:
            log("\n✅ FEATURE 1 PASSED: Multi-patient ingest")
        
        if not test_single_patient_ingest():
            log("\n❌ FEATURE 1 FAILED: Single-patient ingest")
            all_passed = False
        
        if not test_empty_documents_error():
            log("\n❌ FEATURE 1 FAILED: Empty documents validation")
            all_passed = False
        
        # Feature 2: Abbreviations
        if not test_abbreviations_in_samples():
            log("\n❌ FEATURE 2 FAILED: Abbreviations in samples")
            all_passed = False
        else:
            log("\n✅ FEATURE 2 PASSED: Abbreviations in samples")
        
        if not test_abbreviations_in_real_generation():
            log("\n❌ FEATURE 2 FAILED: Abbreviations in real generation")
            all_passed = False
        else:
            log("\n✅ FEATURE 2 PASSED: Abbreviations in real generation")
        
    except Exception as e:
        log(f"\n❌ TEST SUITE FAILED WITH EXCEPTION: {e}")
        import traceback
        traceback.print_exc()
        all_passed = False
    
    finally:
        # Final cleanup
        log("\n" + "="*80)
        log("FINAL CLEANUP")
        log("="*80)
        cleanup_all_except_protected()
    
    log("\n" + "="*80)
    if all_passed:
        log("✅ ALL TESTS PASSED")
    else:
        log("❌ SOME TESTS FAILED")
    log("="*80)
    
    return 0 if all_passed else 1

if __name__ == "__main__":
    sys.exit(main())
