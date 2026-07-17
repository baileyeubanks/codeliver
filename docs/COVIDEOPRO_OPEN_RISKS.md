# Co-VideoPro — Open Risks

Tracked honestly. Each risk: severity, state, mitigation path.

## R1 — Migration 014 never executed against a live database (HIGH)

`supabase/migrations/20260716120000_project_operating_record.sql` is authored to the repo's fail-closed conventions but has not been applied to a running Postgres/Supabase — no local credentials exist in this environment. Risk: a syntax/RLS mistake surfaces only at deploy.
**Mitigation:** run `supabase db reset`/apply in staging before relying on the remote runtime; the demo runtime (localStorage) is unaffected. The DO-block policy loop and the sequence_clips policy were desk-checked; that is not proof.

## R2 — Dual-runtime divergence (MEDIUM)

Entity behavior is validated once in `lib/covideopro/transitions.ts` and consumed by the demo store; the Supabase API routes for the new entities do not exist yet, so the remote runtime currently lacks the record surfaces (Home/Opportunities/record sections render honest fallbacks there). Risk: when remote routes are written, behavior could drift from the demo runtime.
**Mitigation:** reuse the same validators in route handlers; add route-level tests mirroring `tests/covideopro-demo-store.test.ts` flows; keep D5 as a standing rule.

## R3 — Demo persistence is browser-local (MEDIUM)

The demo runtime persists to localStorage (`co-videopro.workspace.v2`). Clearing site data resets the workspace; large media uploads live in session memory or IndexedDB (`media-blob-store`). Risk: users mistake demo persistence for production durability.
**Mitigation:** the UI already labels demo mode; keep the "Local demo workspace" badge; document in README.

## R4 — Sequence model is data-truthful but not yet playable (MEDIUM)

Sequences/clips/selects are real records with source/record times and guarded transitions, but there is no playback engine or visual timeline yet. Risk: a future UI could over-promise (fake NLE).
**Mitigation:** D8 honesty rule — no timeline chrome until playback is real; when built, drive it from `sequence_clips` only.

## R5 — Review consolidation links comments by id, not by frame range (LOW)

Revision rounds reference comment ids; frame-accurate ranges live on the comments themselves. Cross-version comment carry-over (does a v5 comment still apply to v6?) is not modeled.
**Mitigation:** next slice: add `applies_to_version_id` + superseded/unresolved carry-over rules.

## R6 — Performance unmeasured for large libraries (LOW)

The demo slate is small (8 assets). Virtualization of large asset grids, transcript pagination, and waveform memory were not load-tested this phase.
**Mitigation:** performance pass with a generated large seed (500+ assets) before production rollout; the existing tus/ffmpeg pipeline is background-capable already.

## R7 — Deploy contract still says co-deliver (LOW)

`DEPLOY_CONTRACT.md`, Docker build, and the Coolify/GitHub wiring reference the codeliver repo and `deliver.contentco-op.com`. Renaming ops infrastructure is a production decision, out of mission scope.
**Mitigation:** keep `HEALTH_SERVICE_ID = "co-deliver"` stable for monitoring continuity; schedule an ops rename separately.

## R8 — Subagent quota exhaustion constrained parallelization (NOTE)

Exploration/implementation ran in the main agent context after the subagent pool returned 403s (D6). Risk: less independent review of design choices.
**Mitigation:** contract layer + 535 tests as executable review; re-run an independent review pass when quota refreshes.
