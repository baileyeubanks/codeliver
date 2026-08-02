# Storage And Upload Enterprise Map

Date: 2026-07-14
Status: Horizon 1 control plane plus bounded transactional restart recovery
implemented; pillar remains open.
Canonical charter: `docs/strategy/co-produce-goal-extension-2026-07-14.md`,
`Enterprise Operating Horizon`.

## Current Slice

The implemented slice establishes one guarded ingest authority under
`/api/upload/tus` and one non-mutating readiness surface under
`/api/storage/readiness`.

- Authenticated user identity becomes the server-derived tenant namespace.
- Project ownership and optional folder membership are verified before staging.
- Local and CCNAS adapters require an explicit absolute root plus
  `CODELIVER_STORAGE_WRITE_ENABLED=1`.
- Google Drive configuration and credential shape are diagnosed without a
  network call. Drive and object-store writes remain unavailable.
- Multipart sessions persist under the configured filesystem root with atomic
  metadata, tenant-scoped idempotency indexes, recoverable creation journals,
  event JSONL, and cross-process lock files.
- Session replacement is directory-synced and revision-checked. Upload locks
  are heartbeat-backed and inode-fenced so a stale owner cannot save state or
  unlink a successor's lock after takeover. Global and tenant locks serialize
  admission, including outstanding physical-capacity reservations, quota, and
  concurrent-upload decisions.
- Admission checks enforce declared size, free-space reserve, tenant quota,
  concurrent-upload limit, and per-request chunk limit before or during writes.
- Every part receives a server SHA-256 receipt. Optional tus part checksums roll
  back bytes on mismatch. The full staged object is rehashed before placement.
- Versioned object keys hash tenant, project, and object namespaces; sanitize
  filenames; encode an immutable version; and refuse overwrite.
- Traversal, absolute paths, ambiguous percent encodings, symlink redirection,
  and non-regular staging files fail closed.
- Malware scanning is a hook. Without a configured scanner, completed bytes
  remain in hidden staging with `quarantined` state. Only an explicit local-demo
  policy or trusted clean scan result can place an object.
- Asset catalog reconciliation is retried under the upload lock and keyed by the
  immutable object path. A catalog failure does not erase committed byte proof.
- A restart reconciles physical staging length to the durable session offset.
  Unrecorded tail bytes are truncated before retry; staged bytes behind durable
  metadata fail closed for operator review.
- Checksum, clean scan, object key, and derivative intent are persisted before
  final placement. If placement survives but its receipt does not, recovery
  verifies the immutable destination and records the receipt without overwrite.
- Older interrupted placements without prepared state are re-inspected and
  re-scanned. Placement alone never implies a clean verdict.
- Scanner exceptions and malformed results quarantine. Trusted quarantine
  release is bound to the exact verified SHA-256 and refuses unconfigured or
  local-demo scanner identities.
- Derivative enqueue readiness and attempts are durable per session. A failed
  hook remains `error` until an explicit idempotent retry; the default runtime
  has no hook and reports `blocked` rather than claiming processing readiness.
- Signed delivery has a versioned readiness contract binding tenant, recipient,
  object/version/checksum, permission, expiry, revocation generation, and
  watermark policy. It remains fail-closed because no signer, policy resolver,
  revocation store, audit sink, or provider capability is configured.
- The browser checks readiness before file selection, resumes through tus,
  rejects files above the published limit, and distinguishes quarantine from
  completion.

No real Drive or CCNAS write was performed while implementing or testing this
slice. All mutation tests used temporary local roots.

## State Authority

```text
receiving -> verifying -> quarantined -> committed
                    |          |
                    |          +-> rejected
                    +-> rejected | failed

receiving | verifying | quarantined -> aborted
committed + legal hold -> abort refused
```

Placement is immutable and occurs only after size, full checksum, and scan
policy pass. Derivative work is represented by a post-commit hook with durable
attempt state; the current slice does not claim a durable derivative queue or a
configured default hook.

## Restart Recovery Contract

`HEAD /api/upload/tus/:uploadId` and the next accepted `PATCH` acquire the
session lock before recovery.

1. `receiving`: compare staged length with durable offset. Truncate any tail
   that was fsynced before session metadata; reject a shorter staged file.
2. `verifying`: resume checksum and scan when staging is intact. When prepared
   placement evidence exists, reconcile the immutable destination first.
3. legacy placed candidate: derive the session-bound object key, verify size
   and optional declared checksum, scan the stored bytes, then quarantine,
   reject, or recover the receipt from that evidence.
4. `quarantined`: verify that either staging or a previously discovered placed
   candidate still matches durable checksum evidence. Never rerun or promote a
   pending/error verdict implicitly.
5. `committed`: resume only a pending derivative hook attempt. An `error`
   requires explicit retry and signed delivery remains blocked.

The tus response publishes `Upload-Derivative-State`,
`Upload-Original-Ready`, and `Upload-Signed-Delivery-Ready`. These are state
contracts, not a signed delivery implementation.

## Configuration

| Variable | Purpose |
| --- | --- |
| `CODELIVER_STORAGE_PROVIDER` | Required: `local`, `ccnas`, `google-drive`, or reserved `object-store` |
| `CODELIVER_LOCAL_STORAGE_ROOT` | Required absolute root for local demo storage |
| `NAS_MEDIA_ROOT` | Required absolute root for CCNAS storage |
| `CODELIVER_STORAGE_WRITE_ENABLED` | Explicit write authority; only `1` or `true` enables writes |
| `CODELIVER_STORAGE_RESERVED_BYTES` | Free-space floor retained during admission |
| `CODELIVER_STORAGE_MAX_UPLOAD_BYTES` | Maximum declared object size |
| `CODELIVER_STORAGE_MAX_CHUNK_BYTES` | Maximum streamed tus request size |
| `CODELIVER_STORAGE_TENANT_QUOTA_BYTES` | Per-tenant allocation limit in the file repository |
| `CODELIVER_STORAGE_MAX_CONCURRENT_UPLOADS` | Per-tenant active ingest limit |
| `CODELIVER_UPLOAD_SESSION_TTL_MS` | Session expiry metadata; cleanup enforcement is not implemented yet |
| `CODELIVER_UPLOAD_LOCK_TTL_MS` | Stale cross-process lock threshold |
| `CODELIVER_MALWARE_SCAN_TIMEOUT_MS` | Maximum scanner-hook execution before fail-closed quarantine |
| `CODELIVER_DERIVATIVE_HOOK_TIMEOUT_MS` | Maximum derivative enqueue-hook execution before durable error state |
| `CODELIVER_MALWARE_POLICY` | Defaults to required; only `allow-local-demo` bypasses scanning and only for local |
| `GOOGLE_DRIVE_FOLDER_ID` | Drive readiness destination identifier |
| `GOOGLE_DRIVE_ACCESS_TOKEN` | Drive credential-shape option; never returned by diagnostics |
| `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON` | Alternate Drive credential-shape option; never returned by diagnostics |

The configured filesystem root must already exist. Diagnostics never create it.
All local demo control, staging, event, and object paths stay beneath that root.

## Three Horizons

### Horizon 1: Coherent Production Core

Delivered in this slice:

- provider-neutral multipart contract and capability declaration
- explicit local/CCNAS write boundary and Drive readiness boundary
- owner-derived tenant isolation and project/folder admission checks
- resumable state, idempotency, streamed bounded chunks, and offset locks
- part and object checksums, quarantine state, scanner and post-commit hooks
- immutable versioned placement, capacity diagnostics, quotas, and backpressure
- browser readiness, pause/resume/retry/cancel, size gate, and quarantine status
- local fault, security, concurrency, and key-scale proof

Horizon 1 integration still required:

- conductor-run authenticated browser proof against a configured local root
- a real malware engine adapter and recovery worker for quarantined sessions
- canonical asset/version transaction plus catalog/transcode queue with durable
  retry and dead-letter state
- authenticated delivery for local objects and signed delivery for external users
- cleanup enforcement for expired sessions and abandoned idempotency indexes
- approved version authority from the asset/version pillar instead of client
  default `version=1`

### Horizon 2: Enterprise Scale

Build next in risk order:

1. Replace the bounded file transaction journal, revision checks, and directory
   scans with a transactional session repository supporting distributed leases,
   fencing generations, partitioning, and millions of active sessions.
2. Add native provider transports for Drive and S3-compatible object stores,
   provider multipart IDs, reconciled part manifests, server-side copy, and
   checksum parity across providers.
3. Add a durable event bus and idempotent jobs for malware, metadata probe,
   proxy, waveform, thumbnail, captions, replication, and catalog attachment.
4. Enforce organization policy for quota, media type, project placement,
   retention, storage class, replication count, egress, and delegated admin.
5. Publish RED/USE metrics and traces: admission latency, part latency, resume
   success, checksum rejects, quarantine age, queue depth, free capacity,
   catalog lag, derivative lag, provider errors, and restore verification age.
6. Define SLOs and error budgets. Initial targets for calibration are 99.95%
   ingest-control availability, 99.9% successful resume after an interrupted
   accepted part, p95 admission below 500 ms, and zero acknowledged checksum
   mismatches or cross-tenant reads.
7. Add lifecycle/tiering, inventory reconciliation, two-provider replication,
   encrypted backup, sampled restore drills, and documented RPO/RTO per asset
   class.
8. Provide shadow-copy migration, checksum comparison, dual-read, explicit
   cutover, and provider-by-provider rollback receipts.

### Horizon 3: Governed Media Intelligence

- policy-selected residency and processing regions with immutable residency
  evidence and cross-region transfer denial
- legal holds that freeze object, versions, manifests, sessions, audit, and
  derivative lineage across every lifecycle worker
- signed delivery manifests bound to recipient, object/version checksum,
  permission, expiry, watermark policy, and revocation generation
- deterministic replay from immutable source checksum, pipeline version,
  configuration hash, model/prompt lineage, and human decision receipts
- globally distributed read placement with policy-aware replication and egress
  routing
- continuously verified restore, cryptographic inventory attestations, and
  regulator/client export packages
- auditable placement and lifecycle agents that can propose but cannot execute
  destructive migration, deletion, or legal-hold release without authority

## Migration And Rollback

Provider migration must be additive:

1. Inventory source objects and freeze each source checksum/version tuple.
2. Copy into a new provider namespace without changing catalog authority.
3. Verify byte count, SHA-256, metadata, retention, and derivative manifest.
4. Shadow-read and compare delivery results.
5. Switch new writes behind an explicit provider configuration change.
6. Dual-read during a bounded observation window.
7. Switch catalog placement receipts only after reconciliation is complete.
8. Roll back by restoring the previous provider selector; never delete the old
   copy as part of cutover.

The current file repository has no automatic migration command. Changing a
provider with active sessions is unsupported and must fail operational review.

## Residual Risks

- The file session repository performs tenant quota inventory by directory scan;
  it is correct for the current slice but not a very-large-scale control plane.
- File locks fence saves and release by the held inode, but they are not a
  distributed lease or monotonic fencing generation. Network-filesystem lock,
  rename, and fsync semantics require provider-specific certification.
- Quarantined objects require an external trusted scanner result; there is no
  worker, retry schedule, or quarantine-age alert yet.
- Committed originals are durable placement receipts, but derivative generation
  and catalog retries are request-triggered rather than queue-backed. Hook
  implementations must be idempotent because recovery can resume a persisted
  `pending` attempt after process death.
- Tenant scope currently follows project owner identity. Organization tenancy,
  service-project grants, delegated roles, and transfer semantics remain owned
  by identity/project policy integration.
- Local delivery is not implemented. CCNAS catalog URLs still depend on the
  existing authenticated media stream route, which is outside this write lane.
- `legalHold` is represented and blocks abort when set, but no authorized hold
  administration or retention worker exists.
- Session expiry is recorded but not enforced by cleanup/reconciliation.
- A crash after zero-byte staging allocation but before the creation journal is
  durable can leave an unindexed empty staging file. Inventory cleanup remains
  required; recovery never deletes unknown non-empty staging.
- Drive credentials are checked structurally, not authenticated against Google;
  the adapter intentionally refuses all Drive writes.
- Object-store transport, signed delivery issuance, residency enforcement, replication,
  backup, restore drills, lifecycle tiering, and billing receipts remain future
  capabilities and are not implied by the adapter contract.

## Recursive Evidence

1. Inventory found build-time NAS mutation, fallback roots, direct filesystem
   coupling, no checksum authority, and no canonical tenant-scoped ingest gate.
2. Adapter loop added explicit configuration, diagnostics, safe paths, capacity,
   multipart primitives, and immutable keys. Fault tests found and fixed a file
   handle auto-close bug.
3. Session loop added durable idempotency, locks, quota/backpressure, checksums,
   quarantine, and placement. Concurrency tests found and fixed a directory
   creation race.
4. Integration loop added owned tus/readiness routes, project/folder authority,
   catalog retry locking, and a readiness-aware browser surface.
5. Restart loop added creation journals, fsync-backed replacement, revision CAS,
   tenant admission locks, stale-lock ownership fencing, physical-offset rollback,
   prepared-placement receipts, and legacy placement re-scan.
6. Release-readiness loop added checksum-bound trusted scan results, durable
   derivative state/retry, and a fail-closed signed-delivery manifest contract.
7. Focused tests cover fail-closed providers, Drive no-write behavior, traversal,
   symlinks, overwrite refusal, checksum rollback, 5,000 version keys,
   concurrent session creation, lock contention, concurrent quota admission,
   cross-tenant idempotency isolation, restart byte rollback, interrupted
   placement recovery, stale revision rejection, scanner failure/quarantine,
   checksum-bound trusted release, derivative retry, signed-delivery authority,
   and catalog retry serialization.

This evidence supports the delivered slice only. Per the canonical charter, the
storage/upload pillar remains open until the conductor proves its cross-pillar
contracts and the completion audit closes the residual risks above.
