# Media catalog control plane

This directory is an API-only first slice for tenant-scoped media discovery. It
complements the existing owner-scoped `assets` and `versions` model without
changing that model, adding a migration, or writing catalog state into unrelated
metadata.

## Contract

- Every operation has an authenticated `tenantId`, `actorId`, and tenant role.
- Catalog keys are `(tenantId, assetId)`; storage and cursors never select by
  `assetId` alone.
- Ingest binds an immutable `versionId`, monotonically increasing sequence, and
  caller-attested SHA-256 checksum. The API also verifies that the authenticated
  M2 client can read the exact `versions` row and that its sequence matches.
- `expectedRevision` prevents lost updates. Lower version sequences and reused
  sequence/version bindings fail closed, and historical version identifiers
  remain reserved to their original asset after a newer version is bound.
- Owner/admin may ingest and change lifecycle state. All tenant members may
  discover active items. Only owner/admin receive restricted source and rights
  metadata. Only owner may revert.
- Idempotency keys are tenant-scoped. An exact retry returns the original item
  and operation ID with a `replayed` receipt; changed payloads are rejected.
- Lifecycle changes are logical and reversible. Reverting an initial ingest
  produces a retained `withdrawn` tombstone rather than deleting history.
- Discovery uses deterministic sorting, a maximum page size of 100, bounded
  inputs, tenant/filter-bound cursors, and generation checks that reject stale
  pagination snapshots.
- Every accepted, rejected, denied, replayed, or read domain operation produces
  a normalized `catalog.receipt.v1` receipt. Receipt payloads contain references,
  outcomes, and timing, never catalog metadata or source locators.

## API surface

- `GET /api/catalog/items` — tenant discovery with `q`, repeated `tag`, `state`,
  `limit`, and `cursor` parameters.
- `POST /api/catalog/items` — deterministic version-bound ingest/upsert.
- `PATCH /api/catalog/items/:assetId` — reversible lifecycle transition.
- `POST /api/catalog/operations/:operationId/revert` — owner-only guarded revert.
- `GET /api/catalog/receipts` — owner/admin tenant receipt audit.

All responses are private, `no-store`, JSON-only, and return stable machine codes,
plain-language error messages, safe-retry flags, and recovery instructions.

## Accessibility

This slice intentionally introduces no user interface. The API returns stable
field names, explicit lifecycle labels, and human-readable error messages so a
future UI can announce outcomes without parsing prose. Any consuming UI must
preserve keyboard access, visible focus, semantic result counts, and live-region
announcements for ingest, transition, revert, and pagination outcomes; those UI
proofs belong in the slice that adds a catalog surface.

## Proof command

With repository dependencies available:

```sh
npm run typecheck
node --experimental-strip-types --loader ./lib/catalog/test-loader.mjs --test lib/catalog/service.test.ts
```

The attack suite proves cross-tenant isolation, restricted metadata redaction,
role denial, inaccessible/stale/conflicting versions (including historical
identifier reuse), revision races, exact replay, changed payload rejection,
non-destructive revert, malformed filter rejection, cross-tenant/filter/stale
cursor rejection, a 100-item page ceiling, tenant-only audit reads, safe observer
failure, and actionable recovery contracts.

## Residual risks and next slice

The runtime uses the explicit `CatalogRepository` port with a process-local
adapter because this lane forbids live migrations and external writes. It is
suitable for contract and API integration proof, but state, idempotency records,
operations, and receipts are not durable across process restarts or horizontally
shared. The next slice is a reviewed durable adapter and migration with RLS,
unique tenant/idempotency constraints, atomic item-operation-receipt commits,
retention limits, and repository conformance tests. It must also bind assets to a
durable tenant/project relationship; the current M2 schema proves asset access
but does not relate an asset to a team. Finally, the existing versions table has
no server-recorded content checksum, so ingest checksum evidence remains a
caller attestation until the media pipeline persists a digest.
