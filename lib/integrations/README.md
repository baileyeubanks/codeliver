# Integration control plane (M4)

This slice is an API-only, provider-neutral command and receipt contract. There is no UI because the first risk to close is accidental or cross-tenant delivery, not configuration presentation.

## Safety boundary

- `app/api/integrations` derives the actor from the authenticated session and permissions from verified team membership. Request JSON cannot supply either value.
- Every command and configuration binds an explicit schema version. Delivery intents also bind the exact configuration and payload schema versions.
- New configurations start disabled. Enabling means **enabled for dry-run intent recording**; there is no transport interface or network call in this module.
- A delivery request only records an immutable, deterministic receipt with `deliveryAttempted: false`. Payload contents are replaced by a digest.
- Idempotency is tenant-scoped. Replays return the original receipt; reuse with different input fails closed.
- Disable/enable and cancel/restore are versioned reversible control transitions. They never deliver anything.
- Strict input allowlists reject endpoint, callback, credential, secret-like, and unbounded payload material.
- Safe audit events hash tenant, actor, and integration references and exclude payloads and idempotency keys.

Statuses and errors use plain-language messages alongside stable machine codes. The in-memory ledger is deliberately non-durable and bounded. It is process-local, so it does not yet coordinate multiple server instances, persist receipts across restarts, or enforce durable per-tenant quotas. Durable storage, signed inbound callbacks, and any transport adapter remain later slices that require separate design and migration approval.
