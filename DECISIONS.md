# DECISIONS

One decision per entry, with the why.

## D1 — Journey/geocode provider for this run: TfL Unified API + postcodes.io (not Google)
The spec's primary plan was Google Routes/Geocoding/Places using "the key already in the env" — but no `GOOGLE_MAPS_API_KEY` exists in this container (verified: no `.env.local`, nothing in process env). Per the spec's blocker rule, shipping the best keyless/free-tier version: TfL Journey Planner (real multimodal London transit times, free, no key required at low volume) for journeys, postcodes.io for postcode geocoding, TfL StopPoint search for named-place lookup. All behind one provider interface (`lib/providers/`) so Google plugs in by adding the key and a provider file — the exact seam the spec asked to leave for TfL is simply reversed.

## D2 — No fabricated journey times, ever
The old `lib/algorithm.ts` silently fell back to haversine distance estimates when TfL failed. Removed. A failed leg renders as an honest "couldn't compute" state and the candidate is penalised/excluded rather than scored on invented numbers.

## D3 — Fairness definition (exact)
- **Fairest (default):** argmin over candidates of max(per-person journey minutes); ties broken by smallest spread (max − min).
- **Quickest:** argmin of sum(per-person journey minutes).
Both always computed; the diff sentence is generated from the actual numbers ("Quickest would save the group X minutes overall — but NAME's trip jumps to Y. Fairest keeps everyone within Z."). Identical winners → "Both modes agree: PLACE."

## D5 — Engine shape: shortlist 13 + per-person nearest, concurrency 6, hour-bucket cache
Candidates are pruned to the 13 nearest the group centroid plus each person's single nearest candidate (coverage for far-flung origins), bounding calls at ≤ people × (13 + people). Journey calls run 6 at a time. The TfL provider caches every lookup in-memory keyed by coords rounded to 3 dp + departure hour bucket, so toggles/retries never re-query. A candidate with any failed leg is excluded from ranking (failure recorded in the response); fewer than 3 rankable candidates → honest 502, never an estimate.

## D6 — Place search: TfL StopPoint + postcodes.io behind one PlaceSearchProvider
`/api/places` merges TfL StopPoint search (stations, with lat/lng) and postcodes.io autocomplete (bulk-resolved to coords). Postcode-looking queries rank postcodes first; everything else ranks stations first. Max 6 suggestions, deduped by label. Google Places drops into the same `PlaceSearchProvider` interface when the key exists.

## D7 — Map is a dependency-free SVG minimap
No Google key and no appetite for a heavy map library tonight: the result screen plots people's origins and the winner on an inline SVG scaled to the group's lat/lng bounding box — dashed convergence lines, labelled dots, on-voice and weightless. Swappable for a real map (Google JS / MapLibre) behind the same component boundary later.

## D8 — Both modes precomputed; venue UI parked
`/api/optimise` returns Fairest and Quickest winners (plus top-5 ranked and per-person legs for each) in one response, so the result-screen toggle is instant with no refetch. The venue layer is a later phase: `/api/venues` is kept working as-is, but the result screen doesn't render venues yet.

## D4 — Deploy = push `main`
No Vercel CLI/token in the container; the project deploys via git integration with production tracking `main`. Per the spec's explicit clearance to deploy to production throughout, each phase is committed on the working branch and merged to `main` to deploy, then verified against the live URL.

## D9 — Venue source: Overpass (OpenStreetMap) as the live keyless path; mock venues deleted
No Google key in this env, and the old keyless fallback returned five hard-coded fake venues — fabrication, banned. `/api/venues` now queries Overpass (free, no key) for named `amenity=pub|bar|cafe|restaurant` nodes/ways within 400m of the meet point, dedupes by name, biases pubs/bars first (evening product), and labels each with a straight-line walking estimate (5 km/h) — honest because it's a distance-to-venue label, not a journey time. 8s timeout; any failure returns an empty list and the result screen simply doesn't render the "Where to go" section — the recommendation stands on its own. The Google Places path is kept and takes over automatically when `GOOGLE_MAPS_API_KEY` exists, falling back to Overpass if it returns nothing.

## D10 — Share state carries a compact result summary; shared links re-run the engine
The `?s=` base64 state still encodes the people (inputs), and now also a tiny result summary `r` — winning place, per-person name+minutes, diff sentence — written when the share link is generated. Opening a shared link auto-runs the engine (times shown to the opener are always fresh, real lookups), while `r` exists purely so the server can emit a correct OG card without running journey lookups inside `generateMetadata`. Encoding is now UTF-8-safe (btoa choked on non-Latin-1 names); old plain-base64 links still decode.

## D11 — Server page wrapper for per-result metadata
`app/page.tsx` was a client component, which can't emit per-URL OG tags. Simplest correct split: `app/page.tsx` is now a thin server component with `generateMetadata({ searchParams })` that decodes `?s=` and points og:image at `/api/og` with the result's params (og:title "Meet at {place}", diff as description); the whole interactive app moved unchanged to `components/HomeClient.tsx`. `metadataBase` set from `NEXT_PUBLIC_BASE_URL` with the Vercel URL as default — kills the build warning and makes OG URLs absolute.

## D12 — OG card: next/og ImageResponse, edge runtime, app palette
`/api/og` renders the 1200×630 card with `next/og` — light #FAFAFA ground, HALF·POINT wordmark with the accent dot, big place name (scales down for long names), per-person time pills, diff sentence in secondary grey, system sans throughout. All content comes from query params; nothing is invented at render time.

## D14 — Copy voice rules (Phase 7)
Voice: dry, confident, blame-transferring — the app sides with whoever always gets the long journey, and gently takes the piss out of the person who picks somewhere convenient for themselves. Rules applied to every user-facing string:
- Keep Andrew's lines verbatim: hero "The app that stops one person always winning.", sub-head "Multi-person. Multi-modal. Last-train-aware.", CTA "Find somewhere fair." (full stop included — it's a verdict, not a request). Secondary line "Find the fairest place to meet. Then blame the algorithm." used as the metadata description.
- No "Oops", no exclamation marks, no emojis, no "Let's", no generic boilerplate ("Something went wrong!"). The test for every string: would this look AI-written? If yes, rewrite.
- Errors are honest and name the failing party: "TfL couldn't plan Ben's leg. Not our doing." / "TfL isn't answering for most of these routes right now." Never a vague apology.
- Don't overexplain mechanics — "Making sure nobody gets shafted" over a paragraph about minimax.
- Share confirmation transfers the blame: "Copied. Their problem now."

## D15 — Last-train-aware: static curated table × real TfL terminal legs (Phase 8)
When a person's "heading home to" resolves to an out-of-London terminal (home postcode's outward code hits the curated table in `lib/terminals.ts`), the last train becomes a real constraint: for the shortlist's top 6 Fairest candidates (plus the Quickest winner) the engine computes the person's real TfL journey from the candidate to their terminal — cached, real times only — and derives "leave the venue by" = last-train departure − journey − 5 min buffer, using the correct weekday/Sat/Sun variant for the current day (00:xx departures count as tonight's service). Candidates forcing a leave-by more than 20 min earlier than the best on offer are dropped before picking winners; the surviving plan renders on the person's journey card as magic, not a warning ("Makes the 23:30 to Colchester from Liverpool Street — leave by 22:57."). A failed terminal leg applies no constraint and shows no line — never an invented number. A candidate that IS the terminal is a real 0-minute leg (TfL refuses zero-length journeys). Londoners (no terminal hit): nothing changes. Share links already encode the home field, so reopening a link reproduces the constraint with fresh lookups.

## D16 — Last-train times are a curated static table; live lookup is a future upgrade
The terminal→home last-train departure itself comes from the static table, not a live timetable query — TfL's national-rail timetable coverage is the future upgrade and slots in behind the same lookup. The table was audited and spot-checked against published timetables (June 2026): Victoria→Brighton weekday corrected 23:32 → 23:52; Paddington→Reading corrected 23:48 → 23:38 (the old value was *later* than the last reliable train — the dangerous direction); Liverpool Street→Colchester 23:30 confirmed real (conservative — later stopping services exist). Entries are deliberately conservative where services thin out: missing a fictional earlier train costs minutes, inventing a later one strands someone.

## D13 — Share CTA: native share sheet first
The result-screen CTA is full-width on mobile and calls `navigator.share` (title "Meet at {place}" + URL — the group-chat-native path on iOS/Android); where unavailable it copies to clipboard with a quiet "Copied. Send it in the group chat." confirmation. A dismissed share sheet is treated as a non-event, not an error.

## D17 — Contrast-safe palette shift (Phase 9)
The original greys/oranges failed WCAG AA on the app's grounds: #86868B secondary text on #FAFAFA is ~3.5:1, #FF6B35 warning on white ~2.8:1, and white on #007AFF ~4.0:1. Nudged each to the nearest on-brand value that clears 4.5:1: secondary #6E6E73 (4.9:1 on #FAFAFA), warning #C2410C (5.2:1 on white), accent #0066CC (5.5:1 white-on-accent, 5.3:1 as text on #FAFAFA). Applied everywhere the colour appears — Tailwind theme, CSS vars, the SVG minimap and the OG card — so the brand stays one colour. Footer and loading text dropped their /50–/60 opacity tints for the same reason.

## D18 — Autocomplete is a real combobox; toggle is aria-pressed buttons (Phase 9)
The suggestion dropdown was click-only divs. Both place fields now share one PlaceField component implementing the WAI-ARIA combobox pattern: role=combobox with aria-expanded/aria-controls/aria-activedescendant on the input, role=listbox/option with aria-selected on the list, ArrowUp/Down to move, Enter to pick, Escape to close, mouse unchanged (onMouseDown so focus never bounces). The Fairest/Quickest control dropped the inaccurate tab semantics for plain buttons with aria-pressed. Share button announces "Copied to clipboard" via a visually-hidden aria-live region; the inline error region is role=alert. Global :focus-visible outline in the accent colour on all buttons/links.

## D20 — UX rebuilt around the argument itself: who → where → verdict (2026-07-02)
The single mega-form treated people as rows and the result as a stat dump. The flow is now shaped like the group-chat argument the app settles, three focused moments:
- **Crew** ("Who's coming?") — names go in as chips; each person picks up a colour they keep everywhere (chip, place card, map dot, fairness bar). Crews repeat, so the last successful lineup is saved on-device and offered back as "Same crew as last time?" — one tap instead of eight fields. First visit shows a three-beat how-it-works strip; never again after.
- **Places** ("Where's everyone starting?") — one card per person with a single question ("Where's Dan starting from?"), live progress copy ("2 of 4 in"), "Use my location" on empty fields, and the same home/last-train disclosure as before. CTA stays "Find somewhere fair." (verbatim, D14).
- **Verdict** — the fairest spot is THE VERDICT, proved by a fairness receipt: per-person colour bars on one shared scale, route + last-train line beneath each. Runners-up render as tappable challengers ("Still arguing? Tap the counter-offer") tagged "Quickest overall"/"The verdict", each showing its biggest loser ("Dan +5"); tapping one swaps the whole view (map, receipt) to make its case — and states why the verdict stands. The Fairest/Quickest toggle folded into this list; `result.ranked` (previously computed but unused by the UI) powers it with zero new API calls.
Shared links keep the same `?s=` encoding (old links still decode) and now land on the verdict with an "Add yourself →" banner, closing the group-chat loop. Loading copy is personalised with the crew's names. PersonRow/ResultView replaced by CrewStep/PlacesStep/VerdictView + a shared PlaceField; identity helpers in `lib/people.ts` (8 AA-contrast person colours).

## D21 — staticmap keyless response is 404, route forced dynamic
`/api/staticmap` returned `204` when `GOOGLE_MAPS_API_KEY` is absent, and Next's static optimisation re-wrapped the cached response through the Response constructor, which rejects null-body statuses — every MiniMap probe 500'd in keyless environments. The route is now `force-dynamic` and answers `404` (a body-legal status) for "no key / Google failed"; MiniMap's probe checks `r.ok` and falls back to the SVG minimap as before.

## D19 — `/` stays server-dynamic (per-result OG beats static prerender); TfL cache is per-instance
`/` cannot be statically prerendered while `generateMetadata` reads `?s=` — that per-result OG card is the Phase 5 product, so the dynamic render stays (the shell it serves is tiny; First Load JS 92.7 kB, interactive work all client-side; a corrupt `?s=` falls back to default metadata and a clean input state, verified with `/?s=garbage`). Separately: the TfL journey cache (D5) is a per-instance in-memory Map — it held across a session locally (identical /api/optimise: 6.1s then 0.013s) but on serverless each instance warms its own. The production upgrade is a shared KV/edge cache (Vercel KV or similar) behind the same cacheKey; it slots into lib/providers/tfl.ts without touching the engine.
