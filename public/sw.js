// NurseCare service worker — offline app shell + cached data for viewing away from the server
const CACHE = 'nursecare-v3'
const APP_SHELL = ['/']

self.addEventListener('install', (e) => {
  self.skipWaiting()
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(APP_SHELL).catch(() => {})))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const { request } = e
  const url = new URL(request.url)
  if (request.method !== 'GET') return // POST/PUT/DELETE (AI generate etc.) go straight to network
  if (url.origin !== self.location.origin) return
  // Never touch dev/HMR or Next.js internal streaming endpoints
  if (url.pathname.includes('/_next/webpack-hmr') || url.pathname.includes('__nextjs') || url.pathname.includes('hot-update')) return

  // App navigations: network-first, fall back to the cached shell so the app opens offline
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('/', copy)); return res })
        .catch(() => caches.match('/').then((r) => r || caches.match(request)))
    )
    return
  }

  // API reads: network-first with cache fallback (view last-loaded patients & documents offline)
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(request)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(request, copy)); return res })
        .catch(() => caches.match(request))
    )
    return
  }

  // Static assets (Next chunks, icons, images): cache-first
  e.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((res) => {
      const copy = res.clone(); caches.open(CACHE).then((c) => c.put(request, copy)); return res
    }).catch(() => cached))
  )
})
