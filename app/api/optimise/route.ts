import { NextRequest, NextResponse } from 'next/server'
import { optimise, EnginePerson } from '@/lib/engine'
import { Person } from '@/lib/types'
import { getPostcodeOutward, lookupTerminal } from '@/lib/terminals'

// Big groups + terminal-leg retries can exceed Vercel's default function window.
export const maxDuration = 60

// "Heading home to" only becomes a last-train constraint when it resolves to a
// known out-of-London terminal — i.e. the home field looks like a postcode
// whose outward code is in the curated table. Londoners: nothing changes.
function terminalForHome(p: Person) {
  const raw = (p.homeLocation || '').toUpperCase().replace(/\s+/g, '')
  if (!raw) return undefined
  if (/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(raw)) return lookupTerminal(getPostcodeOutward(raw))
  if (/^[A-Z]{1,2}\d{1,2}[A-Z]?$/.test(raw)) return lookupTerminal(raw)
  return undefined
}

export async function POST(request: NextRequest) {
  let body: { people?: Person[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const people = body.people || []
  if (people.length < 2) {
    return NextResponse.json({ error: 'It takes at least two people to meet halfway.' }, { status: 400 })
  }
  if (people.length > 8) {
    return NextResponse.json({ error: "Eight people max. That's a meetup, not a festival." }, { status: 400 })
  }

  const enginePeople: EnginePerson[] = []
  for (let i = 0; i < people.length; i++) {
    const p = people[i]
    if (!p.fromLatLng || typeof p.fromLatLng.lat !== 'number' || typeof p.fromLatLng.lng !== 'number') {
      return NextResponse.json(
        { error: `${p.name || `Person ${i + 1}`} needs a starting point picked from the suggestions.` },
        { status: 400 }
      )
    }
    enginePeople.push({
      id: p.id || `person-${i}`,
      name: p.name?.trim() || `Person ${i + 1}`,
      origin: p.fromLatLng,
      terminal: terminalForHome(p),
    })
  }

  const outcome = await optimise(enginePeople)
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: 502 })
  }
  return NextResponse.json(outcome.result)
}
