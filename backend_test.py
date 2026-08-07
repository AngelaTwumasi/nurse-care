#!/usr/bin/env python3
"""
Backend API test for NurseCare - Round 3 Schema Extension
Tests AI generation endpoint with careSchedule and medications[].times
"""
import requests
import json
import time
import sys

BASE_URL = "https://web-nurse-app.preview.emergentagent.com/api"

def test_round3_schema_extension():
    """Test AI generation with careSchedule and medications[].times"""
    print("\n" + "="*80)
    print("ROUND 3 SCHEMA EXTENSION TEST - careSchedule + medications[].times")
    print("="*80)
    
    test_patient_id = None
    
    try:
        # Step 1: Create test patient
        print("\n[1/6] Creating test patient 'Care Sched Test'...")
        patient_data = {
            "name": "Care Sched Test",
            "bed": "Bed 3",
            "age": "75",
            "diagnosis": "Post-op day 1, monitoring"
        }
        
        response = requests.post(f"{BASE_URL}/patients", json=patient_data, timeout=10)
        if response.status_code != 200:
            print(f"❌ FAILED to create patient: {response.status_code} - {response.text}")
            return False
        
        patient = response.json()
        test_patient_id = patient.get('id')
        print(f"✅ Patient created: {patient['name']} (ID: {test_patient_id})")
        
        # Step 2: Add comprehensive care plan document with scheduled tasks and medication times
        print("\n[2/6] Adding care plan document with scheduled tasks and medication times...")
        document_data = {
            "documents": [{
                "name": "Plan & meds",
                "category": "careplan",
                "kind": "text",
                "textContent": """Post-op day 1. Meds: Paracetamol 1g PO at 0600 and 1400; Ceftriaxone 1g IV at 0800; Enoxaparin 40mg SC at 2000. Nursing: hourly neuro obs, 4-hourly vitals (0600 0800 1000 1400 1800 2200), assist with breakfast at 0800, mobilise with physio at 1030, wound check end of shift. Obs 0600 HR 82 BP 128/78 RR 16 SpO2 97% Temp 36.9. Obs 1000 HR 96 BP 112/70 RR 20 SpO2 95% Temp 37.6."""
            }]
        }
        
        response = requests.post(
            f"{BASE_URL}/patients/{test_patient_id}/documents",
            json=document_data,
            timeout=10
        )
        if response.status_code != 200:
            print(f"❌ FAILED to add document: {response.status_code} - {response.text}")
            return False
        
        updated_patient = response.json()
        doc_count = len(updated_patient.get('documents', []))
        print(f"✅ Document added successfully (total documents: {doc_count})")
        
        # Step 3: Generate AI care plan (REAL Gemini call, allow up to 90s)
        print("\n[3/6] Calling POST /api/patients/:id/generate (REAL Gemini 2.5 Pro)...")
        print("⏳ This may take 15-90 seconds...")
        
        start_time = time.time()
        response = requests.post(
            f"{BASE_URL}/patients/{test_patient_id}/generate",
            timeout=120
        )
        elapsed = time.time() - start_time
        
        if response.status_code != 200:
            print(f"❌ FAILED AI generation: {response.status_code} - {response.text}")
            return False
        
        result = response.json()
        ai_output = result.get('aiOutput')
        
        if not ai_output:
            print("❌ FAILED: No aiOutput in response")
            return False
        
        print(f"✅ AI generation completed in {elapsed:.1f} seconds")
        
        # Step 4: Verify ALL required keys
        print("\n[4/6] Verifying schema compliance...")
        
        # Base keys (8 keys from original schema)
        base_keys = [
            'patientSummary', 'priorities', 'interventions', 'isbar',
            'medications', 'redFlags', 'newGradTips', 'safetyNotice'
        ]
        
        # Round 2 extension keys (3 keys)
        round2_keys = ['medicationTimes', 'vitalsTimeline', 'earlyWarning']
        
        # Round 3 NEW keys
        round3_keys = ['careSchedule']
        
        all_keys = base_keys + round2_keys + round3_keys
        
        missing_keys = []
        for key in all_keys:
            if key not in ai_output:
                missing_keys.append(key)
        
        if missing_keys:
            print(f"❌ FAILED: Missing keys: {missing_keys}")
            return False
        
        print(f"✅ All {len(all_keys)} required keys present")
        
        # Verify base keys structure
        print("\n   Verifying base keys (8):")
        if not isinstance(ai_output['patientSummary'], str):
            print("   ❌ patientSummary is not a string")
            return False
        print(f"   ✅ patientSummary: {len(ai_output['patientSummary'])} chars")
        
        if not isinstance(ai_output['priorities'], list):
            print("   ❌ priorities is not an array")
            return False
        print(f"   ✅ priorities: {len(ai_output['priorities'])} items")
        
        if not isinstance(ai_output['interventions'], list):
            print("   ❌ interventions is not an array")
            return False
        print(f"   ✅ interventions: {len(ai_output['interventions'])} items")
        
        if not isinstance(ai_output['isbar'], dict):
            print("   ❌ isbar is not an object")
            return False
        isbar_sections = ['identify', 'situation', 'background', 'assessment', 'recommendation']
        missing_isbar = [s for s in isbar_sections if s not in ai_output['isbar']]
        if missing_isbar:
            print(f"   ❌ isbar missing sections: {missing_isbar}")
            return False
        print(f"   ✅ isbar: all 5 sections present")
        
        if not isinstance(ai_output['medications'], list):
            print("   ❌ medications is not an array")
            return False
        print(f"   ✅ medications: {len(ai_output['medications'])} items")
        
        if not isinstance(ai_output['redFlags'], list):
            print("   ❌ redFlags is not an array")
            return False
        print(f"   ✅ redFlags: {len(ai_output['redFlags'])} items")
        
        if not isinstance(ai_output['newGradTips'], list):
            print("   ❌ newGradTips is not an array")
            return False
        print(f"   ✅ newGradTips: {len(ai_output['newGradTips'])} items")
        
        if not isinstance(ai_output['safetyNotice'], str):
            print("   ❌ safetyNotice is not a string")
            return False
        print(f"   ✅ safetyNotice: present")
        
        # Verify Round 2 extension keys
        print("\n   Verifying Round 2 extension keys (3):")
        
        if not isinstance(ai_output['medicationTimes'], list):
            print("   ❌ medicationTimes is not an array")
            return False
        print(f"   ✅ medicationTimes: {len(ai_output['medicationTimes'])} items")
        if len(ai_output['medicationTimes']) > 0:
            sample = ai_output['medicationTimes'][0]
            if 'time' in sample and 'medication' in sample:
                print(f"      Sample: {sample.get('time')} - {sample.get('medication')}")
        
        if not isinstance(ai_output['vitalsTimeline'], list):
            print("   ❌ vitalsTimeline is not an array")
            return False
        print(f"   ✅ vitalsTimeline: {len(ai_output['vitalsTimeline'])} items")
        if len(ai_output['vitalsTimeline']) > 0:
            sample = ai_output['vitalsTimeline'][0]
            print(f"      Sample: {sample.get('time')} - HR {sample.get('hr')}, BP {sample.get('bp')}")
        
        if not isinstance(ai_output['earlyWarning'], dict):
            print("   ❌ earlyWarning is not an object")
            return False
        ew_keys = ['score', 'riskLevel', 'trend', 'rationale', 'escalation']
        missing_ew = [k for k in ew_keys if k not in ai_output['earlyWarning']]
        if missing_ew:
            print(f"   ❌ earlyWarning missing keys: {missing_ew}")
            return False
        print(f"   ✅ earlyWarning: score={ai_output['earlyWarning']['score']}, "
              f"riskLevel={ai_output['earlyWarning']['riskLevel']}, "
              f"trend={ai_output['earlyWarning']['trend']}")
        
        # Verify Round 3 NEW keys - careSchedule
        print("\n   Verifying Round 3 NEW keys:")
        
        if not isinstance(ai_output['careSchedule'], list):
            print("   ❌ careSchedule is not an array")
            return False
        
        care_schedule_count = len(ai_output['careSchedule'])
        print(f"   ✅ careSchedule: {care_schedule_count} items")
        
        if care_schedule_count == 0:
            print("   ⚠️  WARNING: careSchedule is empty (expected scheduled tasks from document)")
        else:
            # Verify structure of careSchedule items
            for idx, item in enumerate(ai_output['careSchedule'][:3]):  # Check first 3
                if not all(k in item for k in ['time', 'task', 'priority']):
                    print(f"   ❌ careSchedule[{idx}] missing required keys (time/task/priority)")
                    return False
                if item['priority'] not in ['urgent', 'soon', 'routine']:
                    print(f"   ❌ careSchedule[{idx}] invalid priority: {item['priority']}")
                    return False
            
            # Show sample items
            print(f"      Sample items:")
            for item in ai_output['careSchedule'][:3]:
                print(f"      - {item['time']}: {item['task'][:50]}... [{item['priority']}]")
        
        # Verify medications[].times array (Round 3 requirement)
        print("\n   Verifying medications[].times arrays:")
        
        meds_with_times = 0
        meds_without_times = 0
        
        for med in ai_output['medications']:
            if 'times' in med:
                if isinstance(med['times'], list):
                    meds_with_times += 1
                    if len(med['times']) > 0:
                        print(f"      ✅ {med.get('name', 'Unknown')}: times={med['times']}")
                else:
                    print(f"      ❌ {med.get('name', 'Unknown')}: 'times' is not an array")
                    return False
            else:
                meds_without_times += 1
                print(f"      ⚠️  {med.get('name', 'Unknown')}: missing 'times' key")
        
        print(f"   📊 Medications with times: {meds_with_times}/{len(ai_output['medications'])}")
        
        if meds_without_times > 0:
            print(f"   ⚠️  WARNING: {meds_without_times} medications missing 'times' array")
        
        # Step 5: Verify persistence
        print("\n[5/6] Verifying data persistence via GET /api/patients/:id...")
        
        response = requests.get(f"{BASE_URL}/patients/{test_patient_id}", timeout=10)
        if response.status_code != 200:
            print(f"❌ FAILED to retrieve patient: {response.status_code}")
            return False
        
        persisted = response.json()
        persisted_ai = persisted.get('aiOutput')
        
        if not persisted_ai:
            print("❌ FAILED: aiOutput not persisted")
            return False
        
        # Check careSchedule persisted
        if 'careSchedule' not in persisted_ai:
            print("❌ FAILED: careSchedule not persisted")
            return False
        
        # Check medications[].times persisted
        persisted_meds_with_times = sum(1 for m in persisted_ai.get('medications', []) if 'times' in m)
        
        print(f"✅ Data persisted correctly")
        print(f"   - careSchedule: {len(persisted_ai['careSchedule'])} items")
        print(f"   - medications with times: {persisted_meds_with_times}/{len(persisted_ai.get('medications', []))}")
        
        # Step 6: Cleanup
        print("\n[6/6] Cleaning up test patient...")
        response = requests.delete(f"{BASE_URL}/patients/{test_patient_id}", timeout=10)
        if response.status_code != 200:
            print(f"⚠️  WARNING: Failed to delete test patient: {response.status_code}")
        else:
            print("✅ Test patient deleted successfully")
        
        print("\n" + "="*80)
        print("✅ ROUND 3 SCHEMA EXTENSION TEST PASSED")
        print("="*80)
        print("\nSummary:")
        print(f"  • All {len(all_keys)} required keys present and valid")
        print(f"  • careSchedule: {care_schedule_count} scheduled tasks")
        print(f"  • medications[].times: {meds_with_times}/{len(ai_output['medications'])} medications have times array")
        print(f"  • AI generation time: {elapsed:.1f}s")
        print(f"  • Data persistence: ✅ verified")
        
        return True
        
    except requests.exceptions.Timeout:
        print("❌ FAILED: Request timeout (AI generation may take longer than expected)")
        return False
    except requests.exceptions.RequestException as e:
        print(f"❌ FAILED: Network error: {e}")
        return False
    except Exception as e:
        print(f"❌ FAILED: Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        # Ensure cleanup even if test fails
        if test_patient_id:
            try:
                requests.delete(f"{BASE_URL}/patients/{test_patient_id}", timeout=5)
            except Exception:
                pass

if __name__ == "__main__":
    success = test_round3_schema_extension()
    sys.exit(0 if success else 1)
