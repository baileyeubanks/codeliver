# Collaboration control-plane slice

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
