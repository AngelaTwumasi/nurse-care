import { MongoClient, GridFSBucket } from 'mongodb'
import { v4 as uuidv4 } from 'uuid'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ---------- MongoDB ----------
let client
let db
let connecting

async function connectToMongo() {
  if (db) return db
  if (!connecting) {
    client = new MongoClient(process.env.MONGO_URL)
    connecting = client.connect().then(() => {
      db = client.db(process.env.DB_NAME)
      return db
    })
  }
  await connecting
  return db
}

// ---------- GridFS document storage (keeps big files OUT of the patient record) ----------
const FILE_BUCKET = 'docfiles'
function getBucket(db) {
  return new GridFSBucket(db, { bucketName: FILE_BUCKET })
}

function dataUrlToBuffer(dataUrl) {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl || '')
  if (!m) return null
  return { mime: m[1], buffer: Buffer.from(m[2], 'base64') }
}

async function storeFile(db, docId, patientId, dataUrl, mimeType) {
  const parsed = dataUrlToBuffer(dataUrl)
  if (!parsed) return false
  const bucket = getBucket(db)
  await new Promise((resolve, reject) => {
    const up = bucket.openUploadStream(docId, { metadata: { docId, patientId, mime: mimeType || parsed.mime } })
    up.on('error', reject)
    up.on('finish', resolve)
    up.end(parsed.buffer)
  })
  return true
}

async function readFile(db, docId) {
  const files = await db.collection(`${FILE_BUCKET}.files`).find({ 'metadata.docId': docId }).toArray()
  if (!files.length) return null
  const bucket = getBucket(db)
  const chunks = []
  await new Promise((resolve, reject) => {
    const dl = bucket.openDownloadStream(files[0]._id)
    dl.on('data', (c) => chunks.push(c))
    dl.on('error', reject)
    dl.on('end', resolve)
  })
  return { buffer: Buffer.concat(chunks), mime: files[0].metadata?.mime || 'application/octet-stream' }
}

async function deleteFile(db, docId) {
  const files = await db.collection(`${FILE_BUCKET}.files`).find({ 'metadata.docId': docId }).toArray()
  const bucket = getBucket(db)
  for (const f of files) { try { await bucket.delete(f._id) } catch {} }
}

// Resolve a doc to a base64 data URL for the LLM (from embedded dataUrl OR GridFS)
async function resolveDocDataUrl(db, doc) {
  if (doc.dataUrl) return doc.dataUrl
  if (doc.hasFile) {
    const f = await readFile(db, doc.id)
    if (f) return `data:${f.mime};base64,${f.buffer.toString('base64')}`
  }
  return null
}

// ---------- CORS ----------
function handleCORS(response) {
  response.headers.set('Access-Control-Allow-Origin', process.env.CORS_ORIGINS || '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  response.headers.set('Access-Control-Allow-Credentials', 'true')
  return response
}

export async function OPTIONS() {
  return handleCORS(new NextResponse(null, { status: 200 }))
}

const json = (data, status = 200) => handleCORS(NextResponse.json(data, { status }))

const MAX_PATIENTS = 4
const LLM_MODEL = 'gemini/gemini-2.5-pro'

// ---------- AI Care Generation ----------
async function generateNursingCare(patient, db) {
  const KEY = process.env.EMERGENT_LLM_KEY
  const BASE = process.env.EMERGENT_LLM_BASE_URL
  if (!KEY || !BASE) throw new Error('LLM not configured')

  const parts = []

  const intro = `You are an experienced clinical nurse educator supporting a NEW GRADUATE nurse.
Carefully READ and INTERPRET EVERY attached patient document. Documents may include: the care plan,
medication chart, vital-sign observations, DOCTOR / medical-officer notes and orders, PHYSIOTHERAPY notes,
DIETITIAN / NUTRITIONIST notes, other allied-health notes, and any other documents. Each document is labelled
with its category. Extract the relevant information from EACH document (including doctor orders, physio mobility
plans and nutrition/diet requirements) and INTEGRATE it into ONE cohesive nursing care plan and handover.
Produce a practical, shift-ready nursing care guide.

PATIENT CONTEXT:
- Name: ${patient.name || 'Unknown'}
- Bed/Room: ${patient.bed || 'N/A'}
- Age: ${patient.age || 'N/A'}
- Known diagnosis / reason for admission: ${patient.diagnosis || 'See documents'}

RULES:
- Use ONLY information visible in the provided documents and context. Do NOT invent facts, doses, allergies or diagnoses.
- Where information is missing or unclear, say so in "redFlags" or "safetyNotice".
- Write in clear, supportive language a new grad can act on this shift.
- A registered clinician must verify all medications, allergies, deterioration and escalation decisions.

Return ONLY a valid JSON object (no markdown, no commentary) with EXACTLY this shape:
{
  "patientSummary": "2-3 sentence plain-language summary of the patient and current status",
  "handoverHeader": {
    "alerts": [ "key safety alerts, e.g. allergies, falls risk, infection precautions, resuscitation status, cognitive/communication needs — ONLY if seen in documents" ],
    "diagnosis": "primary diagnosis / reason for admission",
    "background": "relevant past medical history and social background",
    "age": "patient age",
    "attendingDoctor": "attending doctor / medical team / consultant if documented, else 'Not documented'"
  },
  "criticalActions": [ { "action": "a TIME-CRITICAL nursing action for this patient", "window": "the critical time window, e.g. 'now', 'within 1 hour', 'before next dose'", "rationale": "why it is time-critical" } ],
  "priorities": [ { "rank": 1, "priority": "short title", "rationale": "why this matters now", "urgency": "urgent" | "soon" | "routine" } ],
  "interventions": [ { "intervention": "what to do", "frequency": "how often / timing", "monitoring": "WHAT specifically to monitor (name the parameters/signs to watch)", "howToMonitor": "HOW to monitor it — the technique/tool, what a normal vs concerning result looks like, and the threshold that should prompt action", "rationale": "why this matters — the clinical reasoning, consequences if missed" } ],
  "drsabcd": {
    "danger": "any environmental/safety hazards to check for this patient",
    "response": "expected level of response / how to assess (e.g. AVPU/GCS)",
    "sendForHelp": "who/when to call for help for this patient (RN, MET, rapid response)",
    "airway": "airway status and what to watch",
    "breathing": "breathing status, O2, targets and what to watch",
    "circulation": "circulation/perfusion status, IV access, fluids and what to watch",
    "disability": "neuro/BGL/pain status and what to watch",
    "exposure": "temperature, skin, wounds, drains and what to watch"
  },
  "dietMobility": { "diet": "diet order / restrictions / assistance needed", "mobility": "mobility status / weight-bearing / falls precautions", "aids": "aids or supervision needed" },
  "assessments": { "done": [ "assessments/observations already completed this shift" ], "todo": [ "assessments still to be completed this shift" ] },
  "linesDevices": [ { "type": "e.g. IV cannula / IDC / NGT / infusion / drain / oxygen", "detail": "what is running / size / rate", "site": "location", "notes": "care, patency, review/removal date" } ],
  "edd": "estimated date of discharge if documented, else 'Not documented'",
  "recommendations": [ "overall plan recommendations and next steps for the shift/team" ],
  "outstandingTasks": [ "tasks still to complete this shift (jobs list)" ],
  "isbar": { "identify": "...", "situation": "...", "background": "...", "assessment": "...", "recommendation": "..." },
  "medications": [ { "name": "...", "dose": "...", "route": "...", "times": ["due/administration times seen or scheduled, e.g. 0800", "1400"], "notes": "timing or nursing considerations" } ],
  "medicationTimes": [ { "time": "e.g. 0800", "medication": "name", "dose": "dose" } ],
  "careSchedule": [ { "time": "when to complete, e.g. 0800 / hourly / pre-meal / end of shift", "task": "the nursing care or task to complete at this time", "priority": "urgent" | "soon" | "routine" } ],
  "vitalsTimeline": [ { "time": "e.g. 0600 or 07/08 14:00", "hr": "", "bp": "", "rr": "", "spo2": "", "temp": "", "notes": "any observation at this time" } ],
  "earlyWarning": {
    "score": "numeric early warning / MEWS-style score if derivable from vitals, else 'N/A'",
    "riskLevel": "low" | "medium" | "high",
    "trend": "improving" | "stable" | "worsening",
    "rationale": "one line explaining the score/trend from the vitals seen",
    "escalation": "what the new grad should do now (e.g. increase obs frequency, notify RN, call MET/rapid response)"
  },
  "redFlags": [ "signs of deterioration to escalate immediately" ],
  "newGradTips": [ "practical, encouraging tips for a new grad managing this patient" ],
  "safetyNotice": "one line reminding the nurse to verify with a senior/RN"
}

For every "monitoring"/"howToMonitor" field, be SPECIFIC and practical: state exactly what extra to observe, HOW to observe it, and the number/threshold that should trigger action. For "criticalActions", list only genuinely time-critical items (leave empty [] if none). For fields not documented, use "Not documented" (strings) or [] (arrays) rather than inventing details.
For "vitalsTimeline" and "medicationTimes": extract EVERY time-stamped observation and medication administration/scheduled time you can find across the documents, in chronological order. Leave a field as "" if not recorded. For "earlyWarning": base the trend on how the vitals change over time in the documents (e.g. rising HR/RR, falling SpO2/BP = worsening).`

  parts.push({ type: 'text', text: intro })

  const docs = patient.documents || []
  if (docs.length === 0) {
    parts.push({ type: 'text', text: 'NOTE: No documents were uploaded. Base your guidance ONLY on the patient context above and clearly flag the lack of documentation in redFlags and safetyNotice.' })
  }

  for (const doc of docs) {
    const label = `--- DOCUMENT: category="${doc.category}" name="${doc.name}" ---`
    parts.push({ type: 'text', text: label })
    if (doc.kind === 'text') {
      parts.push({ type: 'text', text: doc.textContent || '(empty)' })
    } else {
      const dataUrl = await resolveDocDataUrl(db, doc)
      if (!dataUrl) {
        parts.push({ type: 'text', text: `(File "${doc.name}" could not be loaded; skipped)` })
      } else if (doc.mimeType === 'application/pdf') {
        parts.push({ type: 'file', file: { filename: doc.name, file_data: dataUrl } })
      } else if (doc.mimeType && doc.mimeType.startsWith('image/')) {
        parts.push({ type: 'image_url', image_url: { url: dataUrl } })
      } else {
        parts.push({ type: 'text', text: `(Unsupported file type ${doc.mimeType}; skipped)` })
      }
    }
  }

  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: LLM_MODEL,
      temperature: 0.2,
      messages: [{ role: 'user', content: parts }],
    }),
  })

  const bodyText = await res.text()
  if (!res.ok) {
    console.error('LLM error', res.status, bodyText.slice(0, 500))
    throw new Error('AI service request failed')
  }

  let content = ''
  try {
    const parsed = JSON.parse(bodyText)
    content = parsed?.choices?.[0]?.message?.content || ''
  } catch (e) {
    throw new Error('Unexpected AI response')
  }

  let clean = content.trim()
  clean = clean.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
  const first = clean.indexOf('{')
  const last = clean.lastIndexOf('}')
  if (first !== -1 && last !== -1) clean = clean.slice(first, last + 1)

  let result
  try {
    result = JSON.parse(clean)
  } catch (e) {
    console.error('Parse fail', content.slice(0, 500))
    throw new Error('AI returned an unreadable result. Please try again.')
  }
  return result
}

// ---------- Sample scenario presets ----------
function applySamplePreset(patient, type, h, now) {
  if (type === 'sepsis') {
    patient.name = 'DEMO · Mrs. Rita Kaur'
    patient.bed = 'Bed 2'
    patient.age = '68'
    patient.diagnosis = 'Urosepsis; hypotension; on IV antibiotics and fluids'
    patient.documents[0].textContent = 'Query urosepsis. Cultures sent. IV Piperacillin-Tazobactam 4.5g QID (0600 1200 1800 2400). 1L Hartmanns stat then reassess. Hourly obs. Obs 0600 HR 108 BP 96/54 RR 24 SpO2 94% Temp 38.8. Obs 0900 HR 124 BP 84/48 RR 28 SpO2 92% Temp 39.4. Lactate 3.1. Reduced urine output.'
    patient.aiOutput = {
      patientSummary: '68-year-old woman with urosepsis. She is febrile, tachycardic and becoming hypotensive with a rising lactate — she meets sepsis criteria and needs the sepsis pathway now.',
      priorities: [
        { rank: 1, priority: 'Sepsis 6 / restore perfusion', rationale: 'Hypotension (84/48), tachycardia and lactate 3.1 indicate septic shock risk', urgency: 'urgent' },
        { rank: 2, priority: 'Timely IV antibiotics', rationale: 'Give prescribed antibiotics without delay after cultures', urgency: 'urgent' },
        { rank: 3, priority: 'Urine output & fluid status', rationale: 'Reduced output — monitor hourly, consider IDC and fluid balance', urgency: 'soon' },
      ],
      interventions: [
        { intervention: 'Escalate for MET/sepsis pathway; give O2 to keep SpO2 ≥ 94%', frequency: 'Now', monitoring: 'BP, HR, SpO2, GCS', rationale: 'Septic shock is time-critical' },
        { intervention: 'Give IV fluid bolus as prescribed and reassess', frequency: 'Stat then review', monitoring: 'BP, lactate, urine output', rationale: 'Restores perfusion' },
        { intervention: 'Administer IV antibiotics on time', frequency: '0600/1200/1800/2400', monitoring: 'Temp, allergy status', rationale: 'Source control of infection' },
      ],
      isbar: {
        identify: 'Mrs Rita Kaur, 68, Bed 2, RN [your name] calling.',
        situation: 'I am worried about sepsis — she is hypotensive and tachycardic.',
        background: 'Admitted with query urosepsis, on IV antibiotics and fluids.',
        assessment: 'HR 124, BP 84/48, RR 28, Temp 39.4, lactate 3.1, low urine output.',
        recommendation: 'Please attend now; I have started the sepsis pathway and need urgent review.',
      },
      medications: [
        { name: 'Piperacillin-Tazobactam', dose: '4.5g', route: 'IV', times: ['0600', '1200', '1800', '2400'], notes: 'Give on time; check allergies' },
        { name: 'Hartmann\'s solution', dose: '1L', route: 'IV', times: ['stat'], notes: 'Bolus then reassess' },
      ],
      medicationTimes: [
        { time: '0600', medication: 'Pip-Taz 4.5g IV', dose: '' },
        { time: '1200', medication: 'Pip-Taz 4.5g IV', dose: '' },
      ],
      careSchedule: [
        { time: 'Now', task: 'Escalate sepsis, oxygen, IV access x2, bloods & cultures', priority: 'urgent' },
        { time: 'Hourly', task: 'Vital signs and urine output', priority: 'urgent' },
        { time: '1200', task: 'Repeat lactate and reassess fluids', priority: 'soon' },
      ],
      vitalsTimeline: [
        { time: '0600', hr: '108', bp: '96/54', rr: '24', spo2: '94', temp: '38.8', notes: 'Febrile' },
        { time: '0900', hr: '124', bp: '84/48', rr: '28', spo2: '92', temp: '39.4', notes: 'Hypotensive, lactate 3.1' },
      ],
      earlyWarning: { score: '8', riskLevel: 'high', trend: 'worsening', rationale: 'Hypotension with tachycardia, fever and rising lactate', escalation: 'Activate MET / sepsis team immediately' },
      redFlags: ['Systolic BP < 90 or not responding to fluids', 'Lactate rising', 'New confusion', 'Urine output < 0.5 mL/kg/hr'],
      newGradTips: ['Think Sepsis 6: give 3, take 3.', 'Don\'t delay antibiotics waiting for everything else.', 'Escalate early — sepsis moves fast.'],
      safetyNotice: 'This is a demo. Always verify medications, doses and escalation with your senior/RN.',
    }
    patient.ewHistory = [ { t: h(3), score: 4, risk: 'medium', riskValue: 2 }, { t: h(1), score: 6, risk: 'high', riskValue: 3 }, { t: now, score: 8, risk: 'high', riskValue: 3 } ]
  } else if (type === 'postop') {
    patient.name = 'DEMO · Mr. Tom Fischer'
    patient.bed = 'Bed 9'
    patient.age = '54'
    patient.diagnosis = 'Day 1 post laparoscopic appendicectomy; stable, pain management'
    patient.documents[0].textContent = 'POD1 lap appendicectomy. Obs stable. Regular paracetamol 1g QID (0600 1200 1800 2400), oxycodone 5mg PRN pain. Encourage mobilisation, deep breathing, diet as tolerated. Obs 0600 HR 74 BP 122/76 RR 15 SpO2 98% Temp 36.8. Obs 1000 HR 78 BP 118/74 RR 14 SpO2 99% Temp 36.9. Pain 3/10.'
    patient.aiOutput = {
      patientSummary: '54-year-old man, day 1 after keyhole appendix surgery. He is comfortable and stable; the focus is good pain relief, early mobilising and watching for any post-op complications.',
      priorities: [
        { rank: 1, priority: 'Pain management', rationale: 'Good analgesia enables mobilising and recovery', urgency: 'soon' },
        { rank: 2, priority: 'Mobilisation & chest care', rationale: 'Prevents VTE and chest complications', urgency: 'routine' },
        { rank: 3, priority: 'Wound & diet progression', rationale: 'Monitor wound, advance diet as tolerated', urgency: 'routine' },
      ],
      interventions: [
        { intervention: 'Regular analgesia and reassess pain score', frequency: 'QID + PRN', monitoring: 'Pain score, sedation, bowels', rationale: 'Comfort and function' },
        { intervention: 'Assist to mobilise and deep-breathe', frequency: '3-4 hourly', monitoring: 'Tolerance, dizziness', rationale: 'Reduces VTE/atelectasis' },
        { intervention: 'Wound check and observe for infection', frequency: 'Each shift', monitoring: 'Redness, ooze, fever', rationale: 'Early detection' },
      ],
      isbar: {
        identify: 'Mr Tom Fischer, 54, Bed 9, RN [your name].',
        situation: 'Day 1 post appendicectomy, stable and comfortable.',
        background: 'Laparoscopic appendicectomy yesterday, no complications.',
        assessment: 'Obs stable, pain 3/10 with regular analgesia, mobilising with help.',
        recommendation: 'Continue current plan; will escalate if pain, fever or obs change.',
      },
      medications: [
        { name: 'Paracetamol', dose: '1g', route: 'PO', times: ['0600', '1200', '1800', '2400'], notes: 'Regular, max 4g/day' },
        { name: 'Oxycodone', dose: '5mg', route: 'PO', times: ['PRN'], notes: 'For breakthrough pain; watch sedation' },
      ],
      medicationTimes: [
        { time: '0600', medication: 'Paracetamol 1g', dose: '' },
        { time: '1200', medication: 'Paracetamol 1g', dose: '' },
      ],
      careSchedule: [
        { time: '0800', task: 'Analgesia, assist to shower & mobilise', priority: 'routine' },
        { time: '1000', task: 'Deep breathing exercises, encourage diet', priority: 'routine' },
        { time: '1400', task: 'Wound check and pain reassessment', priority: 'soon' },
      ],
      vitalsTimeline: [
        { time: '0600', hr: '74', bp: '122/76', rr: '15', spo2: '98', temp: '36.8', notes: 'Comfortable' },
        { time: '1000', hr: '78', bp: '118/74', rr: '14', spo2: '99', temp: '36.9', notes: 'Pain 3/10' },
      ],
      earlyWarning: { score: '0', riskLevel: 'low', trend: 'stable', rationale: 'All observations within normal limits and stable', escalation: 'Routine monitoring; escalate if pain, fever or obs change' },
      redFlags: ['Fever or wound redness/discharge', 'Increasing abdominal pain or distension', 'Persistent nausea/vomiting'],
      newGradTips: ['Stay ahead of pain with regular analgesia.', 'Early mobilising prevents clots and chest infections.', 'A calm shift is a great time to practise your ISBAR.'],
      safetyNotice: 'This is a demo. Always verify medications, doses and escalation with your senior/RN.',
    }
    patient.ewHistory = [ { t: h(3), score: 1, risk: 'low', riskValue: 1 }, { t: h(1), score: 0, risk: 'low', riskValue: 1 }, { t: now, score: 0, risk: 'low', riskValue: 1 } ]
  }
  // 'chf' keeps the default object already built
}

// ---------- Router ----------
async function handleRoute(request, { params }) {
  const { path = [] } = await params
  const seg = path
  const route = `/${seg.join('/')}`
  const method = request.method

  try {
    const db = await connectToMongo()

    if ((route === '/' || route === '/root') && method === 'GET') {
      return json({ message: 'NurseCare API running' })
    }

    // ---- Patients collection ----
    if (route === '/patients' && method === 'GET') {
      const patients = await db.collection('patients').find({}).sort({ createdAt: 1 }).toArray()
      return json(patients.map(({ _id, documents, ...rest }) => ({
        ...rest,
        documents: (documents || []).map((d) => ({ id: d.id, name: d.name, category: d.category, kind: d.kind, mimeType: d.mimeType })),
      })))
    }

    if (route === '/sample' && method === 'POST') {
      const count = await db.collection('patients').countDocuments()
      if (count >= MAX_PATIENTS) {
        return json({ error: `Patient load is full (max ${MAX_PATIENTS} patients). Discharge one first.` }, 400)
      }
      const now = new Date()
      const h = (n) => new Date(now.getTime() - n * 3600 * 1000)
      let sampleType = 'chf'
      try { const _b = await request.json(); if (_b && _b.type) sampleType = _b.type } catch {}
      const patient = {
        id: uuidv4(),
        name: 'DEMO · Mr. Alan Reid',
        bed: 'Bed 6',
        age: '79',
        diagnosis: 'Congestive heart failure exacerbation; Type 2 diabetes; monitoring for fluid overload',
        documents: [{
          id: uuidv4(), name: 'Care plan & obs (demo)', category: 'careplan', kind: 'text', mimeType: null, dataUrl: null,
          textContent: 'CHF exacerbation. Fluid restrict 1.5L/day, daily weights, strict fluid balance. Meds: Furosemide 40mg IV BD (0800, 1400), Metformin 500mg BD (0800, 1800), Enoxaparin 40mg SC (2000). Obs 0600 HR 88 BP 128/78 RR 20 SpO2 94% Temp 36.9. Obs 1000 HR 102 BP 112/70 RR 24 SpO2 91% Temp 37.2. Obs 1400 HR 116 BP 98/60 RR 28 SpO2 88% Temp 37.6. Increasing SOB, bilateral basal crackles.',
          uploadedAt: now,
        }],
        aiOutput: {
          patientSummary: '79-year-old man admitted with a heart-failure flare. Over the shift his heart and breathing rates have climbed while oxygen levels have fallen — a picture of worsening fluid overload that needs close watching.',
          priorities: [
            { rank: 1, priority: 'Respiratory support & oxygenation', rationale: 'SpO2 falling 94→88% with rising RR and crackles suggests pulmonary congestion', urgency: 'urgent' },
            { rank: 2, priority: 'Fluid balance & diuresis', rationale: 'Ensure furosemide given, monitor urine output, daily weight and strict fluid balance', urgency: 'soon' },
            { rank: 3, priority: 'Glycaemic monitoring', rationale: 'T2DM on metformin — check BGLs, watch for illness-related swings', urgency: 'routine' },
          ],
          interventions: [
            { intervention: 'Apply oxygen and sit upright; titrate to SpO2 ≥ 92%', frequency: 'Now, continuous', monitoring: 'SpO2, work of breathing, RR', rationale: 'Improves oxygenation and reduces preload' },
            { intervention: 'Administer prescribed IV furosemide and monitor response', frequency: '0800 & 1400', monitoring: 'Urine output, weight, K+', rationale: 'Reduces fluid overload' },
            { intervention: 'Half-hourly vital signs and escalate on trigger', frequency: 'Every 30 min', monitoring: 'HR, BP, RR, SpO2', rationale: 'Detects deterioration early' },
          ],
          isbar: {
            identify: 'Mr Alan Reid, 79, Bed 6, RN [your name] calling.',
            situation: 'Increasing shortness of breath with falling oxygen saturations this shift.',
            background: 'Admitted with CHF exacerbation; also has T2DM. On IV furosemide, fluid restricted.',
            assessment: 'HR 116, BP 98/60, RR 28, SpO2 88% on room air, bibasal crackles — appears fluid overloaded and hypoxic.',
            recommendation: 'Please review urgently; consider increasing diuresis and oxygen; would like a medical review now.',
          },
          medications: [
            { name: 'Furosemide', dose: '40mg', route: 'IV', times: ['0800', '1400'], notes: 'Monitor urine output and potassium' },
            { name: 'Metformin', dose: '500mg', route: 'PO', times: ['0800', '1800'], notes: 'Hold if unwell/for contrast' },
            { name: 'Enoxaparin', dose: '40mg', route: 'SC', times: ['2000'], notes: 'VTE prophylaxis' },
          ],
          medicationTimes: [
            { time: '0800', medication: 'Furosemide 40mg IV / Metformin 500mg', dose: '' },
            { time: '1400', medication: 'Furosemide 40mg IV', dose: '' },
            { time: '1800', medication: 'Metformin 500mg', dose: '' },
            { time: '2000', medication: 'Enoxaparin 40mg SC', dose: '' },
          ],
          careSchedule: [
            { time: '0800', task: 'Morning meds, weigh patient, commence fluid balance chart', priority: 'soon' },
            { time: 'Every 30 min', task: 'Vital signs while deteriorating', priority: 'urgent' },
            { time: '1200', task: 'Check blood glucose level', priority: 'routine' },
            { time: '1400', task: 'Second furosemide dose, reassess oedema & chest', priority: 'soon' },
            { time: 'End of shift', task: 'Update fluid balance total and handover', priority: 'routine' },
          ],
          vitalsTimeline: [
            { time: '0600', hr: '88', bp: '128/78', rr: '20', spo2: '94', temp: '36.9', notes: 'Baseline' },
            { time: '1000', hr: '102', bp: '112/70', rr: '24', spo2: '91', temp: '37.2', notes: 'Increasing SOB' },
            { time: '1400', hr: '116', bp: '98/60', rr: '28', spo2: '88', temp: '37.6', notes: 'Bibasal crackles' },
          ],
          earlyWarning: { score: '6', riskLevel: 'high', trend: 'worsening', rationale: 'Rising HR/RR with falling SpO2 and BP over the shift', escalation: 'Notify senior RN and request urgent medical review / consider MET criteria' },
          redFlags: ['SpO2 < 90% or ongoing fall', 'RR > 28 or increasing distress', 'Systolic BP < 90 mmHg', 'New confusion or chest pain'],
          newGradTips: ['Sit the patient up and get oxygen on early — it buys time.', 'Escalate on a trend, not just a single number.', 'Have your ISBAR ready before you call — it makes the review faster.'],
          safetyNotice: 'This is a demo. Always verify medications, doses and escalation with your senior/RN.',
        },
        aiGeneratedAt: now,
        careDone: {},
        ewHistory: [
          { t: h(4), score: 2, risk: 'low', riskValue: 1 },
          { t: h(2), score: 4, risk: 'medium', riskValue: 2 },
          { t: now, score: 6, risk: 'high', riskValue: 3 },
        ],
        isSample: true,
        createdAt: now,
      }
      applySamplePreset(patient, sampleType, h, now)
      await db.collection('patients').insertOne(patient)
      const { _id, ...clean } = patient
      return json(clean)
    }

    if (route === '/patients' && method === 'POST') {
      const count = await db.collection('patients').countDocuments()
      if (count >= MAX_PATIENTS) {
        return json({ error: `Patient load is full (max ${MAX_PATIENTS} patients per shift). Discharge a patient to add a new one.` }, 400)
      }
      const body = await request.json()
      if (!body.name || !body.name.trim()) {
        return json({ error: 'Patient name is required' }, 400)
      }
      const patient = {
        id: uuidv4(),
        name: body.name.trim(),
        bed: body.bed || '',
        age: body.age || '',
        diagnosis: body.diagnosis || '',
        documents: [],
        aiOutput: null,
        aiGeneratedAt: null,
        createdAt: new Date(),
      }
      await db.collection('patients').insertOne(patient)
      const { _id, ...clean } = patient
      return json(clean)
    }

    // ---- Single patient ----
    if (seg[0] === 'patients' && seg[1]) {
      const id = seg[1]
      const patient = await db.collection('patients').findOne({ id })
      if (!patient && !(seg.length === 2 && method === 'DELETE')) {
        return json({ error: 'Patient not found' }, 404)
      }

      // /patients/:id
      if (seg.length === 2) {
        if (method === 'GET') {
          const { _id, documents, ...rest } = patient
          // Strip heavy dataUrl blobs from the response; files are served via /documents/:docId/content
          const cleanDocs = (documents || []).map(({ dataUrl, ...d }) => ({
            ...d,
            hasFile: d.hasFile || (d.kind !== 'text' && (!!dataUrl || !!d.hasFile)),
          }))
          return json({ ...rest, documents: cleanDocs })
        }
        if (method === 'PUT') {
          const body = await request.json()
          const update = {}
          ;['name', 'bed', 'age', 'diagnosis', 'handoverNote'].forEach((k) => {
            if (body[k] !== undefined) update[k] = body[k]
          })
          if (body.handoverNote !== undefined) update.handoverNoteAt = new Date()
          if (body.careDone !== undefined) update.careDone = body.careDone
          await db.collection('patients').updateOne({ id }, { $set: update })
          const updated = await db.collection('patients').findOne({ id })
          const { _id, documents, ...rest } = updated
          const cleanDocs = (documents || []).map(({ dataUrl, ...d }) => ({ ...d, hasFile: d.hasFile || (d.kind !== 'text' && !!dataUrl) }))
          return json({ ...rest, documents: cleanDocs })
        }
        if (method === 'DELETE') {
          for (const d of patient.documents || []) { if (d.kind !== 'text') { try { await deleteFile(db, d.id) } catch {} } }
          await db.collection('patients').deleteOne({ id })
          return json({ success: true })
        }
      }

      // /patients/:id/documents  and /patients/:id/documents/:docId  and .../content
      if (seg[2] === 'documents') {
        if (seg.length === 3 && method === 'POST') {
          const body = await request.json()
          const incoming = Array.isArray(body.documents) ? body.documents : [body]
          const newDocs = []
          for (const d of incoming) {
            const docId = uuidv4()
            const kind = d.kind || (d.textContent ? 'text' : 'file')
            let hasFile = false
            // Store binary files in GridFS to keep the patient record small (avoids 16MB BSON limit)
            if (kind !== 'text' && d.dataUrl) {
              try {
                hasFile = await storeFile(db, docId, id, d.dataUrl, d.mimeType)
              } catch (e) {
                console.error('storeFile error', e?.message)
                return json({ error: 'Could not store the uploaded file. Please try a smaller file.' }, 500)
              }
            }
            newDocs.push({
              id: docId,
              name: d.name || 'Untitled',
              category: d.category || 'other',
              kind,
              mimeType: d.mimeType || null,
              dataUrl: null, // never embed big blobs in the patient document
              hasFile,
              textContent: d.textContent || null,
              uploadedAt: new Date(),
            })
          }
          await db.collection('patients').updateOne(
            { id },
            { $push: { documents: { $each: newDocs } } }
          )
          const updated = await db.collection('patients').findOne({ id })
          const { _id, documents, ...rest } = updated
          const cleanDocs = (documents || []).map(({ dataUrl, ...doc }) => ({ ...doc, hasFile: doc.hasFile || (doc.kind !== 'text' && !!dataUrl) }))
          return json({ ...rest, documents: cleanDocs })
        }
        // GET .../documents/:docId/content -> stream the file bytes
        if (seg.length === 5 && seg[4] === 'content' && method === 'GET') {
          const docId = seg[3]
          const doc = (patient.documents || []).find((d) => d.id === docId)
          let buffer, mime
          if (doc?.dataUrl) {
            const parsed = dataUrlToBuffer(doc.dataUrl)
            if (parsed) { buffer = parsed.buffer; mime = doc.mimeType || parsed.mime }
          }
          if (!buffer) {
            const f = await readFile(db, docId)
            if (f) { buffer = f.buffer; mime = doc?.mimeType || f.mime }
          }
          if (!buffer) return json({ error: 'File not found' }, 404)
          const res = new NextResponse(buffer, {
            status: 200,
            headers: {
              'Content-Type': mime || 'application/octet-stream',
              'Content-Disposition': `inline; filename="${(doc?.name || 'document').replace(/"/g, '')}"`,
              'Cache-Control': 'private, max-age=3600',
            },
          })
          return handleCORS(res)
        }
        if (seg.length === 4 && method === 'DELETE') {
          const docId = seg[3]
          try { await deleteFile(db, docId) } catch {}
          await db.collection('patients').updateOne(
            { id },
            { $pull: { documents: { id: docId } } }
          )
          const updated = await db.collection('patients').findOne({ id })
          const { _id, documents, ...rest } = updated
          const cleanDocs = (documents || []).map(({ dataUrl, ...doc }) => ({ ...doc, hasFile: doc.hasFile || (doc.kind !== 'text' && !!dataUrl) }))
          return json({ ...rest, documents: cleanDocs })
        }
      }

      // /patients/:id/generate
      if (seg[2] === 'generate' && seg.length === 3 && method === 'POST') {
        const result = await generateNursingCare(patient, db)
        const generatedAt = new Date()
        const prevHist = Array.isArray(patient.ewHistory) ? patient.ewHistory : []
        const ew = result.earlyWarning || {}
        const sm = String(ew.score ?? '').match(/-?\d+(\.\d+)?/)
        const scoreNum = sm ? parseFloat(sm[0]) : null
        const riskValue = ew.riskLevel === 'high' ? 3 : ew.riskLevel === 'medium' ? 2 : ew.riskLevel === 'low' ? 1 : 0
        const ewHistory = [...prevHist, { t: generatedAt, score: scoreNum, risk: ew.riskLevel || null, riskValue }].slice(-20)
        await db.collection('patients').updateOne(
          { id },
          { $set: { aiOutput: result, aiGeneratedAt: generatedAt, careDone: {}, ewHistory } }
        )
        return json({ aiOutput: result, aiGeneratedAt: generatedAt })
      }

      // /patients/:id/worsen -> simulate deterioration for training (bumps EWS + appends ewHistory)
      if (seg[2] === 'worsen' && seg.length === 3 && method === 'POST') {
        const ai = patient.aiOutput || {}
        const ew = { ...(ai.earlyWarning || {}) }
        const curScore = (() => { const m = String(ew.score ?? '').match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : 0 })()
        const nextScore = Math.min(curScore + 2, 14)
        const nextRisk = nextScore >= 7 ? 'high' : nextScore >= 4 ? 'medium' : 'low'
        ew.score = String(nextScore)
        ew.riskLevel = nextRisk
        ew.trend = 'worsening'
        ew.rationale = 'Simulated deterioration: observations trending worse this shift.'
        ew.escalation = nextRisk === 'high' ? 'Escalate now — notify senior RN and consider a MET/Rapid Response call.' : 'Increase observation frequency and inform the team.'
        const newAi = { ...ai, earlyWarning: ew }
        const generatedAt = new Date()
        const prevHist = Array.isArray(patient.ewHistory) ? patient.ewHistory : []
        const riskValue = nextRisk === 'high' ? 3 : nextRisk === 'medium' ? 2 : 1
        const ewHistory = [...prevHist, { t: generatedAt, score: nextScore, risk: nextRisk, riskValue }].slice(-20)
        await db.collection('patients').updateOne(
          { id },
          { $set: { aiOutput: newAi, aiGeneratedAt: generatedAt, ewHistory } }
        )
        return json({ aiOutput: newAi, aiGeneratedAt: generatedAt })
      }

      // /patients/:id/improve -> simulate recovery for training (lowers EWS + appends ewHistory)
      if (seg[2] === 'improve' && seg.length === 3 && method === 'POST') {
        const ai = patient.aiOutput || {}
        const ew = { ...(ai.earlyWarning || {}) }
        const curScore = (() => { const m = String(ew.score ?? '').match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : 0 })()
        const nextScore = Math.max(curScore - 2, 0)
        const nextRisk = nextScore >= 7 ? 'high' : nextScore >= 4 ? 'medium' : 'low'
        ew.score = String(nextScore)
        ew.riskLevel = nextRisk
        ew.trend = nextScore === 0 ? 'stable' : 'improving'
        ew.rationale = 'Simulated recovery: observations trending back toward normal this shift.'
        ew.escalation = nextRisk === 'high' ? 'Still high — keep close observation and inform the team.' : nextRisk === 'medium' ? 'Improving — continue current plan and monitor.' : 'Within normal limits — routine observations.'
        const newAi = { ...ai, earlyWarning: ew }
        const generatedAt = new Date()
        const prevHist = Array.isArray(patient.ewHistory) ? patient.ewHistory : []
        const riskValue = nextRisk === 'high' ? 3 : nextRisk === 'medium' ? 2 : 1
        const ewHistory = [...prevHist, { t: generatedAt, score: nextScore, risk: nextRisk, riskValue }].slice(-20)
        await db.collection('patients').updateOne(
          { id },
          { $set: { aiOutput: newAi, aiGeneratedAt: generatedAt, ewHistory } }
        )
        return json({ aiOutput: newAi, aiGeneratedAt: generatedAt })
      }
    }

    return json({ error: `Route ${route} not found` }, 404)
  } catch (error) {
    console.error('API Error:', error)
    return json({ error: error.message || 'Internal server error' }, 500)
  }
}

export const GET = handleRoute
export const POST = handleRoute
export const PUT = handleRoute
export const DELETE = handleRoute
export const PATCH = handleRoute
