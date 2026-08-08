import { v4 as uuidv4 } from 'uuid'
import { NextResponse } from 'next/server'
import { connectToMongo, storeFile, readFile, deleteFile, dataUrlToBuffer } from '@/lib/server/db'
import { identifyPatients, generateNursingCare, transcribeAudio } from '@/lib/server/ai'
import { buildSamplePatient } from '@/lib/server/samples'
import { MAX_PATIENTS } from '@/lib/server/constants'
import { SESSION_COOKIE, sessionCookieOptions, exchangeEmergentSession, createSession, getUserFromRequest, destroySession, publicUser } from '@/lib/server/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

    // ---- Auth (public) ----
    if (route === '/auth/exchange' && method === 'POST') {
      const { session_id } = await request.json().catch(() => ({}))
      if (!session_id) return json({ error: 'Missing session_id' }, 400)
      try {
        const emergent = await exchangeEmergentSession(session_id)
        const { user, sessionToken } = await createSession(db, emergent)
        const res = handleCORS(NextResponse.json({ user: publicUser(user) }))
        res.cookies.set(SESSION_COOKIE, sessionToken, sessionCookieOptions())
        return res
      } catch (e) {
        console.error('auth exchange', e.message)
        return json({ error: 'Login failed — please try signing in again.' }, 401)
      }
    }
    if (route === '/auth/logout' && method === 'POST') {
      await destroySession(request, db)
      const res = handleCORS(NextResponse.json({ ok: true }))
      res.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions(), maxAge: 0, expires: new Date(0) })
      return res
    }
    if (route === '/auth/me' && method === 'GET') {
      const u = await getUserFromRequest(request, db)
      return json({ user: publicUser(u) })
    }

    // ---- Everything below requires a signed-in nurse (per-user data isolation) ----
    const user = await getUserFromRequest(request, db)
    if (!user) return json({ error: 'Unauthorized' }, 401)
    const ownerId = user.id

    // ---- Patients collection ----
    if (route === '/patients' && method === 'GET') {
      const patients = await db.collection('patients').find({ ownerId }).sort({ createdAt: 1 }).toArray()
      return json(patients.map(({ _id, documents, ...rest }) => ({
        ...rest,
        documents: (documents || []).map((d) => ({ id: d.id, name: d.name, category: d.category, kind: d.kind, mimeType: d.mimeType })),
      })))
    }

    if (route === '/sample' && method === 'POST') {
      const count = await db.collection('patients').countDocuments({ ownerId })
      if (count >= MAX_PATIENTS) {
        return json({ error: `Patient load is full (max ${MAX_PATIENTS} patients). Discharge one first.` }, 400)
      }
      let sampleType = 'chf'
      try { const _b = await request.json(); if (_b && _b.type) sampleType = _b.type } catch {}
      const patient = buildSamplePatient(sampleType)
      patient.ownerId = ownerId
      await db.collection('patients').insertOne(patient)
      const { _id, ...clean } = patient
      return json(clean)
    }

    if (route === '/patients' && method === 'POST') {
      const count = await db.collection('patients').countDocuments({ ownerId })
      if (count >= MAX_PATIENTS) {
        return json({ error: `Patient load is full (max ${MAX_PATIENTS} patients per shift). Discharge a patient to add a new one.` }, 400)
      }
      const body = await request.json()
      if (!body.name || !body.name.trim()) {
        return json({ error: 'Patient name is required' }, 400)
      }
      const patient = {
        id: uuidv4(),
        ownerId,
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

    // ---- Ingest: detect 1..4 patients from an uploaded sheet, create them, attach docs ----
    if (route === '/ingest' && method === 'POST') {
      const body = await request.json()
      const documents = Array.isArray(body.documents) ? body.documents : []
      if (!documents.length) return json({ error: 'No documents provided' }, 400)
      const existing = await db.collection('patients').countDocuments({ ownerId })
      const slots = MAX_PATIENTS - existing
      if (slots <= 0) return json({ error: `Patient load is full (max ${MAX_PATIENTS} patients). Discharge a patient first.` }, 400)

      let detected
      try {
        detected = await identifyPatients(documents)
      } catch (e) {
        return json({ error: e.message || 'Could not read the uploaded document' }, 400)
      }
      if (!detected.length) detected = [{ name: 'Unnamed', bed: '', age: '', diagnosis: '' }]
      const multi = detected.length > 1
      const toCreate = detected.slice(0, slots)
      const created = []
      for (const d of toCreate) {
        const pid = uuidv4()
        const docsMeta = []
        for (const doc of documents) {
          const docId = uuidv4()
          const kind = doc.kind || (doc.textContent ? 'text' : 'file')
          let hasFile = false
          if (kind !== 'text' && doc.dataUrl) {
            const _b64 = String(doc.dataUrl).split(',')[1] || ''
            if (Math.floor(_b64.length * 3 / 4) > 30 * 1024 * 1024) {
              return json({ error: 'A document is too large (max 30MB).' }, 413)
            }
            try { hasFile = await storeFile(db, docId, pid, doc.dataUrl, doc.mimeType) } catch (e) { console.error('ingest storeFile', e?.message) }
          }
          docsMeta.push({ id: docId, name: doc.name || 'Untitled', category: doc.category || 'other', kind, mimeType: doc.mimeType || null, dataUrl: null, hasFile, textContent: doc.textContent || null, uploadedAt: new Date() })
        }
        const patient = {
          id: pid,
          ownerId,
          name: d.name || 'Unnamed',
          bed: d.bed || '',
          age: d.age || '',
          diagnosis: d.diagnosis || '',
          focusHint: multi ? `${d.name || 'this patient'}${d.bed ? ' (bed ' + d.bed + ')' : ''}${d.diagnosis ? ' — ' + d.diagnosis : ''}` : null,
          documents: docsMeta,
          aiOutput: null,
          aiGeneratedAt: null,
          createdAt: new Date(),
        }
        await db.collection('patients').insertOne(patient)
        const { _id, documents: dd, ...rest } = patient
        created.push({ ...rest, documents: dd.map(({ dataUrl, ...x }) => x) })
      }
      return json({ patients: created, detectedCount: detected.length, created: created.length, truncated: detected.length > created.length })
    }
    if (seg[0] === 'patients' && seg[1]) {
      const id = seg[1]
      const patient = await db.collection('patients').findOne({ id, ownerId })
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
          for (const d of (patient?.documents || [])) { if (d.kind !== 'text') { try { await deleteFile(db, d.id) } catch {} } }
          await db.collection('patients').deleteOne({ id, ownerId })
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
              // SEC-003: enforce a server-side size cap (client checks can be bypassed).
              const b64 = String(d.dataUrl).split(',')[1] || ''
              const approxBytes = Math.floor(b64.length * 3 / 4)
              if (approxBytes > 30 * 1024 * 1024) {
                return json({ error: 'File is too large (max 30MB).' }, 413)
              }
              try {
                hasFile = await storeFile(db, docId, id, d.dataUrl, d.mimeType)
              } catch (e) {
                console.error('storeFile error', e?.message)
                return json({ error: 'Could not store the uploaded file. Please try a smaller file.' }, 500)
              }
            }
            // Audio recordings (voice handover / dictated care plan): transcribe with Gemini so
            // the spoken content can be read in the viewer AND fed into the care plan.
            let transcript = null
            const isAudio = (d.mimeType || '').toLowerCase().startsWith('audio/')
            if (kind !== 'text' && isAudio && d.dataUrl) {
              try { transcript = await transcribeAudio(d.dataUrl) } catch (e) { console.error('transcribeAudio', e?.message) }
            }
            newDocs.push({
              id: docId,
              name: d.name || 'Untitled',
              category: d.category || 'other',
              kind,
              mimeType: d.mimeType || null,
              dataUrl: null, // never embed big blobs in the patient document
              hasFile,
              textContent: d.textContent || transcript || null,
              transcript,
              transcribedAt: transcript ? new Date() : null,
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
          // SEC-002: only serve known-safe types inline; anything else is forced to download
          // as an opaque octet-stream so a crafted "document" cannot execute in the browser.
          const safeMime = (mime || '').toLowerCase()
          const inlineOk = safeMime.startsWith('image/') || safeMime.startsWith('audio/') || safeMime === 'application/pdf'
          const res = new NextResponse(buffer, {
            status: 200,
            headers: {
              'Content-Type': inlineOk ? safeMime : 'application/octet-stream',
              'Content-Disposition': `${inlineOk ? 'inline' : 'attachment'}; filename="${(doc?.name || 'document').replace(/[^\w.\- ]/g, '_')}"`,
              'X-Content-Type-Options': 'nosniff',
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
