'use client'

import { useState } from 'react'
import { Person } from '@/lib/types'
import { displayName, personColor, personInitial } from '@/lib/people'
import PlaceField from './PlaceField'

function PersonCard({
  person,
  index,
  autoFocus,
  onUpdate,
}: {
  person: Person
  index: number
  autoFocus: boolean
  onUpdate: (person: Person) => void
}) {
  const [showHome, setShowHome] = useState(Boolean(person.homeLocation))
  const needsConfirm = Boolean(person.fromLocation.trim() && !person.fromLatLng)
  const name = displayName(person, index)

  return (
    <div
      className={`bg-surface rounded-2xl shadow-card p-4 sm:p-5 transition-shadow ${
        needsConfirm ? 'ring-1 ring-warning/50' : ''
      }`}
    >
      <div className="flex items-center gap-2.5 mb-3">
        <span
          className="w-7 h-7 rounded-full text-white text-sm font-bold inline-flex items-center justify-center shrink-0"
          style={{ backgroundColor: personColor(index) }}
          aria-hidden
        >
          {personInitial(person.name, index)}
        </span>
        <p className="font-semibold text-text-primary">
          Where&apos;s {name} starting from?
        </p>
      </div>

      <PlaceField
        id={`${person.id}-from`}
        label={`${name} starting from`}
        placeholder="Postcode, station or place"
        value={person.fromLocation}
        resolved={Boolean(person.fromLatLng)}
        autoFocus={autoFocus}
        allowGeolocate
        onChange={(v) => onUpdate({ ...person, fromLocation: v, fromLatLng: null })}
        onPick={(label, latLng) => onUpdate({ ...person, fromLocation: label, fromLatLng: latLng })}
      />

      {!showHome ? (
        <button
          onClick={() => setShowHome(true)}
          className="mt-2.5 text-sm text-text-secondary hover:text-accent transition-colors"
        >
          + heading home somewhere different?
        </button>
      ) : (
        <div className="mt-2.5">
          <PlaceField
            id={`${person.id}-home`}
            label={`${name} heading home to`}
            placeholder="Home postcode or station"
            value={person.homeLocation}
            resolved={Boolean(person.homeLatLng)}
            onChange={(v) => onUpdate({ ...person, homeLocation: v, homeLatLng: null })}
            onPick={(label, latLng) => onUpdate({ ...person, homeLocation: label, homeLatLng: latLng })}
          />
          <p className="mt-1.5 text-xs text-text-secondary">
            A home postcode outside London switches on last-train protection.
          </p>
        </div>
      )}
    </div>
  )
}

// Moment two: the intel-gathering. One focused question per person,
// answered in whatever order — the CTA lights up when enough is in.
export default function PlacesStep({
  people,
  loading,
  onUpdate,
  onBack,
  onOptimise,
}: {
  people: Person[]
  loading: boolean
  onUpdate: (index: number, person: Person) => void
  onBack: () => void
  onOptimise: () => void
}) {
  const resolvedCount = people.filter((p) => p.fromLatLng).length
  const firstUnresolved = people.findIndex((p) => !p.fromLatLng)

  return (
    <section className="animate-fade-up">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="font-display text-2xl sm:text-3xl font-bold text-text-primary">
          Where&apos;s everyone starting?
        </h2>
        <button onClick={onBack} className="text-sm text-text-secondary hover:text-accent transition-colors shrink-0">
          ‹ Edit crew
        </button>
      </div>
      <p className="text-sm text-text-secondary mb-6" aria-live="polite">
        {resolvedCount === people.length
          ? 'Everyone’s in. Run it.'
          : `${resolvedCount} of ${people.length} in — pick from the suggestions so the times are real.`}
      </p>

      <div className="space-y-3 mb-6">
        {people.map((person, i) => (
          <PersonCard
            key={person.id}
            person={person}
            index={i}
            autoFocus={i === firstUnresolved}
            onUpdate={(updated) => onUpdate(i, updated)}
          />
        ))}
      </div>

      <button
        onClick={onOptimise}
        disabled={loading || resolvedCount < 2}
        className="btn-lift w-full bg-accent text-white py-4 rounded-2xl text-base font-semibold transition-all hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
      >
        {loading ? 'Working it out…' : 'Find somewhere fair.'}
      </button>
    </section>
  )
}
