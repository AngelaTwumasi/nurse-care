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
Analyse ALL of the attached patient documents (care plan, medication chart, vital signs, allied health notes and other documents) for the following patient and produce a practical, shift-ready nursing care guide.

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
      return json(patients.map(({ _id, ...rest }) => rest))
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
        await db.collection('patients').updateOne(
          { id },
          { $set: { aiOutput: result, aiGeneratedAt: generatedAt } }
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
