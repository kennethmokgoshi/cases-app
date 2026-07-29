import type { Metadata } from 'next'
import './globals.css'
import { Providers } from './providers'

// Force all pages to render at request time, not build time.
// This prevents Next.js from trying to connect to the DB during docker build.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Staff Reporting - Zenowethu',
  description: 'Employee activity and time tracking',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
