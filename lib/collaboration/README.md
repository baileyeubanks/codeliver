# Collaboration control-plane slice

## Inventory and risk decision

The active M2 surface streams comments and presence by asset ID and has separate
review/version routes, but it does not expose one tenant-, project-, asset-, and
version-bound command contract. The highest-risk missing capability was therefore
a server-authorized boundary that cannot be bypassed with client-supplied identity,
role, tenant, or version claims.

This slice introduces an append-only command/event contract without changing the
existing M2 schema or realtime UI. Every command is bound to one explicit tenant,
project, asset, and current asset version. The server derives the actor and
permissions; client identity or capability claims are never accepted.

The current compatibility adapter deliberately treats the authenticated project
owner as the tenant and rejects all other memberships. This is fail-closed until
the enterprise identity lane supplies a versioned membership grant. The in-memory
event store is also deliberately non-durable: it proves command, receipt,
idempotency, ordering, and read-bound contracts without a live migration. It must
be replaced with a transactional durable adapter before production use.

Operations are reversible through explicit compensating events (`thread.resolve`
and `thread.reopen`, `presence.join` and `presence.leave`); no API deletes history.
Receipts and events include trace, actor, authorization-version, and scope fields.

This is API-only and creates no user-facing controls. Accessibility therefore has
no visual interaction surface in this slice. JSON failures use stable codes plus
plain-language messages and explicit recovery guidance, allowing a future
accessible UI to announce errors and next steps without parsing provider or
database details.

## Proof

`node --test lib/collaboration/control-plane.attack.test.mjs` executes 10 passing tests.
The attacks cover unsupported/malformed envelopes, tenant injection, stale asset
versions, capability escalation, stale authorization grants, deterministic replay,
idempotency-key conflict, stream-sequence conflict, stale thread revision,
reversible moderation, capped cursor reads, and independent tenant domains.

`npm run typecheck` validates the routes and contract when dependencies are
installed in the checkout. The isolated M4 worktree reused the integration
worktree's installed toolchain and type roots without changing dependency files.

## Residual risk and next slice

The in-memory adapter is process-local and intentionally not production-ready.
A durable adapter must atomically append the event and reserve the idempotency
receipt in one transaction; it must also materialize thread state rather than
replaying an unbounded stream. Enterprise membership grants must replace the
owner-only compatibility binding. Realtime transport, accessible UI announcements,
and route-level tests with injected auth/storage adapters remain follow-on work.

The next bounded slice is a storage-neutral transactional acceptance interface
plus a durable projection contract, still without a migration or live write.
