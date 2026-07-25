import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || 'https://uk-telco-intel-mvp.vercel.app'),
  title: 'HALF·POINT — The fairest place to meet in London',
  description: 'Find the fairest place to meet. Then blame the algorithm. Multi-person. Multi-modal. Last-train-aware.',
  openGraph: {
    title: 'HALF·POINT — The fairest place to meet in London',
    description: 'Find the fairest place to meet. Then blame the algorithm.',
    // /public/og-image.png was a 12-byte text placeholder; the dynamic OG
    // route renders a real branded card even with no params.
    images: [{ url: '/api/og', width: 1200, height: 630 }],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-bg">
        {children}
      </body>
    </html>
  )
}
