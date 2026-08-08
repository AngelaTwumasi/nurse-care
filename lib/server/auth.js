import crypto from 'crypto'

export const SESSION_COOKIE = 'nc_session'
const SEVEN_DAYS = 7 * 24 * 60 * 60

export function sha256(v) {
  return crypto.createHash('sha256').update(String(v)).digest('hex')
}

export function sessionCookieOptions() {
  const production = process.env.NODE_ENV === 'production'
  return {
    httpOnly: true,
    secure: production,
    sameSite: production ? 'none' : 'lax',
    path: '/',
    maxAge: SEVEN_DAYS,
  }
}

// Exchange the one-time Emergent session_id for the user profile + session_token.
// Uses the verified Emergent managed-auth endpoint.
export async function exchangeEmergentSession(sessionId) {
  const res = await fetch('https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data', {
    method: 'GET',
    headers: { 'X-Session-ID': sessionId },
    cache: 'no-store',
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.detail || body.message || 'Emergent session exchange failed')
  if (!body.id || !body.email || !body.session_token) throw new Error('Invalid Emergent session response')
  return body // { id, email, name, picture, session_token }
}

// Persist/refresh the user + session; returns { user, sessionToken, expiresAt }.
export async function createSession(db, emergent) {
  const now = new Date()
  const expiresAt = new Date(Date.now() + SEVEN_DAYS * 1000)
  const id = String(emergent.id)
  await db.collection('users').updateOne(
    { id },
    {
      $set: { id, email: String(emergent.email).toLowerCase(), name: emergent.name || null, picture: emergent.picture || null, updatedAt: now },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  )
  await db.collection('user_sessions').insertOne({
    token_hash: sha256(emergent.session_token),
    user_id: id,
    createdAt: now,
    expires_at: expiresAt,
  })
  const user = await db.collection('users').findOne({ id })
  return { user, sessionToken: emergent.session_token, expiresAt }
}

// Read + validate the session cookie from a NextRequest. Returns the user doc or null.
export async function getUserFromRequest(request, db) {
  const token = request.cookies?.get?.(SESSION_COOKIE)?.value
  if (!token) return null
  const session = await db.collection('user_sessions').findOne({
    token_hash: sha256(token),
    expires_at: { $gt: new Date() },
  })
  if (!session) return null
  return db.collection('users').findOne({ id: session.user_id })
}

export async function destroySession(request, db) {
  const token = request.cookies?.get?.(SESSION_COOKIE)?.value
  if (token) await db.collection('user_sessions').deleteOne({ token_hash: sha256(token) })
}

export function publicUser(u) {
  if (!u) return null
  return { id: u.id, email: u.email, name: u.name, picture: u.picture }
}
