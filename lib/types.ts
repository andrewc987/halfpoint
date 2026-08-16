export interface LatLng {
  lat: number
  lng: number
}

export interface Person {
  id: string
  name: string
  fromLocation: string
  fromLatLng: LatLng | null
  homeLocation: string
  homeLatLng: LatLng | null
  homePostcode: string
  londonTerminal?: Terminal
}

export interface Terminal {
  name: string
  postcode: string
  latLng: LatLng
  lastTrains: LastTrain[]
}

export interface LastTrain {
  destination: string
  departureTime: string
  daysOfWeek: string[]
}

// Last-train plan for someone heading home outside London: the static-table
// departure plus a real TfL leg from the candidate to the terminal.
export interface LastTrainPlan {
  terminal: string
  destination: string
  trainTime: string // e.g. '23:42'
  leaveBy: string // trainTime − real TfL candidate→terminal journey − 5 min buffer
  toTerminalMinutes: number
}

export type PersonLeg =
  | { personId: string; personName: string; ok: true; minutes: number; route: string; lastTrain?: LastTrainPlan }
  | { personId: string; personName: string; ok: false }

export interface ScoredCandidate {
  name: string
  postcode: string
  latLng: LatLng
  maxMinutes: number
  spread: number
  totalMinutes: number
  legs: PersonLeg[]
}

// A degraded lookup the engine reports honestly instead of inventing a
// journey. Discriminated by `kind` — consumers switch on it, never parse
// a formatted string.
export type Failure =
  | { kind: 'journey-leg'; candidate: string; personId: string; personName: string }
  | { kind: 'no-last-train-today'; terminal: string; personId: string; personName: string }
  | { kind: 'terminal-leg'; candidate: string; terminal: string; personId: string; personName: string }

// Human-readable form of a failure, for logs or any surface that shows one.
export function failureLabel(f: Failure): string {
  switch (f.kind) {
    case 'journey-leg':
      return f.candidate
    case 'no-last-train-today':
      return `${f.terminal} (no last-train entry today)`
    case 'terminal-leg':
      return `${f.candidate} → ${f.terminal} (terminal leg)`
  }
}

export interface OptimiseResponse {
  fairest: ScoredCandidate
  quickest: ScoredCandidate
  agree: boolean
  diff: string
  ranked: ScoredCandidate[]
  origins: { personId: string; name: string; latLng: LatLng }[]
  failures: Failure[]
}

export interface Venue {
  name: string
  type: string
  walkingMinutes: number
}
