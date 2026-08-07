#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  Rebuild "NurseCare" as a full-stack web app for NEW GRADUATE nurses. Core value:
  manage up to 4 patients per shift; for each patient upload documents (care plan,
  medication chart, vital signs, allied health notes, other PDFs/images or typed notes);
  AI (Gemini 2.5 Pro via Emergent LLM key) reads ALL documents and generates nursing
  interventions, care priorities, medications summary, and an ISBAR handover, plus
  red flags and new-grad tips. Includes an interactive onboarding tutorial.

backend:
  - task: "Patients CRUD (max 4 per shift)"
    implemented: true
    working: true
    file: "/app/app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "GET/POST /api/patients, GET/PUT/DELETE /api/patients/:id. POST enforces max 4 patients. UUID ids, ObjectId stripped."
        -working: true
        -agent: "testing"
        -comment: "✅ All CRUD operations verified working. GET /api/patients returns array. POST creates patient with uuid and enforces max 4 (5th returns 400 with proper error message). GET/:id retrieves patient. PUT/:id updates fields. DELETE/:id removes patient and returns {success:true}. Missing name validation returns 400. All tests passed."

  - task: "Document management (upload files/notes, delete)"
    implemented: true
    working: true
    file: "/app/app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "POST /api/patients/:id/documents accepts {documents:[{name,category,kind,mimeType,dataUrl,textContent}]}. DELETE /api/patients/:id/documents/:docId removes doc. Docs stored embedded in patient."
        -working: true
        -agent: "testing"
        -comment: "✅ Document management verified working. POST /api/patients/:id/documents successfully adds documents with uuid doc ids. Tested with both vitals note and care plan document. DELETE /api/patients/:id/documents/:docId correctly removes document from patient's documents array. All tests passed."

  - task: "AI generate nursing cares (Gemini 2.5 Pro multimodal)"
    implemented: true
    working: true
    file: "/app/app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "testing"
        -comment: "Verified 12/12 earlier with all base keys."
        -working: "NA"
        -agent: "main"
        -comment: "EXTENDED schema (needs retest): aiOutput must now ALSO include medicationTimes[] ({time,medication,dose}), vitalsTimeline[] ({time,hr,bp,rr,spo2,temp,notes}), and earlyWarning{score,riskLevel(low|medium|high),trend(improving|stable|worsening),rationale,escalation}. Confirm returned + persisted when documents contain time-stamped vitals."
        -working: true
        -agent: "testing"
        -comment: "✅ SCHEMA EXTENSION VERIFIED. Created patient 'Timeline Test' with deteriorating vitals (HR 88→118, BP 130/80→92/55, RR 18→28, SpO2 96→89, Temp 37.2→38.6). AI generation completed in 29.0s. ALL base keys (8) + NEW keys (3) present and valid: medicationTimes[] (3 items: Paracetamol 0600/1400, Ceftriaxone 0800), vitalsTimeline[] (3 time-stamped observations), earlyWarning{score:N/A, riskLevel:high, trend:worsening, rationale, escalation}. Trend correctly identified as 'worsening'. All data persisted. Test patient cleaned up."

frontend:
  - task: "Shift dashboard + patient workspace + tutorial"
    implemented: true
    working: "NA"
    file: "/app/app/page.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Dashboard renders, empty state and header verified via screenshot. Needs full click-by-click UI test of add patient -> upload note -> generate -> results."

  - task: "Export Handover (copy + download PDF)"
    implemented: true
    working: "NA"
    file: "/app/app/page.js"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "After AI generate, results show 'Copy handover' (clipboard) and 'Download PDF' (opens print window with styled ISBAR/priorities/interventions/meds/red flags)."

  - task: "Shift Timeline (vitals + med times) and Deterioration Alert (EWS)"
    implemented: true
    working: "NA"
    file: "/app/app/page.js"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "New 'Timeline' tab renders ai.vitalsTimeline + ai.medicationTimes. Deterioration Alert banner renders ai.earlyWarning (score, riskLevel color, trend icon, escalation) above the tabs."

metadata:
  created_by: "main_agent"
  version: "1.1"
  test_sequence: 3
  run_ui: false

test_plan:
  current_focus:
    - "AI generate nursing cares (Gemini 2.5 Pro multimodal)"
    - "Shift dashboard + patient workspace + tutorial"
    - "Export Handover (copy + download PDF)"
    - "Shift Timeline (vitals + med times) and Deterioration Alert (EWS)"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
    -agent: "main"
    -message: |
      ROUND 2 — new features added. Please RETEST.
      BACKEND (quick): POST /api/patients/:id/generate now must ALSO return, inside aiOutput,
      the keys: medicationTimes[] ({time,medication,dose}), vitalsTimeline[]
      ({time,hr,bp,rr,spo2,temp,notes}) and earlyWarning{score,riskLevel,trend,rationale,escalation}.
      Provide a document with time-stamped vitals so these populate, e.g. a text doc:
      "Obs 0600 HR 88 BP 130/80 RR 18 SpO2 96%. Obs 1000 HR 104 BP 100/60 RR 24 SpO2 92%.
       Obs 1400 HR 118 BP 92/55 RR 28 SpO2 89%." Verify all base keys still present and the
      3 new keys exist and persist. Clean up test patients afterwards.
    -agent: "testing"
    -message: |
      ✅ BACKEND TESTING COMPLETE - ALL TESTS PASSED (12/12) [round 1]
      Patients CRUD, document management, and AI generation (real Gemini 2.5 Pro, 32.7s) all verified.
      All base aiOutput keys present and persisted. Test patients cleaned up. Backend production-ready.
    -agent: "testing"
    -message: |
      ✅ BACKEND TESTING COMPLETE - ALL TESTS PASSED (12/12)
      
      Comprehensive backend testing completed successfully. All 3 high-priority backend tasks verified working:
      
      1. Patients CRUD (max 4 per shift) - ✅ WORKING
         - GET /api/patients returns array
         - POST /api/patients creates patient with uuid
         - Max 4 enforcement working (5th returns 400 with proper error)
         - GET/PUT/DELETE /api/patients/:id all working
         - Validation working (missing name returns 400)
      
      2. Document management - ✅ WORKING
         - POST /api/patients/:id/documents adds documents with uuid doc ids
         - DELETE /api/patients/:id/documents/:docId removes documents
         - Tested with multiple document types (vitals, care plan)
      
      3. AI generation (Gemini 2.5 Pro) - ✅ WORKING
         - POST /api/patients/:id/generate successfully calls REAL Gemini API
         - Response time: 32.7 seconds (within expected 15-40s range)
         - All required output keys present and correctly structured:
           * patientSummary (string)
           * priorities (array with priority/rationale/urgency)
           * interventions (array)
           * isbar (object with all 5 sections)
           * medications (array)
           * redFlags (array)
           * newGradTips (array)
           * safetyNotice (string)
         - aiOutput and aiGeneratedAt correctly persisted to patient record
      
      Test cleanup: All test patients removed successfully.
      
      NO CRITICAL ISSUES FOUND. Backend is production-ready.
    -agent: "testing"
    -message: |
      ✅ SCHEMA EXTENSION TEST PASSED (ROUND 2)
      
      Retested AI generation endpoint after schema extension. All tests passed:
      
      Test scenario:
      - Created patient "Timeline Test" (68yo, Pneumonia monitoring for sepsis)
      - Added vitals document with DETERIORATING observations:
        * 0600: HR 88, BP 130/80, RR 18, SpO2 96%, Temp 37.2
        * 1000: HR 104, BP 100/60, RR 24, SpO2 92%, Temp 38.1
        * 1400: HR 118, BP 92/55, RR 28, SpO2 89%, Temp 38.6
      - Medications: Paracetamol 1g PO at 0600/1400, Ceftriaxone 1g IV at 0800
      
      Results:
      ✅ AI generation completed in 29.0 seconds (REAL Gemini 2.5 Pro call)
      ✅ ALL 8 BASE keys present and valid:
         patientSummary, priorities, interventions, isbar (5 sections), 
         medications, redFlags, newGradTips, safetyNotice
      ✅ ALL 3 NEW keys present and valid:
         - medicationTimes[] (3 items with time/medication/dose)
         - vitalsTimeline[] (3 items with time/hr/bp/rr/spo2/temp/notes)
         - earlyWarning{score, riskLevel, trend, rationale, escalation}
      ✅ earlyWarning.riskLevel = "high" (correct)
      ✅ earlyWarning.trend = "worsening" (correctly identified deterioration)
      ✅ All data persisted correctly via GET /api/patients/:id
      ✅ Test patient cleaned up successfully
      
      Backend AI generation with extended schema is PRODUCTION-READY.
