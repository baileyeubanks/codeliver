# Co-ProVideo Stabilization Status

Updated: 2026-07-25
Machine: M2
Branch: `codex/co-videopro-definitive-20260715`

## Anti-Drift Contract

- Preserve the shared player-first review workspace.
- Keep one compact top bar, one dominant media stage, and one adjacent review rail.
- Do not deploy, push, alter DNS, or touch the public Content Co-op site from this loop.
- Treat missing auth, database, NAS, or provider configuration as an explicit unavailable state.

## Current State

The F1–F14 security stabilization is fully implemented in source and the source
harness is green. Atomic per-finding commits and runtime production proof are in
progress. The port-4103 listener was last confirmed as `next dev`; F10 is not
complete until it is `next start` via `scripts/rebuild-public-runtime.sh`.

## Harness Evidence (current truth)

Command set: `git diff --check && npm run typecheck && npm run lint && npm test && npm run build`

- `git diff --check`: pass
- `npm run typecheck`: pass, 0 errors
- `npm run lint`: pass, 0 errors, 40 warnings (pre-existing)
- `npm test`: pass, 722/722
- `npm run build`: pass (one pre-existing Turbopack NFT trace warning, unchanged)
- Runtime on `:4103`: last confirmed M2 `next dev`, not a production server

Do not cite the older 664/664 or 696/696 runs as current truth.

## Audit Finding Dispositions (handoff section 11)

| ID | Item | Disposition |
| --- | --- | --- |
| C1 | `?demo=1` authentication bypass | implemented (F1); runtime proof pending |
| C2 | no real server session / forgeable demo identity | implemented (F1/F12); real-session proof blocked on Supabase env |
| H1 | public source maps | implemented (`productionBrowserSourceMaps: false`); runtime proof pending |
| H2 | malformed RSC stack/path leak | verifier exists (`scripts/verify-runtime.sh`); runtime proof pending |
| H3 | launch editor endpoint | verifier exists; runtime proof pending |
| M1 | prefilled credentials | fixed and source-tested (F4) |
| M2 | Stripe server code in client bundle | code split implemented (F5); production bundle grep pending |
| M3 | clickjacking | fixed centrally (F3: `frame-ancestors 'none'`, `X-Frame-Options: DENY`); curl proof pending |
| M4 | missing security headers / powered-by | fixed centrally (F3); curl proof pending |
| M5 | webhook management unauthenticated/crashing | hardened and regression-tested (F7); runtime matrix pending |
| L1 | health topology | public probes minimized (F6); curl proof pending |
| L2 | route oracle / soft 404 | dynamic server wrappers added (F8); authenticated 404 proof blocked on Supabase env |
| L3 | production hostname references | intentional surface-routing configuration, not secrets; accepted |
| L4 | demo API empty 500s | broad API boundary fix implemented (F2/F13); runtime matrix pending |
| L5 | robots/sitemap redirect | fixed (F9 metadata routes + matcher exclusions) |
| L6 | TRACE and Retry-After hygiene | retry headers added on unavailable responses; production TRACE retest pending |

Tested-not-vulnerable audit items (preserve evidence, no speculative changes):
reflected XSS/SSTI, open redirect, CORS reflection, path traversal variants,
image optimizer SSRF, obvious project ID guessing, hardcoded secret values in chunks.

## Stabilization Backlog

| ID | Item | Status | Proof |
| --- | --- | --- | --- |
| F1 | Explicit local-only demo gate | Implemented | Source tests pass; runtime-proof-pending |
| F2 | Structured API unavailable errors | Implemented | Contract tests pass; runtime matrix pending |
| F3 | Security headers | Implemented | Source tests pass; curl proof pending |
| F4 | Login prefill removal | Implemented | Source tests pass |
| F5 | Stripe server-only checkout | Implemented | Source tests pass; bundle grep pending |
| F6 | Minimal public health | Implemented | Source tests pass; curl proof pending |
| F7 | Webhook hardening | Implemented | Source tests pass; runtime matrix pending |
| F8 | Real dynamic-route 404s | Implemented | Source tests pass; authenticated 404 blocked-on-env |
| F9 | Middleware static metadata exclusions | Implemented | Source tests pass |
| F10 | Production runtime on port 4103 | Scripts implemented | Runtime-proof-pending (4103 still `next dev`) |
| F11 | Fail-closed storage and retry UI | Implemented | Source tests pass; NAS proof blocked-on-env |
| F12 | Stable auth session JSON | Implemented | Source tests pass; runtime matrix pending |
| F13 | Error and response hygiene | Implemented | Source tests pass; runtime matrix pending |
| F14 | Contract documentation | Implemented | This update |

## Blocked-on-env

The absence of Supabase configuration and `NAS_MEDIA_ROOT` in the M2 shell
blocks all authenticated and NAS-backed runtime proof. Details and the exact
commands that would prove the blocked items are in `BLOCKERS.md`.

## Required Harness

- `npm run build`
- `npm run lint`
- `npx tsc --noEmit`
- `npm test`
- `scripts/verify-runtime.sh`
- Browser proof for upload, reload, playback, login, and protected-route behavior

## Runtime proof — 2026-07-25 (post-cutover)

- Port 4103: `next start` (next-server v16.2.10, parent `npm run start`) — dev runtime replaced.
- `scripts/verify-runtime.sh` ALL PASS (authenticated 404 SKIP — AUTH_COOKIE unset, see BLOCKERS.md):
  demo query blocked, structured session JSON, security headers, minimal health,
  no launch-editor behavior, no malformed-RSC stack/path leak, no Stripe server
  strings in client chunks, source maps unavailable (15 scripts).
- API down-backend matrix (backends absent): /api/auth/session, /api/projects,
  /api/assets, /api/webhooks, /api/folders, /api/teams, /api/notifications,
  /api/analytics/project, /api/storage/readiness, /api/upload/tus,
  /api/assets/[uuid], /api/assets/[uuid]/comments, /api/review/[token],
  /api/projects/[uuid] + POST /api/projects → ALL return structured
  503 {"error","code":"BACKEND_UNAVAILABLE"}, no-store, nosniff, JSON.
  Zero empty-body 500s, zero provider detail, zero framework HTML errors.
- TRACE /projects → 500 generic "Internal Server Error" text/plain (21 bytes,
  Next.js framework method handling; no header reflection, no env/stack leak).
  Accepted: framework-level, leaks nothing; 405 would be nicer but is Next's default.
- Commit 2d57b7b fixed a verifier false positive (login return-path echo).
