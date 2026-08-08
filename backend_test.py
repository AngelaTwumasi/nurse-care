#!/usr/bin/env python3
"""
NurseCare Backend Authentication & Per-User Isolation Test Suite
Tests authentication gate, per-user data isolation, and full lifecycle with sessions.
"""

import requests
import json
import base64
import time
import sys
import subprocess

# Base URL from environment
BASE_URL = "https://web-nurse-app.preview.emergentagent.com/api"

# Test session cookies
NURSE1_COOKIE = "nc_session=TESTTOKEN1"
NURSE2_COOKIE = "nc_session=TESTTOKEN2"
BOGUS_COOKIE = "nc_session=BOGUS"

# Track created patients for cleanup
created_patients = []

def log_test(name):
    print(f"\n{'='*80}")
    print(f"TEST: {name}")
    print('='*80)

def log_pass(msg):
    print(f"✅ PASS: {msg}")

def log_fail(msg):
    print(f"❌ FAIL: {msg}")
    
def log_info(msg):
    print(f"ℹ️  INFO: {msg}")

def make_request(method, path, headers=None, json_data=None, expect_status=None):
    """Make HTTP request and optionally assert status"""
    url = f"{BASE_URL}{path}"
    h = headers or {}
    try:
        if method == "GET":
            resp = requests.get(url, headers=h, timeout=30)
        elif method == "POST":
            resp = requests.post(url, headers=h, json=json_data, timeout=120)
        elif method == "PUT":
            resp = requests.put(url, headers=h, json=json_data, timeout=30)
        elif method == "DELETE":
            resp = requests.delete(url, headers=h, timeout=30)
        else:
            raise ValueError(f"Unsupported method: {method}")
        
        if expect_status and resp.status_code != expect_status:
            log_fail(f"{method} {path} returned {resp.status_code}, expected {expect_status}")
            log_info(f"Response: {resp.text[:500]}")
            return None
        
        return resp
    except Exception as e:
        log_fail(f"{method} {path} raised exception: {e}")
        return None

def test_auth_gate_no_cookie():
    """Test 1: AUTH GATE - no cookie should return 401 for protected routes, 200 for /auth/me"""
    log_test("AUTH GATE (no cookie)")
    
    # /auth/me should return 200 with user:null
    resp = make_request("GET", "/auth/me", expect_status=200)
    if resp:
        data = resp.json()
        if data.get("user") is None:
            log_pass("GET /auth/me without cookie returns 200 with user:null")
        else:
            log_fail(f"GET /auth/me returned user={data.get('user')}, expected null")
    
    # All protected routes should return 401
    protected_routes = [
        ("GET", "/patients"),
        ("POST", "/sample", {}),
        ("POST", "/patients", {"name": "Test"}),
        ("POST", "/ingest", {"documents": []}),
    ]
    
    for method, path, *args in protected_routes:
        json_data = args[0] if args else None
        resp = make_request(method, path, json_data=json_data, expect_status=401)
        if resp:
            log_pass(f"{method} {path} without cookie returns 401")
    
    # Test with bogus cookie
    resp = make_request("GET", "/patients", headers={"Cookie": BOGUS_COOKIE}, expect_status=401)
    if resp:
        log_pass("GET /patients with bogus cookie returns 401")

def test_auth_me_with_cookie():
    """Test 2: AUTH ME - with valid cookie should return user data"""
    log_test("AUTH ME (with valid cookie)")
    
    resp = make_request("GET", "/auth/me", headers={"Cookie": NURSE1_COOKIE}, expect_status=200)
    if resp:
        data = resp.json()
        user = data.get("user")
        if user and user.get("id") == "testnurse1" and user.get("email") == "nurse1@test.dev":
            log_pass(f"GET /auth/me with TESTTOKEN1 returns user: {user}")
        else:
            log_fail(f"GET /auth/me returned unexpected user: {user}")

def test_full_lifecycle_nurse1():
    """Test 3: FULL LIFECYCLE as nurse1"""
    log_test("FULL LIFECYCLE as nurse1 (TESTTOKEN1)")
    
    headers = {"Cookie": NURSE1_COOKIE}
    
    # 3a. GET /patients -> array (only nurse1's)
    resp = make_request("GET", "/patients", headers=headers, expect_status=200)
    if resp:
        patients = resp.json()
        log_pass(f"GET /patients returns array with {len(patients)} patients")
        initial_count = len(patients)
    else:
        return
    
    # 3b. POST /sample {type:"sepsis"} -> patient with ownerId, risk high, full aiOutput
    resp = make_request("POST", "/sample", headers=headers, json_data={"type": "sepsis"}, expect_status=200)
    if resp:
        sample = resp.json()
        sample_id = sample.get("id")
        created_patients.append(("nurse1", sample_id))
        
        if sample.get("ownerId") == "testnurse1":
            log_pass(f"POST /sample created patient with ownerId=testnurse1")
        else:
            log_fail(f"POST /sample ownerId={sample.get('ownerId')}, expected testnurse1")
        
        ai = sample.get("aiOutput", {})
        ew = ai.get("earlyWarning", {})
        if ew.get("riskLevel") == "high":
            log_pass(f"Sample sepsis patient has riskLevel=high")
        else:
            log_fail(f"Sample sepsis patient riskLevel={ew.get('riskLevel')}, expected high")
        
        # Check for abbreviations array
        if isinstance(ai.get("abbreviations"), list) and len(ai.get("abbreviations")) > 0:
            log_pass(f"Sample patient has abbreviations array with {len(ai.get('abbreviations'))} items")
        else:
            log_fail(f"Sample patient missing abbreviations array")
    else:
        return
    
    # 3c. POST /patients {name:"AuthTest Pt", bed:"A1"} -> created; missing name -> 400
    resp = make_request("POST", "/patients", headers=headers, json_data={"name": "AuthTest Pt", "bed": "A1"}, expect_status=200)
    if resp:
        patient = resp.json()
        patient_id = patient.get("id")
        created_patients.append(("nurse1", patient_id))
        log_pass(f"POST /patients created patient: {patient.get('name')} (id={patient_id})")
    else:
        return
    
    # Test missing name validation
    resp = make_request("POST", "/patients", headers=headers, json_data={"bed": "A2"}, expect_status=400)
    if resp:
        log_pass("POST /patients without name returns 400")
    
    # 3d. POST /patients/:id/documents: text note + small PNG
    # Text note
    text_doc = {
        "documents": [{
            "name": "Test Note",
            "category": "vitals",
            "kind": "text",
            "textContent": "Patient stable. HR 80, BP 120/80."
        }]
    }
    resp = make_request("POST", f"/patients/{patient_id}/documents", headers=headers, json_data=text_doc, expect_status=200)
    if resp:
        log_pass("POST /patients/:id/documents added text note")
    
    # Small PNG (1x1 red pixel)
    png_base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="
    png_doc = {
        "documents": [{
            "name": "Test Image",
            "category": "other",
            "kind": "file",
            "mimeType": "image/png",
            "dataUrl": f"data:image/png;base64,{png_base64}"
        }]
    }
    resp = make_request("POST", f"/patients/{patient_id}/documents", headers=headers, json_data=png_doc, expect_status=200)
    if resp:
        updated = resp.json()
        docs = updated.get("documents", [])
        img_doc = next((d for d in docs if d.get("name") == "Test Image"), None)
        if img_doc:
            doc_id = img_doc.get("id")
            if img_doc.get("hasFile") and not img_doc.get("dataUrl"):
                log_pass("POST /patients/:id/documents added PNG with hasFile=true, dataUrl=null")
                
                # GET .../content streams image/png
                resp = make_request("GET", f"/patients/{patient_id}/documents/{doc_id}/content", headers=headers, expect_status=200)
                if resp and resp.headers.get("Content-Type") == "image/png":
                    log_pass("GET /patients/:id/documents/:docId/content streams image/png")
                else:
                    log_fail(f"GET content returned Content-Type={resp.headers.get('Content-Type') if resp else 'N/A'}")
                
                # DELETE removes it
                resp = make_request("DELETE", f"/patients/{patient_id}/documents/{doc_id}", headers=headers, expect_status=200)
                if resp:
                    log_pass("DELETE /patients/:id/documents/:docId removes document")
                    
                    # GET content after delete -> 404
                    resp = make_request("GET", f"/patients/{patient_id}/documents/{doc_id}/content", headers=headers, expect_status=404)
                    if resp:
                        log_pass("GET content after DELETE returns 404")
            else:
                log_fail(f"PNG doc hasFile={img_doc.get('hasFile')}, dataUrl={img_doc.get('dataUrl')}")
    
    # SEC-003: >30MB base64 -> 413
    # Create a 31MB base64 string (approximately)
    large_data = "A" * (31 * 1024 * 1024 * 4 // 3)  # base64 is ~4/3 of binary size
    large_doc = {
        "documents": [{
            "name": "Large File",
            "category": "other",
            "kind": "file",
            "mimeType": "application/pdf",
            "dataUrl": f"data:application/pdf;base64,{large_data}"
        }]
    }
    log_info("Testing SEC-003: uploading >30MB file (this may take a moment)...")
    resp = make_request("POST", f"/patients/{patient_id}/documents", headers=headers, json_data=large_doc, expect_status=413)
    if resp:
        log_pass("POST /patients/:id/documents with >30MB file returns 413")
    
    # 3e. POST /patients/:id/generate -> 200 full aiOutput
    log_info("Testing POST /generate (REAL Gemini call, ~30-50s)...")
    resp = make_request("POST", f"/patients/{patient_id}/generate", headers=headers, expect_status=200)
    if resp:
        result = resp.json()
        ai = result.get("aiOutput", {})
        required_keys = ["patientSummary", "priorities", "interventions", "isbar", "medications", 
                        "medicationTimes", "vitalsTimeline", "careSchedule", "earlyWarning", 
                        "redFlags", "newGradTips", "safetyNotice", "handoverHeader", "criticalActions",
                        "drsabcd", "dietMobility", "assessments", "linesDevices", "edd", 
                        "recommendations", "outstandingTasks", "abbreviations"]
        missing = [k for k in required_keys if k not in ai]
        if not missing:
            log_pass(f"POST /generate returned full aiOutput with all {len(required_keys)} required keys")
        else:
            log_fail(f"POST /generate missing keys: {missing}")
    
    # POST /patients/:id/worsen (+2 cap14)
    resp = make_request("POST", f"/patients/{patient_id}/worsen", headers=headers, expect_status=200)
    if resp:
        result = resp.json()
        ai = result.get("aiOutput", {})
        ew = ai.get("earlyWarning", {})
        log_pass(f"POST /worsen returned score={ew.get('score')}, trend={ew.get('trend')}")
    
    # POST /patients/:id/improve (-2 floor0)
    resp = make_request("POST", f"/patients/{patient_id}/improve", headers=headers, expect_status=200)
    if resp:
        result = resp.json()
        ai = result.get("aiOutput", {})
        ew = ai.get("earlyWarning", {})
        log_pass(f"POST /improve returned score={ew.get('score')}, trend={ew.get('trend')}")
    
    # 3f. PUT /patients/:id {handoverNote:"x"} -> sets handoverNote + handoverNoteAt
    resp = make_request("PUT", f"/patients/{patient_id}", headers=headers, json_data={"handoverNote": "Test handover note"}, expect_status=200)
    if resp:
        updated = resp.json()
        if updated.get("handoverNote") == "Test handover note" and updated.get("handoverNoteAt"):
            log_pass(f"PUT /patients/:id sets handoverNote and handoverNoteAt={updated.get('handoverNoteAt')}")
        else:
            log_fail(f"PUT /patients/:id handoverNote={updated.get('handoverNote')}, handoverNoteAt={updated.get('handoverNoteAt')}")
    
    # 3g. POST /ingest with multi-patient text doc
    ingest_doc = {
        "documents": [{
            "name": "Handover Sheet",
            "category": "other",
            "kind": "text",
            "textContent": """
            Patient 1: John Smith, Bed 1, 65yo, Pneumonia
            Patient 2: Mary Jones, Bed 2, 70yo, CHF
            Patient 3: Bob Wilson, Bed 3, 55yo, Post-op
            """
        }]
    }
    resp = make_request("POST", "/ingest", headers=headers, json_data=ingest_doc, expect_status=200)
    if resp:
        result = resp.json()
        detected = result.get("detectedCount", 0)
        created = result.get("created", 0)
        patients = result.get("patients", [])
        log_pass(f"POST /ingest detected {detected} patients, created {created}")
        
        # Track created patients for cleanup
        for p in patients:
            created_patients.append(("nurse1", p.get("id")))
            if p.get("ownerId") == "testnurse1":
                log_pass(f"Ingested patient {p.get('name')} has ownerId=testnurse1")
            else:
                log_fail(f"Ingested patient {p.get('name')} has ownerId={p.get('ownerId')}")

def test_per_user_isolation():
    """Test 4: PER-USER ISOLATION - nurse2 should NOT see nurse1's patients"""
    log_test("PER-USER ISOLATION (CRITICAL)")
    
    nurse1_headers = {"Cookie": NURSE1_COOKIE}
    nurse2_headers = {"Cookie": NURSE2_COOKIE}
    
    # Get nurse1's patients
    resp = make_request("GET", "/patients", headers=nurse1_headers, expect_status=200)
    if not resp:
        log_fail("Could not get nurse1's patients")
        return
    
    nurse1_patients = resp.json()
    if not nurse1_patients:
        log_fail("Nurse1 has no patients to test isolation")
        return
    
    p1_id = nurse1_patients[0].get("id")
    log_info(f"Testing isolation with nurse1's patient P1={p1_id}")
    
    # GET /patients as nurse2 must NOT include P1
    resp = make_request("GET", "/patients", headers=nurse2_headers, expect_status=200)
    if resp:
        nurse2_patients = resp.json()
        nurse2_ids = [p.get("id") for p in nurse2_patients]
        if p1_id not in nurse2_ids:
            log_pass(f"GET /patients as nurse2 does NOT include nurse1's patient P1")
        else:
            log_fail(f"GET /patients as nurse2 INCLUDES nurse1's patient P1 - ISOLATION BREACH!")
    
    # GET /patients/P1 as nurse2 -> 404
    resp = make_request("GET", f"/patients/{p1_id}", headers=nurse2_headers, expect_status=404)
    if resp:
        log_pass(f"GET /patients/P1 as nurse2 returns 404")
    
    # PUT /patients/P1 as nurse2 -> 404
    resp = make_request("PUT", f"/patients/{p1_id}", headers=nurse2_headers, json_data={"name": "Hacked"}, expect_status=404)
    if resp:
        log_pass(f"PUT /patients/P1 as nurse2 returns 404")
    
    # DELETE /patients/P1 as nurse2 -> should NOT delete it
    resp = make_request("DELETE", f"/patients/{p1_id}", headers=nurse2_headers)
    if resp:
        # Check if P1 still exists for nurse1
        resp = make_request("GET", f"/patients/{p1_id}", headers=nurse1_headers, expect_status=200)
        if resp:
            log_pass(f"DELETE /patients/P1 as nurse2 did NOT delete nurse1's patient (P1 still exists)")
        else:
            log_fail(f"DELETE /patients/P1 as nurse2 DELETED nurse1's patient - ISOLATION BREACH!")
    
    # GET P1 documents/content as nurse2 -> 404
    resp = make_request("GET", f"/patients/{p1_id}/documents", headers=nurse2_headers)
    if resp and resp.status_code == 404:
        log_pass(f"GET /patients/P1/documents as nurse2 returns 404")

def test_logout():
    """Test 5: LOGOUT - POST /auth/logout clears cookie"""
    log_test("LOGOUT")
    
    headers = {"Cookie": NURSE1_COOKIE}
    
    # POST /auth/logout
    resp = make_request("POST", "/auth/logout", headers=headers, expect_status=200)
    if resp:
        # Check Set-Cookie header
        set_cookie = resp.headers.get("Set-Cookie", "")
        if "nc_session=" in set_cookie and ("Max-Age=0" in set_cookie or "expires=" in set_cookie):
            log_pass("POST /auth/logout returns 200 and clears cookie (Set-Cookie with Max-Age=0)")
        else:
            log_fail(f"POST /auth/logout Set-Cookie header: {set_cookie}")
        
        # After logout, TESTTOKEN1 session is deleted
        # Verify by trying to use it
        resp = make_request("GET", "/auth/me", headers=headers, expect_status=200)
        if resp:
            data = resp.json()
            if data.get("user") is None:
                log_pass("After logout, GET /auth/me with old cookie returns user:null")
            else:
                log_fail(f"After logout, GET /auth/me still returns user: {data.get('user')}")

def cleanup():
    """Cleanup: delete created patients"""
    log_test("CLEANUP")
    
    # Re-seed TESTTOKEN1 since we logged out
    log_info("Re-seeding TESTTOKEN1 session...")
    subprocess.run(["node", "/app/seed.js"], check=True)
    log_pass("Re-seeded TESTTOKEN1 and TESTTOKEN2 sessions")
    
    nurse1_headers = {"Cookie": NURSE1_COOKIE}
    
    for owner, patient_id in created_patients:
        if owner == "nurse1":
            resp = make_request("DELETE", f"/patients/{patient_id}", headers=nurse1_headers)
            if resp and resp.status_code == 200:
                log_info(f"Deleted patient {patient_id}")
            else:
                log_info(f"Could not delete patient {patient_id} (may already be deleted)")
    
    log_pass(f"Cleanup complete. Attempted to delete {len(created_patients)} test patients")

def main():
    print("\n" + "="*80)
    print("NurseCare Backend Authentication & Per-User Isolation Test Suite")
    print("="*80)
    
    try:
        test_auth_gate_no_cookie()
        test_auth_me_with_cookie()
        test_full_lifecycle_nurse1()
        test_per_user_isolation()
        test_logout()
    finally:
        cleanup()
    
    print("\n" + "="*80)
    print("TEST SUITE COMPLETE")
    print("="*80)

if __name__ == "__main__":
    main()
