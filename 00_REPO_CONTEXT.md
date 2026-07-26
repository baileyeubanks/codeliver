# CO-DELIVER Repo Context

## Role
Standalone review and delivery product under the Content Co-op umbrella.

## Canonical Repo
- `/Users/baileyeubanks/Desktop/Projects/contentco-op/cco-videopro-definitive-20260715`
- Branch: `codex/co-videopro-definitive-20260715`
- Reconciled HEAD: `a7eaaab73729b8e8f591f0ea18e1ee06ae21e499`
- Machine: M2
- The older `.../contentco-op/codeliver` checkout is superseded for local
  consolidation. This definitive repo is the canonical M2 source; deployed
  provenance remains unknown until independently verified.
- The sibling `cco-additive-capability-lab-20260725` worktree owns the isolated
  Published Playback v1 design lane. It is not part of canonical-repo mutation
  packets unless Bailey explicitly transfers or closes that lane.

## Current Condition
`PARTIAL` — the exact-SHA application-source harness reproduced green on M2 on
2026-07-26, and CCO-C2 now has a repo-owned production-mode listener plus an
anonymous fail-closed verifier receipt on `4103` at documentation-only HEAD
`bad8ef1`; `4115` remains unused. Authenticated/backend/media proof and the
real-file operating spine are not complete. P10–P28 have current
source-and-evidence classifications, but none qualifies as `REAL`. Historical
runtime proof and current blockers are separated in `STATUS.md` and
`BLOCKERS.md`.

## Canonical Scope
- review UI
- upload, storage, versioning, playback, and delivery
- comments and approvals
- sharing
- auth and data
- product shell
- client portal, requests, workspace, asset library, and reporting

## Canonical Product Truth
- Co-Deliver is one standalone review product.
- Public review happens at `/review/[token]`.
- Internal review happens at `/projects/[id]/assets/[assetId]`.
- Both routes now converge on one shared player-first review workspace contract.
- The canonical review surface is:
  - one compact top bar
  - one dominant media stage
  - one adjacent review rail

## Post-Stabilization Source Contracts
- Demo mode is an explicit server-only opt-in: `CODELIVER_DEMO_MODE=1`, additionally constrained to non-production localhost requests. `?demo=1` alone grants no authority; the proxy strips forged `x-codeliver-demo-preview` headers and stamps the internal capability header only after the local opt-in gate succeeds (`proxy.ts`, `lib/demo/server-mode.ts`, `lib/demo/capability-context.ts`).
- Central response helpers and covered route families enforce stable no-store
  JSON `{error, code}` responses; backend/provider failures map to opaque
  unavailable responses without leaking provider text. API-wide runtime
  coverage remains unknown pending CCO-C7 (`lib/api/backend.ts`,
  `lib/api/responses.ts`).
- Central security headers in `next.config.ts`: CSP with `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, strict referrer policy, `poweredByHeader: false`, `productionBrowserSourceMaps: false`, and a global `/api/:path*` `Cache-Control: no-store` rule.
- Public health probes `/api/health` and `/api/health/live` return only `{"status":"ok"}`; detailed readiness/dependency data is staff-gated (`app/api/health/_lib/access.ts`).
- Stripe access is server-only (`lib/covideopro/payments.server.ts`, `lib/covideopro/checkout.server.ts`) behind authenticated `POST /api/billing/checkout` with server-authoritative amounts, project-admin check, durable rate limit, and idempotency.
- Webhook management (`app/api/webhooks/**`) authenticates, validates `team_id`, requires team admin, and reserves a durable rate slot before reading any request body; persisted secret fields are sanitized and a signing secret is returned only once at creation.
- Dynamic project/asset/review/invite routes are server-wrapped: confirmed missing records return real `notFound()` 404s; backend failures stay retryable errors (`lib/dynamic-route-authority.ts`, `components/projects/ProjectWorkspaceClient.tsx`, `components/review/PublicReviewPage.tsx`).
- Uploads are designed around three separate fail-closed gates. Storage ingest
  readiness requires a writable implementation (`local` or `ccnas`), an
  explicit provider, write-enable flag, and provider-applicable root. Trusted
  scanner readiness then gates release from quarantine, and durable derivative
  enqueue gates playable processing. Current source has no production scanner
  hook and the readiness route hardcodes derivative enqueue as unconfigured,
  so ingest may be testable in an approved isolated environment while release
  and playable processing remain blocked (`app/api/upload/_shared.ts`,
  `lib/storage/config.ts`, `lib/storage/release-readiness.ts`,
  `app/api/storage/readiness/route.ts`).
- Public runtime must be `next start` on port 4103 via `scripts/rebuild-public-runtime.sh`, verified by `scripts/verify-runtime.sh`. Never serve the public surface from `next dev`. This is the required contract, not a claim that the runtime is currently up.

## Key Source Files
- `components/review/ReviewWorkspace.tsx`
- `components/review/ReviewMediaSurface.tsx`
- `app/review/[token]/page.tsx`
- `app/(review)/projects/[id]/assets/[assetId]/page.tsx`
- `proxy.ts`, `lib/demo/server-mode.ts`, `lib/api/backend.ts`, `lib/api/responses.ts`
- `next.config.ts`

## Current Risks
- source health is stronger than runtime/product truth; a green unit harness
  does not prove the real media lifecycle
- `share_intent` is still derived rather than hardened as a durable contract
- approval authority is still reviewer-email based rather than explicitly bound to an approval-step contract
- internal auth/data remains owner-scoped
- P19's `onLock` path remains unwired, so the visible approval flow cannot yet
  establish durable locked delivery
- upload reconciliation currently creates an asset but no V1 version; public
  review authority requires a resolvable version
- uploaded CCNAS media currently points at a staff-authenticated stream route,
  so anonymous token-review playback is not yet a proved path
- approval records are not yet exact-version-bound and externally attributable
  through the durable history needed for locked delivery
- several later capabilities use demo workspace or browser-local persistence;
  the CCO-C3 ledger labels them without promoting them to production truth
- authenticated database proof is blocked on Supabase URL/key/schema
  configuration
- positive media proof is blocked on explicit provider/write authority,
  storage root, and a production malware-scanner implementation

## Next Focus
- keep the shared player-first review workspace canonical
- preserve the independently reviewed CCO-C1 truth-doc commit, completed
  CCO-C3 source-and-current-evidence ledger, and current CCO-C2 anonymous
  runtime receipt; next establish CCO-C4 private readiness and the bounded
  CCO-C5 real spine
- keep P10–P28 classifications current as route/UI/data/authority/runtime
  evidence changes
- establish a current local production runtime receipt
- prove one real file through upload → asset → V1 → playback → anonymous
  public review → frame comment → attributable approval → locked delivery
- wire only the valuable partials required by that spine before expanding the
  feature frontier
- keep all commits local; push, deploy, DNS, database, provider, and
  destructive actions require Bailey's explicit approval

## Update Rule
Every future CO-DELIVER thread should read this file first and update it when repo truth materially changes.
