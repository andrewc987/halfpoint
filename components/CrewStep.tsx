'use client'

import { useRef, useState } from 'react'
import { Person } from '@/lib/types'
import { SavedCrew, displayName, personColor, personInitial } from '@/lib/people'

// Moment one of the argument: who's actually coming?
// Names go in fast — type, enter, next — and each person picks up the colour
// they'll keep for the rest of the journey (chip, card, map dot, fairness bar).
export default function CrewStep({
  people,
  savedCrew,
  showIntro,
  onAdd,
  onRemove,
  onLoadSaved,
  onDone,
}: {
  people: Person[]
  savedCrew: SavedCrew | null
  showIntro: boolean
  onAdd: (name: string) => void
  onRemove: (index: number) => void
  onLoadSaved: () => void
  onDone: (pendingName: string) => void
}) {
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const commitDraft = () => {
    const name = draft.trim().replace(/,+$/, '')
    if (!name) return
    onAdd(name)
    setDraft('')
    inputRef.current?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commitDraft()
    } else if (e.key === 'Backspace' && draft === '' && people.length > 0) {
      onRemove(people.length - 1)
    }
  }

  const effectiveCount = people.length + (draft.trim() ? 1 : 0)
  const canContinue = effectiveCount >= 2

  // Offer the saved crew only while this one's still empty — once names go in,
  // the user has made their choice.
  const offerSaved = savedCrew !== null && people.length === 0

  return (
    <section className="animate-fade-up">
      {showIntro && (
        <div className="mb-8 grid grid-cols-3 gap-2 text-center" aria-label="How it works">
          {[
            ['1', 'Name the crew'],
            ['2', 'Say where everyone starts'],
            ['3', 'Get the verdict, with receipts'],
          ].map(([n, line]) => (
            <div key={n} className="rounded-2xl bg-surface shadow-card px-2 py-3.5">
              <p className="text-xs font-semibold text-accent mb-1">{n}</p>
              <p className="text-xs text-text-secondary leading-snug">{line}</p>
            </div>
          ))}
        </div>
      )}

      {offerSaved && (
        <div className="mb-6 bg-surface rounded-2xl shadow-card p-4 sm:p-5">
          <p className="text-sm font-semibold text-text-primary mb-2">Same crew as last time?</p>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {savedCrew.people.map((p, i) => (
              <span key={p.id} className="inline-flex items-center gap-1.5 text-sm text-text-secondary">
                <span
                  className="w-5 h-5 rounded-full text-white text-[10px] font-bold inline-flex items-center justify-center"
                  style={{ backgroundColor: personColor(i) }}
                  aria-hidden
                >
                  {personInitial(p.name, i)}
                </span>
                {displayName(p, i)}
              </span>
            ))}
          </div>
          <button
            onClick={onLoadSaved}
            className="text-sm font-semibold text-accent hover:text-accent/80 transition-colors"
          >
            Load them →
          </button>
        </div>
      )}

      <h2 className="font-display text-2xl sm:text-3xl font-bold text-text-primary text-center mb-2">
        Who&apos;s coming?
      </h2>
      <p className="text-sm text-text-secondary text-center mb-6">
        First names will do. Two minimum, eight max.
      </p>

      <div
        className="bg-surface rounded-2xl shadow-card p-3 sm:p-4 flex flex-wrap items-center gap-2 cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {people.map((p, i) => (
          <span
            key={p.id}
            className="animate-crossfade inline-flex items-center gap-2 rounded-full pl-1 pr-2.5 py-1 text-sm font-medium text-text-primary bg-bg border border-border"
          >
            <span
              className="w-6 h-6 rounded-full text-white text-xs font-bold inline-flex items-center justify-center"
              style={{ backgroundColor: personColor(i) }}
              aria-hidden
            >
              {personInitial(p.name, i)}
            </span>
            {displayName(p, i)}
            <button
              onClick={(e) => {
                e.stopPropagation()
                onRemove(i)
              }}
              aria-label={`Remove ${displayName(p, i)}`}
              className="text-text-secondary hover:text-warning leading-none transition-colors"
            >
              ×
            </button>
          </span>
        ))}
        {people.length < 8 && (
          <input
            ref={inputRef}
            type="text"
            autoFocus
            value={draft}
            maxLength={20}
            placeholder={people.length === 0 ? 'Type a name, hit enter' : 'Another name…'}
            aria-label="Add a person"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            className="!w-auto flex-1 min-w-[10rem] !border-0 !shadow-none !bg-transparent !p-1.5 focus:!shadow-none"
            style={{ boxShadow: 'none' }}
          />
        )}
      </div>

      <button
        onClick={() => onDone(draft.trim())}
        disabled={!canContinue}
        className="btn-lift w-full mt-6 bg-accent text-white py-4 rounded-2xl text-base font-semibold transition-all hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
      >
        That&apos;s everyone.
      </button>
      {!canContinue && (
        <p className="text-xs text-text-secondary text-center mt-3">
          It takes at least two people to meet halfway.
        </p>
      )}
    </section>
  )
}
