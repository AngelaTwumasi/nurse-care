import './globals.css'
import { Providers } from './providers'
import { Toaster } from '@/components/ui/sonner'
import PWARegister from './pwa-register'

export const metadata = {
  title: 'NurseCare — AI Care Plans for New Grad Nurses',
  description: 'Manage up to 4 patients per shift. Upload care plans, meds, vitals & allied health notes and get AI-generated nursing interventions, priorities and ISBAR handover.',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'NurseCare' },
  icons: { icon: '/icon-192.png', apple: '/apple-touch-icon.png' },
}

export const viewport = {
  themeColor: '#0d9488',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{__html:'window.addEventListener("error",function(e){if(e.error instanceof DOMException&&e.error.name==="DataCloneError"&&e.message&&e.message.includes("PerformanceServerTiming")){e.stopImmediatePropagation();e.preventDefault()}},true);'}} />
      </head>
      <body>
        <Providers>{children}</Providers>
        <Toaster richColors position="top-center" />
        <PWARegister />
      </body>
    </html>
  )
}
