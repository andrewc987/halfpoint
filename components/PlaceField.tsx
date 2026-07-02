'use client'

import { useEffect, useRef, useState } from 'react'
import { PlaceSuggestion } from '@/lib/providers/types'
import { LatLng } from '@/lib/types'

// One forgiving autocomplete field: combobox input + listbox of options,
// arrow keys/Enter/Escape all work, mouse still wins. Optionally offers
// "Use my location" as the first row while the field is empty.
export default function PlaceField({
  id,
  label,
  placeholder,
  value,
  resolved,
  autoFocus,
  allowGeolocate,
  onChange,
  onPick,
}: {
  id: string
  label: string
  placeholder: string
  value: string
  resolved: boolean
  autoFocus?: boolean
  allowGeolocate?: boolean
  onChange: (v: string) => void
  onPick: (label: string, latLng: LatLng) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [locating, setLocating] = useState(false)

  const close = () => {
    setOpen(false)
    setActive(-1)
  }

  const query = (q: string) => {
    if (debounce.current) clearTimeout(debounce.current)
    if (q.trim().length < 2) {
      setSuggestions([])
      close()
      return
    }
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/places?q=${encodeURIComponent(q)}`)
        if (!res.ok) return
        const data = await res.json()
        const list: PlaceSuggestion[] = data.suggestions || []
        setSuggestions(list)
        setOpen(list.length > 0)
        setActive(-1)
      } catch {
        /* leave previous suggestions */
      }
    }, 250)
  }

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const pick = (s: PlaceSuggestion) => {
    close()
    onPick(s.label, s.latLng)
  }

  const geolocate = () => {
    if (!navigator.geolocation || locating) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        close()
        onPick('My location', { lat: pos.coords.latitude, lng: pos.coords.longitude })
      },
      () => setLocating(false),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    )
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((active + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(active <= 0 ? suggestions.length - 1 : active - 1)
    } else if (e.key === 'Enter') {
      if (active >= 0) {
        e.preventDefault()
        pick(suggestions[active])
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
  }

  const listboxId = `${id}-listbox`
  const showGeolocate = Boolean(
    allowGeolocate && !resolved && value.trim().length === 0 && typeof navigator !== 'undefined' && navigator.geolocation
  )

  return (
    <div className="relative" ref={ref}>
      <input
        type="text"
        inputMode="text"
        autoComplete="off"
        autoFocus={autoFocus}
        id={id}
        placeholder={placeholder}
        aria-label={label}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${id}-option-${active}` : undefined}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          query(e.target.value)
        }}
        onKeyDown={onKeyDown}
      />
      {resolved && (
        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-success text-base" aria-hidden>
          ✓
        </span>
      )}
      {showGeolocate && (
        <button
          type="button"
          onClick={geolocate}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-accent hover:text-accent/80 px-2 py-1 transition-colors"
        >
          {locating ? 'Locating…' : 'Use my location'}
        </button>
      )}
      {open && (
        <div className="autocomplete-dropdown" role="listbox" id={listboxId} aria-label={`${label} suggestions`}>
          {suggestions.map((s, i) => (
            <div
              key={i}
              id={`${id}-option-${i}`}
              role="option"
              aria-selected={i === active}
              className="autocomplete-item"
              onMouseDown={(e) => {
                e.preventDefault()
                pick(s)
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span className="text-text-primary">{s.label}</span>
              {s.sublabel && <span className="text-text-secondary ml-2 text-xs">{s.sublabel}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
