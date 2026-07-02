'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Person, OptimiseResponse } from '@/lib/types'
import { SavedCrew, createPerson, displayName, hasSeen, loadCrew, markSeen, personColor, saveCrew } from '@/lib/people'
import CrewStep from '@/components/CrewStep'
import PlacesStep from '@/components/PlacesStep'
import VerdictView from '@/components/VerdictView'
import ShareButton from '@/components/ShareButton'

// The app follows the argument it settles:
//   crew   — "who's in?"
//   places — "where's everyone coming from?"
//   verdict — "right, here's the fair answer. With receipts."
type Phase = 'crew' | 'places' | 'verdict'

function LoadingState({ names }: { names: string[] }) {
  const stages = useMemo(() => {
    const listed =
      names.length <= 3 ? names.join(', ') : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`
    return [
      `Pulling real journey times for ${listed || 'everyone'}`,
      'Scoring every contender, both ways',
      'Making sure nobody gets shafted',
    ]
  }, [names])

  const [stage, setStage] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setStage((s) => Math.min(s + 1, stages.length - 1)), 2600)
    return () => clearInterval(t)
  }, [stages])

  return (
    <section className="animate-fade-up text-center py-8 min-h-[148px]">
      <div className="progress-hairline mb-6" aria-hidden />
      <ul className="inline-flex flex-col items-start gap-1.5 text-left" aria-live="polite">
        {stages.map((line, i) => (
          <li
            key={line}
            className={`text-sm flex items-center gap-2 transition-opacity duration-500 ${
              i <= stage ? 'text-text-secondary' : 'text-text-secondary/0 select-none'
            }`}
          >
            <span
              className={`text-success text-xs w-3 transition-opacity duration-500 ${i < stage ? 'opacity-100' : 'opacity-0'}`}
              aria-hidden
            >
              ✓
            </span>
            {line}
            {i === stage ? '…' : ''}
          </li>
        ))}
      </ul>
    </section>
  )
}

interface ShareState {
  people: Person[]
  // Compact result summary so a shared URL can emit a real OG card
  // without re-running the engine server-side.
  r?: { place: string; legs: { n: string; m: number }[]; diff: string }
}

function encodeState(state: ShareState): string {
  try { return btoa(unescape(encodeURIComponent(JSON.stringify(state)))) } catch { return '' }
}

function decodeState(encoded: string): ShareState | null {
  try { return JSON.parse(decodeURIComponent(escape(atob(encoded)))) } catch { return null }
}

const PHASES: Phase[] = ['crew', 'places', 'verdict']

export default function HomeClient() {
  const [phase, setPhase] = useState<Phase>('crew')
  const [people, setPeople] = useState<Person[]>([])
  const [result, setResult] = useState<OptimiseResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedCrew, setSavedCrew] = useState<SavedCrew | null>(null)
  const [showIntro, setShowIntro] = useState(false)
  // Set when this session began from someone else's share link — the opener
  // is probably a mate who should add themselves and re-run.
  const [openedFromShare, setOpenedFromShare] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const s = params.get('s')
    if (s) {
      const decoded = decodeState(s)
      if (decoded && Array.isArray(decoded.people) && decoded.people.length >= 2) {
        setPeople(decoded.people)
        setOpenedFromShare(true)
        // A shared link reproduces the verdict, not just the inputs.
        runOptimise(decoded.people)
        return
      }
    }
    setShowIntro(!hasSeen())
    setSavedCrew(loadCrew())
    markSeen()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const colors = useMemo(() => {
    const map: Record<string, string> = {}
    people.forEach((p, i) => {
      map[p.id] = personColor(i)
    })
    return map
  }, [people])

  const getShareUrl = useCallback(() => {
    const state: ShareState = { people }
    if (result) {
      state.r = {
        place: result.fairest.name,
        legs: result.fairest.legs
          .filter((l): l is Extract<typeof l, { ok: true }> => l.ok)
          .map((l) => ({ n: l.personName, m: l.minutes })),
        diff: result.diff,
      }
    }
    const base = typeof window !== 'undefined' ? window.location.origin : ''
    return `${base}/?s=${encodeURIComponent(encodeState(state))}`
  }, [people, result])

  // ——— Crew handlers ———
  const addPerson = (name: string) => {
    if (people.length >= 8) return
    setPeople((prev) => (prev.length >= 8 ? prev : [...prev, createPerson(name)]))
  }

  const removePerson = (index: number) => {
    setPeople(people.filter((_, i) => i !== index))
  }

  const crewDone = (pendingName: string) => {
    let next = people
    if (pendingName && people.length < 8) {
      next = [...people, createPerson(pendingName)]
      setPeople(next)
    }
    if (next.length >= 2) {
      setError(null)
      setPhase('places')
    }
  }

  const loadSavedCrew = () => {
    if (!savedCrew) return
    setPeople(savedCrew.people)
    setPhase('places')
  }

  // ——— Places handlers ———
  const updatePerson = (index: number, updated: Person) => {
    const next = [...people]
    next[index] = updated
    setPeople(next)
  }

  const handleOptimise = () => runOptimise(people)

  const runOptimise = async (group: Person[]) => {
    setError(null)

    const unresolved = group.filter((p) => p.fromLocation.trim() && !p.fromLatLng)
    if (unresolved.length > 0) {
      const names = unresolved.map((p) => displayName(p, group.indexOf(p)))
      setError(
        `${names.join(' and ')} ${names.length === 1 ? "hasn't" : "haven't"} confirmed a location — pick from the suggestions.`
      )
      return
    }

    const resolved = group.filter((p) => p.fromLatLng)
    if (resolved.length < 2) {
      setError('Two starting points minimum — pick them from the suggestions.')
      return
    }

    setResult(null)
    setLoading(true)

    try {
      const res = await fetch('/api/optimise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ people: resolved }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error || "The engine didn't answer. Run it again.")
        return
      }

      const data: OptimiseResponse = await res.json()
      setResult(data)
      setPhase('verdict')
      // Remember the lineup — next time it's one tap, not eight fields.
      saveCrew(group)
      setSavedCrew(null)
    } catch {
      setError("Couldn't reach the journey planner. Try again in a minute.")
    } finally {
      setLoading(false)
    }
  }

  const addYourself = () => {
    setOpenedFromShare(false)
    setPhase('crew')
  }

  const phaseIndex = loading ? 2 : PHASES.indexOf(phase)
  const compactHeader = phase !== 'crew' || loading

  return (
    <main className="max-w-xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      {/* Hero — full-throated on arrival, quiet wordmark once the work starts */}
      <header className={`animate-fade-up text-center ${compactHeader ? 'mb-7' : 'mb-9 sm:mb-11'}`}>
        <h1
          className={`font-display font-bold tracking-tight text-text-primary transition-all ${
            compactHeader ? 'text-2xl mb-0' : 'text-4xl sm:text-5xl md:text-6xl mb-4'
          }`}
        >
          HALF<span className="text-accent">·</span>POINT
        </h1>
        {!compactHeader && (
          <>
            <p className="text-lg sm:text-xl text-text-primary font-medium mb-1.5">
              The app that stops one person always winning.
            </p>
            <p className="text-sm sm:text-base text-text-secondary">
              Settle the group chat&apos;s oldest argument — where to meet.
            </p>
          </>
        )}
        {/* Three quiet dots: who → where → verdict */}
        <div className="flex justify-center gap-1.5 mt-5" aria-hidden>
          {PHASES.map((p, i) => (
            <span
              key={p}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === phaseIndex ? 'w-5 bg-accent' : 'w-1.5 bg-border'
              }`}
            />
          ))}
        </div>
      </header>

      {/* Error */}
      {error && (
        <section className="animate-fade-up mb-6">
          <div className="bg-warning/8 border border-warning/20 rounded-xl px-4 py-3 text-center" role="alert">
            <p className="text-sm text-warning font-medium">{error}</p>
          </div>
        </section>
      )}

      {loading ? (
        <LoadingState names={people.map((p, i) => displayName(p, i))} />
      ) : (
        <>
          {phase === 'crew' && (
            <CrewStep
              people={people}
              savedCrew={savedCrew}
              showIntro={showIntro}
              onAdd={addPerson}
              onRemove={removePerson}
              onLoadSaved={loadSavedCrew}
              onDone={crewDone}
            />
          )}

          {phase === 'places' && (
            <PlacesStep
              people={people}
              loading={loading}
              onUpdate={updatePerson}
              onBack={() => setPhase('crew')}
              onOptimise={handleOptimise}
            />
          )}

          {phase === 'verdict' && result && (
            <>
              {openedFromShare && (
                <section className="animate-fade-up mb-6">
                  <div className="bg-accent-light border border-accent/20 rounded-2xl px-4 py-3.5 flex items-center justify-between gap-3">
                    <p className="text-sm text-text-primary">
                      This verdict covers {people.length} people. Coming too?
                    </p>
                    <button
                      onClick={addYourself}
                      className="shrink-0 text-sm font-semibold text-accent hover:text-accent/80 transition-colors"
                    >
                      Add yourself →
                    </button>
                  </div>
                </section>
              )}

              <VerdictView result={result} colors={colors}>
                <section className="flex justify-center pt-2 pb-1 px-2">
                  <ShareButton getShareUrl={getShareUrl} placeName={result.fairest.name} />
                </section>
              </VerdictView>

              <section className="flex justify-center gap-6 mt-6">
                <button
                  onClick={() => setPhase('crew')}
                  className="text-sm text-text-secondary hover:text-accent transition-colors"
                >
                  Change the crew
                </button>
                <button
                  onClick={() => setPhase('places')}
                  className="text-sm text-text-secondary hover:text-accent transition-colors"
                >
                  Change starting points
                </button>
              </section>
            </>
          )}
        </>
      )}

      <footer className="text-center text-sm text-text-secondary py-6 border-t border-border mt-10">
        HALF·POINT — London, {new Date().getFullYear()}
      </footer>
    </main>
  )
}
