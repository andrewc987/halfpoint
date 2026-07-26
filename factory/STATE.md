# Factory State
project: HALF·POINT (halfpoint)
hq: /projects/hq/projects/halfpoint.md
stage: live
stage_name: live, two owner-side API unlocks outstanding
last_updated: 2026-07-26
next_action: Owner unlocks, no code needed — add a free TFL_APP_KEY (register at api-portal.tfl.gov.uk) to Vercel Production env to lift the anonymous TfL rate limit that suppresses legs/last-train lines on larger groups, and enable "Maps Static API" for the Google key in Cloud console so the live map stops silently falling back to SVG.
notes: Live at https://uk-telco-intel-mvp.vercel.app — the Vercel project still carries the old uk-telco-intel-mvp slug; rename + proper domain is a pending owner settings change.
  Phase-10 UX rebuild (Crew → Places → Verdict) shipped and live-verified 2026-07-02; GOOGLE_MAPS_API_KEY confirmed in Vercel Production.
  Hard rule: never invent a journey time — failed legs surface honestly.
  Build history and live-verification evidence: PROGRESS.md (superseded as the handover, kept for history). Decision records stay authoritative in DECISIONS.md (D1–D21).
