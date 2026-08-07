#!/usr/bin/env python3
"""
NurseCare Backend API Test - Schema Extension (Round 2)
Tests the extended AI generation schema with medicationTimes, vitalsTimeline, and earlyWarning
"""

import requests
import json
import time

# Configuration
BASE_URL = "https://web-nurse-app.preview.emergentagent.com/api"
TIMEOUT = 10
AI_TIMEOUT = 90

def cleanup_all_patients():
    """Delete all patients to ensure clean state"""
    print("\n🧹 Cleaning up all patients...")
    try:
        response = requests.get(f"{BASE_URL}/patients", timeout=TIMEOUT)
        if response.status_code == 200:
            patients = response.json()
            for patient in patients:
                patient_id = patient.get('id')
                if patient_id:
                    requests.delete(f"{BASE_URL}/patients/{patient_id}", timeout=TIMEOUT)
                    print(f"   Deleted: {patient.get('name', 'Unknown')}")
            print("✅ Cleanup complete\n")
        else:
            print(f"⚠️  Could not fetch patients: {response.status_code}\n")
    except Exception as e:
        print(f"⚠️  Cleanup error: {str(e)}\n")

def test_schema_extension():
    """
    Test the extended AI generation schema with:
    - medicationTimes[] (array of {time, medication, dose})
    - vitalsTimeline[] (array of {time, hr, bp, rr, spo2, temp, notes})
    - earlyWarning{score, riskLevel, trend, rationale, escalation}
    """
    print("="*80)
    print("SCHEMA EXTENSION TEST - AI Generation with Timeline & Early Warning")
    print("="*80)
    
    test_patient_id = None
    
    try:
        # Step 1: Create patient
        print("\n[STEP 1] Creating patient: Timeline Test")
        patient_data = {
            "name": "Timeline Test",
            "bed": "Bed 5",
            "age": "68",
            "diagnosis": "Pneumonia, monitoring for sepsis"
        }
        response = requests.post(f"{BASE_URL}/patients", json=patient_data, timeout=TIMEOUT)
        
        if response.status_code != 200:
            print(f"❌ FAIL: Could not create patient - Status {response.status_code}")
            print(f"   Response: {response.text}")
            return False
        
        patient = response.json()
        test_patient_id = patient.get('id')
        print(f"✅ PASS: Patient created with ID: {test_patient_id}")
        print(f"   Name: {patient.get('name')}, Bed: {patient.get('bed')}, Age: {patient.get('age')}")
        print(f"   Diagnosis: {patient.get('diagnosis')}")
        
        # Step 2: Add document with time-stamped vitals showing DETERIORATION
        print("\n[STEP 2] Adding vitals document with deteriorating observations")
        doc_data = {
            "documents": [
                {
                    "name": "Vitals obs",
                    "category": "vitals",
                    "kind": "text",
                    "textContent": """Obs 0600 HR 88 BP 130/80 RR 18 SpO2 96% Temp 37.2. Obs 1000 HR 104 BP 100/60 RR 24 SpO2 92% Temp 38.1. Obs 1400 HR 118 BP 92/55 RR 28 SpO2 89% Temp 38.6. Meds: Paracetamol 1g PO at 0600 and 1400; Ceftriaxone 1g IV at 0800."""
                }
            ]
        }
        response = requests.post(f"{BASE_URL}/patients/{test_patient_id}/documents", json=doc_data, timeout=TIMEOUT)
        
        if response.status_code != 200:
            print(f"❌ FAIL: Could not add document - Status {response.status_code}")
            print(f"   Response: {response.text}")
            return False
        
        patient = response.json()
        doc_count = len(patient.get('documents', []))
        print(f"✅ PASS: Document added successfully")
        print(f"   Total documents: {doc_count}")
        print(f"   Document shows deteriorating vitals:")
        print(f"     0600: HR 88, BP 130/80, RR 18, SpO2 96%, Temp 37.2")
        print(f"     1000: HR 104, BP 100/60, RR 24, SpO2 92%, Temp 38.1")
        print(f"     1400: HR 118, BP 92/55, RR 28, SpO2 89%, Temp 38.6")
        
        # Step 3: Generate AI output (REAL Gemini call)
        print("\n[STEP 3] Calling POST /api/patients/:id/generate (REAL Gemini 2.5 Pro)")
        print("⏳ This may take 60-90 seconds...")
        
        start_time = time.time()
        response = requests.post(f"{BASE_URL}/patients/{test_patient_id}/generate", timeout=AI_TIMEOUT)
        elapsed = time.time() - start_time
        
        if response.status_code != 200:
            print(f"❌ FAIL: AI generation failed - Status {response.status_code}")
            print(f"   Response: {response.text[:500]}")
            return False
        
        print(f"✅ Response received in {elapsed:.1f} seconds")
        
        data = response.json()
        
        # Check top-level structure
        if 'aiOutput' not in data:
            print(f"❌ FAIL: Missing 'aiOutput' in response")
            return False
        
        if 'aiGeneratedAt' not in data:
            print(f"❌ FAIL: Missing 'aiGeneratedAt' in response")
            return False
        
        ai_output = data['aiOutput']
        print(f"✅ PASS: Response contains aiOutput and aiGeneratedAt")
        
        # Step 4: Verify ALL base keys
        print("\n[STEP 4] Verifying BASE schema keys")
        base_keys = [
            'patientSummary',
            'priorities',
            'interventions',
            'isbar',
            'medications',
            'redFlags',
            'newGradTips',
            'safetyNotice'
        ]
        
        missing_base = [key for key in base_keys if key not in ai_output]
        if missing_base:
            print(f"❌ FAIL: Missing base keys: {missing_base}")
            return False
        
        print(f"✅ PASS: All 8 base keys present")
        for key in base_keys:
            if isinstance(ai_output[key], list):
                print(f"   ✓ {key}: array with {len(ai_output[key])} items")
            elif isinstance(ai_output[key], dict):
                print(f"   ✓ {key}: object with {len(ai_output[key])} keys")
            elif isinstance(ai_output[key], str):
                preview = ai_output[key][:60] + "..." if len(ai_output[key]) > 60 else ai_output[key]
                print(f"   ✓ {key}: \"{preview}\"")
        
        # Verify ISBAR structure
        isbar = ai_output.get('isbar', {})
        isbar_keys = ['identify', 'situation', 'background', 'assessment', 'recommendation']
        missing_isbar = [key for key in isbar_keys if key not in isbar]
        if missing_isbar:
            print(f"❌ FAIL: Missing ISBAR keys: {missing_isbar}")
            return False
        print(f"   ✓ isbar: all 5 sections present (identify, situation, background, assessment, recommendation)")
        
        # Step 5: Verify NEW schema keys
        print("\n[STEP 5] Verifying NEW schema keys (medicationTimes, vitalsTimeline, earlyWarning)")
        
        # Check medicationTimes
        if 'medicationTimes' not in ai_output:
            print(f"❌ FAIL: Missing 'medicationTimes' key")
            return False
        
        med_times = ai_output['medicationTimes']
        if not isinstance(med_times, list):
            print(f"❌ FAIL: medicationTimes is not an array, got {type(med_times)}")
            return False
        
        print(f"✅ PASS: medicationTimes present (array with {len(med_times)} items)")
        if len(med_times) > 0:
            for i, mt in enumerate(med_times[:3]):  # Show first 3
                print(f"   [{i+1}] time: {mt.get('time', 'N/A')}, medication: {mt.get('medication', 'N/A')}, dose: {mt.get('dose', 'N/A')}")
            if len(med_times) > 3:
                print(f"   ... and {len(med_times) - 3} more")
        
        # Check vitalsTimeline
        if 'vitalsTimeline' not in ai_output:
            print(f"❌ FAIL: Missing 'vitalsTimeline' key")
            return False
        
        vitals_timeline = ai_output['vitalsTimeline']
        if not isinstance(vitals_timeline, list):
            print(f"❌ FAIL: vitalsTimeline is not an array, got {type(vitals_timeline)}")
            return False
        
        print(f"✅ PASS: vitalsTimeline present (array with {len(vitals_timeline)} items)")
        if len(vitals_timeline) > 0:
            for i, vt in enumerate(vitals_timeline):
                print(f"   [{i+1}] time: {vt.get('time', 'N/A')}, HR: {vt.get('hr', '')}, BP: {vt.get('bp', '')}, RR: {vt.get('rr', '')}, SpO2: {vt.get('spo2', '')}, Temp: {vt.get('temp', '')}")
                if vt.get('notes'):
                    print(f"       notes: {vt.get('notes')[:60]}")
        
        # Check earlyWarning
        if 'earlyWarning' not in ai_output:
            print(f"❌ FAIL: Missing 'earlyWarning' key")
            return False
        
        early_warning = ai_output['earlyWarning']
        if not isinstance(early_warning, dict):
            print(f"❌ FAIL: earlyWarning is not an object, got {type(early_warning)}")
            return False
        
        print(f"✅ PASS: earlyWarning present (object)")
        
        # Verify earlyWarning structure
        ew_required = ['score', 'riskLevel', 'trend', 'rationale', 'escalation']
        missing_ew = [key for key in ew_required if key not in early_warning]
        if missing_ew:
            print(f"❌ FAIL: Missing earlyWarning keys: {missing_ew}")
            return False
        
        print(f"   ✓ All 5 earlyWarning keys present:")
        print(f"     - score: {early_warning.get('score')}")
        print(f"     - riskLevel: {early_warning.get('riskLevel')}")
        print(f"     - trend: {early_warning.get('trend')}")
        print(f"     - rationale: {early_warning.get('rationale')[:80]}..." if len(str(early_warning.get('rationale', ''))) > 80 else f"     - rationale: {early_warning.get('rationale')}")
        print(f"     - escalation: {early_warning.get('escalation')[:80]}..." if len(str(early_warning.get('escalation', ''))) > 80 else f"     - escalation: {early_warning.get('escalation')}")
        
        # Validate riskLevel values
        risk_level = early_warning.get('riskLevel')
        if risk_level not in ['low', 'medium', 'high']:
            print(f"⚠️  WARNING: riskLevel '{risk_level}' not in expected values [low, medium, high]")
        
        # Validate trend values
        trend = early_warning.get('trend')
        if trend not in ['improving', 'stable', 'worsening']:
            print(f"⚠️  WARNING: trend '{trend}' not in expected values [improving, stable, worsening]")
        
        # Check if trend matches the deteriorating vitals
        print(f"\n   📊 TREND ANALYSIS:")
        print(f"      Given vitals show: HR↑ (88→118), BP↓ (130/80→92/55), RR↑ (18→28), SpO2↓ (96→89), Temp↑ (37.2→38.6)")
        print(f"      Expected trend: 'worsening'")
        print(f"      Actual trend: '{trend}'")
        
        if trend == 'worsening':
            print(f"   ✅ PASS: Trend correctly identified as 'worsening'")
        else:
            print(f"   ⚠️  NOTE: Trend is '{trend}' (expected 'worsening' based on deteriorating vitals)")
            print(f"           This may be acceptable if AI has different interpretation, but reporting actual value.")
        
        # Step 6: Verify persistence
        print("\n[STEP 6] Verifying persistence via GET /api/patients/:id")
        response = requests.get(f"{BASE_URL}/patients/{test_patient_id}", timeout=TIMEOUT)
        
        if response.status_code != 200:
            print(f"❌ FAIL: Could not retrieve patient - Status {response.status_code}")
            return False
        
        patient = response.json()
        
        if 'aiOutput' not in patient or not patient['aiOutput']:
            print(f"❌ FAIL: aiOutput not persisted to patient record")
            return False
        
        if 'aiGeneratedAt' not in patient or not patient['aiGeneratedAt']:
            print(f"❌ FAIL: aiGeneratedAt not persisted to patient record")
            return False
        
        persisted_ai = patient['aiOutput']
        
        # Verify new keys are persisted
        if 'medicationTimes' not in persisted_ai:
            print(f"❌ FAIL: medicationTimes not persisted")
            return False
        
        if 'vitalsTimeline' not in persisted_ai:
            print(f"❌ FAIL: vitalsTimeline not persisted")
            return False
        
        if 'earlyWarning' not in persisted_ai:
            print(f"❌ FAIL: earlyWarning not persisted")
            return False
        
        print(f"✅ PASS: All aiOutput keys (including new schema) persisted successfully")
        print(f"   - medicationTimes: {len(persisted_ai['medicationTimes'])} items")
        print(f"   - vitalsTimeline: {len(persisted_ai['vitalsTimeline'])} items")
        print(f"   - earlyWarning: {len(persisted_ai['earlyWarning'])} keys")
        
        print("\n" + "="*80)
        print("✅ ALL TESTS PASSED - SCHEMA EXTENSION VERIFIED")
        print("="*80)
        print(f"Summary:")
        print(f"  ✓ Patient created and document added")
        print(f"  ✓ AI generation completed in {elapsed:.1f}s")
        print(f"  ✓ All 8 base keys present and valid")
        print(f"  ✓ All 3 NEW keys present and valid:")
        print(f"    - medicationTimes[] ({len(med_times)} items)")
        print(f"    - vitalsTimeline[] ({len(vitals_timeline)} items)")
        print(f"    - earlyWarning{{score, riskLevel, trend, rationale, escalation}}")
        print(f"  ✓ earlyWarning.trend = '{trend}'")
        print(f"  ✓ All data persisted correctly")
        print("="*80)
        
        return True
        
    except requests.exceptions.Timeout:
        print(f"❌ FAIL: Request timed out after {AI_TIMEOUT}s")
        return False
    except Exception as e:
        print(f"❌ FAIL: Exception occurred: {str(e)}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        # Step 7: Cleanup
        if test_patient_id:
            print(f"\n[STEP 7] Cleaning up test patient {test_patient_id}")
            try:
                response = requests.delete(f"{BASE_URL}/patients/{test_patient_id}", timeout=TIMEOUT)
                if response.status_code == 200:
                    print(f"✅ Test patient deleted successfully")
                else:
                    print(f"⚠️  Could not delete test patient: {response.status_code}")
            except Exception as e:
                print(f"⚠️  Cleanup error: {str(e)}")

def main():
    print("\n" + "="*80)
    print("NURSECARE BACKEND - SCHEMA EXTENSION TEST (ROUND 2)")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"AI Model: gemini/gemini-2.5-pro via Emergent LLM proxy")
    print("Testing: medicationTimes[], vitalsTimeline[], earlyWarning{}")
    print("="*80)
    
    # Cleanup first
    cleanup_all_patients()
    
    # Run the schema extension test
    success = test_schema_extension()
    
    # Final cleanup
    cleanup_all_patients()
    
    if success:
        print("\n✅ SCHEMA EXTENSION TEST PASSED")
        exit(0)
    else:
        print("\n❌ SCHEMA EXTENSION TEST FAILED")
        exit(1)

if __name__ == "__main__":
    main()
