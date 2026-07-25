# CO-DELIVER Repo Context

## Role
Standalone review and delivery product under the Content Co-op umbrella.

## Canonical Repo
- `/Users/baileyeubanks/Desktop/Projects/contentco-op/cco-videopro-definitive-20260715`
- Branch: `codex/co-videopro-definitive-20260715`
- Machine: M2
- The older `.../contentco-op/codeliver` checkout is superseded; this definitive repo is the only live source.

## Current Condition
`partial` — F1–F14 security stabilization implemented and source-harness green; runtime production proof pending (see `STATUS.md` and `BLOCKERS.md`).

## Canonical Scope
- review UI
- comments and approvals
- sharing
- auth and data
- product shell

## Canonical Product Truth
- Co-Deliver is one standalone review product.
- Public review happens at `/review/[token]`.
- Internal review happens at `/projects/[id]/assets/[assetId]`.
- Both routes now converge on one shared player-first review workspace contract.
- The canonical review surface is:
  - one compact top bar
  - one dominant media stage
  - one adjacent review rail

## Post-Stabilization Security / Runtime Behavior
- Demo mode is an explicit server-only opt-in: `CODELIVER_DEMO_MODE=1`, additionally constrained to non-production localhost requests. `?demo=1` alone grants no authority; the proxy strips forged `x-codeliver-demo-preview` headers and stamps the internal capability header only after the local opt-in gate succeeds (`proxy.ts`, `lib/demo/server-mode.ts`, `lib/demo/capability-context.ts`).
- Every API error is a stable no-store JSON `{error, code}` response; backend/provider failures map to opaque `503 BACKEND_UNAVAILABLE` / `STORAGE_UNAVAILABLE` without leaking provider text (`lib/api/backend.ts`, `lib/api/responses.ts`).
- Central security headers in `next.config.ts`: CSP with `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, strict referrer policy, `poweredByHeader: false`, `productionBrowserSourceMaps: false`, and a global `/api/:path*` `Cache-Control: no-store` rule.
- Public health probes `/api/health` and `/api/health/live` return only `{"status":"ok"}`; detailed readiness/dependency data is staff-gated (`app/api/health/_lib/access.ts`).
- Stripe access is server-only (`lib/covideopro/payments.server.ts`, `lib/covideopro/checkout.server.ts`) behind authenticated `POST /api/billing/checkout` with server-authoritative amounts, project-admin check, durable rate limit, and idempotency.
- Webhook management (`app/api/webhooks/**`) authenticates, validates `team_id`, requires team admin, and reserves a durable rate slot before reading any request body; persisted secret fields are sanitized and a signing secret is returned only once at creation.
- Dynamic project/asset/review/invite routes are server-wrapped: confirmed missing records return real `notFound()` 404s; backend failures stay retryable errors (`lib/dynamic-route-authority.ts`, `components/projects/ProjectWorkspaceClient.tsx`, `components/review/PublicReviewPage.tsx`).
- Uploads fail closed: storage readiness is asserted before upload bytes are consumed; missing `NAS_MEDIA_ROOT` returns retryable `503 STORAGE_UNAVAILABLE` (`app/api/upload/_shared.ts`).
- Public runtime must be `next start` on port 4103 via `scripts/rebuild-public-runtime.sh`, verified by `scripts/verify-runtime.sh`. Never serve the public surface from `next dev`.

## Key Source Files
- `components/review/ReviewWorkspace.tsx`
- `components/review/ReviewMediaSurface.tsx`
- `app/review/[token]/page.tsx`
- `app/(review)/projects/[id]/assets/[assetId]/page.tsx`
- `proxy.ts`, `lib/demo/server-mode.ts`, `lib/api/backend.ts`, `lib/api/responses.ts`
- `next.config.ts`

## Current Risks
- remaining instability is now mostly under the product model, not the visible shell
- `share_intent` is still derived rather than hardened as a durable contract
- approval authority is still reviewer-email based rather than explicitly bound to an approval-step contract
- internal auth/data remains owner-scoped
- authenticated end-to-end browser QA is blocked on Supabase credentials (see `BLOCKERS.md`)

## Next Focus
- keep the shared player-first review workspace canonical
- harden sharing, approval, and auth/data contracts without reintroducing dashboard-shell drift
- keep captain-thread convergence inside this repo only
- complete runtime proof per `STATUS.md` before any Section 7 work

## Update Rule
Every future CO-DELIVER thread should read this file first and update it when repo truth materially changes.
