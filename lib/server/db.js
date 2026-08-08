import { MongoClient, GridFSBucket } from 'mongodb'

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

export { connectToMongo, FILE_BUCKET, getBucket, dataUrlToBuffer, storeFile, readFile, deleteFile, resolveDocDataUrl }
