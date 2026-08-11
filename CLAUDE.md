# HALF·POINT

A group meetup optimiser: the fairest place in London for 2–8 people to meet,
using real TfL journey times, then a shareable briefing with per-person routes
and last-train warnings.

Next.js 14 App Router + TypeScript + Tailwind. No DB, no auth. Handover:
`factory/STATE.md`. Background in `DECISIONS.md`, `PROGRESS.md`, `tasks/`.

> The directory is named `uk-telco-intel.mvp` and the package is `halfpoint`.
> Same project — it is a London meetup app, not a telco one.

## Commands

```bash
npm install && npm run dev    # http://localhost:3000
cp .env.local.example .env.local
npm run build
npm run lint
```

## The rules that bite

- **It must work with no keys at all.** TfL and postcodes.io are free, so the
  app is fully functional keyless. `GOOGLE_MAPS_API_KEY` (Places, Static Maps,
  venues) and `TFL_APP_KEY` (higher rate limits) are enhancements only. Anything
  new must degrade the same way.
- **Provider calls fail soft** — return `{ ok: false }` or empty, never throw.
  A venue lookup that fails must never block a recommendation.
- **TfL's anonymous per-IP rate limit is the real constraint** on shared
  serverless egress, not compute. `lib/engine.ts` bounds concurrency, caps the
  shortlist and paces terminal-leg retries for that reason — don't widen any of
  them without setting `TFL_APP_KEY`.
- **The Google key stays server-side.** `/api/staticmap` proxies it and returns
  204 when unkeyed, so the client falls back to an SVG map.
- The fairness scoring ("fairest" = min worst-case time, then spread, then total;
  vs "quickest" = min total) plus the last-train constraint is the product. It
  lives in `lib/engine.ts`; candidates and terminals are curated data beside it.
