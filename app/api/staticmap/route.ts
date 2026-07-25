import { NextRequest, NextResponse } from 'next/server'

// Without this, a build where GOOGLE_MAPS_API_KEY is absent hits the early
// `return 204` before touching `request`, so Next statically prerenders the
// route and freezes that empty response — which then serves as a 404/500 in
// production even when the key exists at runtime.
export const dynamic = 'force-dynamic'

// Proxies Google Maps Static API so the key stays server-side.
// Returns 204 (no content) when the key is absent — MiniMap falls back to SVG.
export async function GET(request: NextRequest) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) return new NextResponse(null, { status: 204 })

  const p = request.nextUrl.searchParams
  const center = p.get('center') || '51.505,-0.127'
  const zoom = p.get('zoom') || '12'
  const markerParams = p.getAll('m').map((m) => `markers=${encodeURIComponent(m)}`).join('&')

  // Minimal light map style matching the app palette
  const styles = [
    'feature:all|element:labels.text.fill|color:0x6e6e73',
    'feature:road|element:geometry|color:0xffffff',
    'feature:road.arterial|element:geometry|color:0xf0f0f0',
    'feature:water|element:geometry|color:0xe5e5ea',
    'feature:poi|visibility:off',
    'feature:transit.station|element:labels.icon|visibility:off',
    'feature:landscape|element:geometry|color:0xfafafa',
  ]
  const styleParams = styles.map((s) => `style=${encodeURIComponent(s)}`).join('&')

  const url =
    `https://maps.googleapis.com/maps/api/staticmap` +
    `?center=${encodeURIComponent(center)}&zoom=${zoom}&size=640x300&scale=2` +
    `&${markerParams}&${styleParams}&key=${apiKey}`

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return new NextResponse(null, { status: 204 })
    const buf = await res.arrayBuffer()
    return new NextResponse(buf, {
      headers: {
        'content-type': 'image/png',
        'cache-control': 'public, max-age=3600',
      },
    })
  } catch {
    return new NextResponse(null, { status: 204 })
  }
}
