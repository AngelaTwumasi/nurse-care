// NurseCare service worker — network-first with an offline fallback cache.
// Network-first (instead of cache-first) prevents stale JS chunks from being served
// after a new build/deploy, while still letting nurses view the last-loaded data offline.
const CACHE = 'nursecare-v4'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  // Purge ALL previous caches (including older versions that may hold stale chunks/shell)
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const { request } = e
  const url = new URL(request.url)
  if (request.method !== 'GET') return // writes always go straight to the network
  if (url.origin !== self.location.origin) return
  // Never touch dev/HMR or Next.js internal streaming endpoints
  if (url.pathname.includes('/_next/webpack-hmr') || url.pathname.includes('__nextjs') || url.pathname.includes('hot-update')) return

  const isNav = request.mode === 'navigate'
  const isApi = url.pathname.startsWith('/api/')
  const cacheable = isNav || isApi || url.pathname.startsWith('/_next/') || url.pathname === '/'
    || /\.(?:js|css|png|jpg|jpeg|svg|webp|ico|json|woff2?)$/.test(url.pathname)

  // Network-first everywhere: always try the network, cache good GETs as an offline fallback.
  e.respondWith(
    fetch(request)
      .then((res) => {
        if (res && res.ok && cacheable) {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(isNav ? '/' : request, copy)).catch(() => {})
        }
        return res
      })
      .catch(() => caches.match(isNav ? '/' : request).then((r) => r || caches.match(request)))
  )
})
