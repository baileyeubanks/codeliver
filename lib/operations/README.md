# M4 enterprise operations control plane

This slice is deliberately computation-only. It evaluates tenant-bound SLO evidence, reads a bounded local runtime snapshot, produces permission-filtered redacted JSON support data, and returns dry-run recovery plans. It has no adapter capable of executing recovery, creating archives, notifying people, or changing production state.

## Safety contract

- API authority comes from server-side team membership. Request roles, actors, and permissions are never trusted.
- Every request binds the operations schema/config versions and an idempotency key. Runtime diagnostics and recovery also bind `m4.operations.local-snapshot.v1`.
- Tenant mismatches, stale snapshots, unsupported recovery intents, unsafe execution fields, oversized inputs, and idempotency key conflicts fail closed.
- Observations correlate hashed actor/tenant references to deterministic receipts without logging payloads.
- Recovery output is proposed, cancelable by discarding it, expires with its snapshot, reports `not_executed`, and contains no execution port.

## Residual risk and next slice

The in-memory idempotency ledger is process-local and bounded; durable multi-instance replay protection needs a tenant-partitioned transactional adapter. Runtime diagnostics cover only the current Node process, not database, queue, storage, or regional dependencies. Support bundle entries currently enter through the request contract before validation/redaction; the next slice should replace them with server-side evidence collectors and signed evidence provenance. Threshold/config rollout needs a durable version registry. Recovery requires a separately reviewed approval/execution system; this lane intentionally does not provide one.
