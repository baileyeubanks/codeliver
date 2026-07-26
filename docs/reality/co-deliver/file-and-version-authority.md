# Co-VideoPro File And Version Authority

Date: 2026-07-26
Status: CCO-C5A file authority plus CCO-C6B review-admission authority in the
M2 release-candidate tree

## One Production Writer

`POST /api/upload/tus` and its upload-resource methods are the only production
file/catalog writer. The production Projects surface uses
`components/assets/AssetUpload.tsx` and passes a canonical project UUID.

The upload path:

1. authorizes the actor and project before accepting bytes;
2. commits bytes through the configured provider;
3. records size, SHA-256, provider version identity, and commit time;
4. requires a durable clean scan verdict;
5. calls one service-only atomic RPC; and
6. returns the one asset and exact V1 bound to that upload.

Retries must resolve the same upload, provider object, asset, and V1. Conflicting
identity, a soft-deleted record, a cross-project partial, or more than one
inherited asset claiming the storage object fails closed.

## Retired Writers

These routes are intentionally dead and return `410 Gone` before reading auth,
request bodies, route parameters, storage, or the database:

- `POST /api/media/upload`
- `POST /api/media/tus`
- methods on `/api/media/tus/[uploadId]`

These catalog writers are also retired:

- `POST /api/projects/[id]/assets` cannot create metadata-only assets and
  points callers to canonical TUS ingest.
- `POST /api/assets/[id]/versions` cannot create an arbitrary referenced V2.
  It intentionally advertises no false successor because a governed revision
  ingest contract is not implemented.

Browser-direct storage uploads and public storage URLs were removed from the
production Projects surface. Demo-only upload behavior remains local and must
stay visibly labeled.

## Database Authority

Migration `20260726084644_atomic_upload_catalog_v1.sql` adds managed version
receipt fields, server-owned catalog privileges, safe authenticated read
projections, unique managed-upload identities, and the
`attach_committed_upload_v1` RPC.

The function is `SECURITY INVOKER`, executable only by `service_role`, checks
the supplied actor against canonical project/team authority, locks both upload
and provider-object identities, detects inherited contamination, and performs
asset plus V1 creation in one transaction.

The migration is **unapplied**. No current receipt proves live PostgreSQL
syntax, existing-data compatibility, grants/policies, effective RPC authority,
or rollback behavior. Applying it requires Bailey's explicit database approval
after a read-only duplicate and compatibility preflight.

Migration `20260726113000_comment_pin_percentage_contract.sql` aligns comment
pins to the UI's 0–100 percentage unit and enforces complete coordinate pairs.
It takes an exclusive lock and aborts before DDL if any existing pin is found,
so ambiguous legacy 0–1 data cannot be reinterpreted silently. It is also
**unapplied** and requires a Bailey-approved read-only legacy-pin inventory and
an explicit remediation decision before application.

## Immutable Filesystem Publication

Filesystem publication preflights capacity for the complete immutable copy,
copies the completed staging object into a separate deterministic placement
inode, validates and seals it through held no-follow handles, verifies the
final hard link before directory sync, removes placement and staging entries
durably, and issues a receipt only at `nlink = 1`. Reconciliation removes crash
orphans and aliases, can inspect sealed staging read-only at the exact durable
offset, and rejects writable objects or legacy staging aliases. This is
application-level immutability, not WORM; CCNAS filesystem semantics still
require isolated runtime proof.

## Exact-Version Playback

Authenticated playback uses `/api/media/versions/[versionId]`. The route:

- authorizes the exact version through its asset and project;
- rejects missing or soft-deleted catalog records;
- validates the managed storage receipt;
- supports bounded HTTP range responses; and
- opens, verifies, and streams the same file handle so pathname replacement
  cannot swap content between verification and read.

Active content is forced to download. Provider receipt columns and storage
keys are absent from authenticated catalog projections.

## Public Review Authority

Public review payloads serialize explicit external-safe asset, version,
comment, and invite projections rather than raw database rows. Invites must be
active and reference an existing asset. Password-protected and
watermark-enabled invites fail closed until their governed paths exist. A
successful admission binds the opaque-token hash, invite, asset, exact version,
and bounded durable session; the browser receives only a signed, host-only
15-minute grant and a token-free exact-version media URL. Comment, approval,
and edit-decision writes require the same admission and use separate action
rate limits. Complete finite frame pins remain in the 0–100 percentage unit.

This source bridge still does not prove live anonymous playback. Its migration,
private signing configuration, trusted ingress provenance, provider receipt,
and real-file behavior must be verified together without exposing provider
identity or the invite token in the media URL.

## Current Evidence Boundary

Source gates in the CCO-C6B release-candidate tree pass:

- typecheck;
- lint with zero errors;
- 1,211 tests: 1,208 passing, zero failures, and three runtime skips;
- production build without a whole-project NFT trace warning; and
- independent exact-diff review with no Critical or Important findings.

Both M2 runtime ports are down. No database was started, no migration was
applied, and no provider or real file was mutated. Therefore upload → asset →
V1 → playback is a reviewed source contract, not an operational or
end-to-end proof. A safely projected and admission-bound exact-version
frame-comment write now exists in source, but its pin and admission migrations
are unapplied and live anonymous media playback remains open. Exact-version
approval attribution, lock, and final delivery also remain open.
