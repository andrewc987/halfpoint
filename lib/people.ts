import { Person } from './types'

// Every person gets a colour the moment they join the crew, and keeps it
// everywhere: name chip, place card, map dot, fairness bar. All eight clear
// WCAG AA for white text so avatars stay legible at any size.
export const PERSON_COLORS = [
  '#0066CC', // blue (brand accent)
  '#7C3AED', // violet
  '#C2410C', // burnt orange
  '#047857', // green
  '#BE185D', // pink
  '#4338CA', // indigo
  '#B45309', // amber
  '#0E7490', // teal
] as const

export function personColor(index: number): string {
  return PERSON_COLORS[index % PERSON_COLORS.length]
}

export function personInitial(name: string, index: number): string {
  const trimmed = name.trim()
  return trimmed ? trimmed[0].toUpperCase() : String(index + 1)
}

export function displayName(person: Person, index: number): string {
  return person.name.trim() || `Person ${index + 1}`
}

export function createPerson(name = ''): Person {
  return {
    id: `person-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    fromLocation: '',
    fromLatLng: null,
    homeLocation: '',
    homeLatLng: null,
    homePostcode: '',
  }
}

// ——— Crew memory ———
// Friend groups repeat. After a successful run the lineup (names + resolved
// locations) is kept on-device so next time it's one tap, not eight fields.

const CREW_KEY = 'halfpoint.crew.v1'
const SEEN_KEY = 'halfpoint.seen.v1'

export interface SavedCrew {
  people: Person[]
  savedAt: number
}

export function saveCrew(people: Person[]): void {
  try {
    localStorage.setItem(CREW_KEY, JSON.stringify({ people, savedAt: Date.now() } satisfies SavedCrew))
  } catch {
    /* private mode / quota — the feature just doesn't persist */
  }
}

export function loadCrew(): SavedCrew | null {
  try {
    const raw = localStorage.getItem(CREW_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SavedCrew
    if (!Array.isArray(parsed.people) || parsed.people.length < 2) return null
    return parsed
  } catch {
    return null
  }
}

export function markSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1')
  } catch {
    /* fine */
  }
}

export function hasSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return false
  }
}
