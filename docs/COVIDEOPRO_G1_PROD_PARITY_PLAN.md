# Co-VideoPro — G1 Production-Runtime Parity Plan

**Date:** 2026-07-17 · **Author:** plan subagent (agent-16), reviewed and adopted by main agent · **Status:** M1 in execution (agent-17)

## Decisions on open questions
- (a) Client-surface proposal approval/milestone payment: **out of G1 scope** (admin-only; the client portal lane G7 owns that authority model).
- (b) minRole convention: **adopted** — GET=viewer, writes=editor, proposals/payments/stage=producer.
- (c) localStorage→Supabase import: **out of scope** for G1.

## Route surface (all NEW unless noted)
Workspace-scoped (authority `owner_id = user.id`): organizations (+/[id]), contacts (+/[id]), inquiries (+/[id], `/convert`).
Project-scoped (authority `getProjectAccess`): briefs, proposals (+approval→milestones side effect), plan-items, selects, sequences (+clips trim/split/remove), revision-requests, decisions, deliverables, stage advance, payment-milestones (+checkout), notification-outbox (+dispatch).
Changes: `app/api/projects*` select gains `stage, organization_id, primary_contact_id` (stage never body-writable); `proxy.ts` admin allowlist gains all new patterns (never client patterns in G1).

## Risky seams (from the plan agent)
1. **GRANT gap (blocker):** new tables need `GRANT ALL ... TO service_role` + `GRANT SELECT ... TO authenticated` or every route 500s.
2. **RLS:** add `FORCE ROW LEVEL SECURITY`; writes stay service-role-only by design (documented in-migration).
3. **Schema exposure:** PostgREST must expose `co_production` in staging before rollout.
4. **Launch gate:** routes missing from ADMIN_API_ROUTE_PATTERNS fail prod-only, silently.
5. **id/uuid:** demo `prefix-uuid` ids vs DB bare uuids — server-side uuid generation + regex validation.
6. **Non-atomic multi-writes** (convert, version+supersede, approval→milestones, sequence+clips): idempotent via constraints + repeat-call checks; `rpc` wrapper only if partial failure proves user-visible.
7. **`sequence_clips` has no `project_id`** — access/RLS resolve via parent sequence join; never trust client-supplied project_id.

## Milestones (risk-ordered: infra first, money last)
- **M1 (S)** — migration GRANTs/FORCE RLS, proxy patterns, projects stage fields, organizations/contacts/inquiries + convert, tenant harness extraction, launch-gate tests. ← agent-17
- **M2 (M)** — commercial spine: briefs, proposals (+version snapshots), approval→milestones idempotent side effect.
- **M3 (L)** — production/edit spine: plan-items, selects, sequences+clips, revision-requests, decisions, deliverables, stage route.
- **M4 (S-M)** — money + comms: milestone checkout/paid/void (mock default, Stripe gated on rk_), outbox read/dispatch, share-route outbox enqueue.

## Test strategy (S1 security plan binding)
Every route lands with its tenant tests in the same commit: A/B identity IDOR cases, authority asserted before any query, cross-project FK injection → 404, body allowlisting, validator-parity 422s with zero writes, side-effect idempotency (repeat approval → no duplicate milestones), launch-gate admin/client matrix. Harness: `tests/helpers/tenant-harness.ts` extracted from `tests/asset-tag-bulk-tenant-security.test.ts`.
