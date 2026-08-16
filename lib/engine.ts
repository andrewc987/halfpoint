import { Failure, LastTrainPlan, LatLng, OptimiseResponse, PersonLeg, ScoredCandidate, Terminal } from './types'
import { CANDIDATE_STATIONS, CandidateStation } from './candidates'
import { tflJourneys } from './providers/tfl'

export interface EnginePerson {
  id: string
  name: string
  origin: LatLng
  terminal?: Terminal
}

// 10 keeps a 4-person run (~40 matrix calls + terminal legs) inside TfL's
// anonymous per-IP budget on shared serverless egress; TFL_APP_KEY lifts it.
const SHORTLIST_SIZE = 10
const CONCURRENCY = 6
// Last-train: only compute candidate→terminal legs for the shortlist's top
// candidates after initial ranking (bounds the extra TfL calls), and drop a
// candidate if it forces a leave-by more than this much earlier than the best.
const TERMINAL_TOP_N = 6
const LEAVE_BY_BUFFER_MIN = 5
const LEAVE_BY_TOLERANCE_MIN = 20

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function lastTrainToday(terminal: Terminal, date: Date) {
  const day = DAY_NAMES[date.getDay()]
  return terminal.lastTrains.find((t) => t.daysOfWeek.includes(day))
}

function parseHHMM(time: string): number {
  const [h, m] = time.split(':').map(Number)
  let mins = h * 60 + m
  // 00:xx–02:xx departures belong to tonight's service, not this morning's.
  if (mins < 180) mins += 1440
  return mins
}

function formatHHMM(mins: number): string {
  const m = ((mins % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

function distSq(a: LatLng, b: LatLng): number {
  // Good enough for shortlisting at London scale; lng compressed for latitude.
  const dLat = a.lat - b.lat
  const dLng = (a.lng - b.lng) * 0.62
  return dLat * dLat + dLng * dLng
}

function shortlist(people: EnginePerson[]): CandidateStation[] {
  const centroid: LatLng = {
    lat: people.reduce((s, p) => s + p.origin.lat, 0) / people.length,
    lng: people.reduce((s, p) => s + p.origin.lng, 0) / people.length,
  }
  const byCentroid = [...CANDIDATE_STATIONS].sort(
    (a, b) => distSq(a.latLng, centroid) - distSq(b.latLng, centroid)
  )
  const picked = byCentroid.slice(0, SHORTLIST_SIZE)

  // Coverage: make sure each person's nearest candidate is in the shortlist,
  // so a far-flung origin isn't scored only against central picks.
  for (const person of people) {
    const nearest = CANDIDATE_STATIONS.reduce((a, b) =>
      distSq(a.latLng, person.origin) <= distSq(b.latLng, person.origin) ? a : b
    )
    if (!picked.some((c) => c.name === nearest.name)) picked.push(nearest)
  }
  return picked
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

function diffSentence(fairest: ScoredCandidate, quickest: ScoredCandidate): { agree: boolean; diff: string } {
  if (fairest.name === quickest.name) {
    return { agree: true, diff: `Both modes agree: ${fairest.name}.` }
  }
  const saved = fairest.totalMinutes - quickest.totalMinutes
  const worstLeg = quickest.legs.reduce((a, b) => {
    if (!a.ok) return b
    if (!b.ok) return a
    return a.minutes >= b.minutes ? a : b
  })
  const worstName = worstLeg.personName
  const worstMinutes = worstLeg.ok ? worstLeg.minutes : quickest.maxMinutes
  return {
    agree: false,
    diff: `Quickest would save the group ${saved} minutes overall — but ${worstName}'s trip jumps to ${worstMinutes} minutes. Fairest keeps everyone within ${fairest.maxMinutes}.`,
  }
}

export async function optimise(
  people: EnginePerson[],
  departureTime: Date = new Date()
): Promise<{ ok: true; result: OptimiseResponse } | { ok: false; error: string }> {
  if (people.length < 2) return { ok: false, error: 'At least two people needed.' }

  const candidates = shortlist(people)

  // people × shortlist journey lookups, bounded concurrency, every result cached by the provider.
  const pairs = candidates.flatMap((candidate) => people.map((person) => ({ candidate, person })))
  const legs = await mapWithConcurrency(pairs, CONCURRENCY, async ({ candidate, person }) => {
    const journey = await tflJourneys.journeyTime(person.origin, candidate.latLng, departureTime)
    return { candidate, person, journey }
  })

  const scored: ScoredCandidate[] = []
  const failures: Failure[] = []

  for (const candidate of candidates) {
    const candidateLegs: PersonLeg[] = people.map((person) => {
      const found = legs.find((l) => l.candidate.name === candidate.name && l.person.id === person.id)!
      if (found.journey.ok) {
        return {
          personId: person.id,
          personName: person.name,
          ok: true,
          minutes: found.journey.minutes,
          route: found.journey.route,
        }
      }
      failures.push({ kind: 'journey-leg', candidate: candidate.name, personId: person.id, personName: person.name })
      return { personId: person.id, personName: person.name, ok: false }
    })

    if (candidateLegs.every((l) => l.ok)) {
      const minutes = candidateLegs.map((l) => (l.ok ? l.minutes : 0))
      const max = Math.max(...minutes)
      const min = Math.min(...minutes)
      scored.push({
        name: candidate.name,
        postcode: candidate.postcode,
        latLng: candidate.latLng,
        maxMinutes: max,
        spread: max - min,
        totalMinutes: minutes.reduce((a, b) => a + b, 0),
        legs: candidateLegs,
      })
    }
  }

  if (scored.length < 3) {
    return {
      ok: false,
      error: "TfL isn't answering for most of these routes right now. Give it a minute, then run it again.",
    }
  }

  const byFairest = [...scored].sort(
    (a, b) => a.maxMinutes - b.maxMinutes || a.spread - b.spread || a.totalMinutes - b.totalMinutes
  )
  const byQuickest = [...scored].sort((a, b) => a.totalMinutes - b.totalMinutes || a.maxMinutes - b.maxMinutes)

  // Last-train constraint: for anyone heading home outside London, compute the
  // real TfL leg from each top candidate to their terminal, derive "leave the
  // venue by", and drop candidates that force an unreasonably early exit.
  const constrained = people
    .map((p) => (p.terminal ? { person: p, terminal: p.terminal, train: lastTrainToday(p.terminal, departureTime) } : null))
    .filter((c): c is { person: EnginePerson; terminal: Terminal; train: NonNullable<ReturnType<typeof lastTrainToday>> } =>
      Boolean(c && c.train)
    )

  for (const p of people) {
    if (p.terminal && !constrained.some((c) => c.person.id === p.id)) {
      failures.push({ kind: 'no-last-train-today', terminal: p.terminal.name, personId: p.id, personName: p.name })
    }
  }

  let pool = byFairest
  if (constrained.length > 0) {
    const considered = byFairest.slice(0, TERMINAL_TOP_N)
    if (!considered.includes(byQuickest[0])) considered.push(byQuickest[0])

    const terminalPairs = considered.flatMap((candidate) => constrained.map((c) => ({ candidate, c })))
    const terminalLegs = await mapWithConcurrency(terminalPairs, CONCURRENCY, async ({ candidate, c }) => {
      // A candidate that IS the terminal (e.g. meeting at Victoria, train from
      // Victoria) is a real 0-minute leg — TfL refuses zero-length journeys.
      if (distSq(candidate.latLng, c.terminal.latLng) < 5e-6 /* ~250 m */) {
        return { candidate, c, journey: { ok: true, minutes: 0, route: '' } as const }
      }
      // Terminal legs fire after the main matrix and are the first casualties of
      // TfL's anonymous rate limit (worst on shared serverless egress IPs) —
      // paced retries rescue most of them. TFL_APP_KEY removes the problem.
      let journey = await tflJourneys.journeyTime(candidate.latLng, c.terminal.latLng, departureTime)
      for (const delay of [2500, 6000]) {
        if (journey.ok) break
        await new Promise((r) => setTimeout(r, delay))
        journey = await tflJourneys.journeyTime(candidate.latLng, c.terminal.latLng, departureTime)
      }
      if (!journey.ok) {
        failures.push({
          kind: 'terminal-leg',
          candidate: candidate.name,
          terminal: c.terminal.name,
          personId: c.person.id,
          personName: c.person.name,
        })
      }
      return { candidate, c, journey }
    })

    // Per candidate: the earliest leave-by across constrained people (real legs only).
    const leaveByMins = new Map<string, number>()
    for (const { candidate, c, journey } of terminalLegs) {
      if (!journey.ok) continue // honest: no invented terminal leg, no constraint from it
      const leaveBy = parseHHMM(c.train.departureTime) - journey.minutes - LEAVE_BY_BUFFER_MIN
      const current = leaveByMins.get(candidate.name)
      leaveByMins.set(candidate.name, current === undefined ? leaveBy : Math.min(current, leaveBy))

      // Surface it on the person's leg for this candidate — magic, not a warning.
      const leg = candidate.legs.find((l) => l.personId === c.person.id)
      if (leg?.ok) {
        const plan: LastTrainPlan = {
          terminal: c.terminal.name,
          destination: c.train.destination,
          trainTime: c.train.departureTime,
          leaveBy: formatHHMM(leaveBy),
          toTerminalMinutes: journey.minutes,
        }
        leg.lastTrain = plan
      }
    }

    if (leaveByMins.size > 0) {
      const bestLeaveBy = Math.max(...leaveByMins.values())
      const kept = considered.filter((cand) => {
        const lb = leaveByMins.get(cand.name)
        return lb === undefined || lb >= bestLeaveBy - LEAVE_BY_TOLERANCE_MIN
      })
      if (kept.length > 0) pool = kept
      else pool = considered
    } else {
      pool = considered
    }
  }

  const fairest = pool.reduce((a, b) => (byFairest.indexOf(a) <= byFairest.indexOf(b) ? a : b))
  const quickest = pool.reduce((a, b) => (byQuickest.indexOf(a) <= byQuickest.indexOf(b) ? a : b))
  const { agree, diff } = diffSentence(fairest, quickest)

  return {
    ok: true,
    result: {
      fairest,
      quickest,
      agree,
      diff,
      ranked: pool.slice(0, 5),
      origins: people.map((p) => ({ personId: p.id, name: p.name, latLng: p.origin })),
      failures,
    },
  }
}
