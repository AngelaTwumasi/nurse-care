'use client'

import { useEffect } from 'react'

export default function PWARegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

    // In development (next dev) a service worker caches HMR/dev chunks and breaks the app.
    // Only enable the SW for production builds. In dev, remove any previously-registered SW
    // and clear its caches so the app always loads fresh.
    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker.getRegistrations()
        .then((regs) => {
          const had = regs.length > 0
          return Promise.all(regs.map((r) => r.unregister())).then(() => had)
        })
        .then((had) => {
          if (window.caches) {
            caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))).catch(() => {})
          }
          if (had && !sessionStorage.getItem('nc_sw_cleaned')) {
            sessionStorage.setItem('nc_sw_cleaned', '1')
            window.location.reload()
          }
        })
        .catch(() => {})
      return
    }

    const register = () => { navigator.serviceWorker.register('/sw.js').catch(() => {}) }
    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register)
    return () => window.removeEventListener('load', register)
  }, [])

  return null
}
