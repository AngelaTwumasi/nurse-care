// Lightweight IndexedDB-backed offline mutation queue for NurseCare PWA.
// Queues safe write operations (notes, obs, handover notes, care toggles, rename)
// while offline and replays them in order when the device reconnects.
// No external dependencies — plain IndexedDB. All functions are client-side only.

const DB_NAME = 'nursecare-sync'
const STORE = 'queue'
const CHANGE_EVENT = 'nursecare-sync-change'

function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return }
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx(db, mode) {
  return db.transaction(STORE, mode).objectStore(STORE)
}

function emitChange() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
  }
}

export async function enqueueOp({ path, method, body, label }) {
  try {
    const db = await openDB()
    const op = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      path,
      method: (method || 'POST').toUpperCase(),
      body: body || null,
      label: label || `${method} ${path}`,
      ts: Date.now(),
    }
    await new Promise((resolve, reject) => {
      const r = tx(db, 'readwrite').add(op)
      r.onsuccess = () => resolve()
      r.onerror = () => reject(r.error)
    })
    db.close()
    emitChange()
    return op.id
  } catch (e) {
    return null
  }
}

export async function getAllOps() {
  try {
    const db = await openDB()
    const ops = await new Promise((resolve, reject) => {
      const r = tx(db, 'readonly').getAll()
      r.onsuccess = () => resolve(r.result || [])
      r.onerror = () => reject(r.error)
    })
    db.close()
    return ops.sort((a, b) => a.ts - b.ts)
  } catch (e) {
    return []
  }
}

export async function removeOp(id) {
  try {
    const db = await openDB()
    await new Promise((resolve, reject) => {
      const r = tx(db, 'readwrite').delete(id)
      r.onsuccess = () => resolve()
      r.onerror = () => reject(r.error)
    })
    db.close()
    emitChange()
  } catch (e) { /* ignore */ }
}

export async function queueCount() {
  const ops = await getAllOps()
  return ops.length
}

// Replay queued operations in order. Stops on network failure or server (5xx)
// error so it can retry later; permanent client errors (4xx) are dropped but reported
// as FAILED (not success). Returns { done, failed, failedLabels }.
let _flushing = false
export async function flushQueue() {
  if (_flushing) return { done: 0, failed: 0, failedLabels: [] }
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { done: 0, failed: 0, failedLabels: [] }
  _flushing = true
  const ops = await getAllOps()
  let done = 0, failed = 0
  const failedLabels = []
  try {
    for (const op of ops) {
      if (typeof navigator !== 'undefined' && !navigator.onLine) break
      try {
        const res = await fetch(`/api${op.path}`, {
          method: op.method,
          headers: { 'Content-Type': 'application/json' },
          body: op.body || undefined,
        })
        if (res.status >= 500) break // transient server issue — retry later
        if (res.ok) {
          await removeOp(op.id)
          done++
        } else {
          // Permanent client error (4xx): drop so it doesn't loop forever, but report as failed.
          await removeOp(op.id)
          failed++
          failedLabels.push(op.label || `${op.method} ${op.path}`)
        }
      } catch (e) {
        // network error — likely went offline again; stop and retry later
        break
      }
    }
  } finally {
    _flushing = false
  }
  return { done, failed, failedLabels }
}

export function subscribeQueue(cb) {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(CHANGE_EVENT, cb)
  return () => window.removeEventListener(CHANGE_EVENT, cb)
}

export async function clearQueue() {
  try {
    const db = await openDB()
    await new Promise((resolve, reject) => {
      const r = tx(db, 'readwrite').clear()
      r.onsuccess = () => resolve()
      r.onerror = () => reject(r.error)
    })
    db.close()
    emitChange()
  } catch (e) { /* ignore */ }
}
