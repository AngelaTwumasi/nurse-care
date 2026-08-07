#!/usr/bin/env python3
"""
Backend test for NurseCare API - Round 8: ewHistory accumulation
Tests that ewHistory accumulates on each generate while careDone resets.
"""
import requests
import time
import json

BASE_URL = "https://web-nurse-app.preview.emergentagent.com/api"

def test_ewhistory_accumulation():
    """
    Test ewHistory accumulation on generate endpoint.
    Steps:
    1. Create patient "EWHist Test"
    2. Add vitals document with deteriorating observations
    3. POST /generate (first time) - verify ewHistory length 1, careDone is {}
    4. PUT careDone to {"0": true}
    5. POST /generate (second time) - verify ewHistory length 2, careDone reset to {}
    6. Verify all 12 aiOutput keys present
    7. Cleanup
    """
    print("\n" + "="*80)
    print("ROUND 8: Testing ewHistory accumulation on generate endpoint")
    print("="*80 + "\n")
    
    patient_id = None
    
    try:
        # Step 1: Create patient "EWHist Test"
        print("Step 1: Creating patient 'EWHist Test'...")
        patient_data = {
            "name": "EWHist Test",
            "bed": "B1",
            "age": "72",
            "diagnosis": "Sepsis watch"
        }
        
        response = requests.post(f"{BASE_URL}/patients", json=patient_data, timeout=30)
        print(f"  Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"  ❌ FAILED: Expected 200, got {response.status_code}")
            print(f"  Response: {response.text}")
            return False
        
        patient = response.json()
        patient_id = patient.get('id')
        print(f"  ✅ Patient created with ID: {patient_id}")
        print(f"  Name: {patient.get('name')}, Bed: {patient.get('bed')}, Age: {patient.get('age')}")
        
        # Step 2: Add vitals document with deteriorating observations
        print("\nStep 2: Adding vitals document with deteriorating observations...")
        doc_data = {
            "documents": [{
                "name": "Obs",
                "category": "vitals",
                "kind": "text",
                "textContent": "Obs 0600 HR 92 BP 105/62 RR 22 SpO2 93% Temp 38.2. Obs 1000 HR 118 BP 92/54 RR 28 SpO2 89% Temp 38.9."
            }]
        }
        
        response = requests.post(f"{BASE_URL}/patients/{patient_id}/documents", json=doc_data, timeout=30)
        print(f"  Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"  ❌ FAILED: Expected 200, got {response.status_code}")
            print(f"  Response: {response.text}")
            return False
        
        updated_patient = response.json()
        doc_count = len(updated_patient.get('documents', []))
        print(f"  ✅ Document added successfully. Total documents: {doc_count}")
        
        # Step 3: First AI generation
        print("\nStep 3: First AI generation (REAL Gemini, allow 90s)...")
        start_time = time.time()
        
        response = requests.post(f"{BASE_URL}/patients/{patient_id}/generate", timeout=120)
        elapsed = time.time() - start_time
        print(f"  Status: {response.status_code}")
        print(f"  Time: {elapsed:.1f}s")
        
        if response.status_code != 200:
            print(f"  ❌ FAILED: Expected 200, got {response.status_code}")
            print(f"  Response: {response.text}")
            return False
        
        gen_result = response.json()
        print(f"  ✅ AI generation completed in {elapsed:.1f}s")
        
        # Get patient to verify ewHistory and careDone
        print("\nStep 3a: Verifying ewHistory and careDone after first generate...")
        response = requests.get(f"{BASE_URL}/patients/{patient_id}", timeout=30)
        
        if response.status_code != 200:
            print(f"  ❌ FAILED: Could not retrieve patient")
            return False
        
        patient = response.json()
        ew_history = patient.get('ewHistory', [])
        care_done = patient.get('careDone', None)
        
        print(f"  ewHistory type: {type(ew_history)}")
        print(f"  ewHistory length: {len(ew_history) if isinstance(ew_history, list) else 'N/A'}")
        
        # Verify ewHistory is an array of length 1
        if not isinstance(ew_history, list):
            print(f"  ❌ FAILED: ewHistory is not an array, got {type(ew_history)}")
            return False
        
        if len(ew_history) != 1:
            print(f"  ❌ FAILED: ewHistory length should be 1, got {len(ew_history)}")
            return False
        
        print(f"  ✅ ewHistory is an array of length 1")
        
        # Verify ewHistory[0] structure
        ew_entry = ew_history[0]
        print(f"\n  ewHistory[0] structure:")
        print(f"    t: {ew_entry.get('t')} (type: {type(ew_entry.get('t'))})")
        print(f"    score: {ew_entry.get('score')} (type: {type(ew_entry.get('score'))})")
        print(f"    risk: {ew_entry.get('risk')} (type: {type(ew_entry.get('risk'))})")
        print(f"    riskValue: {ew_entry.get('riskValue')} (type: {type(ew_entry.get('riskValue'))})")
        
        # Verify required fields exist
        if 't' not in ew_entry:
            print(f"  ❌ FAILED: ewHistory[0] missing 't' field")
            return False
        
        if 'score' not in ew_entry:
            print(f"  ❌ FAILED: ewHistory[0] missing 'score' field")
            return False
        
        if 'risk' not in ew_entry:
            print(f"  ❌ FAILED: ewHistory[0] missing 'risk' field")
            return False
        
        if 'riskValue' not in ew_entry:
            print(f"  ❌ FAILED: ewHistory[0] missing 'riskValue' field")
            return False
        
        # Verify score is number or null
        score = ew_entry.get('score')
        if score is not None and not isinstance(score, (int, float)):
            print(f"  ❌ FAILED: score should be number or null, got {type(score)}")
            return False
        
        # Verify risk is string
        risk = ew_entry.get('risk')
        if risk is not None and not isinstance(risk, str):
            print(f"  ❌ FAILED: risk should be string, got {type(risk)}")
            return False
        
        # Verify riskValue is 0-3
        risk_value = ew_entry.get('riskValue')
        if not isinstance(risk_value, (int, float)) or risk_value < 0 or risk_value > 3:
            print(f"  ❌ FAILED: riskValue should be 0-3, got {risk_value}")
            return False
        
        print(f"  ✅ ewHistory[0] has all required fields with correct types")
        print(f"     - t: timestamp present")
        print(f"     - score: {score} (number or null) ✅")
        print(f"     - risk: '{risk}' (string) ✅")
        print(f"     - riskValue: {risk_value} (0-3) ✅")
        
        # Verify careDone is {}
        print(f"\n  careDone: {care_done}")
        if care_done != {}:
            print(f"  ❌ FAILED: careDone should be {{}}, got {care_done}")
            return False
        
        print(f"  ✅ careDone is {{}} (empty) after first generate")
        
        # Step 4: Update careDone to simulate ticked task
        print("\nStep 4: Updating careDone to {'0': true} to simulate ticked task...")
        update_data = {"careDone": {"0": True}}
        
        response = requests.put(f"{BASE_URL}/patients/{patient_id}", json=update_data, timeout=30)
        print(f"  Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"  ❌ FAILED: Expected 200, got {response.status_code}")
            return False
        
        updated_patient = response.json()
        care_done = updated_patient.get('careDone', {})
        print(f"  careDone after update: {care_done}")
        
        if care_done != {"0": True}:
            print(f"  ❌ FAILED: careDone should be {{'0': True}}, got {care_done}")
            return False
        
        print(f"  ✅ careDone updated successfully to {{'0': True}}")
        
        # Step 5: Second AI generation
        print("\nStep 5: Second AI generation (REAL Gemini, allow 90s)...")
        start_time = time.time()
        
        response = requests.post(f"{BASE_URL}/patients/{patient_id}/generate", timeout=120)
        elapsed = time.time() - start_time
        print(f"  Status: {response.status_code}")
        print(f"  Time: {elapsed:.1f}s")
        
        if response.status_code != 200:
            print(f"  ❌ FAILED: Expected 200, got {response.status_code}")
            print(f"  Response: {response.text}")
            return False
        
        print(f"  ✅ Second AI generation completed in {elapsed:.1f}s")
        
        # Get patient to verify ewHistory accumulated and careDone reset
        print("\nStep 5a: Verifying ewHistory ACCUMULATED and careDone RESET...")
        response = requests.get(f"{BASE_URL}/patients/{patient_id}", timeout=30)
        
        if response.status_code != 200:
            print(f"  ❌ FAILED: Could not retrieve patient")
            return False
        
        patient = response.json()
        ew_history = patient.get('ewHistory', [])
        care_done = patient.get('careDone', None)
        
        print(f"  ewHistory length: {len(ew_history) if isinstance(ew_history, list) else 'N/A'}")
        print(f"  careDone: {care_done}")
        
        # Verify ewHistory length is now 2 (ACCUMULATED)
        if not isinstance(ew_history, list):
            print(f"  ❌ FAILED: ewHistory is not an array")
            return False
        
        if len(ew_history) != 2:
            print(f"  ❌ FAILED: ewHistory length should be 2 (accumulated), got {len(ew_history)}")
            return False
        
        print(f"  ✅ ewHistory length is now 2 (ACCUMULATED, not reset)")
        
        # Verify both entries have correct structure
        for i, entry in enumerate(ew_history):
            print(f"\n  ewHistory[{i}]:")
            print(f"    t: {entry.get('t')}")
            print(f"    score: {entry.get('score')}")
            print(f"    risk: {entry.get('risk')}")
            print(f"    riskValue: {entry.get('riskValue')}")
            
            if 't' not in entry or 'score' not in entry or 'risk' not in entry or 'riskValue' not in entry:
                print(f"  ❌ FAILED: ewHistory[{i}] missing required fields")
                return False
        
        print(f"  ✅ Both ewHistory entries have correct structure")
        
        # Verify careDone was RESET to {}
        if care_done != {}:
            print(f"  ❌ FAILED: careDone should be reset to {{}}, got {care_done}")
            return False
        
        print(f"  ✅ careDone was RESET to {{}} (empty) after second generate")
        
        # Step 6: Verify all 12 aiOutput keys present
        print("\nStep 6: Verifying all 12 aiOutput keys present...")
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
        for key in required_keys:
            if key not in ai_output:
                missing_keys.append(key)
                print(f"  ❌ Missing key: {key}")
            else:
                print(f"  ✅ {key}: present")
        
        if missing_keys:
            print(f"\n  ❌ FAILED: Missing {len(missing_keys)} required keys: {missing_keys}")
            return False
        
        print(f"\n  ✅ All 12 required aiOutput keys present")
        
        # Additional verification of key structures
        print("\n  Verifying key structures:")
        
        # Check isbar has 5 sections
        isbar = ai_output.get('isbar', {})
        isbar_keys = ['identify', 'situation', 'background', 'assessment', 'recommendation']
        isbar_ok = all(k in isbar for k in isbar_keys)
        print(f"    isbar (5 sections): {'✅' if isbar_ok else '❌'}")
        
        # Check arrays
        print(f"    priorities: {len(ai_output.get('priorities', []))} items")
        print(f"    interventions: {len(ai_output.get('interventions', []))} items")
        print(f"    medications: {len(ai_output.get('medications', []))} items")
        print(f"    medicationTimes: {len(ai_output.get('medicationTimes', []))} items")
        print(f"    vitalsTimeline: {len(ai_output.get('vitalsTimeline', []))} items")
        print(f"    careSchedule: {len(ai_output.get('careSchedule', []))} items")
        print(f"    redFlags: {len(ai_output.get('redFlags', []))} items")
        print(f"    newGradTips: {len(ai_output.get('newGradTips', []))} items")
        
        # Check earlyWarning structure
        early_warning = ai_output.get('earlyWarning', {})
        ew_keys = ['score', 'riskLevel', 'trend', 'rationale', 'escalation']
        ew_ok = all(k in early_warning for k in ew_keys)
        print(f"    earlyWarning (5 fields): {'✅' if ew_ok else '❌'}")
        
        print("\n" + "="*80)
        print("✅ ALL TESTS PASSED - ewHistory accumulation working correctly")
        print("="*80)
        print("\nSummary:")
        print("  ✅ ewHistory accumulates on each generate (length 1 → 2)")
        print("  ✅ ewHistory entries have correct structure (t, score, risk, riskValue)")
        print("  ✅ careDone resets to {} on each generate")
        print("  ✅ All 12 aiOutput keys present and valid")
        
        return True
        
    except Exception as e:
        print(f"\n❌ TEST FAILED WITH EXCEPTION: {str(e)}")
        import traceback
        traceback.print_exc()
        return False
        
    finally:
        # Step 7: Cleanup - delete test patient
        if patient_id:
            print(f"\nStep 7: Cleanup - Deleting test patient '{patient_id}'...")
            try:
                response = requests.delete(f"{BASE_URL}/patients/{patient_id}", timeout=30)
                if response.status_code == 200:
                    print(f"  ✅ Test patient 'EWHist Test' deleted successfully")
                else:
                    print(f"  ⚠️  Warning: Could not delete test patient (status {response.status_code})")
            except Exception as e:
                print(f"  ⚠️  Warning: Error during cleanup: {str(e)}")
        
        # Verify patient "m" still exists
        print("\nVerifying patient 'm' was preserved...")
        try:
            response = requests.get(f"{BASE_URL}/patients", timeout=30)
            if response.status_code == 200:
                patients = response.json()
                m_patient = next((p for p in patients if p.get('name') == 'm'), None)
                if m_patient:
                    print(f"  ✅ Patient 'm' preserved (ID: {m_patient.get('id')})")
                else:
                    print(f"  ⚠️  Warning: Patient 'm' not found")
            else:
                print(f"  ⚠️  Warning: Could not verify patients (status {response.status_code})")
        except Exception as e:
            print(f"  ⚠️  Warning: Error verifying patient 'm': {str(e)}")

if __name__ == "__main__":
    success = test_ewhistory_accumulation()
    exit(0 if success else 1)
