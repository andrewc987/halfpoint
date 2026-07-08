'use client'

import { useEffect, useState } from 'react'
import { LatLng } from '@/lib/types'

interface MapOrigin {
  name: string
  latLng: LatLng
  color?: string
}

interface MiniMapProps {
  origins: MapOrigin[]
  destination: { name: string; latLng: LatLng }
}

// Build the /api/staticmap URL for a Google Static Map with origin + destination markers
function buildStaticMapUrl(origins: MapOrigin[], destination: { name: string; latLng: LatLng }) {
  const center = `${destination.latLng.lat},${destination.latLng.lng}`
  // Auto-fit zoom: find rough span
  const lats = [...origins.map((o) => o.latLng.lat), destination.latLng.lat]
  const lngs = [...origins.map((o) => o.latLng.lng), destination.latLng.lng]
  const span = Math.max(Math.max(...lats) - Math.min(...lats), Math.max(...lngs) - Math.min(...lngs))
  const zoom = span < 0.02 ? 14 : span < 0.06 ? 13 : span < 0.15 ? 12 : 11

  const params = new URLSearchParams({ center, zoom: String(zoom) })
  // Destination: blue marker. No label — Google Static Maps only accepts
  // single uppercase alphanumerics and silently 400s on anything else (★ did).
  params.append('m', `color:0x0066CC|size:mid|${destination.latLng.lat},${destination.latLng.lng}`)
  // Origins: each person's own colour
  for (const o of origins) {
    const hex = (o.color || '#6E6E73').replace('#', '0x')
    params.append('m', `color:${hex}|size:small|${o.latLng.lat},${o.latLng.lng}`)
  }
  return `/api/staticmap?${params.toString()}`
}

export default function MiniMap({ origins, destination }: MiniMapProps) {
  const [useGoogleMap, setUseGoogleMap] = useState<boolean | null>(null) // null = loading
  const staticMapUrl = buildStaticMapUrl(origins, destination)

  useEffect(() => {
    // Probe whether the static map proxy has a key
    fetch(staticMapUrl, { method: 'HEAD' })
      .then((r) => setUseGoogleMap(r.ok))
      .catch(() => setUseGoogleMap(false))
  }, [staticMapUrl])

  if (useGoogleMap === null) {
    // Brief skeleton while probing
    return <div className="w-full rounded-2xl bg-surface shadow-card" style={{ aspectRatio: '640/300' }} />
  }

  if (useGoogleMap) {
    return (
      <div className="w-full rounded-2xl shadow-card overflow-hidden" style={{ aspectRatio: '640/300' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={staticMapUrl}
          alt={`Map: everyone converging on ${destination.name}`}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </div>
    )
  }

  // SVG minimap fallback (no key / key absent)
  return <SvgMiniMap origins={origins} destination={destination} />
}

const W = 320
const H = 190
const PAD_X = 34
const PAD_Y = 30

function SvgMiniMap({ origins, destination }: MiniMapProps) {
  const points = [...origins.map((o) => o.latLng), destination.latLng]
  const minLat = Math.min(...points.map((p) => p.lat))
  const maxLat = Math.max(...points.map((p) => p.lat))
  const minLng = Math.min(...points.map((p) => p.lng))
  const maxLng = Math.max(...points.map((p) => p.lng))

  const midLat = (minLat + maxLat) / 2
  const lngFactor = Math.cos((midLat * Math.PI) / 180)
  const latSpan = Math.max(maxLat - minLat, 0.02)
  const lngSpan = Math.max((maxLng - minLng) * lngFactor, 0.02)
  const scale = Math.min((W - PAD_X * 2) / lngSpan, (H - PAD_Y * 2) / latSpan)

  const cx = (minLng + maxLng) / 2
  const cy = midLat
  const x = (p: LatLng) => W / 2 + (p.lng - cx) * lngFactor * scale
  const y = (p: LatLng) => H / 2 + (cy - p.lat) * scale

  const dx = x(destination.latLng)
  const dy = y(destination.latLng)

  const clampX = (v: number) => Math.min(Math.max(v, 26), W - 26)
  const placed: { x: number; y: number }[] = [{ x: clampX(dx), y: dy + 18 }]
  const originLabels = origins.map((o) => {
    const ox = x(o.latLng)
    const oy = y(o.latLng)
    let lx = clampX(ox)
    let ly = oy - 8
    const collides = (px: number, py: number) =>
      placed.some((p) => Math.abs(p.x - px) < 52 && Math.abs(p.y - py) < 12)
    if (collides(lx, ly) || ly < 10) ly = oy + 14
    if (collides(lx, ly)) ly = oy + 26
    placed.push({ x: lx, y: ly })
    return { ox, oy, lx, ly, name: o.name, color: o.color }
  })

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Map: everyone converging on ${destination.name}`}
      className="w-full h-auto rounded-2xl bg-surface shadow-card"
    >
      {originLabels.map((o, i) => (
        <line key={`l-${i}`} className="map-fade" style={{ animationDelay: `${250 + i * 110}ms` }}
          x1={o.ox} y1={o.oy} x2={dx} y2={dy}
          stroke="#DBDBDE" strokeWidth={1.5} strokeDasharray="3 4" strokeLinecap="round" />
      ))}
      {originLabels.map((o, i) => (
        <g key={`o-${i}`} className="map-fade" style={{ animationDelay: `${120 + i * 110}ms` }}>
          <circle cx={o.ox} cy={o.oy} r={4.5} fill={o.color || '#6E6E73'} />
          <circle cx={o.ox} cy={o.oy} r={4.5} fill="none" stroke="#FFFFFF" strokeWidth={1.25} />
          <text x={o.lx} y={o.ly} textAnchor="middle" fontSize={9.5} fill="#6E6E73"
            fontFamily="-apple-system, system-ui, sans-serif">{o.name}</text>
        </g>
      ))}
      <g className="map-winner" style={{ animationDelay: `${360 + origins.length * 110}ms` }}>
        <circle cx={dx} cy={dy} r={11} fill="#0066CC" opacity={0.12} />
        <circle cx={dx} cy={dy} r={7} fill="#0066CC" opacity={0.18} />
        <circle cx={dx} cy={dy} r={5.5} fill="#0066CC" stroke="#FFFFFF" strokeWidth={1.5} />
        <text x={clampX(dx)} y={dy + 19} textAnchor="middle" fontSize={10.5} fontWeight={600}
          fill="#1D1D1F" fontFamily="-apple-system, system-ui, sans-serif">{destination.name}</text>
      </g>
    </svg>
  )
}
