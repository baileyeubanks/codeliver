# M4 Portfolio Analytics Contract

`POST /api/portfolio-analytics/query` is an additive, read-only API. It computes
portfolio metrics from exact asset-version facts without changing the active M2
analytics routes or schema.

## Safety contract

- The authenticated M2 owner ID is the tenant ID until enterprise tenancy is
  integrated. A forged tenant or missing `portfolio.analytics.read` permission
  is rejected before a source read.
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
- A query is bounded to 25 projects, 1,000 assets, 1,000 version facts, a
  366-day window, 100 items per page, and a 512 KiB request body. Opaque cursors
  are bound to one snapshot.
- The operation performs reads only. Replaying a binding is the reversal path;
  source drift is reported instead of silently mixing a prior snapshot with
  current data.
- Receipts expose contract, query, snapshot, result, idempotency-key, and trace
  digests without returning the raw idempotency key.

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
does not bind all of those rows to an asset version. It also has no persistent
idempotency-key registry or server-side snapshot store; idempotency is
content-derived within the read contract. The next slice should integrate the
enterprise tenant/role decision contract and a separately approved durable
receipt store, then add review-cycle metrics only after their source events are
version-bound. No user-facing component changed, so accessibility status is
explicitly `api-only`.
