#!/usr/bin/env python3
"""
Backend test for NurseCare patient load limit verification.
Verifies that the patient load limit was raised from 4 to 10.
"""

import requests
import json
import time

BASE_URL = "https://web-nurse-app.preview.emergentagent.com/api"

def test_patient_load_limit():
    """
    Test that patient load limit is now 10 (raised from 4).
    
    Steps:
    1. GET /api/patients to note current count (C)
    2. Create patients until total reaches 10
    3. Attempt 11th patient when total == 10 -> expect HTTP 400
    4. Test INGEST cap with 6 patients when some slots are free
    5. Cleanup all created patients except "m" and "paul"
    """
    
    created_patient_ids = []
    ingested_patient_ids = []
    
    try:
        print("\n" + "="*80)
        print("PATIENT LOAD LIMIT TEST (4 -> 10)")
        print("="*80)
        
        # STEP 1: Get current patient count
        print("\n[STEP 1] GET /api/patients - Note current count")
        response = requests.get(f"{BASE_URL}/patients")
        if response.status_code != 200:
            print(f"❌ FAILED: GET /patients returned {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        patients = response.json()
        initial_count = len(patients)
        print(f"✅ Current patient count (C): {initial_count}")
        
        # List existing patients (to preserve "m" and "paul")
        existing_names = [p.get('name', '').lower() for p in patients]
        print(f"   Existing patients: {[p.get('name', 'Unknown') for p in patients]}")
        
        # STEP 2: Create patients until total reaches 10
        print(f"\n[STEP 2] Create patients until total reaches 10")
        needed = 10 - initial_count
        print(f"   Need to create {needed} patients to reach limit of 10")
        
        if needed > 0:
            for i in range(needed):
                patient_data = {
                    "name": f"LimitTest {i+1}",
                    "bed": f"Bed {100+i}",
                    "age": "65",
                    "diagnosis": "Test patient for load limit verification"
                }
                
                response = requests.post(f"{BASE_URL}/patients", json=patient_data)
                
                if response.status_code != 200:
                    print(f"❌ FAILED: POST /patients returned {response.status_code} for patient {i+1}")
                    print(f"Response: {response.text}")
                    return False
                
                patient = response.json()
                patient_id = patient.get('id')
                created_patient_ids.append(patient_id)
                print(f"   ✅ Created patient {i+1}/{needed}: '{patient.get('name')}' (ID: {patient_id[:8]}...)")
            
            # Verify count is now 10
            response = requests.get(f"{BASE_URL}/patients")
            current_count = len(response.json())
            print(f"\n   ✅ Total patient count after creation: {current_count}")
            
            if current_count != 10:
                print(f"❌ FAILED: Expected 10 patients, got {current_count}")
                return False
            
            print(f"   ✅ VERIFIED: Patient load is now at maximum (10 patients)")
        else:
            print(f"   ℹ️  Already at or above 10 patients (count: {initial_count})")
        
        # STEP 3: Attempt to create 11th patient (should fail with 400)
        print(f"\n[STEP 3] Attempt to create 11th patient (should fail with 400)")
        patient_data = {
            "name": "LimitTest OVERFLOW",
            "bed": "Bed 999",
            "age": "70",
            "diagnosis": "This should be rejected"
        }
        
        response = requests.post(f"{BASE_URL}/patients", json=patient_data)
        
        if response.status_code != 400:
            print(f"❌ FAILED: Expected HTTP 400, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        error_data = response.json()
        error_message = error_data.get('error', '')
        print(f"   ✅ Correctly rejected with HTTP 400")
        print(f"   ✅ Error message: '{error_message}'")
        
        if 'max 10' not in error_message.lower() or 'full' not in error_message.lower():
            print(f"❌ FAILED: Error message doesn't mention 'max 10' or 'full'")
            return False
        
        print(f"   ✅ VERIFIED: 11th patient rejected with proper error message")
        
        # STEP 4: Test INGEST cap
        print(f"\n[STEP 4] Test INGEST cap with 6 patients when some slots are free")
        
        # Delete 3 LimitTest patients to free up slots
        print(f"   Deleting 3 LimitTest patients to free ~3 slots...")
        deleted_count = 0
        for patient_id in created_patient_ids[:3]:
            response = requests.delete(f"{BASE_URL}/patients/{patient_id}")
            if response.status_code == 200:
                deleted_count += 1
                print(f"   ✅ Deleted patient {patient_id[:8]}...")
        
        created_patient_ids = created_patient_ids[3:]  # Remove deleted IDs
        
        # Verify count after deletion
        response = requests.get(f"{BASE_URL}/patients")
        count_after_delete = len(response.json())
        free_slots = 10 - count_after_delete
        print(f"   ✅ Patient count after deletion: {count_after_delete}")
        print(f"   ✅ Free slots: {free_slots}")
        
        # Create ingest document with 6 patients
        print(f"\n   Creating ingest document with 6 patients...")
        ingest_doc = {
            "documents": [{
                "name": "Shift allocation sheet",
                "category": "careplan",
                "kind": "text",
                "textContent": """SHIFT ALLOCATION - 6 PATIENTS
                
Bed 1: John Smith, 65yo, Community acquired pneumonia
Obs: HR 88, BP 130/80, RR 18, SpO2 96%, Temp 37.8
IV antibiotics QID, oxygen 2L/min

Bed 2: Mary Johnson, 72yo, Post-op hip replacement day 2
Obs: HR 76, BP 125/75, RR 16, SpO2 98%, Temp 36.9
Mobilising with physio, pain management

Bed 3: Ahmed Khan, 58yo, COPD exacerbation
Obs: HR 92, BP 135/85, RR 22, SpO2 91%, Temp 37.2
Nebulisers QID, oxygen titrate to SpO2 >92%

Bed 4: Rosa Diaz, 68yo, UTI with confusion
Obs: HR 98, BP 120/70, RR 20, SpO2 95%, Temp 38.2
IV antibiotics, falls precautions

Bed 5: Tom Wilson, 80yo, Heart failure exacerbation
Obs: HR 102, BP 110/65, RR 24, SpO2 90%, Temp 37.0
IV furosemide BD, fluid restrict

Bed 6: Sarah Lee, 55yo, Diabetic ketoacidosis
Obs: HR 110, BP 105/60, RR 26, SpO2 94%, Temp 37.5
Insulin infusion, hourly BGL monitoring
"""
            }]
        }
        
        response = requests.post(f"{BASE_URL}/ingest", json=ingest_doc)
        
        if response.status_code != 200:
            print(f"❌ FAILED: POST /ingest returned {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        ingest_result = response.json()
        detected_count = ingest_result.get('detectedCount', 0)
        created_count = ingest_result.get('created', 0)
        truncated = ingest_result.get('truncated', False)
        patients_created = ingest_result.get('patients', [])
        
        print(f"\n   ✅ Ingest completed:")
        print(f"      - Detected patients: {detected_count}")
        print(f"      - Created patients: {created_count}")
        print(f"      - Truncated: {truncated}")
        
        # Store ingested patient IDs for cleanup
        for p in patients_created:
            ingested_patient_ids.append(p.get('id'))
        
        # Verify the ingest respected the cap
        if detected_count != 6:
            print(f"❌ FAILED: Expected to detect 6 patients, got {detected_count}")
            return False
        
        print(f"   ✅ VERIFIED: Detected 6 patients correctly")
        
        if created_count > free_slots:
            print(f"❌ FAILED: Created {created_count} patients but only {free_slots} slots were free")
            return False
        
        print(f"   ✅ VERIFIED: Created only {created_count} patients (respecting {free_slots} free slots)")
        
        if detected_count > created_count and not truncated:
            print(f"❌ FAILED: truncated should be true when detected > created")
            return False
        
        if truncated:
            print(f"   ✅ VERIFIED: truncated=true when detected ({detected_count}) > created ({created_count})")
        
        # Verify total never exceeds 10
        response = requests.get(f"{BASE_URL}/patients")
        final_count = len(response.json())
        print(f"\n   ✅ Total patient count after ingest: {final_count}")
        
        if final_count > 10:
            print(f"❌ FAILED: Total patient count ({final_count}) exceeds maximum (10)")
            return False
        
        print(f"   ✅ VERIFIED: Total patient count ({final_count}) does not exceed maximum (10)")
        
        # STEP 5: Cleanup
        print(f"\n[STEP 5] Cleanup - Delete all created test patients")
        print(f"   Preserving patients named 'm' and 'paul'...")
        
        # Get all patients again
        response = requests.get(f"{BASE_URL}/patients")
        all_patients = response.json()
        
        cleanup_count = 0
        preserved_count = 0
        
        for patient in all_patients:
            patient_name = patient.get('name', '').lower()
            patient_id = patient.get('id')
            
            # Never delete "m" or "paul"
            if patient_name == 'm' or patient_name == 'paul':
                print(f"   ⚠️  PRESERVED: '{patient.get('name')}' (ID: {patient_id[:8]}...)")
                preserved_count += 1
                continue
            
            # Delete LimitTest and ingest patients
            if 'limittest' in patient_name.lower() or patient_id in created_patient_ids or patient_id in ingested_patient_ids:
                response = requests.delete(f"{BASE_URL}/patients/{patient_id}")
                if response.status_code == 200:
                    cleanup_count += 1
                    print(f"   ✅ Deleted: '{patient.get('name')}' (ID: {patient_id[:8]}...)")
                else:
                    print(f"   ⚠️  Failed to delete: '{patient.get('name')}' (ID: {patient_id[:8]}...)")
        
        print(f"\n   ✅ Cleanup complete: Deleted {cleanup_count} test patients")
        print(f"   ✅ Preserved {preserved_count} patients ('m' and 'paul')")
        
        # Verify final count
        response = requests.get(f"{BASE_URL}/patients")
        final_patients = response.json()
        final_count = len(final_patients)
        print(f"   ✅ Final patient count: {final_count}")
        
        # Verify m and paul are still there
        final_names = [p.get('name', '').lower() for p in final_patients]
        if 'm' in existing_names and 'm' not in final_names:
            print(f"   ❌ WARNING: Patient 'm' was deleted!")
        if 'paul' in existing_names and 'paul' not in final_names:
            print(f"   ❌ WARNING: Patient 'paul' was deleted!")
        
        print("\n" + "="*80)
        print("✅ ALL TESTS PASSED")
        print("="*80)
        print("\nSUMMARY:")
        print(f"  • Patient load limit verified: 10 patients (raised from 4)")
        print(f"  • 11th patient correctly rejected with HTTP 400")
        print(f"  • INGEST cap working: respects remaining slots, truncated={truncated}")
        print(f"  • Total never exceeded 10 patients")
        print(f"  • Cleanup complete: {cleanup_count} test patients deleted")
        print(f"  • Preserved patients: 'm' and 'paul'")
        print("="*80)
        
        return True
        
    except Exception as e:
        print(f"\n❌ TEST FAILED WITH EXCEPTION: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_patient_load_limit()
    exit(0 if success else 1)
