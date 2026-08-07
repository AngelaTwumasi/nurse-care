import { MongoClient } from 'mongodb'
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
async function generateNursingCare(patient) {
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
  "priorities": [ { "rank": 1, "priority": "short title", "rationale": "why this matters now", "urgency": "urgent" | "soon" | "routine" } ],
  "interventions": [ { "intervention": "what to do", "frequency": "how often / timing", "monitoring": "what to watch for", "rationale": "why" } ],
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
    } else if (doc.mimeType === 'application/pdf') {
      parts.push({ type: 'file', file: { filename: doc.name, file_data: doc.dataUrl } })
    } else if (doc.mimeType && doc.mimeType.startsWith('image/')) {
      parts.push({ type: 'image_url', image_url: { url: doc.dataUrl } })
    } else {
      parts.push({ type: 'text', text: `(Unsupported file type ${doc.mimeType}; skipped)` })
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
          const { _id, ...clean } = patient
          return json(clean)
        }
        if (method === 'PUT') {
          const body = await request.json()
          const update = {}
          ;['name', 'bed', 'age', 'diagnosis'].forEach((k) => {
            if (body[k] !== undefined) update[k] = body[k]
          })
          if (body.careDone !== undefined) update.careDone = body.careDone
          await db.collection('patients').updateOne({ id }, { $set: update })
          const updated = await db.collection('patients').findOne({ id })
          const { _id, ...clean } = updated
          return json(clean)
        }
        if (method === 'DELETE') {
          await db.collection('patients').deleteOne({ id })
          return json({ success: true })
        }
      }

      // /patients/:id/documents  and /patients/:id/documents/:docId
      if (seg[2] === 'documents') {
        if (seg.length === 3 && method === 'POST') {
          const body = await request.json()
          const incoming = Array.isArray(body.documents) ? body.documents : [body]
          const newDocs = incoming.map((d) => ({
            id: uuidv4(),
            name: d.name || 'Untitled',
            category: d.category || 'other',
            kind: d.kind || (d.textContent ? 'text' : 'file'),
            mimeType: d.mimeType || null,
            dataUrl: d.dataUrl || null,
            textContent: d.textContent || null,
            uploadedAt: new Date(),
          }))
          await db.collection('patients').updateOne(
            { id },
            { $push: { documents: { $each: newDocs } } }
          )
          const updated = await db.collection('patients').findOne({ id })
          const { _id, ...clean } = updated
          return json(clean)
        }
        if (seg.length === 4 && method === 'DELETE') {
          const docId = seg[3]
          await db.collection('patients').updateOne(
            { id },
            { $pull: { documents: { id: docId } } }
          )
          const updated = await db.collection('patients').findOne({ id })
          const { _id, ...clean } = updated
          return json(clean)
        }
      }

      // /patients/:id/generate
      if (seg[2] === 'generate' && seg.length === 3 && method === 'POST') {
        const result = await generateNursingCare(patient)
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
