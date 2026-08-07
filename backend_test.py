#!/usr/bin/env python3
"""
Backend test for NurseCare Sample Scenario Presets feature
Tests POST /api/sample endpoint with different scenario types
"""

import requests
import json
import os
from typing import List, Dict, Any

# Get base URL from environment
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://web-nurse-app.preview.emergentagent.com')
API_BASE = f"{BASE_URL}/api"

def print_test_header(test_name: str):
    """Print a formatted test header"""
    print(f"\n{'='*80}")
    print(f"TEST: {test_name}")
    print(f"{'='*80}")

def print_result(passed: bool, message: str):
    """Print test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status}: {message}")

def get_patients() -> List[Dict[str, Any]]:
    """Get all patients"""
    response = requests.get(f"{API_BASE}/patients")
    if response.status_code == 200:
        return response.json()
    return []

def delete_patient(patient_id: str) -> bool:
    """Delete a patient by ID"""
    response = requests.delete(f"{API_BASE}/patients/{patient_id}")
    return response.status_code == 200

def create_sample_patient(scenario_type: str = None) -> Dict[str, Any]:
    """Create a sample patient with optional scenario type"""
    url = f"{API_BASE}/sample"
    headers = {'Content-Type': 'application/json'}
    
    if scenario_type:
        body = json.dumps({"type": scenario_type})
        response = requests.post(url, headers=headers, data=body)
    else:
        response = requests.post(url, headers=headers)
    
    return {
        'status_code': response.status_code,
        'data': response.json() if response.status_code in [200, 400] else None,
        'response': response
    }

def validate_ai_output(ai_output: Dict[str, Any]) -> tuple[bool, List[str]]:
    """Validate that aiOutput has all required keys"""
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
    
    # Validate isbar has all 5 sections
    if 'isbar' in ai_output:
        isbar_keys = ['identify', 'situation', 'background', 'assessment', 'recommendation']
        for key in isbar_keys:
            if key not in ai_output['isbar']:
                missing_keys.append(f'isbar.{key}')
    
    # Validate earlyWarning structure
    if 'earlyWarning' in ai_output:
        ew_keys = ['score', 'riskLevel', 'trend', 'rationale', 'escalation']
        for key in ew_keys:
            if key not in ai_output['earlyWarning']:
                missing_keys.append(f'earlyWarning.{key}')
    
    return len(missing_keys) == 0, missing_keys

def validate_patient_structure(patient: Dict[str, Any], expected_name_part: str, expected_risk: str) -> tuple[bool, List[str]]:
    """Validate patient structure and content"""
    errors = []
    
    # Check UUID format (not ObjectId)
    if 'id' not in patient:
        errors.append("Missing 'id' field")
    elif not isinstance(patient['id'], str) or len(patient['id']) != 36:
        errors.append(f"Invalid UUID format: {patient.get('id')}")
    
    # Check name contains expected part
    if 'name' not in patient:
        errors.append("Missing 'name' field")
    elif expected_name_part not in patient['name']:
        errors.append(f"Name '{patient['name']}' does not contain '{expected_name_part}'")
    
    # Check isSample flag
    if 'isSample' not in patient:
        errors.append("Missing 'isSample' field")
    elif patient['isSample'] != True:
        errors.append(f"isSample should be true, got {patient['isSample']}")
    
    # Check documents array
    if 'documents' not in patient:
        errors.append("Missing 'documents' field")
    elif not isinstance(patient['documents'], list):
        errors.append("documents should be an array")
    elif len(patient['documents']) == 0:
        errors.append("documents array is empty")
    
    # Check aiOutput exists
    if 'aiOutput' not in patient:
        errors.append("Missing 'aiOutput' field")
    else:
        # Validate aiOutput structure
        valid, missing = validate_ai_output(patient['aiOutput'])
        if not valid:
            errors.append(f"aiOutput missing keys: {', '.join(missing)}")
        
        # Check earlyWarning.riskLevel
        if 'earlyWarning' in patient['aiOutput']:
            actual_risk = patient['aiOutput']['earlyWarning'].get('riskLevel')
            if actual_risk != expected_risk:
                errors.append(f"Expected riskLevel '{expected_risk}', got '{actual_risk}'")
    
    # Check ewHistory exists
    if 'ewHistory' not in patient:
        errors.append("Missing 'ewHistory' field")
    elif not isinstance(patient['ewHistory'], list):
        errors.append("ewHistory should be an array")
    
    return len(errors) == 0, errors

def main():
    print(f"\n{'#'*80}")
    print("# NurseCare Backend Test - Sample Scenario Presets")
    print(f"# API Base: {API_BASE}")
    print(f"{'#'*80}")
    
    # Track created sample patients for cleanup
    created_sample_ids = []
    
    try:
        # TEST 1: Check initial patient count
        print_test_header("1. Check Initial Patient Count")
        initial_patients = get_patients()
        initial_count = len(initial_patients)
        print(f"Initial patient count: {initial_count}")
        
        # Check if patient 'm' exists
        patient_m = None
        for p in initial_patients:
            if p.get('name') == 'm':
                patient_m = p
                print(f"Found patient 'm' with ID: {p.get('id')}")
                break
        
        if patient_m:
            print_result(True, "Patient 'm' exists and will be preserved")
        else:
            print_result(True, "Patient 'm' not found (may not exist yet)")
        
        # TEST 2: Create sepsis sample
        print_test_header("2. Create Sepsis Sample Patient")
        result = create_sample_patient('sepsis')
        
        if result['status_code'] == 200:
            patient = result['data']
            created_sample_ids.append(patient['id'])
            
            print(f"✅ Status: 200 OK")
            print(f"Patient ID: {patient.get('id')}")
            print(f"Patient Name: {patient.get('name')}")
            print(f"Diagnosis: {patient.get('diagnosis')}")
            print(f"Risk Level: {patient.get('aiOutput', {}).get('earlyWarning', {}).get('riskLevel')}")
            
            valid, errors = validate_patient_structure(patient, 'Rita Kaur', 'high')
            if valid:
                print_result(True, "Sepsis sample patient created with correct structure and data")
            else:
                print_result(False, f"Validation errors: {'; '.join(errors)}")
        else:
            print_result(False, f"Expected 200, got {result['status_code']}: {result['data']}")
        
        # TEST 3: Create postop sample
        print_test_header("3. Create Post-Op Sample Patient")
        result = create_sample_patient('postop')
        
        if result['status_code'] == 200:
            patient = result['data']
            created_sample_ids.append(patient['id'])
            
            print(f"✅ Status: 200 OK")
            print(f"Patient ID: {patient.get('id')}")
            print(f"Patient Name: {patient.get('name')}")
            print(f"Diagnosis: {patient.get('diagnosis')}")
            print(f"Risk Level: {patient.get('aiOutput', {}).get('earlyWarning', {}).get('riskLevel')}")
            
            valid, errors = validate_patient_structure(patient, 'Tom Fischer', 'low')
            if valid:
                print_result(True, "Post-op sample patient created with correct structure and data")
            else:
                print_result(False, f"Validation errors: {'; '.join(errors)}")
        else:
            print_result(False, f"Expected 200, got {result['status_code']}: {result['data']}")
        
        # TEST 4: Create CHF sample (default, no body)
        print_test_header("4. Create CHF Sample Patient (default, no body)")
        result = create_sample_patient()
        
        if result['status_code'] == 200:
            patient = result['data']
            created_sample_ids.append(patient['id'])
            
            print(f"✅ Status: 200 OK")
            print(f"Patient ID: {patient.get('id')}")
            print(f"Patient Name: {patient.get('name')}")
            print(f"Diagnosis: {patient.get('diagnosis')}")
            print(f"Risk Level: {patient.get('aiOutput', {}).get('earlyWarning', {}).get('riskLevel')}")
            
            valid, errors = validate_patient_structure(patient, 'Alan Reid', 'high')
            if valid:
                print_result(True, "CHF sample patient created with correct structure and data")
            else:
                print_result(False, f"Validation errors: {'; '.join(errors)}")
        else:
            print_result(False, f"Expected 200, got {result['status_code']}: {result['data']}")
        
        # TEST 5: Verify aiOutput completeness for one sample
        print_test_header("5. Verify Complete aiOutput Structure")
        if created_sample_ids:
            # Get the first created sample patient
            patients = get_patients()
            sample_patient = None
            for p in patients:
                if p['id'] == created_sample_ids[0]:
                    sample_patient = p
                    break
            
            if sample_patient and 'aiOutput' in sample_patient:
                ai_output = sample_patient['aiOutput']
                print(f"Checking aiOutput for patient: {sample_patient['name']}")
                
                # Check all keys
                all_keys = [
                    'patientSummary', 'priorities', 'interventions', 'isbar',
                    'medications', 'medicationTimes', 'vitalsTimeline', 'careSchedule',
                    'earlyWarning', 'redFlags', 'newGradTips', 'safetyNotice'
                ]
                
                missing = []
                for key in all_keys:
                    if key not in ai_output:
                        missing.append(key)
                    else:
                        print(f"  ✅ {key}: present")
                
                # Check isbar sections
                if 'isbar' in ai_output:
                    isbar_sections = ['identify', 'situation', 'background', 'assessment', 'recommendation']
                    for section in isbar_sections:
                        if section in ai_output['isbar']:
                            print(f"  ✅ isbar.{section}: present")
                        else:
                            missing.append(f'isbar.{section}')
                
                # Check earlyWarning fields
                if 'earlyWarning' in ai_output:
                    ew_fields = ['score', 'riskLevel', 'trend', 'rationale', 'escalation']
                    for field in ew_fields:
                        if field in ai_output['earlyWarning']:
                            print(f"  ✅ earlyWarning.{field}: {ai_output['earlyWarning'][field]}")
                        else:
                            missing.append(f'earlyWarning.{field}')
                
                # Check ewHistory
                if 'ewHistory' in sample_patient:
                    print(f"  ✅ ewHistory: array with {len(sample_patient['ewHistory'])} entries")
                else:
                    missing.append('ewHistory')
                
                if not missing:
                    print_result(True, "All required aiOutput keys and ewHistory present")
                else:
                    print_result(False, f"Missing keys: {', '.join(missing)}")
            else:
                print_result(False, "Could not retrieve sample patient for validation")
        
        # TEST 6: Max-4 enforcement
        print_test_header("6. Test Max-4 Patient Enforcement")
        current_patients = get_patients()
        current_count = len(current_patients)
        print(f"Current patient count: {current_count}")
        
        # Create samples until we reach 4
        while current_count < 4:
            print(f"Creating sample to reach max capacity ({current_count}/4)...")
            result = create_sample_patient('chf')
            if result['status_code'] == 200:
                created_sample_ids.append(result['data']['id'])
                current_count += 1
                print(f"  ✅ Created sample patient (now {current_count}/4)")
            else:
                print_result(False, f"Failed to create sample: {result['status_code']}")
                break
        
        # Now try to create one more (should fail with 400)
        if current_count == 4:
            print(f"Attempting to create 5th patient (should fail)...")
            result = create_sample_patient('sepsis')
            
            if result['status_code'] == 400:
                error_msg = result['data'].get('error', '')
                print(f"✅ Status: 400 (as expected)")
                print(f"Error message: {error_msg}")
                
                if 'full' in error_msg.lower() or 'max' in error_msg.lower():
                    print_result(True, "Max-4 enforcement working correctly")
                else:
                    print_result(False, f"Error message doesn't mention capacity: {error_msg}")
            else:
                print_result(False, f"Expected 400, got {result['status_code']}")
        else:
            print_result(False, f"Could not reach max capacity (stuck at {current_count}/4)")
        
    except Exception as e:
        print(f"\n❌ TEST SUITE ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
    
    finally:
        # CLEANUP: Delete all created sample patients
        print_test_header("CLEANUP: Deleting Created Sample Patients")
        
        # Get current patients to identify samples
        all_patients = get_patients()
        
        for patient in all_patients:
            patient_id = patient.get('id')
            patient_name = patient.get('name', '')
            is_sample = patient.get('isSample', False)
            
            # Delete if it's a sample we created OR if it's marked as isSample
            # BUT preserve patient 'm'
            if patient_name == 'm':
                print(f"  ⚠️  Preserving patient 'm' (ID: {patient_id})")
                continue
            
            if patient_id in created_sample_ids or is_sample:
                print(f"  Deleting sample patient: {patient_name} (ID: {patient_id})")
                if delete_patient(patient_id):
                    print(f"    ✅ Deleted successfully")
                else:
                    print(f"    ❌ Failed to delete")
        
        # Final count
        final_patients = get_patients()
        final_count = len(final_patients)
        print(f"\nFinal patient count: {final_count}")
        
        # Verify patient 'm' still exists if it was there initially
        if patient_m:
            m_still_exists = any(p.get('name') == 'm' for p in final_patients)
            if m_still_exists:
                print_result(True, "Patient 'm' preserved successfully")
            else:
                print_result(False, "Patient 'm' was accidentally deleted!")
        
        print(f"\n{'#'*80}")
        print("# Test Suite Complete")
        print(f"{'#'*80}\n")

if __name__ == '__main__':
    main()
