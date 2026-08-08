#!/usr/bin/env python3
"""
Backend test for EXPANDED AI care-plan schema verification.
Tests both sample presets and real AI generation for new schema fields.
"""

import requests
import time
import json
import sys

BASE_URL = "https://web-nurse-app.preview.emergentagent.com/api"

# Track created patients for cleanup
created_patients = []

def cleanup_patient(patient_id):
    """Delete a patient by ID"""
    try:
        response = requests.delete(f"{BASE_URL}/patients/{patient_id}")
        if response.status_code == 200:
            print(f"✅ Cleaned up patient {patient_id}")
            return True
        else:
            print(f"⚠️  Failed to cleanup patient {patient_id}: {response.status_code}")
            return False
    except Exception as e:
        print(f"⚠️  Error cleaning up patient {patient_id}: {e}")
        return False

def verify_handover_header(handover_header, test_name):
    """Verify handoverHeader structure"""
    print(f"  Checking handoverHeader for {test_name}...")
    
    if not isinstance(handover_header, dict):
        print(f"    ❌ handoverHeader is not a dict: {type(handover_header)}")
        return False
    
    required_keys = ['alerts', 'diagnosis', 'background', 'age', 'attendingDoctor']
    for key in required_keys:
        if key not in handover_header:
            print(f"    ❌ Missing key '{key}' in handoverHeader")
            return False
    
    # Verify alerts is an array
    if not isinstance(handover_header['alerts'], list):
        print(f"    ❌ alerts is not an array: {type(handover_header['alerts'])}")
        return False
    
    # Verify strings
    for key in ['diagnosis', 'background', 'age', 'attendingDoctor']:
        if not isinstance(handover_header[key], str):
            print(f"    ❌ {key} is not a string: {type(handover_header[key])}")
            return False
    
    print(f"    ✅ handoverHeader structure valid")
    print(f"       - alerts: {len(handover_header['alerts'])} items")
    print(f"       - diagnosis: {handover_header['diagnosis'][:50]}...")
    print(f"       - attendingDoctor: {handover_header['attendingDoctor']}")
    return True

def verify_critical_actions(critical_actions, test_name, allow_empty=False):
    """Verify criticalActions structure"""
    print(f"  Checking criticalActions for {test_name}...")
    
    if not isinstance(critical_actions, list):
        print(f"    ❌ criticalActions is not an array: {type(critical_actions)}")
        return False
    
    if len(critical_actions) == 0:
        if allow_empty:
            print(f"    ✅ criticalActions is empty array (allowed for {test_name})")
            return True
        else:
            print(f"    ❌ criticalActions is empty (expected non-empty for {test_name})")
            return False
    
    # Check first item structure
    item = critical_actions[0]
    required_keys = ['action', 'window', 'rationale']
    for key in required_keys:
        if key not in item:
            print(f"    ❌ Missing key '{key}' in criticalActions[0]")
            return False
        if not isinstance(item[key], str):
            print(f"    ❌ {key} is not a string: {type(item[key])}")
            return False
    
    print(f"    ✅ criticalActions structure valid ({len(critical_actions)} items)")
    print(f"       - action: {item['action'][:50]}...")
    print(f"       - window: {item['window']}")
    return True

def verify_drsabcd(drsabcd, test_name):
    """Verify drsabcd structure"""
    print(f"  Checking drsabcd for {test_name}...")
    
    if not isinstance(drsabcd, dict):
        print(f"    ❌ drsabcd is not a dict: {type(drsabcd)}")
        return False
    
    required_keys = ['danger', 'response', 'sendForHelp', 'airway', 'breathing', 'circulation', 'disability', 'exposure']
    for key in required_keys:
        if key not in drsabcd:
            print(f"    ❌ Missing key '{key}' in drsabcd")
            return False
        if not isinstance(drsabcd[key], str):
            print(f"    ❌ {key} is not a string: {type(drsabcd[key])}")
            return False
    
    print(f"    ✅ drsabcd structure valid (all 8 letter fields present)")
    return True

def verify_diet_mobility(diet_mobility, test_name):
    """Verify dietMobility structure"""
    print(f"  Checking dietMobility for {test_name}...")
    
    if not isinstance(diet_mobility, dict):
        print(f"    ❌ dietMobility is not a dict: {type(diet_mobility)}")
        return False
    
    required_keys = ['diet', 'mobility', 'aids']
    for key in required_keys:
        if key not in diet_mobility:
            print(f"    ❌ Missing key '{key}' in dietMobility")
            return False
        if not isinstance(diet_mobility[key], str):
            print(f"    ❌ {key} is not a string: {type(diet_mobility[key])}")
            return False
    
    print(f"    ✅ dietMobility structure valid")
    return True

def verify_assessments(assessments, test_name):
    """Verify assessments structure"""
    print(f"  Checking assessments for {test_name}...")
    
    if not isinstance(assessments, dict):
        print(f"    ❌ assessments is not a dict: {type(assessments)}")
        return False
    
    required_keys = ['done', 'todo']
    for key in required_keys:
        if key not in assessments:
            print(f"    ❌ Missing key '{key}' in assessments")
            return False
        if not isinstance(assessments[key], list):
            print(f"    ❌ {key} is not an array: {type(assessments[key])}")
            return False
    
    print(f"    ✅ assessments structure valid")
    print(f"       - done: {len(assessments['done'])} items")
    print(f"       - todo: {len(assessments['todo'])} items")
    return True

def verify_lines_devices(lines_devices, test_name):
    """Verify linesDevices structure"""
    print(f"  Checking linesDevices for {test_name}...")
    
    if not isinstance(lines_devices, list):
        print(f"    ❌ linesDevices is not an array: {type(lines_devices)}")
        return False
    
    if len(lines_devices) == 0:
        print(f"    ❌ linesDevices is empty (expected non-empty)")
        return False
    
    # Check first item structure
    item = lines_devices[0]
    required_keys = ['type', 'detail', 'site', 'notes']
    for key in required_keys:
        if key not in item:
            print(f"    ❌ Missing key '{key}' in linesDevices[0]")
            return False
        if not isinstance(item[key], str):
            print(f"    ❌ {key} is not a string: {type(item[key])}")
            return False
    
    print(f"    ✅ linesDevices structure valid ({len(lines_devices)} items)")
    print(f"       - type: {item['type']}")
    return True

def verify_interventions_how_to_monitor(interventions, test_name):
    """Verify interventions have howToMonitor field"""
    print(f"  Checking interventions[].howToMonitor for {test_name}...")
    
    if not isinstance(interventions, list):
        print(f"    ❌ interventions is not an array: {type(interventions)}")
        return False
    
    if len(interventions) == 0:
        print(f"    ❌ interventions is empty")
        return False
    
    # Check all items have howToMonitor
    for i, item in enumerate(interventions):
        if 'howToMonitor' not in item:
            print(f"    ❌ Missing 'howToMonitor' in interventions[{i}]")
            return False
        if not isinstance(item['howToMonitor'], str):
            print(f"    ❌ howToMonitor is not a string in interventions[{i}]: {type(item['howToMonitor'])}")
            return False
        if len(item['howToMonitor'].strip()) == 0:
            print(f"    ❌ howToMonitor is empty in interventions[{i}]")
            return False
    
    print(f"    ✅ All {len(interventions)} interventions have non-empty howToMonitor")
    print(f"       - Sample howToMonitor: {interventions[0]['howToMonitor'][:80]}...")
    return True

def test_sample_preset(preset_type, allow_empty_critical_actions=False):
    """Test a sample preset for all new schema fields"""
    print(f"\n{'='*80}")
    print(f"TEST: Sample preset '{preset_type}'")
    print(f"{'='*80}")
    
    try:
        # Create sample patient
        print(f"1. Creating sample patient with type='{preset_type}'...")
        response = requests.post(f"{BASE_URL}/sample", json={"type": preset_type})
        
        if response.status_code != 200:
            print(f"❌ Failed to create sample: {response.status_code}")
            print(f"   Response: {response.text[:200]}")
            return False
        
        patient = response.json()
        patient_id = patient.get('id')
        created_patients.append(patient_id)
        print(f"✅ Sample patient created: {patient.get('name')} (ID: {patient_id})")
        
        # Verify aiOutput exists
        ai_output = patient.get('aiOutput')
        if not ai_output:
            print(f"❌ No aiOutput in response")
            return False
        
        print(f"\n2. Verifying NEW schema fields...")
        
        # Verify all new fields
        all_valid = True
        
        # handoverHeader
        if 'handoverHeader' not in ai_output:
            print(f"  ❌ Missing handoverHeader")
            all_valid = False
        else:
            if not verify_handover_header(ai_output['handoverHeader'], preset_type):
                all_valid = False
            # Check alerts is non-empty
            if len(ai_output['handoverHeader']['alerts']) == 0:
                print(f"    ❌ handoverHeader.alerts is empty (expected non-empty)")
                all_valid = False
        
        # criticalActions
        if 'criticalActions' not in ai_output:
            print(f"  ❌ Missing criticalActions")
            all_valid = False
        else:
            if not verify_critical_actions(ai_output['criticalActions'], preset_type, allow_empty_critical_actions):
                all_valid = False
        
        # drsabcd
        if 'drsabcd' not in ai_output:
            print(f"  ❌ Missing drsabcd")
            all_valid = False
        else:
            if not verify_drsabcd(ai_output['drsabcd'], preset_type):
                all_valid = False
        
        # dietMobility
        if 'dietMobility' not in ai_output:
            print(f"  ❌ Missing dietMobility")
            all_valid = False
        else:
            if not verify_diet_mobility(ai_output['dietMobility'], preset_type):
                all_valid = False
        
        # assessments
        if 'assessments' not in ai_output:
            print(f"  ❌ Missing assessments")
            all_valid = False
        else:
            if not verify_assessments(ai_output['assessments'], preset_type):
                all_valid = False
        
        # linesDevices
        if 'linesDevices' not in ai_output:
            print(f"  ❌ Missing linesDevices")
            all_valid = False
        else:
            if not verify_lines_devices(ai_output['linesDevices'], preset_type):
                all_valid = False
        
        # edd
        if 'edd' not in ai_output:
            print(f"  ❌ Missing edd")
            all_valid = False
        else:
            if not isinstance(ai_output['edd'], str):
                print(f"  ❌ edd is not a string: {type(ai_output['edd'])}")
                all_valid = False
            else:
                print(f"  ✅ edd is a string: {ai_output['edd']}")
        
        # recommendations
        if 'recommendations' not in ai_output:
            print(f"  ❌ Missing recommendations")
            all_valid = False
        else:
            if not isinstance(ai_output['recommendations'], list):
                print(f"  ❌ recommendations is not an array: {type(ai_output['recommendations'])}")
                all_valid = False
            elif len(ai_output['recommendations']) == 0:
                print(f"  ❌ recommendations is empty (expected non-empty)")
                all_valid = False
            else:
                print(f"  ✅ recommendations is non-empty array ({len(ai_output['recommendations'])} items)")
        
        # outstandingTasks
        if 'outstandingTasks' not in ai_output:
            print(f"  ❌ Missing outstandingTasks")
            all_valid = False
        else:
            if not isinstance(ai_output['outstandingTasks'], list):
                print(f"  ❌ outstandingTasks is not an array: {type(ai_output['outstandingTasks'])}")
                all_valid = False
            elif len(ai_output['outstandingTasks']) == 0:
                print(f"  ❌ outstandingTasks is empty (expected non-empty)")
                all_valid = False
            else:
                print(f"  ✅ outstandingTasks is non-empty array ({len(ai_output['outstandingTasks'])} items)")
        
        # interventions[].howToMonitor
        if 'interventions' not in ai_output:
            print(f"  ❌ Missing interventions")
            all_valid = False
        else:
            if not verify_interventions_how_to_monitor(ai_output['interventions'], preset_type):
                all_valid = False
        
        if all_valid:
            print(f"\n✅ PASS: Sample preset '{preset_type}' has all new schema fields")
            return True
        else:
            print(f"\n❌ FAIL: Sample preset '{preset_type}' missing or invalid schema fields")
            return False
        
    except Exception as e:
        print(f"❌ Exception during test: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_real_ai_generation():
    """Test real AI generation produces the new schema"""
    print(f"\n{'='*80}")
    print(f"TEST: Real AI generation with expanded schema")
    print(f"{'='*80}")
    
    try:
        # Step 5: Create a patient
        print(f"\n5. Creating patient 'Schema Test'...")
        response = requests.post(f"{BASE_URL}/patients", json={
            "name": "Schema Test",
            "bed": "B4",
            "age": "66",
            "diagnosis": "Poorly controlled T1DM, cellulitis right leg"
        })
        
        if response.status_code != 200:
            print(f"❌ Failed to create patient: {response.status_code}")
            print(f"   Response: {response.text[:200]}")
            return False
        
        patient = response.json()
        patient_id = patient.get('id')
        created_patients.append(patient_id)
        print(f"✅ Patient created: {patient.get('name')} (ID: {patient_id})")
        
        # Step 6: Add a rich text document
        print(f"\n6. Adding rich text care plan document...")
        doc_content = """66yo T1DM, admitted with right leg cellulitis. Allergy: Penicillin. Attending: Dr. Lee (Endocrine/Medical). PMH: hypertension, retinopathy. Alert: falls risk. IV cannula 20G left forearm for IV flucloxacillin. IDC in situ. Diet: diabetic diet. Mobility: mobilise with frame, assist x1. Meds: Flucloxacillin 1g IV QID 0600 1200 1800 2400; insulin variable rate infusion; check BGL hourly. Obs 0600 HR 92 BP 138/84 RR 18 SpO2 97 Temp 38.1. Obs 1000 HR 104 BP 128/76 RR 20 SpO2 96 Temp 38.6. Plan: IV antibiotics, mark cellulitis border, monitor BGL, ? discharge in 3 days. Tasks still to do: mark cellulitis margins, 1200 BGL, wound review."""
        
        response = requests.post(f"{BASE_URL}/patients/{patient_id}/documents", json={
            "documents": [{
                "name": "Care plan",
                "category": "careplan",
                "kind": "text",
                "textContent": doc_content
            }]
        })
        
        if response.status_code != 200:
            print(f"❌ Failed to add document: {response.status_code}")
            print(f"   Response: {response.text[:200]}")
            return False
        
        print(f"✅ Document added successfully")
        
        # Step 7: Generate AI care plan (REAL Gemini call)
        print(f"\n7. Generating AI care plan (REAL Gemini call, ~30-45s)...")
        start_time = time.time()
        response = requests.post(f"{BASE_URL}/patients/{patient_id}/generate")
        elapsed = time.time() - start_time
        
        if response.status_code != 200:
            print(f"❌ Failed to generate: {response.status_code}")
            print(f"   Response: {response.text[:200]}")
            return False
        
        result = response.json()
        print(f"✅ AI generation completed in {elapsed:.1f}s")
        
        # Step 8: Get patient and verify aiOutput
        print(f"\n8. Verifying aiOutput contains ALL new keys...")
        response = requests.get(f"{BASE_URL}/patients/{patient_id}")
        
        if response.status_code != 200:
            print(f"❌ Failed to get patient: {response.status_code}")
            return False
        
        patient = response.json()
        ai_output = patient.get('aiOutput')
        
        if not ai_output:
            print(f"❌ No aiOutput in patient")
            return False
        
        # Verify ALL keys (base + new)
        print(f"\n  Checking ALL aiOutput keys (base + new)...")
        
        # Base keys (from previous rounds)
        base_keys = [
            'patientSummary', 'priorities', 'interventions', 'isbar', 'medications',
            'medicationTimes', 'vitalsTimeline', 'careSchedule', 'earlyWarning',
            'redFlags', 'newGradTips', 'safetyNotice'
        ]
        
        # New keys (this round)
        new_keys = [
            'handoverHeader', 'criticalActions', 'drsabcd', 'dietMobility',
            'assessments', 'linesDevices', 'edd', 'recommendations', 'outstandingTasks'
        ]
        
        all_valid = True
        
        # Check base keys exist
        print(f"\n  Base keys (12):")
        for key in base_keys:
            if key not in ai_output:
                print(f"    ❌ Missing base key: {key}")
                all_valid = False
            else:
                print(f"    ✅ {key}")
        
        # Check new keys with detailed validation
        print(f"\n  New keys (9):")
        
        # handoverHeader
        if 'handoverHeader' not in ai_output:
            print(f"    ❌ Missing handoverHeader")
            all_valid = False
        else:
            if verify_handover_header(ai_output['handoverHeader'], 'real AI'):
                print(f"    ✅ handoverHeader")
            else:
                all_valid = False
        
        # criticalActions
        if 'criticalActions' not in ai_output:
            print(f"    ❌ Missing criticalActions")
            all_valid = False
        else:
            if verify_critical_actions(ai_output['criticalActions'], 'real AI', allow_empty=True):
                print(f"    ✅ criticalActions")
            else:
                all_valid = False
        
        # drsabcd
        if 'drsabcd' not in ai_output:
            print(f"    ❌ Missing drsabcd")
            all_valid = False
        else:
            if verify_drsabcd(ai_output['drsabcd'], 'real AI'):
                print(f"    ✅ drsabcd")
            else:
                all_valid = False
        
        # dietMobility
        if 'dietMobility' not in ai_output:
            print(f"    ❌ Missing dietMobility")
            all_valid = False
        else:
            if verify_diet_mobility(ai_output['dietMobility'], 'real AI'):
                print(f"    ✅ dietMobility")
            else:
                all_valid = False
        
        # assessments
        if 'assessments' not in ai_output:
            print(f"    ❌ Missing assessments")
            all_valid = False
        else:
            if verify_assessments(ai_output['assessments'], 'real AI'):
                print(f"    ✅ assessments")
            else:
                all_valid = False
        
        # linesDevices
        if 'linesDevices' not in ai_output:
            print(f"    ❌ Missing linesDevices")
            all_valid = False
        else:
            if verify_lines_devices(ai_output['linesDevices'], 'real AI'):
                print(f"    ✅ linesDevices")
            else:
                all_valid = False
        
        # edd
        if 'edd' not in ai_output:
            print(f"    ❌ Missing edd")
            all_valid = False
        else:
            if isinstance(ai_output['edd'], str):
                print(f"    ✅ edd: {ai_output['edd']}")
            else:
                print(f"    ❌ edd is not a string")
                all_valid = False
        
        # recommendations
        if 'recommendations' not in ai_output:
            print(f"    ❌ Missing recommendations")
            all_valid = False
        else:
            if isinstance(ai_output['recommendations'], list):
                print(f"    ✅ recommendations ({len(ai_output['recommendations'])} items)")
            else:
                print(f"    ❌ recommendations is not an array")
                all_valid = False
        
        # outstandingTasks
        if 'outstandingTasks' not in ai_output:
            print(f"    ❌ Missing outstandingTasks")
            all_valid = False
        else:
            if isinstance(ai_output['outstandingTasks'], list):
                print(f"    ✅ outstandingTasks ({len(ai_output['outstandingTasks'])} items)")
            else:
                print(f"    ❌ outstandingTasks is not an array")
                all_valid = False
        
        # interventions[].howToMonitor
        if 'interventions' not in ai_output:
            print(f"    ❌ Missing interventions")
            all_valid = False
        else:
            if verify_interventions_how_to_monitor(ai_output['interventions'], 'real AI'):
                print(f"    ✅ interventions[].howToMonitor")
            else:
                all_valid = False
        
        # Step 9: Report actual values
        print(f"\n9. Sample values from REAL AI generation:")
        print(f"   - handoverHeader.attendingDoctor: {ai_output.get('handoverHeader', {}).get('attendingDoctor', 'N/A')}")
        print(f"   - handoverHeader.alerts: {ai_output.get('handoverHeader', {}).get('alerts', [])}")
        print(f"   - edd: {ai_output.get('edd', 'N/A')}")
        if ai_output.get('interventions') and len(ai_output['interventions']) > 0:
            print(f"   - interventions[0].howToMonitor: {ai_output['interventions'][0].get('howToMonitor', 'N/A')[:100]}...")
        
        if all_valid:
            print(f"\n✅ PASS: Real AI generation has all required schema fields")
            return True
        else:
            print(f"\n❌ FAIL: Real AI generation missing or invalid schema fields")
            return False
        
    except Exception as e:
        print(f"❌ Exception during test: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """Run all tests"""
    print("="*80)
    print("EXPANDED AI CARE-PLAN SCHEMA VERIFICATION TEST")
    print("="*80)
    
    results = {}
    
    # PART 1: Sample presets
    print("\n" + "="*80)
    print("PART 1: Sample presets contain new fields (hardcoded)")
    print("="*80)
    
    results['sepsis'] = test_sample_preset('sepsis', allow_empty_critical_actions=False)
    results['postop'] = test_sample_preset('postop', allow_empty_critical_actions=True)
    results['chf'] = test_sample_preset('chf', allow_empty_critical_actions=False)
    
    # Cleanup sample patients
    print(f"\n4. Cleaning up sample patients...")
    for patient_id in created_patients[:]:
        cleanup_patient(patient_id)
        created_patients.remove(patient_id)
    
    # PART 2: Real AI generation
    print("\n" + "="*80)
    print("PART 2: Real AI generation produces new schema")
    print("="*80)
    
    results['real_ai'] = test_real_ai_generation()
    
    # Step 10: Cleanup
    print(f"\n10. Cleaning up test patient...")
    for patient_id in created_patients[:]:
        cleanup_patient(patient_id)
        created_patients.remove(patient_id)
    
    # Final summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    print(f"\nPART 1 - Sample Presets:")
    print(f"  1. Sepsis preset:  {'✅ PASS' if results['sepsis'] else '❌ FAIL'}")
    print(f"  2. Postop preset:  {'✅ PASS' if results['postop'] else '❌ FAIL'}")
    print(f"  3. CHF preset:     {'✅ PASS' if results['chf'] else '❌ FAIL'}")
    
    print(f"\nPART 2 - Real AI Generation:")
    print(f"  5-9. Real AI:      {'✅ PASS' if results['real_ai'] else '❌ FAIL'}")
    
    all_passed = all(results.values())
    
    print(f"\n{'='*80}")
    if all_passed:
        print("✅ ALL TESTS PASSED")
        print("="*80)
        print("\nThe EXPANDED AI care-plan schema is working correctly:")
        print("- All 3 sample presets contain the new fields")
        print("- Real AI generation produces the new schema")
        print("- All new keys are present and well-formed")
        return 0
    else:
        print("❌ SOME TESTS FAILED")
        print("="*80)
        failed = [k for k, v in results.items() if not v]
        print(f"\nFailed tests: {', '.join(failed)}")
        return 1

if __name__ == "__main__":
    sys.exit(main())
