'use client'

import { useState, useEffect, useRef, ReactNode } from 'react'
import { OptimiseResponse, ScoredCandidate, Venue } from '@/lib/types'
import MiniMap from './MiniMap'

type Mode = 'fairest' | 'quickest'

interface ResultViewProps {
  result: OptimiseResponse
  children?: ReactNode
}

function JourneyLeg({
  leg,
  index,
  firstReveal,
  lastTrainUnverified,
}: {
  leg: ScoredCandidate['legs'][number]
  index: number
  firstReveal: boolean
  lastTrainUnverified?: boolean
}) {
  return (
    <div
      className={`${firstReveal ? 'animate-fade-up' : 'animate-crossfade'} bg-surface rounded-2xl shadow-card p-4 sm:p-5 flex items-start justify-between gap-3`}
      style={{ animationDelay: firstReveal ? `${450 + index * 90}ms` : `${index * 40}ms` }}
    >
      <div className="min-w-0">
        <p className="font-semibold text-text-primary mb-0.5">{leg.personName}</p>
        {leg.ok ? (
          <>
            <p className="text-sm text-text-secondary leading-relaxed">{leg.route}</p>
            {leg.lastTrain && (
              <p className="text-sm text-accent font-medium mt-1.5">
                Makes the {leg.lastTrain.trainTime} to {leg.lastTrain.destination} from {leg.lastTrain.terminal} —
                leave by {leg.lastTrain.leaveBy}.
              </p>
            )}
            {!leg.lastTrain && lastTrainUnverified && (
              <p className="text-sm text-warning font-medium mt-1.5">
                Couldn&apos;t confirm {leg.personName}&apos;s last train home tonight — check it
                before staying late.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-warning">TfL couldn&apos;t plan {leg.personName}&apos;s leg. Not our doing.</p>
        )}
      </div>
      {leg.ok && (
        <span className="shrink-0 bg-accent text-white text-sm font-semibold px-3 py-1 rounded-full">
          {leg.minutes} min
        </span>
      )}
    </div>
  )
}

function VenueList({ latLng, placeName }: { latLng: { lat: number; lng: number }; placeName: string }) {
  const [venues, setVenues] = useState<Venue[]>([])
  const cache = useRef<Map<string, Venue[]>>(new Map())

  useEffect(() => {
    const key = `${latLng.lat},${latLng.lng}`
    const cached = cache.current.get(key)
    if (cached) {
      setVenues(cached)
      return
    }
    let cancelled = false
    setVenues([])
    fetch(`/api/venues?lat=${latLng.lat}&lng=${latLng.lng}`)
      .then((res) => (res.ok ? res.json() : { venues: [] }))
      .then((data) => {
        const list: Venue[] = Array.isArray(data?.venues) ? data.venues : []
        cache.current.set(key, list)
        if (!cancelled) setVenues(list)
      })
      .catch(() => {
        if (!cancelled) setVenues([])
      })
    return () => {
      cancelled = true
    }
  }, [latLng.lat, latLng.lng])

  if (venues.length === 0) return null

  return (
    <section className="animate-fade-up">
      <p className="text-xs font-semibold uppercase tracking-widest text-text-secondary text-center mb-3">
        Where to go in {placeName}
      </p>
      <div className="space-y-2.5">
        {venues.slice(0, 3).map((v, i) => (
          <div
            key={v.name}
            className="animate-fade-up bg-surface rounded-2xl shadow-card px-4 py-3.5 sm:px-5 flex items-center justify-between gap-3"
            style={{ animationDelay: `${80 + i * 90}ms` }}
          >
            <div className="min-w-0">
              <p className="font-semibold text-text-primary truncate">{v.name}</p>
              <p className="text-sm text-text-secondary">{v.type}</p>
            </div>
            <span className="shrink-0 text-sm text-text-secondary font-medium">
              {v.walkingMinutes} min walk
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function ResultView({ result, children }: ResultViewProps) {
  const [mode, setMode] = useState<Mode>('fairest')
  // First reveal is staged (headline → diff → map → cards); a mode toggle
  // afterwards crossfades the numbers instead of replaying the theatre.
  const [firstReveal, setFirstReveal] = useState(true)
  const winner = mode === 'fairest' ? result.fairest : result.quickest

  // The engine reports degraded lookups in `failures` but the UI never showed
  // them — anyone whose last-train check silently failed (TfL rate limiting is
  // the usual culprit) just lost their "leave by" line with no warning.
  const lastTrainUnverified = new Set(
    (result.failures || [])
      .filter(
        (f) =>
          (f.candidate.startsWith(`${winner.name} →`) && f.candidate.endsWith('(terminal leg)')) ||
          f.candidate.endsWith('(no last-train entry today)')
      )
      .map((f) => f.personName)
  )

  useEffect(() => {
    setMode('fairest')
    setFirstReveal(true)
  }, [result])

  const switchMode = (m: Mode) => {
    if (m === mode) return
    setFirstReveal(false)
    setMode(m)
  }

  return (
    <div className="space-y-6">
      {/* Headline */}
      <section className="text-center">
        <div key={mode} className={firstReveal ? 'animate-fade-up' : 'animate-crossfade'}>
          <p className="text-xs font-semibold uppercase tracking-widest text-text-secondary mb-2">
            {mode === 'fairest' ? 'Fairest for everyone' : 'Quickest for the group'}
          </p>
          <h2 className="font-display text-4xl sm:text-5xl font-bold text-text-primary tracking-tight">
            {winner.name}
          </h2>
        </div>
        <p
          className={`${firstReveal ? 'animate-fade-up' : ''} mt-4 text-base sm:text-lg text-text-secondary leading-relaxed max-w-md mx-auto`}
          style={firstReveal ? { animationDelay: '150ms' } : undefined}
        >
          {result.diff}
        </p>
      </section>

      {/* Mode toggle — both precomputed, switching is instant */}
      {!result.agree && (
        <section
          className={`${firstReveal ? 'animate-fade-up' : ''} flex justify-center`}
          style={firstReveal ? { animationDelay: '250ms' } : undefined}
        >
          <div className="inline-flex bg-surface rounded-full shadow-card p-1" role="group" aria-label="Ranking mode">
            {(['fairest', 'quickest'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => switchMode(m)}
                className={`px-5 py-2 rounded-full text-sm font-semibold transition-colors ${
                  mode === m ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {m === 'fairest' ? 'Fairest' : 'Quickest'}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Map */}
      <section
        className={firstReveal ? 'animate-fade-up' : undefined}
        style={firstReveal ? { animationDelay: '320ms' } : undefined}
      >
        <div key={mode} className={firstReveal ? undefined : 'animate-crossfade'}>
          <MiniMap
            origins={result.origins.map((o) => ({ name: o.name, latLng: o.latLng }))}
            destination={{ name: winner.name, latLng: winner.latLng }}
          />
        </div>
      </section>

      {/* Per-person journeys */}
      <section>
        <div className="space-y-2.5">
          {winner.legs.map((leg, i) => (
            <JourneyLeg
              key={`${mode}-${leg.personId}`}
              leg={leg}
              index={i}
              firstReveal={firstReveal}
              lastTrainUnverified={lastTrainUnverified.has(leg.personName)}
            />
          ))}
        </div>
      </section>

      {/* Share CTA sits above the venues so late-arriving venue cards
          append below it — nothing already on screen shifts. */}
      {children}

      {/* Venues — only rendered when the venue source answered */}
      <VenueList latLng={winner.latLng} placeName={winner.name} />
    </div>
  )
}
