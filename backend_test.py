#!/usr/bin/env python3
"""
Backend test for NurseCare Round 12 features:
A) POST /api/patients/:id/improve (recovery scenario)
B) handoverNoteAt timestamp on PUT /api/patients/:id
"""

import requests
import json
import time
from datetime import datetime, timedelta

BASE_URL = "https://web-nurse-app.preview.emergentagent.com/api"

def print_test_header(test_name):
    print(f"\n{'='*80}")
    print(f"TEST: {test_name}")
    print(f"{'='*80}")

def print_step(step_num, description):
    print(f"\n[STEP {step_num}] {description}")

def print_result(success, message):
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"{status}: {message}")

def print_value(label, value):
    print(f"  {label}: {value}")

# ============================================================================
# TEST A: Recovery endpoint (POST /api/patients/:id/improve)
# ============================================================================
def test_recovery_endpoint():
    print_test_header("A) Recovery endpoint: POST /api/patients/:id/improve")
    
    patient_id = None
    
    try:
        # Step 1: Create a HIGH-risk sample patient (sepsis)
        print_step(1, "Create HIGH-risk sample patient: POST /api/sample {\"type\":\"sepsis\"}")
        
        response = requests.post(f"{BASE_URL}/sample", json={"type": "sepsis"})
        print_value("HTTP Status", response.status_code)
        
        if response.status_code != 200:
            print_result(False, f"Failed to create sample patient: {response.text}")
            return False
        
        patient = response.json()
        patient_id = patient.get("id")
        initial_score_str = patient.get("aiOutput", {}).get("earlyWarning", {}).get("score", "0")
        initial_risk = patient.get("aiOutput", {}).get("earlyWarning", {}).get("riskLevel", "unknown")
        initial_trend = patient.get("aiOutput", {}).get("earlyWarning", {}).get("trend", "unknown")
        initial_ew_history_len = len(patient.get("ewHistory", []))
        
        # Parse score (might be string like "8" or "N/A")
        try:
            initial_score = int(initial_score_str) if initial_score_str != "N/A" else 8
        except (ValueError, TypeError):
            initial_score = 8
        
        print_value("Patient ID", patient_id)
        print_value("Initial Score", initial_score)
        print_value("Initial RiskLevel", initial_risk)
        print_value("Initial Trend", initial_trend)
        print_value("Initial ewHistory Length", initial_ew_history_len)
        
        if initial_risk != "high":
            print_result(False, f"Expected initial riskLevel='high', got '{initial_risk}'")
            return False
        
        print_result(True, f"Sample patient created with high risk (score={initial_score})")
        
        # Step 2: Call POST /api/patients/:id/improve once
        print_step(2, "POST /api/patients/:id/improve (first call)")
        
        response = requests.post(f"{BASE_URL}/patients/{patient_id}/improve")
        print_value("HTTP Status", response.status_code)
        
        if response.status_code != 200:
            print_result(False, f"Failed to call /improve: {response.text}")
            return False
        
        result = response.json()
        new_score_str = result.get("aiOutput", {}).get("earlyWarning", {}).get("score", "0")
        new_risk = result.get("aiOutput", {}).get("earlyWarning", {}).get("riskLevel", "unknown")
        new_trend = result.get("aiOutput", {}).get("earlyWarning", {}).get("trend", "unknown")
        
        try:
            new_score = int(new_score_str)
        except (ValueError, TypeError):
            new_score = 0
        
        print_value("New Score", new_score)
        print_value("New RiskLevel", new_risk)
        print_value("New Trend", new_trend)
        
        expected_score = initial_score - 2
        if new_score != expected_score:
            print_result(False, f"Expected score={expected_score}, got {new_score}")
            return False
        
        if new_trend != "improving":
            print_result(False, f"Expected trend='improving', got '{new_trend}'")
            return False
        
        # Verify ewHistory grew by 1
        response = requests.get(f"{BASE_URL}/patients/{patient_id}")
        patient = response.json()
        new_ew_history_len = len(patient.get("ewHistory", []))
        print_value("New ewHistory Length", new_ew_history_len)
        
        if new_ew_history_len != initial_ew_history_len + 1:
            print_result(False, f"Expected ewHistory length={initial_ew_history_len + 1}, got {new_ew_history_len}")
            return False
        
        print_result(True, f"Score decreased by 2 ({initial_score} → {new_score}), trend='improving', ewHistory grew by 1")
        
        # Step 3: Call /improve repeatedly (about 4-5 times total) to reach score 0
        print_step(3, "Call /improve repeatedly until score reaches 0")
        
        current_score = new_score
        call_count = 1
        max_calls = 10  # Safety limit
        
        while current_score > 0 and call_count < max_calls:
            call_count += 1
            print(f"\n  Call #{call_count}:")
            
            response = requests.post(f"{BASE_URL}/patients/{patient_id}/improve")
            if response.status_code != 200:
                print_result(False, f"Failed on call #{call_count}: {response.text}")
                return False
            
            result = response.json()
            prev_score = current_score
            current_score_str = result.get("aiOutput", {}).get("earlyWarning", {}).get("score", "0")
            try:
                current_score = int(current_score_str)
            except (ValueError, TypeError):
                current_score = 0
            
            current_risk = result.get("aiOutput", {}).get("earlyWarning", {}).get("riskLevel", "unknown")
            current_trend = result.get("aiOutput", {}).get("earlyWarning", {}).get("trend", "unknown")
            
            print_value("  Score", f"{prev_score} → {current_score}")
            print_value("  RiskLevel", current_risk)
            print_value("  Trend", current_trend)
            
            # Verify score decreased by 2 (or reached floor of 0)
            expected = max(prev_score - 2, 0)
            if current_score != expected:
                print_result(False, f"Expected score={expected}, got {current_score}")
                return False
            
            # Verify score never goes negative
            if current_score < 0:
                print_result(False, f"Score went negative: {current_score}")
                return False
            
            # Verify riskLevel de-escalates correctly
            if current_score >= 7 and current_risk != "high":
                print_result(False, f"Score {current_score} should be 'high', got '{current_risk}'")
                return False
            elif 4 <= current_score < 7 and current_risk != "medium":
                print_result(False, f"Score {current_score} should be 'medium', got '{current_risk}'")
                return False
            elif current_score < 4 and current_risk != "low":
                print_result(False, f"Score {current_score} should be 'low', got '{current_risk}'")
                return False
            
            # Verify trend
            if current_score == 0 and current_trend != "stable":
                print_result(False, f"Score is 0, trend should be 'stable', got '{current_trend}'")
                return False
            elif current_score > 0 and current_trend != "improving":
                print_result(False, f"Score > 0, trend should be 'improving', got '{current_trend}'")
                return False
        
        # Verify final state
        response = requests.get(f"{BASE_URL}/patients/{patient_id}")
        patient = response.json()
        final_score_str = patient.get("aiOutput", {}).get("earlyWarning", {}).get("score", "0")
        try:
            final_score = int(final_score_str)
        except (ValueError, TypeError):
            final_score = 0
        final_risk = patient.get("aiOutput", {}).get("earlyWarning", {}).get("riskLevel", "unknown")
        final_trend = patient.get("aiOutput", {}).get("earlyWarning", {}).get("trend", "unknown")
        final_ew_history_len = len(patient.get("ewHistory", []))
        
        print(f"\n  Final State:")
        print_value("  Final Score", final_score)
        print_value("  Final RiskLevel", final_risk)
        print_value("  Final Trend", final_trend)
        print_value("  Final ewHistory Length", final_ew_history_len)
        print_value("  Total /improve calls", call_count)
        
        if final_score != 0:
            print_result(False, f"Expected final score=0, got {final_score}")
            return False
        
        if final_risk != "low":
            print_result(False, f"Expected final riskLevel='low', got '{final_risk}'")
            return False
        
        if final_trend != "stable":
            print_result(False, f"Expected final trend='stable' at score 0, got '{final_trend}'")
            return False
        
        expected_history_len = initial_ew_history_len + call_count
        if final_ew_history_len != expected_history_len:
            print_result(False, f"Expected ewHistory length={expected_history_len}, got {final_ew_history_len}")
            return False
        
        print_result(True, f"Score reached 0 (floor), riskLevel='low', trend='stable', ewHistory grew by {call_count}")
        
        # Step 4: Cleanup
        print_step(4, "Cleanup: DELETE sample patient")
        
        response = requests.delete(f"{BASE_URL}/patients/{patient_id}")
        print_value("HTTP Status", response.status_code)
        
        if response.status_code != 200:
            print_result(False, f"Failed to delete patient: {response.text}")
            return False
        
        print_result(True, "Sample patient deleted successfully")
        
        return True
        
    except Exception as e:
        print_result(False, f"Exception occurred: {str(e)}")
        import traceback
        traceback.print_exc()
        
        # Cleanup on error
        if patient_id:
            try:
                requests.delete(f"{BASE_URL}/patients/{patient_id}")
                print("  Cleanup: Deleted patient after error")
            except Exception:
                pass
        
        return False

# ============================================================================
# TEST B: handoverNoteAt timestamp on PUT
# ============================================================================
def test_handover_note_timestamp():
    print_test_header("B) handoverNoteAt timestamp on PUT /api/patients/:id")
    
    patient_id = None
    
    try:
        # Step 1: Create a patient
        print_step(1, "Create patient: POST /api/patients")
        
        patient_data = {
            "name": "NoteTime Test",
            "bed": "Bed 5",
            "age": "65",
            "diagnosis": "Asthma"
        }
        
        response = requests.post(f"{BASE_URL}/patients", json=patient_data)
        print_value("HTTP Status", response.status_code)
        
        if response.status_code != 200:
            print_result(False, f"Failed to create patient: {response.text}")
            return False
        
        patient = response.json()
        patient_id = patient.get("id")
        
        print_value("Patient ID", patient_id)
        print_value("Patient Name", patient.get("name"))
        print_value("Diagnosis", patient.get("diagnosis"))
        
        print_result(True, "Patient created successfully")
        
        # Step 2: PUT with handoverNote and verify handoverNoteAt
        print_step(2, "PUT /api/patients/:id with handoverNote='First note'")
        
        before_put_time = datetime.utcnow()
        
        response = requests.put(f"{BASE_URL}/patients/{patient_id}", json={"handoverNote": "First note"})
        print_value("HTTP Status", response.status_code)
        
        if response.status_code != 200:
            print_result(False, f"Failed to PUT handoverNote: {response.text}")
            return False
        
        after_put_time = datetime.utcnow()
        
        # GET patient to verify
        response = requests.get(f"{BASE_URL}/patients/{patient_id}")
        if response.status_code != 200:
            print_result(False, f"Failed to GET patient: {response.text}")
            return False
        
        patient = response.json()
        handover_note = patient.get("handoverNote")
        handover_note_at = patient.get("handoverNoteAt")
        
        print_value("handoverNote", handover_note)
        print_value("handoverNoteAt", handover_note_at)
        
        if handover_note != "First note":
            print_result(False, f"Expected handoverNote='First note', got '{handover_note}'")
            return False
        
        if not handover_note_at:
            print_result(False, "handoverNoteAt is missing")
            return False
        
        # Verify it's a valid ISO timestamp
        try:
            timestamp = datetime.fromisoformat(handover_note_at.replace('Z', '+00:00'))
        except (ValueError, TypeError):
            print_result(False, f"handoverNoteAt is not a valid ISO timestamp: {handover_note_at}")
            return False
        
        # Verify timestamp is within the last minute (reasonable window)
        # Make after_put_time timezone-aware for comparison
        from datetime import timezone
        after_put_time_aware = after_put_time.replace(tzinfo=timezone.utc)
        time_diff = (after_put_time_aware - timestamp).total_seconds()
        if abs(time_diff) > 60:
            print_result(False, f"handoverNoteAt timestamp is not recent (diff: {time_diff}s)")
            return False
        
        print_result(True, f"handoverNote set and handoverNoteAt is valid recent timestamp")
        
        first_timestamp = handover_note_at
        
        # Step 3: Wait ~2 seconds, then PUT again with updated note
        print_step(3, "Wait 2s, then PUT with handoverNote='Updated note'")
        
        time.sleep(2)
        
        response = requests.put(f"{BASE_URL}/patients/{patient_id}", json={"handoverNote": "Updated note"})
        print_value("HTTP Status", response.status_code)
        
        if response.status_code != 200:
            print_result(False, f"Failed to PUT updated handoverNote: {response.text}")
            return False
        
        # GET patient to verify
        response = requests.get(f"{BASE_URL}/patients/{patient_id}")
        if response.status_code != 200:
            print_result(False, f"Failed to GET patient: {response.text}")
            return False
        
        patient = response.json()
        updated_note = patient.get("handoverNote")
        updated_note_at = patient.get("handoverNoteAt")
        
        print_value("handoverNote", updated_note)
        print_value("handoverNoteAt (old)", first_timestamp)
        print_value("handoverNoteAt (new)", updated_note_at)
        
        if updated_note != "Updated note":
            print_result(False, f"Expected handoverNote='Updated note', got '{updated_note}'")
            return False
        
        if not updated_note_at:
            print_result(False, "handoverNoteAt is missing after update")
            return False
        
        if updated_note_at == first_timestamp:
            print_result(False, "handoverNoteAt did not update (same as before)")
            return False
        
        # Verify new timestamp is later than first
        try:
            first_ts = datetime.fromisoformat(first_timestamp.replace('Z', '+00:00'))
            updated_ts = datetime.fromisoformat(updated_note_at.replace('Z', '+00:00'))
            
            if updated_ts <= first_ts:
                print_result(False, f"Updated timestamp is not newer than first timestamp")
                return False
            
            time_diff = (updated_ts - first_ts).total_seconds()
            print_value("Time difference", f"{time_diff:.1f}s")
            
        except Exception as e:
            print_result(False, f"Failed to parse timestamps: {str(e)}")
            return False
        
        print_result(True, "handoverNote updated and handoverNoteAt changed to newer timestamp")
        
        # Step 4: PUT with only name (no handoverNote) and verify handoverNote/handoverNoteAt intact
        print_step(4, "PUT with only name (no handoverNote) - verify handoverNote/handoverNoteAt intact")
        
        response = requests.put(f"{BASE_URL}/patients/{patient_id}", json={"name": "NoteTime Test Updated"})
        print_value("HTTP Status", response.status_code)
        
        if response.status_code != 200:
            print_result(False, f"Failed to PUT name only: {response.text}")
            return False
        
        # GET patient to verify
        response = requests.get(f"{BASE_URL}/patients/{patient_id}")
        if response.status_code != 200:
            print_result(False, f"Failed to GET patient: {response.text}")
            return False
        
        patient = response.json()
        final_name = patient.get("name")
        final_note = patient.get("handoverNote")
        final_note_at = patient.get("handoverNoteAt")
        
        print_value("Name", final_name)
        print_value("handoverNote", final_note)
        print_value("handoverNoteAt", final_note_at)
        
        if final_name != "NoteTime Test Updated":
            print_result(False, f"Expected name='NoteTime Test Updated', got '{final_name}'")
            return False
        
        if final_note != "Updated note":
            print_result(False, f"handoverNote changed unexpectedly: '{final_note}'")
            return False
        
        if final_note_at != updated_note_at:
            print_result(False, f"handoverNoteAt changed unexpectedly")
            return False
        
        print_result(True, "PUT without handoverNote did not modify handoverNote/handoverNoteAt")
        
        # Step 5: Cleanup
        print_step(5, "Cleanup: DELETE patient")
        
        response = requests.delete(f"{BASE_URL}/patients/{patient_id}")
        print_value("HTTP Status", response.status_code)
        
        if response.status_code != 200:
            print_result(False, f"Failed to delete patient: {response.text}")
            return False
        
        print_result(True, "Patient deleted successfully")
        
        return True
        
    except Exception as e:
        print_result(False, f"Exception occurred: {str(e)}")
        import traceback
        traceback.print_exc()
        
        # Cleanup on error
        if patient_id:
            try:
                requests.delete(f"{BASE_URL}/patients/{patient_id}")
                print("  Cleanup: Deleted patient after error")
            except Exception:
                pass
        
        return False

# ============================================================================
# MAIN
# ============================================================================
def main():
    print("\n" + "="*80)
    print("NURSECARE ROUND 12 BACKEND TESTING")
    print("Testing: Recovery endpoint + handoverNoteAt timestamp")
    print("="*80)
    
    results = {}
    
    # Test A: Recovery endpoint
    results['A_recovery_endpoint'] = test_recovery_endpoint()
    
    # Test B: handoverNoteAt timestamp
    results['B_handover_timestamp'] = test_handover_note_timestamp()
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    for test_name, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    all_passed = all(results.values())
    
    print("\n" + "="*80)
    if all_passed:
        print("✅ ALL TESTS PASSED")
    else:
        print("❌ SOME TESTS FAILED")
    print("="*80)
    
    return 0 if all_passed else 1

if __name__ == "__main__":
    exit(main())
