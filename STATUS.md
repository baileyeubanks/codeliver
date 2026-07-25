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

The F1–F14 security stabilization is fully implemented, committed atomically
(ca9336b..c71eb04), and the source harness is green. Port 4103 runs `next start`
(post-cutover 2026-07-25) and the runtime verifier passes.

## Harness Evidence (current truth)

Command set: `git diff --check && npm run typecheck && npm run lint && npm test && npm run build`

- `git diff --check`: pass
- `npm run typecheck`: pass, 0 errors
- `npm run lint`: pass, 0 errors, 40 warnings (pre-existing)
- `npm test`: pass, 722/722
- `npm run build`: pass (one pre-existing Turbopack NFT trace warning, unchanged)
- Runtime on `:4103`: `next start` (production) since 2026-07-25 cutover; verifier PASS

Do not cite the older 664/664 or 696/696 runs as current truth.

## Audit Finding Dispositions (handoff section 11)

| ID | Item | Disposition |
| --- | --- | --- |
| C1 | `?demo=1` authentication bypass | fixed-proven (F1; prod 307→login, verifier PASS) |
| C2 | no real server session / forgeable demo identity | implemented (F1/F12); real-session proof blocked on Supabase env |
| H1 | public source maps | fixed-proven (maps 404 in production) |
| H2 | malformed RSC stack/path leak | fixed-proven (verifier PASS) |
| H3 | launch editor endpoint | fixed-proven (verifier PASS; false-positive fixed in 2d57b7b) |
| M1 | prefilled credentials | fixed-proven (F4; DOM inputs empty in prod) |
| M2 | Stripe server code in client bundle | fixed-proven (F5; chunk grep clean) |
| M3 | clickjacking | fixed-proven (F3: `frame-ancestors 'none'`, `X-Frame-Options: DENY`; curl-verified) |
| M4 | missing security headers / powered-by | fixed-proven (F3; curl-verified) |
| M5 | webhook management unauthenticated/crashing | fixed-proven (F7; POST → structured 503) |
| L1 | health topology | fixed-proven (F6; public probes minimal, /ready gated) |
| L2 | route oracle / soft 404 | dynamic server wrappers added (F8); authenticated 404 proof blocked on Supabase env |
| L3 | production hostname references | intentional surface-routing configuration, not secrets; accepted |
| L4 | demo API empty 500s | fixed-proven (F2/F13; down-backend matrix: zero empty 500s) |
| L5 | robots/sitemap redirect | fixed-proven (F9; both 200) |
| L6 | TRACE and Retry-After hygiene | TRACE → generic 500 (framework default, no leak, documented); Retry-After source-verified on 503 paths |

Tested-not-vulnerable audit items (preserve evidence, no speculative changes):
reflected XSS/SSTI, open redirect, CORS reflection, path traversal variants,
image optimizer SSRF, obvious project ID guessing, hardcoded secret values in chunks.

## Stabilization Backlog

| ID | Item | Status | Proof |
| --- | --- | --- | --- |
| F1 | Explicit local-only demo gate | Implemented | Source tests + runtime verifier PASS |
| F2 | Structured API unavailable errors | Implemented | Contract tests + down-backend matrix PASS |
| F3 | Security headers | Implemented | Source tests + curl-verified |
| F4 | Login prefill removal | Implemented | Source tests + prod DOM check PASS |
| F5 | Stripe server-only checkout | Implemented | Source tests + chunk grep clean |
| F6 | Minimal public health | Implemented | Source tests + curl-verified |
| F7 | Webhook hardening | Implemented | Source tests + runtime matrix PASS |
| F8 | Real dynamic-route 404s | Implemented | Source tests pass; authenticated 404 blocked-on-env |
| F9 | Middleware static metadata exclusions | Implemented | Source tests + curl-verified |
| F10 | Production runtime on port 4103 | Implemented | Cutover done; verify-runtime.sh PASS |
| F11 | Fail-closed storage and retry UI | Implemented | Source tests pass; NAS proof blocked-on-env |
| F12 | Stable auth session JSON | Implemented | Source tests + runtime matrix PASS |
| F13 | Error and response hygiene | Implemented | Source tests + runtime matrix PASS |
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
