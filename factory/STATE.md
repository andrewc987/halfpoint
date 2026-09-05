# Factory State
project: HALF·POINT (halfpoint)
hq: /projects/hq/projects/halfpoint.md
stage: live
stage_name: live, two owner-side API unlocks outstanding
branch: main
last_updated: 2026-09-05 (handover refresh; no code change since 2026-08-16)
next_action: Owner unlocks, no code needed — add a free TFL_APP_KEY (register at api-portal.tfl.gov.uk) to Vercel Production env to lift the anonymous TfL rate limit that suppresses legs/last-train lines on larger groups, and enable "Maps Static API" for the Google key in Cloud console so the live map stops silently falling back to SVG. No commit since 2026-07-26 touches either, so both are still open as far as the repo can show; whether Andrew did them in the consoles is unknown from here.
notes: Live at https://uk-telco-intel-mvp.vercel.app (HTTP 200 measured 2026-09-05). The Vercel project still carries the old uk-telco-intel-mvp slug; rename + a proper domain is a pending owner settings change. Whether the deployed build is current main was not measured — check the Vercel dashboard if it matters.
  SINCE THE 2026-07-26 HANDOVER, measured from git log on 2026-09-05: (1) 2026-08-11, two instruction-file commits (e07b278, c9eb4fa) trimmed CLAUDE.md to the house briefing convention — docs only, no product change. (2) 2026-08-16, PR #6 (branch simplify/failures-union) MERGED as 737de4d — audit findings HP.1 + HP.2. Failures are now a discriminated union (kind: journey-leg | no-last-train-today | terminal-leg); VerdictView switches on kind and matches legs by personId, no more string parsing. Dead fields deleted: Person.homePostcode, Person.londonTerminal, EnginePerson.homeLatLng. Person.homeLatLng is live and untouched. main has no commits after 737de4d.
  Phase-10 UX rebuild (Crew → Places → Verdict) shipped and live-verified 2026-07-02; GOOGLE_MAPS_API_KEY confirmed in Vercel Production.
  Hard rule: never invent a journey time — failed legs surface honestly.
  Build history and live-verification evidence: PROGRESS.md (superseded as the handover, kept for history). Decision records stay authoritative in DECISIONS.md (D1–D21).
