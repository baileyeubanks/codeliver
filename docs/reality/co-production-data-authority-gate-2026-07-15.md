# Co-Production Data Authority Gate

**Snapshot:** 2026-07-15  
**Repository baseline:** `main` at `585a703d6bfbee6a2a6c0bd46f93b30a4dd7f298` plus an intentionally uncommitted integration workspace  
**Current launch decision:** **FAIL CLOSED - NOT APPROVED FOR PRODUCTION DATA OR TRAFFIC**

This is the reality record for the Co-Production authority layer. A working demo, a polished cockpit, passing unit tests, or a healthy localhost process does not clear this gate. The public `contentco-op.com` site is outside this rollout and must remain untouched.

## Proven Locally

- The additive migration targets `co_production` and `co_production_private`; it does not alter or adopt generic tables in `public`.
- Production configuration requires both server and browser clients to select `co_production`.
- Service-role access fails closed when its key is absent.
- Review and team invitation bearer tokens are hash-addressed and encrypted at rest in the isolated schema contract.
- Review analytics bind to an invite token, reject arbitrary tracking data, use idempotent request IDs, and derive rotating HMAC viewer identifiers rather than storing raw addresses.
- Project, asset, version, comment, approval, review-link, transcript, analysis, upload, export, and webhook routes now have explicit role floors in the current workspace.
- Production version creation routes through the authenticated `co_production.create_asset_version` function, which locks the asset and atomically advances the version, asset, carried comments, approval reset, and activity history.
- Managed webhook tests and approval events enqueue through a bounded durable
  outbox contract before network delivery. Managed share notifications enqueue
  through the same transaction that creates the managed share manifest, with
  an audit-receipt reference and exact recipient/asset/version scope
  fingerprint.
- Webhook signing binds the timestamp, delivery ID, delivery attempt, and exact
  body. Source contracts persist the authoritative team on every delivery and
  cover idempotency conflicts, lease fencing and renewal, replay-safe settlement
  receipts, retry, dead-letter state, append-only audit events, and
  audit-preserving endpoint deactivation.
- External AI review analysis is exact-version bound, excludes reviewer identities, requires an explicit enable flag, bounds inputs, validates output, and records provider token usage as observed.
- The complete local suite passes `816/816`; TypeScript, scoped ESLint, the
  native 64-page webpack build, and `24/66` static certification checks pass in
  the current workspace.

These facts are source and local-test evidence only. They are not database, staging, deployment, tunnel, or production proof.

## Blocking Evidence

1. The migration set containing `supabase/migrations/20260715093300_fail_closed_co_production_authority.sql`, `supabase/migrations/20260715212000_notification_outbox.sql`, `supabase/migrations/20260715222311_versioned_notification_preferences.sql`, `supabase/migrations/20260715224500_webhook_delivery_outbox.sql`, and `supabase/migrations/20260715230000_atomic_share_manifest_outbox.sql` is unapplied. No remote SQL was executed in this lane.
2. The `co_production` schema has not been exposed and verified through staging PostgREST or Realtime.
3. The migration has not completed a clean apply plus rollback rehearsal against an isolated staging database.
4. No authenticated tenant-impersonation suite has proved every RLS policy with owner, admin, producer, editor, reviewer, viewer, expired member, unrelated tenant, anonymous, and service principals.
5. Existing `public` data has not been inventoried, transformed, reconciled, or copied. Collision exclusions and per-table row counts are not signed off.
6. The dirty shared checkout is not reproducible from Git. Release tests, migrations, and substantial product work remain untracked or uncommitted.
7. Approval assignment, decision/history/status mutation, and webhook enqueue still require reviewed transaction-owned functions. The current managed decision path awaits each queue attempt but the approval mutation and outbox insertion remain separate transactions.
8. The watermark endpoint intentionally fails closed when watermarking is required because no trusted server renderer is connected.
9. AI token usage is observed but not yet reserved and committed through a durable production Co-Credit ledger. Paid AI execution must remain launch-gated until this is atomic.
10. SMS and iMessage remain preview/dry-run only. No live-send authority, provider delivery proof, consent ledger, or opt-out path is approved.
11. NAS, Google Drive, resumable upload, transcode, restore, retention, and egress paths have not completed staging failure/recovery drills with production-sized media.
12. `admin.contentco-op.com` and `client.contentco-op.com` have no approved cutover receipt. DNS, Cloudflare tunnels, credentials, and the public site were not changed.
13. The visual lane is integrated, but the selected in-app Browser backend is unavailable. Fresh canonical desktop/mobile captures, console inspection, and click-through evidence remain open; no alternate browser was substituted.
14. The versioned notification RPC has source and simulated contract coverage only. Local Supabase was unavailable at `127.0.0.1:54322`, so transaction locking, expected-version conflicts, authenticated grants, RLS interaction, rollback, and concurrent-writer behavior have not run against Postgres.
15. The asset-version route now selects the atomic RPC in the production schema, but the underlying migration is unapplied. Concurrent numbering, row locks, comment carry-forward, approval reset, activity history, RLS denial, and rollback have not run against Postgres.
16. No webhook delivery worker is installed or scheduled, and external
    notification providers remain disabled. Source queue contracts do not prove
    provider delivery, retry recovery, lease reaping, or dead-letter operations.
17. Managed share-link persistence and notification enqueue now use one
    authenticated RPC in source, but that RPC is unapplied and has not run
    against PostgreSQL. Locking, RLS, rollback, exact replay, suppression, and
    unknown-transport recovery remain source/simulated evidence only.
18. Certification intentionally leaves `resilience.outbox-delivery` and
    `resilience.concurrency-idempotency` unverified because no operational proof
    receipts exist. No receipt was fabricated from unit tests.

## Required Staging Order

Every item is mandatory and sequential. A failure returns the gate to step 1 for the affected artifact.

1. Preserve the current remote schema, policies, grants, buckets, publications, row counts, and configuration as an exportable pre-change receipt.
2. Review and approve the isolated schema migration as SQL. Confirm extension placement, ownership, grants, default privileges, SECURITY DEFINER search paths, policy recursion, indexes, and rollback behavior.
3. Create an isolated staging database from the same Supabase/Postgres major version. Apply the migration there only.
4. Expose `co_production` to the staging Data API and add only approved Realtime tables to the publication.
5. Configure staging with matching server/browser schema variables and independent token, webhook, and analytics privacy keys. Never reuse production secrets.
6. Run schema compatibility checks for every database-dependent route, worker, Realtime subscription, and storage namespace.
7. Execute explicit, reviewed data transforms from preserved source tables. Reject collisions; compare source/destination counts and immutable version bindings.
8. Run tenant-impersonation and RLS tests for every role and negative case, including direct REST access that bypasses application route helpers.
9. Replace the remaining multi-write approval operations with reviewed atomic database functions. Apply and prove the existing version and managed-share RPCs under concurrent retries, RLS denial, and rollback.
10. Connect durable metering, watermark rendering, notification providers, storage, upload, transcode, backup, and restore adapters behind default-off flags; run failure and recovery drills.
11. Build a clean integration worktree from a known commit. Import scoped changes, classify every API route, and run root, nested certification, enterprise, migration, lint, typecheck, build, and browser journeys from that commit.
12. Capture matched desktop/mobile visual evidence and full login-to-sign-out interaction evidence for staff and client roles.
13. Produce separate admin/client tunnel and hostname receipts while leaving `contentco-op.com` unchanged.
14. Request explicit approval for production migration, deployment, and traffic cutover. These are three separate writes and approvals.

## Minimum Release Evidence

- Immutable commit SHA and clean-tree manifest.
- Staging migration apply and rollback receipts.
- Schema diff, row-count reconciliation, and collision report.
- RLS impersonation matrix with direct database/API evidence.
- Full route inventory with an owner, surface, role floor, and launch state for every endpoint.
- Atomic concurrency/idempotency results for approvals, versions, uploads, shares, metering, notifications, and webhooks.
- Production-sized upload, transcode, storage, backup, and restore drill receipts.
- Desktop/mobile screenshots paired with their references at identical viewports plus interaction results.
- Admin/client hostname, TLS, tunnel, health, login, role-routing, and rollback receipts.
- Written owner approval naming the exact migration, commit, deployment, and traffic change.

## Rollback Boundary

Until the gate passes, rollback means stopping the candidate process and leaving all current public traffic, DNS, tunnels, databases, and storage untouched. The migration is additive and must not be applied to production as an experiment. No cleanup or deletion of legacy tables, buckets, tunnels, or hostnames belongs in the first production change.
