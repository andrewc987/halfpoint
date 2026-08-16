'use client'

import { useEffect, useMemo, useRef, useState, ReactNode } from 'react'
import { OptimiseResponse, ScoredCandidate, Venue } from '@/lib/types'
import MiniMap from './MiniMap'

interface VerdictViewProps {
  result: OptimiseResponse
  colors: Record<string, string>
  children?: ReactNode
}

// The receipt: one row per person — their colour, their route, and a bar
// whose length is their journey. Fairness you can see, not take on trust.
function ReceiptRow({
  leg,
  color,
  scaleMax,
  index,
  firstReveal,
  lastTrainUnverified,
}: {
  leg: ScoredCandidate['legs'][number]
  color: string
  scaleMax: number
  index: number
  firstReveal: boolean
  lastTrainUnverified?: boolean
}) {
  return (
    <div
      className={`${firstReveal ? 'animate-fade-up' : 'animate-crossfade'} bg-surface rounded-2xl shadow-card p-4 sm:p-5`}
      style={{ animationDelay: firstReveal ? `${450 + index * 90}ms` : `${index * 40}ms` }}
    >
      <div className="flex items-center gap-2.5 mb-2">
        <span
          className="w-6 h-6 rounded-full text-white text-xs font-bold inline-flex items-center justify-center shrink-0"
          style={{ backgroundColor: color }}
          aria-hidden
        >
          {leg.personName.trim() ? leg.personName.trim()[0].toUpperCase() : '?'}
        </span>
        <p className="font-semibold text-text-primary flex-1 min-w-0 truncate">{leg.personName}</p>
        {leg.ok && <span className="shrink-0 text-sm font-semibold text-text-primary tabular-nums">{leg.minutes} min</span>}
      </div>
      {leg.ok ? (
        <>
          <div className="h-2 rounded-full bg-bg overflow-hidden mb-2" aria-hidden>
            <div
              className="h-full rounded-full receipt-bar"
              style={{
                width: `${Math.max(6, Math.round((leg.minutes / scaleMax) * 100))}%`,
                backgroundColor: color,
              }}
            />
          </div>
          <p className="text-sm text-text-secondary leading-relaxed">{leg.route}</p>
          {leg.lastTrain && (
            <p className="text-sm text-accent font-medium mt-1.5">
              Makes the {leg.lastTrain.trainTime} to {leg.lastTrain.destination} from {leg.lastTrain.terminal} — leave
              by {leg.lastTrain.leaveBy}.
            </p>
          )}
          {!leg.lastTrain && lastTrainUnverified && (
            <p className="text-sm text-warning font-medium mt-1.5">
              Couldn&apos;t confirm {leg.personName}&apos;s last train home tonight — check it before staying late.
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-warning">TfL couldn&apos;t plan {leg.personName}&apos;s leg. Not our doing.</p>
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
        First round in {placeName}
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
            <span className="shrink-0 text-sm text-text-secondary font-medium">{v.walkingMinutes} min walk</span>
          </div>
        ))}
      </div>
    </section>
  )
}

// Who pays most for switching the venue away from the verdict.
function biggestLoser(candidate: ScoredCandidate, fairest: ScoredCandidate): { name: string; delta: number } | null {
  let worst: { name: string; delta: number } | null = null
  for (const leg of candidate.legs) {
    if (!leg.ok) continue
    const base = fairest.legs.find((l) => l.personId === leg.personId)
    if (!base || !base.ok) continue
    const delta = leg.minutes - base.minutes
    if (!worst || delta > worst.delta) worst = { name: leg.personName, delta }
  }
  return worst
}

export default function VerdictView({ result, colors, children }: VerdictViewProps) {
  // The verdict is the fairest spot. Everything else is a challenger the
  // sceptic in the group can tap — and watch lose on the numbers.
  const candidates = useMemo(() => {
    const list: { candidate: ScoredCandidate; tag?: string }[] = []
    const seen = new Set<string>()
    const push = (candidate: ScoredCandidate, tag?: string) => {
      if (seen.has(candidate.name)) return
      seen.add(candidate.name)
      list.push({ candidate, tag })
    }
    push(result.fairest, 'The verdict')
    if (!result.agree) push(result.quickest, 'Quickest')
    for (const c of result.ranked) push(c)
    return list.slice(0, 5)
  }, [result])

  const [selectedName, setSelectedName] = useState(result.fairest.name)
  const [firstReveal, setFirstReveal] = useState(true)

  useEffect(() => {
    setSelectedName(result.fairest.name)
    setFirstReveal(true)
  }, [result])

  const selected = candidates.find((c) => c.candidate.name === selectedName)?.candidate ?? result.fairest
  const isVerdict = selected.name === result.fairest.name

  // The engine reports degraded lookups in `failures` but the UI never showed
  // them — anyone whose last-train check silently failed (TfL rate limiting is
  // the usual culprit) just lost their "leave by" line with no warning.
  const lastTrainUnverified = useMemo(
    () =>
      new Set(
        (result.failures || [])
          .filter(
            (f) =>
              (f.kind === 'terminal-leg' && f.candidate === selected.name) || f.kind === 'no-last-train-today'
          )
          .map((f) => f.personId)
      ),
    [result, selected.name]
  )

  // One scale across every candidate so bars stay comparable when the
  // sceptic taps between options.
  const scaleMax = Math.max(...candidates.map((c) => c.candidate.maxMinutes))

  const switchTo = (name: string) => {
    if (name === selectedName) return
    setFirstReveal(false)
    setSelectedName(name)
  }

  const loser = isVerdict ? null : biggestLoser(selected, result.fairest)
  const challengerLine = !isVerdict
    ? selected.maxMinutes > result.fairest.maxMinutes
      ? `The longest trip jumps to ${selected.maxMinutes} minutes — ${result.fairest.name} keeps it to ${result.fairest.maxMinutes}. The verdict stands.`
      : `Level on the longest trip — the verdict wins on the ${
          selected.spread > result.fairest.spread ? 'smaller gap between trips' : 'total minutes'
        }.`
    : null

  return (
    <div className="space-y-6">
      {/* Headline */}
      <section className="text-center">
        <div key={selected.name} className={firstReveal ? 'animate-fade-up' : 'animate-crossfade'}>
          <p className="text-xs font-semibold uppercase tracking-widest text-text-secondary mb-2">
            {isVerdict ? 'The verdict' : `The case for ${selected.name}`}
          </p>
          <h2 className="font-display text-4xl sm:text-5xl font-bold text-text-primary tracking-tight">
            {selected.name}
          </h2>
        </div>
        <p
          className={`${firstReveal ? 'animate-fade-up' : ''} mt-4 text-base sm:text-lg text-text-secondary leading-relaxed max-w-md mx-auto`}
          style={firstReveal ? { animationDelay: '150ms' } : undefined}
        >
          {isVerdict
            ? `Nobody travels more than ${selected.maxMinutes} minutes, and the gap between the longest and shortest trip is ${selected.spread}.`
            : challengerLine}
        </p>
        {isVerdict && !result.agree && (
          <p
            className={`${firstReveal ? 'animate-fade-up' : ''} mt-2 text-sm text-text-secondary max-w-md mx-auto`}
            style={firstReveal ? { animationDelay: '220ms' } : undefined}
          >
            {result.diff}
          </p>
        )}
        {!isVerdict && (
          <button
            onClick={() => switchTo(result.fairest.name)}
            className="mt-3 text-sm font-semibold text-accent hover:text-accent/80 transition-colors"
          >
            ‹ Back to the verdict
          </button>
        )}
      </section>

      {/* Map */}
      <section
        className={firstReveal ? 'animate-fade-up' : undefined}
        style={firstReveal ? { animationDelay: '320ms' } : undefined}
      >
        <div key={selected.name} className={firstReveal ? undefined : 'animate-crossfade'}>
          <MiniMap
            origins={result.origins.map((o) => ({ name: o.name, latLng: o.latLng, color: colors[o.personId] }))}
            destination={{ name: selected.name, latLng: selected.latLng }}
          />
        </div>
      </section>

      {/* The receipt */}
      <section>
        <div className="space-y-2.5">
          {selected.legs.map((leg, i) => (
            <ReceiptRow
              key={`${selected.name}-${leg.personId}`}
              leg={leg}
              color={colors[leg.personId] || '#6E6E73'}
              scaleMax={scaleMax}
              index={i}
              firstReveal={firstReveal}
              lastTrainUnverified={lastTrainUnverified.has(leg.personId)}
            />
          ))}
        </div>
      </section>

      {/* Challengers */}
      {candidates.length > 1 && (
        <section
          className={firstReveal ? 'animate-fade-up' : undefined}
          style={firstReveal ? { animationDelay: '650ms' } : undefined}
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-text-secondary text-center mb-3">
            Still arguing? Tap the counter-offer
          </p>
          <div className="space-y-2">
            {candidates.map(({ candidate, tag }) => {
              const active = candidate.name === selected.name
              const delta = candidate.name === result.fairest.name ? null : biggestLoser(candidate, result.fairest)
              return (
                <button
                  key={candidate.name}
                  onClick={() => switchTo(candidate.name)}
                  aria-pressed={active}
                  className={`w-full text-left bg-surface rounded-2xl shadow-card px-4 py-3 sm:px-5 flex items-center justify-between gap-3 transition-all ${
                    active ? 'ring-2 ring-accent' : 'hover:shadow-card-hover'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-text-primary truncate">
                      {candidate.name}
                      {tag && (
                        <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-accent">{tag}</span>
                      )}
                    </p>
                    <p className="text-sm text-text-secondary">
                      Longest trip {candidate.maxMinutes} min · gap {candidate.spread}
                    </p>
                  </div>
                  {delta && delta.delta > 0 && (
                    <span className="shrink-0 text-sm font-medium text-warning tabular-nums">
                      {delta.name} +{delta.delta}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* Share sits above the venues so late-arriving venue cards
          append below it — nothing already on screen shifts. */}
      {children}

      {/* Venues — only rendered when the venue source answered */}
      <VenueList latLng={selected.latLng} placeName={selected.name} />
    </div>
  )
}
