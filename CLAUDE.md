# CLAUDE.md

HALF·POINT — a group meetup optimiser that finds the fairest place in London for 2–8 people to meet, using real TfL journey times, then produces a shareable briefing with per-person routes and last-train warnings.

> Note: the directory is named `uk-telco-intel.mvp`, but the code (package name `halfpoint`) is a London meetup app, not a telco project. Documented from the actual code.

## Commands

Package manager: **npm** (`package-lock.json`).

- `npm run dev` — start the dev server (http://localhost:3000)
- `npm run build` — production build
- `npm run start` — serve the production build
- `npm run lint` — Next.js ESLint

First run: `npm install`, then `cp .env.local.example .env.local`.

## Architecture

- **Framework:** Next.js 14 (App Router) + TypeScript + Tailwind CSS. React 18. No DB, no auth — all state is client-side or derived from external APIs at request time.
- **`app/`** — routes. `layout.tsx` + `page.tsx` (server wrapper that emits per-result OG tags from a `?s=` share param and renders `HomeClient`). API routes under `app/api/`:
  - `optimise` — POST; the main endpoint. Validates 2–8 people, resolves out-of-London home postcodes to a terminal, calls the engine. `maxDuration = 60`.
  - `places` — GET autocomplete (proxies `lib/providers/geocode`).
  - `geocode` — GET postcode → coords + London terminal lookup.
  - `venues` — GET nearby venues (Google Places if keyed, else Overpass/OSM; failure = empty, never blocks recommendation).
  - `staticmap` — proxies Google Static Maps so the key stays server-side; returns 204 when unkeyed (client falls back to SVG).
  - `og` — edge runtime dynamic OG image (`next/og`) for shared results.
- **`components/`** — client UI: `HomeClient` (main app), `PersonRow`, `ResultView`, `MiniMap`, `ShareButton`.
- **`lib/`** — core logic:
  - `engine.ts` — the fairness optimiser. Shortlists candidate stations near the group centroid, fetches a people×candidates TfL journey matrix (bounded concurrency), scores by "fairest" (min worst-case time, then spread, then total) vs "quickest" (min total), applies a last-train constraint via candidate→terminal legs, returns both picks + a diff sentence.
  - `candidates.ts` — curated candidate meeting stations. `terminals.ts` — London rail terminals, last-train tables, postcode→terminal + borough lookups. `types.ts` — shared types.
  - `providers/` — external API adapters. `tfl.ts` (TfL Unified API journey planner, with in-memory cache keyed by rounded coords + hour bucket), `geocode.ts` (Google Places v1 if keyed, else TfL StopPoint + postcodes.io), `types.ts`.
- **Data flow:** user enters name / from / home per person → client geocodes via `/api/places` + `/api/geocode` → `/api/optimise` runs the engine against live TfL data → `ResultView` renders routes + last-train + venues; result is base64-encoded into a share URL that drives OG metadata.

## Conventions & notes

- **Env vars** (all optional; app works keyless — TfL and postcodes.io are free): `GOOGLE_MAPS_API_KEY` (Places autocomplete, Static Maps, venues), `TFL_APP_KEY` (raises TfL rate limits), `NEXT_PUBLIC_BASE_URL` (base for internal API calls, default `http://localhost:3000`). Never commit values; see `.env.local.example`.
- Path alias `@/*` maps to repo root (`tsconfig.json`), so imports are `@/lib/...`, `@/components/...`.
- TfL's anonymous per-IP rate limit is the main constraint on shared serverless egress — `engine.ts` bounds concurrency, caps the shortlist, and paces terminal-leg retries. Setting `TFL_APP_KEY` removes most of this.
- Provider calls fail soft (return `{ ok: false }` / empty) — the recommendation degrades gracefully rather than erroring.
- Deploy target is Vercel (`vercel.json` sets `framework: nextjs`); `.replit` also present for Replit dev.
- Tailwind theme is a bespoke Apple-style light palette (`tailwind.config.js`); OG image styling mirrors it.
- Additional context lives in `README.md`, `DECISIONS.md`, `PROGRESS.md`, and `tasks/`.
