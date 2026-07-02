# PROGRESS

Running log for the overnight rebuild (`tasks/halfpoint-overnight.md`).

## Phase 0 — Discovery & groundwork ✅ (2026-06-12)

**Environment**
- Repo at `/home/user/uk-telco-intel.mvp`, branch `claude/magical-ramanujan-eymo44`, remote `origin` on GitHub (`andrewc987/uk-telco-intel.mvp`).
- Live production deploy confirmed up: `https://uk-telco-intel-mvp.vercel.app` (HTTP 200, title "HALF·POINT — The fairest place to meet in London"). Vercel deploys via git integration; production tracks `main`.
- No Vercel CLI or `.vercel` link in this container; deploy-to-production = merge/push `main`.
- Outbound network open: `maps.googleapis.com` 200, `api.postcodes.io` 200, `api.tfl.gov.uk` 200 (all verified by curl this session).

**Keys**
- `GOOGLE_MAPS_API_KEY`: **NOT present in this container's env** (no `.env.local`, nothing in process env). It may exist in Vercel's Production env, but local dev and direct API verification from here cannot use Google. → See "Hand back to Andrew".
- TfL Unified API and postcodes.io are keyless/free and reachable — building tonight's journey/geocode providers on those, behind the provider-agnostic interface the spec mandates, so Google slots in as soon as the key is available.

**Baseline**
- `next build` green (Next.js 14, app router). Routes: `/` static + 6 API routes. One warning: `metadataBase` unset.
- No test suite, no lint config beyond Next defaults.
- Current app audit: working MVP with autocomplete (Google-or-postcodes.io fallback), 3 scoring methods, TfL journey calls **with a silent haversine fallback that fabricates times — must be removed per spec ("never invent a number")**, venue search, base64 share URLs. UI is a bare form — full rebuild per spec.

## Phases 1–3 — Input flow, engine, result screen ✅ (deployed & live-verified)

Commits `037e803` (input), `0d7ba52` (engine), `32f54b4` (result) — merged to `main`, deployed to production via Vercel git integration.

**Live verification (production URL, real TfL responses this session):**
- Homepage serves the new build (hero "The app that stops one person always winning" confirmed by curl).
- `POST /api/optimise` with the 4-person test group (Canary Wharf / Hammersmith / Camden / Brixton) returned, from live TfL lookups:
  - **Fairest: Westminster** — Ana 33 ("10-min walk, Jubilee line then 12-min walk"), Ben 36 (District line), Cam 32 (24 bus), Dee 25 (159 bus). Max 36, spread 11, total 126.
  - **Quickest: Oxford Circus** — diff sentence generated from actual numbers: "Quickest would save the group 7 minutes overall — but Ben's trip jumps to 41 minutes. Fairest keeps everyone within 36."
- Haversine fabricator deleted; failed legs surface as `ok:false`, candidates with failures excluded from ranking.

## Phases 4–5 — Venues + share/OG ✅ (deployed & live-verified)

Commits `f4a731f` (venues), `9c9f6d6` (share/OG) — merged to `main`, deployed.

**Live verification (production, this session):**
- `/api/venues?lat=51.5137&lng=-0.1310` (Soho) returned real OSM venues: Royal George (Pub, 2 min), Waxy's Little Sister, Rupert Street, White Horse, The Flying Horse. Mock/fabricated venues deleted from the codebase.
- `/api/og` → 200 `image/png` 1200×630; vision-checked the rendered card (wordmark, "MEET AT Westminster", per-person time pills Ana 33 / Ben 36 / Cam 32 / Dee 25, diff sentence). OG param format: repeated `p=Name|minutes`.
- Share URL (`/?s=...`) returns 200 and re-runs the engine on open so results reproduce with fresh real times.

## Phases 7–8 — Copy + last-train ✅ (deployed; live-verified with one known flake)

Commits `e897c4b` (copy), `7464af1` (last-train) — merged to `main`, deployed.

**Live verification (production, this session):**
- New copy live (hero/description "blame the algorithm" confirmed).
- Last-train, 2-person group with home CO1: Liz's leg returned `{terminal: Liverpool Street, destination: Colchester, trainTime: 23:30, toTerminalMinutes: 13 (real TfL), leaveBy: 23:12}` ✓.
- **Known flake:** on 4-person runs the terminal legs fire after ~60 anonymous TfL calls and can get rate-limited; the engine then honestly omits the constraint (never invents a time), so the last-train line can be missing under load. Direct TfL Westminster→Liverpool St verified fine (29 min) — it's throttling, not logic. Fix queued: retry/backoff on terminal legs; proper fix is a free `TFL_APP_KEY` (hand-back below).
- Last-train table spot-checked against published timetables; two entries corrected (Paddington→Reading was wrong in the dangerous direction).

## Phases 6+9 — Motion polish, a11y, robustness ✅ (deployed)
Commits `2df6e4f`, `2403d29` + hardening `a1405a2`/follow-ups. WCAG-AA palette (measured ratios), WAI-ARIA combobox autocomplete with keyboard nav, staged result reveal with prefers-reduced-motion, corrupt `?s=` handled, OG fallback card, TfL cache confirmed (repeat query 6.1s → 0.013s). Bundle +0.8 kB, no new deps.

## Known limitation — TfL anonymous rate limit from Vercel egress (BLOCKER, key fixes it)
Diagnosed via the failures list on live: on 4-person runs, TfL hard-throttles Vercel's shared egress IP — late-run calls (including all candidate→terminal legs) fail even with 2 paced retries and after multi-minute cooldown, while the identical run from this container's IP succeeds fully (Liz: real 27-min Westminster→Liverpool St leg, "leave by 22:58"). Mitigations shipped: shortlist 13→10, terminal-leg retries (2.5s/6s), `maxDuration` 60, failures surfaced honestly — the app never invents a number; small groups work live (2-person last-train verified live: 23:30 train, leave by 23:12). **The fix is a free `TFL_APP_KEY` in Vercel env — the provider already sends it when present. No code change needed.**

## Hand back to Andrew
- **Add a free `TFL_APP_KEY`** (register at api-portal.tfl.gov.uk) to Vercel Production env. This is the one blocker: it lifts the anonymous per-IP rate limit that currently suppresses some legs/last-train lines on larger groups on live. Everything is wired; redeploy not even required beyond the env change.
- `GOOGLE_MAPS_API_KEY` is not available in this execution container. Add it to the container env (or confirm it in Vercel Production env) to activate the Google provider. Tonight's build runs on TfL + postcodes.io (free, real journey times) behind the same provider interface — no fabricated times.
- Vercel project rename off `uk-telco-intel-mvp` slug + domain/DNS — settings changes only Andrew can make.

## Phase 10 — Full UX rebuild around the argument ✅ (2026-07-02, branch `claude/halfpoint-app-check-rx2jse`)

The journey is now the group-chat argument itself, three focused moments (see D20):
**Crew** (name chips with persistent per-person colours, on-device "Same crew as last time?" memory, first-visit how-it-works) → **Places** (one question per card, live "2 of 4 in" progress, Use my location) → **Verdict** (fairness receipt with per-person colour bars on one shared scale, tappable challenger candidates with biggest-loser deltas, colour-coded map, "Add yourself" banner on opened share links).

- New: `lib/people.ts`, `CrewStep.tsx`, `PlacesStep.tsx`, `VerdictView.tsx`, `PlaceField.tsx`. Removed: `PersonRow.tsx`, `ResultView.tsx`. `?s=` share encoding unchanged — old links still work.
- Fixed pre-existing bug: keyless `/api/staticmap` 500'd on every MiniMap probe (Response constructor rejects cached 204); now `force-dynamic` + 404, SVG fallback intact (D21).
- Verified end-to-end this session with Playwright against a production build and live TfL: crew → places (Peckham Rye / Angel / Clapham Common) → verdict (London Bridge, max 27 min, gap 6), challenger tap (Southwark — "The verdict stands"), crew memory on reload, shared-link open with add-yourself banner. `next build` green, First Load JS 95.9 kB.
