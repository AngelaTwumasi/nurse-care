// Shared client-side helpers & constants for NurseCare (extracted from page.js).
import {
  ClipboardList, Pill, Activity, UserRound, Dumbbell, Apple, HeartPulse, FileText,
} from 'lucide-react'
import { enqueueOp } from '@/app/offline-queue'

const HERO_IMG = 'https://images.pexels.com/photos/4021772/pexels-photo-4021772.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940'

const CATEGORIES = {
  careplan: { label: 'Care Plan', icon: ClipboardList, color: 'text-teal-600' },
  medication: { label: 'Medications', icon: Pill, color: 'text-fuchsia-600' },
  vitals: { label: 'Vital Signs', icon: Activity, color: 'text-rose-600' },
  doctor: { label: 'Doctor Notes', icon: UserRound, color: 'text-blue-600' },
  physiotherapist: { label: 'Physiotherapist', icon: Dumbbell, color: 'text-orange-600' },
  nutritionist: { label: 'Nutritionist / Dietitian', icon: Apple, color: 'text-green-600' },
  allied_health: { label: 'Allied Health (other)', icon: HeartPulse, color: 'text-indigo-600' },
  other: { label: 'Other Documents', icon: FileText, color: 'text-slate-600' },
}

const MAX_PATIENTS = 10

async function api(path, opts = {}) {
  const { queueOnFail, label, ...fetchOpts } = opts
  const method = (fetchOpts.method || 'GET').toUpperCase()
  // If a write is marked queueable and we're offline, stash it for later instead of failing.
  if (queueOnFail && typeof navigator !== 'undefined' && !navigator.onLine) {
    await enqueueOp({ path, method, body: fetchOpts.body, label })
    return { _queued: true }
  }
  try {
    const res = await fetch(`/api${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...fetchOpts,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Request failed')
    return data
  } catch (e) {
    // Network error (fetch throws TypeError) on a queueable write -> queue it.
    if (queueOnFail && (e.name === 'TypeError' || (typeof navigator !== 'undefined' && !navigator.onLine))) {
      await enqueueOp({ path, method, body: fetchOpts.body, label })
      return { _queued: true }
    }
    throw e
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// Downscale large images (e.g. full-res phone photos) so the AI can reliably read them and storage stays small
function resizeImageDataUrl(dataUrl, maxDim = 1600, quality = 0.85) {
  return new Promise((resolve) => {
    try {
      const img = document.createElement('img')
      img.onload = () => {
        let { width, height } = img
        if (!width || !height) { resolve(dataUrl); return }
        if (Math.max(width, height) > maxDim) {
          const scale = maxDim / Math.max(width, height)
          width = Math.round(width * scale)
          height = Math.round(height * scale)
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        canvas.getContext('2d').drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.onerror = () => resolve(dataUrl)
      img.src = dataUrl
    } catch { resolve(dataUrl) }
  })
}

// Convert a File to an upload-ready document (images are downscaled & re-encoded as JPEG)
async function fileToDoc(file, category) {
  const dataUrl = await fileToDataUrl(file)
  if (file.type && file.type.startsWith('image/')) {
    const resized = await resizeImageDataUrl(dataUrl)
    return { name: file.name, category, kind: 'file', mimeType: 'image/jpeg', dataUrl: resized }
  }
  return { name: file.name, category, kind: 'file', mimeType: file.type, dataUrl }
}

// Upload a single document with real upload-progress reporting (XHR — fetch has no upload progress).
// When offline (or the network drops mid-upload) a queueable doc is stashed in the offline queue
// and replayed automatically on reconnect. Resolves {_queued:true} in that case.
function uploadDocument(patientId, doc, onProgress, meta = {}) {
  const { queueOnFail, label } = meta
  const body = JSON.stringify({ documents: [doc] })
  if (queueOnFail && typeof navigator !== 'undefined' && !navigator.onLine) {
    return enqueueOp({ path: `/patients/${patientId}/documents`, method: 'POST', body, label })
      .then(() => ({ _queued: true }))
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api/patients/${patientId}/documents`)
    xhr.setRequestHeader('Content-Type', 'application/json')
    xhr.timeout = 120000 // 2 min — don't hang forever on a stalled upload
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      let data = {}
      try { data = JSON.parse(xhr.responseText) } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(data)
      else reject(new Error(data.error || 'Upload failed'))
    }
    const onFail = () => {
      if (queueOnFail) {
        enqueueOp({ path: `/patients/${patientId}/documents`, method: 'POST', body, label })
          .then(() => resolve({ _queued: true }))
          .catch(() => reject(new Error('Network error during upload')))
      } else {
        reject(new Error('Network error during upload'))
      }
    }
    xhr.onerror = onFail
    xhr.ontimeout = onFail
    xhr.send(body)
  })
}

function timeAgo(dateStr) {
  if (!dateStr) return null
  const s = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}m ago`
  return `${Math.floor(h / 24)}d ago`
}
function isStale(dateStr, hours = 4) {
  if (!dateStr) return false
  return Date.now() - new Date(dateStr).getTime() > hours * 3600 * 1000
}
function parseClock(str) {
  if (!str) return null
  const m = String(str).match(/\b(\d{1,2}):?(\d{2})\b/)
  if (!m) return null
  const h = parseInt(m[1], 10), mn = parseInt(m[2], 10)
  if (h > 23 || mn > 59) return null
  return h * 60 + mn
}
function dueStatus(timeStr) {
  const t = parseClock(timeStr)
  if (t == null) return null
  const now = new Date()
  const cur = now.getHours() * 60 + now.getMinutes()
  const delta = t - cur
  if (delta < 0 && delta >= -120) return 'overdue'
  if (delta >= 0 && delta <= 60) return 'soon'
  return null
}

export {
  HERO_IMG, CATEGORIES, MAX_PATIENTS, api, fileToDataUrl, resizeImageDataUrl,
  fileToDoc, uploadDocument, timeAgo, isStale, parseClock, dueStatus,
}
