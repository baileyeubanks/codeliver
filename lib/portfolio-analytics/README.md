# M4 Portfolio Analytics Contract

`POST /api/portfolio-analytics/query` is an additive, read-only API. It computes
portfolio metrics from exact asset-version facts without changing the active M2
analytics routes or schema.

## Safety contract

- The authenticated M2 owner ID is the tenant ID until enterprise tenancy is
  integrated. `deriveM2OwnerPortfolioPrincipal` derives the versioned owner
  role and `portfolio.analytics.read` permission from the authenticated server
  subject; request JSON cannot choose either. A forged tenant, stale access
  decision, or missing permission is rejected before a source read.
- Every project is checked against the tenant and every source fact is checked
  again by the pure computation boundary.
- Captures return an exact, client-held snapshot binding. Replays request only
  those version IDs and compare every fingerprint. Missing, changed, mixed, or
  extra facts fail with `SNAPSHOT_CONFLICT`.
- Inputs are deterministic: the query supplies the UTC window and `asOf`, facts
  are canonically sorted, integer metrics use decimal strings and `bigint`, and
  receipts are content-derived.
- Identical duplicate version facts are counted once; conflicting duplicates
  fail closed. The receipt reports source, accepted, and duplicate counts.
- A bounded execution-ledger port binds each tenant-scoped idempotency key to
  one canonical request intent. Concurrent duplicates share one computation,
  completed duplicates return the stable result, changed key reuse fails with
  `IDEMPOTENCY_CONFLICT`, and failed attempts release their claim for retry.
- A query is bounded to 25 projects, 1,000 assets, 1,000 version facts, a
  366-day window, 100 items per page, and a 512 KiB request body. Opaque cursors
  are bound to one snapshot.
- The operation performs reads only. Replaying a binding is the reversal path;
  source drift is reported instead of silently mixing a prior snapshot with
  current data.
- Receipts expose contract, query, snapshot, result, idempotency-key, and trace
  digests plus the access-decision version without returning the raw
  idempotency key or authenticated subject ID. Structured errors include safe
  recovery guidance.

## Ports and correction proof

`PortfolioAnalyticsSource` and `PortfolioAnalyticsExecutionLedger` are the
owned ports. The API currently wires the existing authenticated Supabase client
as a read-only source and a bounded process-local ledger; neither adapter
writes externally.

`InMemoryPortfolioAnalyticsSource` is the attack-test adapter for source
corrections. A correction must carry `portfolio.analytics.correct`, match the
tenant and immutable project/asset/version identity, and compare-and-swap the
expected active fingerprint. It appends the corrected fact as another immutable
revision. Reactivation only moves the active pointer and never deletes history,
so an old binding can still be replayed and a correction can be reversed. Both
operations return deterministic, non-PII revision receipts. There is no
correction HTTP route in this slice.

## Request shape

```json
{
  "contractVersion": "m4.portfolio-analytics.v1",
  "tenantId": "00000000-0000-4000-8000-000000000001",
  "idempotencyKey": "portfolio-run-0001",
  "projectIds": ["00000000-0000-4000-8000-000000000002"],
  "window": {
    "from": "2026-01-01T00:00:00Z",
    "to": "2026-01-31T23:59:59Z",
    "asOf": "2026-02-01T00:00:00Z"
  },
  "filters": { "fileTypes": ["video"] },
  "page": { "limit": 50 },
  "snapshot": { "mode": "capture" }
}
```

To replay, keep the same scope and replace `snapshot` with
`{"mode":"replay","binding":<the prior response binding>}`.

## Deliberate boundaries and next slice

This slice excludes comments, approvals, and mutable project status because M2
does not bind all of those rows to an asset version. Process-local idempotency
entries and in-memory source revisions disappear on restart, have no
cross-instance coordination, and intentionally prove contracts rather than
durability. The Supabase replay adapter can only replay facts still present and
unchanged in M2; drift fails closed because there is no approved immutable
revision store yet.

The next slice should consume the enterprise lane's tenant/role decision,
replace the process-local ledger with an approved atomic durable adapter, and
persist immutable snapshot/source revisions plus receipts. Review-cycle metrics
should follow only after their source events are version-bound and correctable.
No user-facing component changed, so accessibility status is explicitly
`api-only`.

## Local proof

On Node 24, compile the owned test graph to a temporary CommonJS directory and
run it with `node --test`. The attack suite covers tenant and role escalation,
source-scope leakage, deterministic deduplication and bigint metrics,
idempotency replay/conflict/retry, stale snapshots, cursor binding, source
correction/reversal, malformed and unbounded dimensions, metric manipulation,
access-version drift, accessibility metadata, and receipt PII hygiene. Run
`npm run typecheck` for the repository-wide TypeScript proof.
