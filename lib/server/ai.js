import { resolveDocDataUrl } from './db'
import { MAX_PATIENTS, LLM_MODEL } from './constants'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { promises as fs } from 'fs'
import { existsSync } from 'fs'
import os from 'os'
import path from 'path'
import { randomUUID } from 'crypto'
import ffmpegPathRaw from 'ffmpeg-static'

const execFileAsync = promisify(execFile)

// Recognise audio even when the browser/OS reports an odd or missing MIME type
// (e.g. m4a as video/mp4 or application/octet-stream, or no type at all).
const AUDIO_EXT_RE = /\.(mp3|m4a|mp4a|wav|wave|ogg|oga|opus|aac|flac|webm|aiff|aif|aifc|3gp|3gpp|amr|wma|caf)$/i
function isAudioLike(name, mimeType) {
  const mt = (mimeType || '').toLowerCase()
  if (mt.startsWith('audio/')) return true
  // m4a/aac recordings are frequently mislabelled as video/mp4 by browsers
  if (mt === 'video/mp4' || mt === 'video/quicktime') return true
  if (AUDIO_EXT_RE.test(name || '')) return true
  return false
}

// Next.js/webpack can rewrite the ffmpeg-static path into the .next bundle dir (which doesn't
// contain the binary). Always prefer the real node_modules binary that we know exists on disk.
function resolveFfmpeg() {
  const direct = path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg')
  if (existsSync(direct)) return direct
  if (ffmpegPathRaw && !ffmpegPathRaw.includes('.next') && existsSync(ffmpegPathRaw)) return ffmpegPathRaw
  // last-resort: rely on ffmpeg being on PATH
  return 'ffmpeg'
}

// Normalize any audio (webm/opus, m4a, mp3, ogg, wav...) to mono 16kHz WAV base64.
// The OpenAI-compatible gateway reliably accepts wav/mp3, so we always convert to wav.
async function audioToWavBase64(buffer) {
  const ffmpeg = resolveFfmpeg()
  if (!ffmpeg) throw new Error('ffmpeg unavailable')
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nc-audio-'))
  const inPath = path.join(dir, `in-${randomUUID()}`)
  const outPath = path.join(dir, 'out.wav')
  try {
    await fs.writeFile(inPath, buffer)
    await execFileAsync(ffmpeg, ['-y', '-i', inPath, '-ac', '1', '-ar', '16000', '-f', 'wav', outPath], { timeout: 90000, maxBuffer: 1024 * 1024 * 64 })
    const wav = await fs.readFile(outPath)
    return wav.toString('base64')
  } finally {
    fs.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

// Transcribe an audio recording (spoken handover / dictated care plan) with Gemini 2.5 Pro.
// Accepts a data: URL or raw base64. Returns the transcript text ('' on failure).
async function transcribeAudio(dataUrl) {
  if (!dataUrl) return ''
  const b64 = String(dataUrl).includes(',') ? String(dataUrl).split(',')[1] : String(dataUrl)
  const buf = Buffer.from(b64 || '', 'base64')
  if (!buf.length) return ''
  const wavB64 = await audioToWavBase64(buf)
  const parts = [
    { type: 'text', text: 'This is an audio recording from a hospital ward — a spoken nursing handover or a dictated care plan / notes. Transcribe it ACCURATELY and VERBATIM into clear written English. Do NOT invent content. Output ONLY the transcript text, with no preamble or commentary.' },
    { type: 'input_audio', input_audio: { data: wavB64, format: 'wav' } },
  ]
  const text = await callLLM(parts, { json: false })
  return (text || '').trim()
}

async function callLLM(parts, { json = true } = {}) {
  const KEY = process.env.EMERGENT_LLM_KEY
  const BASE = process.env.EMERGENT_LLM_BASE_URL
  if (!KEY || !BASE) throw new Error('LLM not configured')
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: LLM_MODEL, temperature: 0.1, messages: [{ role: 'user', content: parts }] }),
  })
  const bodyText = await res.text()
  if (!res.ok) {
    console.error('LLM error', res.status, bodyText.slice(0, 500))
    if (/no pages|process input image|INVALID_ARGUMENT/i.test(bodyText) && /image|document/i.test(bodyText)) {
      throw new Error('One of the uploaded images could not be read by the AI. Please upload a clearer, well-lit photo (or a PDF).')
    }
    throw new Error('AI service request failed')
  }
  let content = ''
  try { content = JSON.parse(bodyText).choices?.[0]?.message?.content || '' } catch { content = bodyText }
  if (!json) return content
  const m = content.match(/\{[\s\S]*\}/)
  return JSON.parse(m ? m[0] : content)
}

// Build LLM content parts from raw request documents (dataUrl embedded)
function docsToParts(documents) {
  const parts = []
  for (const doc of documents || []) {
    parts.push({ type: 'text', text: `--- DOCUMENT: category="${doc.category || 'other'}" name="${doc.name || 'file'}" ---` })
    if (doc.kind === 'text' || (!doc.dataUrl && doc.textContent)) {
      parts.push({ type: 'text', text: doc.textContent || '(empty)' })
    } else if (doc.dataUrl) {
      const isImage = (doc.mimeType || '').startsWith('image/') || doc.dataUrl.startsWith('data:image/')
      const isPdf = doc.mimeType === 'application/pdf' || doc.dataUrl.startsWith('data:application/pdf')
      if (isImage) parts.push({ type: 'image_url', image_url: { url: doc.dataUrl } })
      else if (isPdf) parts.push({ type: 'file', file: { filename: doc.name, file_data: doc.dataUrl } })
    }
  }
  return parts
}

// Detect how many patients a handover/allocation sheet contains (1..4)
async function identifyPatients(documents) {
  const parts = [{
    type: 'text',
    text: `You are reading a nursing handover / shift ALLOCATION sheet. It may describe ONE patient OR SEVERAL patients (a nurse's patient load, usually up to 10).
Identify each DISTINCT patient in the document(s).
Return ONLY valid JSON (no markdown): {"patients": [{"name": "", "bed": "", "age": "", "diagnosis": ""}]}.
Rules:
- One object per distinct patient, in the order they appear.
- Maximum 10 patients.
- If a field is not shown, use "" (empty string). If no name is given, use the bed like "Bed 12" or "Patient 1".
- "diagnosis" = the primary problem / reason for admission if visible.
- If there is clearly only ONE patient, return exactly one object.`,
  }, ...docsToParts(documents)]
  const out = await callLLM(parts)
  let list = Array.isArray(out.patients) ? out.patients : []
  return list.slice(0, MAX_PATIENTS).map((p) => ({
    name: (p.name || '').toString().trim() || 'Unnamed',
    bed: (p.bed || '').toString().trim(),
    age: (p.age || '').toString().trim(),
    diagnosis: (p.diagnosis || '').toString().trim(),
  }))
}

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
${patient.focusHint ? `\nIMPORTANT — MULTI-PATIENT DOCUMENT: The attached document(s) may list SEVERAL patients (a shift allocation/handover sheet). Generate this care plan for ONE patient ONLY: ${patient.focusHint}. Use ONLY the section(s) that belong to this patient and IGNORE all other patients on the sheet.` : ''}

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
  "abbreviations": [ { "abbr": "the medical abbreviation/acronym EXACTLY as written in the documents", "meaning": "the full term, plus a short plain-English explanation a new grad can understand" } ],
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
      const mt = (doc.mimeType || '').toLowerCase()
      const isAudio = isAudioLike(doc.name, doc.mimeType)
      // Audio recordings: feed the transcript (made at upload). If missing, transcribe now.
      if (isAudio || doc.transcript) {
        let transcript = doc.transcript
        if (!transcript) {
          try { transcript = await transcribeAudio(await resolveDocDataUrl(db, doc)) } catch (e) { console.error('gen transcribe', e?.message) }
        }
        parts.push({ type: 'text', text: transcript ? `[AUDIO RECORDING TRANSCRIPT]\n${transcript}` : `(Audio recording "${doc.name}" could not be transcribed; skipped)` })
        continue
      }
      const dataUrl = await resolveDocDataUrl(db, doc)
      const isImage = mt.startsWith('image/') || (dataUrl || '').startsWith('data:image/')
      const isPdf = mt === 'application/pdf' || (dataUrl || '').startsWith('data:application/pdf')
      if (!dataUrl) {
        parts.push({ type: 'text', text: `(File "${doc.name}" could not be loaded; skipped)` })
      } else if (isImage) {
        parts.push({ type: 'image_url', image_url: { url: dataUrl } })
      } else if (isPdf) {
        parts.push({ type: 'file', file: { filename: doc.name, file_data: dataUrl } })
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

export { callLLM, docsToParts, identifyPatients, generateNursingCare, transcribeAudio, isAudioLike }
