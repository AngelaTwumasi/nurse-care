#!/usr/bin/env python3
"""
Backend test for NurseCare API - Round 7: Care checklist persistence
Tests careDone persistence and reset on regenerate
"""

import requests
import json
import time

BASE_URL = "https://web-nurse-app.preview.emergentagent.com/api"

def test_care_checklist_persistence():
    """
    Test care checklist persistence (careDone) and reset on regenerate
    """
    print("\n" + "="*80)
    print("ROUND 7: Care Checklist Persistence Test")
    print("="*80)
    
    patient_id = None
    
    try:
        # Step 1: Create a test patient
        print("\n[STEP 1] Creating test patient 'Checklist Test'...")
        patient_data = {
            "name": "Checklist Test",
            "bed": "B1",
            "age": "70",
            "diagnosis": "Post-op, monitoring"
        }
        
        response = requests.post(f"{BASE_URL}/patients", json=patient_data, timeout=10)
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Could not create patient. Response: {response.text}")
            return False
        
        patient = response.json()
        patient_id = patient.get('id')
        print(f"✅ Patient created with ID: {patient_id}")
        print(f"   Name: {patient.get('name')}, Bed: {patient.get('bed')}, Age: {patient.get('age')}")
        
        # Step 2: Add a care plan document with tasks and vitals
        print("\n[STEP 2] Adding care plan document with tasks and vitals...")
        doc_data = {
            "documents": [{
                "name": "Plan",
                "category": "careplan",
                "kind": "text",
                "textContent": "Post-op day 1. Hourly neuro obs. 4-hourly vitals. Assist breakfast 0800. Mobilise with physio 1030. Wound check end of shift. Paracetamol 1g PO 0600 1400. Obs 0600 HR 88 BP 120/70 RR 16 SpO2 97%. Obs 1000 HR 104 BP 100/60 RR 22 SpO2 93%."
            }]
        }
        
        response = requests.post(f"{BASE_URL}/patients/{patient_id}/documents", json=doc_data, timeout=10)
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Could not add document. Response: {response.text}")
            return False
        
        updated_patient = response.json()
        doc_count = len(updated_patient.get('documents', []))
        print(f"✅ Document added successfully. Total documents: {doc_count}")
        
        # Step 3: Generate AI care plan (REAL Gemini - allow up to 90s)
        print("\n[STEP 3] Generating AI care plan (REAL Gemini 2.5 Pro - may take up to 90s)...")
        start_time = time.time()
        
        response = requests.post(f"{BASE_URL}/patients/{patient_id}/generate", timeout=120)
        elapsed = time.time() - start_time
        print(f"Status: {response.status_code}")
        print(f"Generation time: {elapsed:.1f}s")
        
        if response.status_code != 200:
            print(f"❌ FAILED: AI generation failed. Response: {response.text}")
            return False
        
        gen_result = response.json()
        ai_output = gen_result.get('aiOutput', {})
        
        # Verify careSchedule exists
        care_schedule = ai_output.get('careSchedule', [])
        if not care_schedule:
            print(f"❌ FAILED: careSchedule is missing or empty in aiOutput")
            return False
        
        print(f"✅ AI generation completed in {elapsed:.1f}s")
        print(f"   careSchedule has {len(care_schedule)} tasks")
        
        # Step 3b: GET patient and verify careDone is {} right after generate
        print("\n[STEP 3b] Verifying careDone is {} (empty) right after generate...")
        response = requests.get(f"{BASE_URL}/patients/{patient_id}", timeout=10)
        
        if response.status_code != 200:
            print(f"❌ FAILED: Could not retrieve patient. Response: {response.text}")
            return False
        
        patient = response.json()
        care_done = patient.get('careDone', None)
        
        if care_done is None:
            print(f"⚠️  WARNING: careDone field is missing (None)")
            print(f"   Expected: {{}}")
        elif care_done == {}:
            print(f"✅ careDone is {{}} (empty) as expected after generate")
        else:
            print(f"❌ FAILED: careDone should be {{}} but got: {care_done}")
            return False
        
        # Step 4: PUT careDone with some checked tasks
        print("\n[STEP 4] Setting careDone to {{'0': true, '2': true}}...")
        update_data = {
            "careDone": {"0": True, "2": True}
        }
        
        response = requests.put(f"{BASE_URL}/patients/{patient_id}", json=update_data, timeout=10)
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Could not update careDone. Response: {response.text}")
            return False
        
        print(f"✅ PUT request successful")
        
        # Step 4b: GET patient and verify careDone persisted
        print("\n[STEP 4b] Verifying careDone persisted correctly...")
        response = requests.get(f"{BASE_URL}/patients/{patient_id}", timeout=10)
        
        if response.status_code != 200:
            print(f"❌ FAILED: Could not retrieve patient. Response: {response.text}")
            return False
        
        patient = response.json()
        care_done = patient.get('careDone', {})
        patient_name = patient.get('name')
        patient_diagnosis = patient.get('diagnosis')
        
        # Verify careDone
        expected_care_done = {"0": True, "2": True}
        if care_done == expected_care_done:
            print(f"✅ careDone persisted correctly: {care_done}")
        else:
            print(f"❌ FAILED: careDone mismatch")
            print(f"   Expected: {expected_care_done}")
            print(f"   Got: {care_done}")
            return False
        
        # Verify name and diagnosis unchanged
        if patient_name == "Checklist Test" and patient_diagnosis == "Post-op, monitoring":
            print(f"✅ Patient name and diagnosis unchanged:")
            print(f"   Name: {patient_name}")
            print(f"   Diagnosis: {patient_diagnosis}")
        else:
            print(f"❌ FAILED: Patient data changed unexpectedly")
            print(f"   Name: {patient_name} (expected: Checklist Test)")
            print(f"   Diagnosis: {patient_diagnosis} (expected: Post-op, monitoring)")
            return False
        
        # Step 5: Regenerate AI care plan and verify careDone is RESET to {}
        print("\n[STEP 5] Regenerating AI care plan (REAL Gemini - may take up to 90s)...")
        start_time = time.time()
        
        response = requests.post(f"{BASE_URL}/patients/{patient_id}/generate", timeout=120)
        elapsed = time.time() - start_time
        print(f"Status: {response.status_code}")
        print(f"Regeneration time: {elapsed:.1f}s")
        
        if response.status_code != 200:
            print(f"❌ FAILED: AI regeneration failed. Response: {response.text}")
            return False
        
        print(f"✅ AI regeneration completed in {elapsed:.1f}s")
        
        # Step 5b: GET patient and verify careDone was RESET to {}
        print("\n[STEP 5b] Verifying careDone was RESET to {{}} after regenerate...")
        response = requests.get(f"{BASE_URL}/patients/{patient_id}", timeout=10)
        
        if response.status_code != 200:
            print(f"❌ FAILED: Could not retrieve patient. Response: {response.text}")
            return False
        
        patient = response.json()
        care_done = patient.get('careDone', None)
        
        if care_done is None:
            print(f"⚠️  WARNING: careDone field is missing (None) after regenerate")
            print(f"   Expected: {{}}")
        elif care_done == {}:
            print(f"✅ careDone was RESET to {{}} (empty) after regenerate")
        else:
            print(f"❌ FAILED: careDone should be {{}} after regenerate but got: {care_done}")
            return False
        
        # Step 6: Verify all aiOutput keys are present
        print("\n[STEP 6] Verifying all aiOutput keys are present...")
        ai_output = patient.get('aiOutput', {})
        
        required_keys = [
            'patientSummary',
            'priorities',
            'interventions',
            'isbar',
            'medications',
            'medicationTimes',
            'vitalsTimeline',
            'careSchedule',
            'earlyWarning',
            'redFlags',
            'newGradTips',
            'safetyNotice'
        ]
        
        missing_keys = []
        present_keys = []
        
        for key in required_keys:
            if key in ai_output:
                present_keys.append(key)
            else:
                missing_keys.append(key)
        
        if missing_keys:
            print(f"❌ FAILED: Missing aiOutput keys: {missing_keys}")
            print(f"   Present keys ({len(present_keys)}/12): {present_keys}")
            return False
        
        print(f"✅ All 12 required aiOutput keys present:")
        for key in required_keys:
            value = ai_output[key]
            if isinstance(value, list):
                print(f"   • {key}: array with {len(value)} items")
            elif isinstance(value, dict):
                if key == 'isbar':
                    isbar_keys = list(value.keys())
                    print(f"   • {key}: object with {len(isbar_keys)} sections ({', '.join(isbar_keys)})")
                elif key == 'earlyWarning':
                    risk = value.get('riskLevel', 'N/A')
                    trend = value.get('trend', 'N/A')
                    print(f"   • {key}: object (riskLevel={risk}, trend={trend})")
                else:
                    print(f"   • {key}: object")
            else:
                print(f"   • {key}: {type(value).__name__}")
        
        # Verify ISBAR has all 5 sections
        isbar = ai_output.get('isbar', {})
        isbar_sections = ['identify', 'situation', 'background', 'assessment', 'recommendation']
        missing_isbar = [s for s in isbar_sections if s not in isbar]
        
        if missing_isbar:
            print(f"⚠️  WARNING: ISBAR missing sections: {missing_isbar}")
        else:
            print(f"✅ ISBAR has all 5 sections: {', '.join(isbar_sections)}")
        
        print("\n" + "="*80)
        print("✅ ALL TESTS PASSED - Care checklist persistence working correctly")
        print("="*80)
        print("\nSummary:")
        print("  • careDone starts as {} after generate")
        print("  • careDone persists when updated via PUT")
        print("  • careDone resets to {} on regenerate")
        print("  • All 12 aiOutput keys present")
        print("  • Patient data (name/diagnosis) unchanged")
        
        return True
        
    except requests.exceptions.Timeout:
        print(f"❌ FAILED: Request timeout (AI generation may take longer than expected)")
        return False
    except Exception as e:
        print(f"❌ FAILED: Unexpected error: {str(e)}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        # Step 7: Cleanup - delete test patient
        if patient_id:
            print(f"\n[CLEANUP] Deleting test patient '{patient_id}'...")
            try:
                response = requests.delete(f"{BASE_URL}/patients/{patient_id}", timeout=10)
                if response.status_code == 200:
                    print(f"✅ Test patient deleted successfully")
                else:
                    print(f"⚠️  WARNING: Could not delete test patient. Status: {response.status_code}")
            except Exception as e:
                print(f"⚠️  WARNING: Error during cleanup: {str(e)}")
        
        # Verify patient "m" still exists
        print(f"\n[VERIFY] Checking patient 'm' was not deleted...")
        try:
            response = requests.get(f"{BASE_URL}/patients", timeout=10)
            if response.status_code == 200:
                patients = response.json()
                patient_names = [p.get('name') for p in patients]
                if 'm' in patient_names:
                    print(f"✅ Patient 'm' still exists (preserved as instructed)")
                else:
                    print(f"⚠️  INFO: Patient 'm' not found in current patients: {patient_names}")
            else:
                print(f"⚠️  WARNING: Could not verify patients. Status: {response.status_code}")
        except Exception as e:
            print(f"⚠️  WARNING: Error verifying patients: {str(e)}")

if __name__ == "__main__":
    success = test_care_checklist_persistence()
    exit(0 if success else 1)
