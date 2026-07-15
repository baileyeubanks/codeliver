# Integration control plane (M4)

This slice is an API-only, provider-neutral command and receipt contract. There is no UI because the first risk to close is accidental or cross-tenant delivery, not configuration presentation.

## Safety boundary

- `app/api/integrations` derives the actor from the authenticated session and permissions from verified team membership. Request JSON cannot supply either value.
- Every command and configuration binds an explicit schema version. Delivery intents also bind the exact configuration and payload schema versions.
- New configurations start disabled. Enabling means **enabled for dry-run intent recording**; there is no transport interface or network call in this module.
- A delivery request only records an immutable, deterministic receipt with `deliveryAttempted: false`. Payload contents are replaced by a digest.
- Idempotency is tenant-scoped. Replays return the original receipt; reuse with different input fails closed.
- Disable/enable and cancel/restore are versioned reversible control transitions. Configuration versions cannot be reused and no-op state transitions fail closed.
- Every receipt declares `externalEffect: "none"`, its reversing command when one exists, and `compensationStatus: "not_required_no_external_effect"`. An executor cannot be added silently behind this contract.
- Strict input allowlists reject endpoint, callback, credential, secret-like, and unbounded payload material.
- Safe audit events hash tenant, actor, and integration references and exclude payloads and idempotency keys. Errors include stable codes, plain-language messages, and a recovery action.
- Storage is behind `IntegrationLedgerPort`; the supplied in-memory adapter copies records and scopes lookups and quotas per tenant.

## Residual risk and next slice

The in-memory ledger is deliberately non-durable and process-local. Its synchronous operations are safe for this proof, but a durable adapter must provide an atomic idempotency claim, receipt append, state transition/compare-and-swap, tenant quotas, encryption, retention, and recovery testing before production use.

There is intentionally no executor or transport port, no destination/credential configuration, and no inbound callback. A later owner-approved executor slice must add a separately gated capability allowlist, egress policy, secret reference boundary, retry/dead-letter model, signed receipt chain, cancel/execute race arbitration, and provider-neutral compensation contract. Until then, `request_delivery` means only “record a dry-run intent”; no provider or network action is possible.
