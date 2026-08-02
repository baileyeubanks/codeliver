# Co-Deliver Media Pipeline Checkpoint

Date: 2026-07-15
Owner: media processing implementation slice
Scope: lib/media-pipeline/**, app/api/transcode/**, and version-bound export delivery.

This checkpoint follows the recursive enterprise loop in
[docs/strategy/co-produce-goal-extension-2026-07-14.md](../../strategy/co-produce-goal-extension-2026-07-14.md),
especially the upload, storage placement, media processing, derivatives, and
continuity pillar.

## Current Evidence

### H1 implemented

- A pipeline job is bound to one asset_id, version_id, project namespace,
  source object key, expected byte size, and optional ingest checksum.
- A pipeline source can now carry an adapter source receipt: provider, object
  key, size, SHA-256, provider version id, and committed timestamp. When
  configured, enqueue fails closed without that receipt; when present, the
  worker validates adapter inspection against the receipt before copying bytes.
- Enqueue is idempotent on asset, version, source key, and source checksum.
  Replaying a published request returns the same job without reopening its
  legacy queue projection.
- Source intake resolves only a relative object key beneath the configured
  local or CCNAS root, rejects symlinks and root escapes, copies to a private
  workspace, and validates the copied checksum against the source before
  processing.
- The worker performs:

~~~
ingest validation -> quarantine -> ffprobe -> HLS transcode
-> thumbnail -> waveform -> caption derivative -> immutable publish
~~~

- Every derivative is committed through StorageAdapter multipart methods.
  The pipeline does not write derived media by direct final-path placement. It
  reconciles empty staging before upload and verifies deterministic placement
  before and after commit, recovering an already-matching object after an
  ambiguous provider response rather than overwriting it. Segment, playlist,
  manifest, thumbnail, waveform, captions, caption manifest, and pipeline
  provenance manifest records retain object keys, checksums, provider, size,
  and version binding.
- A pipeline provenance manifest is stored as an immutable derivative. It
  records the pipeline version, storage provider, source checksum, probe
  summary, artifact object keys and checksums, redacted execution command
  names, checksum-bound scanner receipt, storage placement policy readiness,
  redacted encryption/key-rotation policy readiness, and a pipeline
  configuration hash without writing local absolute paths into the manifest.
  Source receipt evidence in the manifest includes an object-key digest, not
  the raw source object key.
- Pipeline provenance manifests now include a deterministic integrity envelope.
  Without a signing key this records a payload SHA-256 for restore comparison;
  with a configured signing key it records an HMAC-SHA256 signature and signing
  key digest without storing the secret.
- Replay verification now supports a manifest signing keyring. New manifests
  use the primary signing key, while diagnostics can verify older signed
  manifests with configured retired verification keys during key rotation,
  rollback, or cross-region restore review.
- The source is not replaced. Publish only writes version-keyed pipeline
  metadata into assets.metadata.media_pipeline; it never updates assets.file_url.
- A no-scanner production policy leaves a version quarantined. The only local
  bypass is the existing explicit allow-local-demo storage policy.
- Scanner results are persisted before either quarantine or derivative
  generation. The receipt binds verdict, engine, signature, scanned_at, storage
  provider, and source sha256, so pending production scans and clean local-demo
  scans are both auditable.
- Jobs persist under .codeliver-ingest/control/media-pipeline/, with
  idempotency indexes, atomic state writes, job leases, worker-slot
  backpressure, cancellation markers, bounded retry schedules, stale-lease
  recovery, and event history. Retry eligibility is rechecked from persisted
  state while holding the job lock, so a stale worker observation cannot bypass
  a future retryAt after another process schedules backoff.
- Optional project-scoped admission limits gate enqueue before a new visible
  job is published. The file-backed store serializes admission with a project
  lock, permits idempotent replay of an existing job, rejects unknown source
  sizes when byte quotas are enabled, and reports quota pressure only as
  aggregate counts and maxima.
- Enqueue creation is linearized by a per-idempotency-key control lock. New job
  state is written as an unscannable temp file, indexed, and then atomically
  renamed into the visible queue, so concurrent requests and queue scanners
  cannot observe duplicate work for the same version/source binding.
- Progress is persisted per stage and emitted as structured, identifier-
  minimized metrics. Metrics include jobs, failures, bytes, queue depth
  capability, and stage duration capability.
- The token-gated worker endpoint exposes read-only aggregate diagnostics for
  storage readiness, queue depth, retry pressure, stale leases, cancellations,
  quota pressure, SLO breaches, lifecycle/orphan pressure, corrupt control
  files, temp staged jobs, and configured worker limits. The
  diagnostic payload excludes job ids, asset ids, project ids, version ids,
  filenames, and source object keys.
- SLO diagnostics compare queued, eligible, running, and retry-ready work
  against configurable thresholds. They return only aggregate breach counts,
  oldest running/retry-ready ages, and total SLO pressure for local monitors.
- Source receipt diagnostics summarize migration readiness before receipt-
  required mode is enabled. They count jobs missing receipts, active jobs
  missing receipts, invalid receipt records, provider mismatches, missing
  stored source objects, and checksum or size drift through bounded adapter
  inspection without returning job ids, project ids, filenames, or object keys.
- Storage placement policy diagnostics now make egress posture, required
  adapter capabilities, missing capabilities, and residency-verification
  status explicit. Enqueue fails closed when configured egress or required
  capability policy is not satisfied, while default H1 local execution remains
  unchanged.
- Encryption policy diagnostics now make key-version presence, required
  key-version satisfaction, rotation due date, overdue rotation, and block-on-
  overdue posture explicit. Enqueue fails closed when a configured key version
  or rotation fence is not satisfied. Key labels are not returned in worker
  diagnostics or pipeline provenance manifests; only SHA-256 digests are
  recorded for audit correlation.
- Lifecycle diagnostics are read-only. They inspect bounded artifact references
  from job state, split published, recoverable-unpublished, and terminal
  orphan-candidate derivatives, count missing or checksum-mismatched stored
  objects, surface legal-hold/lifecycle capability support, and keep deletion
  disabled pending a manual attestation workflow.
- Replay diagnostics are read-only. They inspect bounded pipeline provenance
  manifests for published and recoverable jobs, verify stored manifest object
  checksums, parse capped JSON payloads, and compare manifest source/artifact
  semantics against the job record so migration and DR drift can be detected
  before replay. When manifests carry integrity envelopes, diagnostics also
  count signed, unsigned, unverified-signature, missing-integrity,
  payload-mismatch, missing-signature, and invalid-signature manifests.
- Restore attestation is read-only and version scoped. It verifies that an
  explicitly published version has a present pipeline manifest, matching
  stored-object checksum evidence, valid manifest integrity/signature evidence,
  manifest semantics that match the job record, and a complete derivative
  graph with every stored object present and checksum verified. The report
  returns redacted object-key digests, byte totals, SHA-256 evidence, and
  failure categories without returning raw object keys, job ids, project ids,
  filenames, local paths, version ids, or signing secrets.
- The token-gated worker route now exposes restore attestation through
  GET /api/transcode/worker?restore_attestation_version_id=<version_id>.
  Missing or empty version ids fail with 400, unauthorized requests fail with
  401, and the default GET path remains aggregate diagnostics. The production
  launch gate allows this request only on the admin host with the worker token;
  the client host stays closed.
- The token-gated worker POST route can now persist a durable, redacted
  restore-attestation receipt for a published version by accepting
  restore_attestation_version_id in the JSON body. The receipt is committed
  through the same StorageAdapter multipart path as derivatives, carries a
  checksum-bound attestation payload hash, uses the existing manifest signing
  key policy for SHA-256 or HMAC-SHA256 receipt integrity, and returns only
  redacted placement evidence. It refuses ambiguous worker commands that mix
  job_id with restore_attestation_version_id and does not persist receipts for
  not-found or unpublished versions.
- Restore-attestation receipt diagnostics are now part of the token-gated
  aggregate worker diagnostics. The pipeline records an internal control-plane
  receipt index after adapter placement, then diagnostics count published
  version coverage, missing receipts, duplicate receipts, missing receipt
  objects, checksum drift, invalid JSON, integrity drift, signature drift,
  attestation-payload drift, and status drift without returning raw object
  keys, version ids, job ids, project ids, local paths, or signing material.
- Local/CCNAS receipt catalog recovery diagnostics now scan the hashed
  tenant-object namespace with a bounded file cap. They discover persisted
  restore-attestation receipt objects even when the local control-plane receipt
  index is lost or corrupt, count unindexed receipts, invalid JSON candidates,
  unsafe entries, scan truncation, and repair-required pressure, and still
  return only aggregate counts. Remote providers remain marked unsupported
  unless their adapter explicitly exposes the media-pipeline receipt catalog
  capability.
- Provider-backed receipt catalog readiness is now defined at the
  media-pipeline boundary without changing the shared storage adapter
  contract. A future Drive or object-store adapter can opt in with
  listMediaPipelineReceiptObjects, and the pipeline will validate bounded
  catalog entries, safe relative object keys, stored-object inspection,
  checksum evidence, JSON shape, and receipt type before diagnostics or repair
  trust the entry. Readiness-only remote adapters still report unsupported.
  A media-pipeline conformance harness now gives Drive and object-store adapter
  implementors a bounded, redaction-safe target for native catalog readiness:
  capability presence, provider-side pagination, object metadata shape,
  stored-object inspection agreement, unsafe-entry accounting, cursor digesting,
  checkpoint pressure, and quota/backpressure classification.
  Provider catalogs can now return opaque cursors; the pipeline walks pages
  until the inspection cap is reached or the cursor ends, records page counts
  and a cursor digest only, and marks incomplete scans as checkpoint-required
  pressure. Provider-catalog scans now also persist a redacted checkpoint record
  in the media-pipeline control plane with provider, scan root, page count,
  started cursor digest, next cursor digest, continuation-token digest,
  continuation-token key digest, token expiry, completion state,
  freshness/staleness, and aggregate progress only.
  Authorized repair calls can now receive an encrypted, TTL-bound
  provider-catalog continuation token that resumes from the next opaque cursor
  without exposing the raw cursor in diagnostics, checkpoint records, or
  redaction-safe evidence payloads. Resumed scans overwrite the checkpoint with
  the starting cursor digest and clear continuation-token evidence when the
  provider catalog is complete. Old tokens can resume after cursor-token key
  rotation when the prior key is configured as a retired verification key,
  while unrelated retired keys fail closed. The token-gated worker POST route can now
  also run the provider-catalog conformance preflight with bounded scan/page
  limits, returning the same aggregate readiness report before DR drills without
  mutating receipt indexes.
- The token-gated worker POST route now also accepts
  restore_receipt_repair with mode dry_run or apply. The repair command uses
  the same bounded local/CCNAS or provider-backed catalog discovery, validates
  receipt integrity with the configured signing/verification keys, matches
  receipts back to one published version by the redacted version digest,
  rebuilds the local control-plane receipt index only in apply mode, is
  idempotent on repeat apply, refuses apply-mode mutation from incomplete
  provider catalog checkpoints, and returns aggregate repair counts without
  raw object keys, raw cursors, job ids, project ids, local paths, version ids,
  worker tokens, or signing material.
- The token-gated worker POST route now also accepts
  receipt_catalog_checkpoint_reset with mode dry_run or apply. The reset
  command deletes only safe hashed provider-catalog checkpoint files from the
  checkpoint control directory, preserves restore-attestation receipt objects
  and indexes, reports aggregate counts only, and exposes no raw cursors,
  checkpoint filenames, object keys, jobs, projects, versions, paths, worker
  tokens, or signing material. Apply-mode reset now also records a durable
  signed or checksum-bound local control-plane reset receipt with aggregate
  pre-reset counts, deleted-checkpoint count, reset snapshot digest, policy
  evidence, and no checkpoint filenames or raw cursors.
- Worker diagnostics now surface provider-catalog checkpoint reset pressure
  before catalog discovery can refresh a stale checkpoint. The report counts
  valid, invalid, stale, reset-candidate, and unsafe checkpoint entries as
  aggregate-only evidence. Malformed checkpoint records fail closed and block
  catalog recovery diagnostics until an operator runs the reset command, so a
  corrupt checkpoint is not silently replaced by a read-only diagnostic scan.
  Worker diagnostics also verify reset receipt integrity with the configured
  current or retired signing keys and report only aggregate receipt count,
  signature, payload-mismatch, and latest deleted-checkpoint evidence.
  Reset receipt diagnostics now also report bounded retention pressure,
  legal-hold blocking, oldest receipt ages, and preserve-latest policy, and the
  token-gated worker POST route accepts receipt_catalog_checkpoint_reset_lifecycle
  with mode dry_run or apply to prune old reset receipts without exposing local
  filenames or receipt payloads.
- Reset receipts can now be exported, imported, escrowed, inventoried, and
  recovered as signed or checksum-bound redacted packets through the
  token-gated worker POST route using
  receipt_catalog_checkpoint_reset_receipt_packet. Packet import verifies the
  packet envelope, current or retired signing keys, per-record receipt
  integrity, reset snapshot digests, receipt payload digests, duplicate
  records, and dry-run/apply behavior without exposing receipt payloads,
  filenames, local paths, raw cursors, worker tokens, or signing material.
  Reset receipt packet escrow now has bounded lifecycle cleanup, legal-hold
  blocking, aggregate diagnostics, and corrupt/tampered packet quarantine. The
  worker route supports packet lifecycle, quarantine, quarantine inventory, and
  quarantine lifecycle commands without exposing escrow filenames, quarantine
  filenames, packet payloads, receipt payloads, paths, tokens, or signing
  material.
- POST /api/transcode accepts only an owned asset and an exact resolved
  version. A browser cannot supply a filesystem path. The worker endpoint
  requires x-codeliver-media-worker-token. Its optional command body must be a
  JSON object; null, arrays, primitives, malformed JSON, empty job ids, empty
  restore-attestation version ids, malformed repair requests, and ambiguous
  commands fail with 400 instead of polling or throwing.
- GET /api/assets/:id/export now resolves an explicit published version and
  artifact, including the pipeline provenance manifest. It streams the
  selected safe object only after owner authorization; it no longer returns a
  claimed signed raw URL.

### Proven checks

Run from the repository root:

~~~
node --experimental-strip-types --test \
  tests/media-pipeline.test.ts \
  tests/media-pipeline-export.test.ts \
  tests/media-pipeline-restore-api.test.ts \
  tests/production-api-launch-gate.test.ts
npm test
npm run typecheck
npm run lint
npm run build
~~~

The focused media-pipeline/API command passes 48 reported tests, including
local FFmpeg/FFprobe proof,
ambiguous storage-commit recovery, concurrent enqueue isolation, aggregate
diagnostics redaction, project quota backpressure, SLO breach visibility,
lifecycle/orphan pressure, source-receipt migration pressure, restore-receipt
coverage pressure, replay manifest semantic drift detection, signature drift
detection, retired signing-key verification after rotation for manifests and
restore receipts, restore attestation for ready and drifted published versions,
immutable provenance manifest verification, and checksum-bound scanner
receipts in clean and quarantined paths. It also proves policy-gated storage
placement fails closed and reports only redacted readiness
pressure, and that encryption key-version and rotation policy failures fail
closed without leaking key labels. It now also proves source-receipt-required
mode fails closed before enqueue and that successful provenance stores only
redacted source-receipt evidence. Manifest-signature-required mode now fails
closed unless a signing key is configured. The focused
export tests also prove the pipeline manifest can be selected only from a
published version and unsafe manifest object keys fail closed. The restore API
test proves the worker route is token-authorized, rejects an empty version id,
returns a ready signed attestation for a published version, and redacts job,
version, project, source, object-key, local-path, worker-token, and signing-key
material. The production launch-gate test proves the same route remains
admin-only and credential-bearing. It also proves POST persistence writes one
adapter-committed restore-attestation receipt, signs it when a signing key is
configured, and keeps the response plus stored receipt free of raw job ids,
version ids, project ids, source keys, object keys, local paths, worker tokens,
and signing secrets. It now also proves dry-run/apply receipt-index repair is
token-authorized, aggregate-only, redacted, signature-validating, and
idempotent after a deleted local receipt index. Provider-catalog tests prove
remote providers stay unsupported without an explicit catalog capability and
that a catalog-capable remote provider can feed validated diagnostics and
repair without leaking identifiers. Cursor-checkpoint tests prove partial
provider scans refuse apply-mode repair, expose only a cursor digest, then
resume across the next provider page and repair once the checkpoint is
complete. Durable checkpoint tests prove those aggregate checkpoint records are
persisted, include issued continuation-token digest/key-digest/expiry evidence,
become stale after the policy window, are scoped by provider and scan root in
diagnostics, and are overwritten by a later completed scan with the started
cursor digest without leaking raw cursors or object keys. Continuation-token
tests prove encrypted
tokens resume provider-catalog repair without replaying page one, aggregate
page counts survive resume, old tokens remain usable after cursor-token key
rotation through retired verification keys, wrong retired keys fail closed,
provider mismatches and expired tokens fail closed, and the raw cursor, object
keys, project, job, version, path, token keys, and signing key remain redacted.
Provider-catalog conformance tests prove native
readiness can be assessed without raw object-key/cursor leakage, and malformed
metadata, inspection mismatches, missing capabilities, and provider
backpressure fail closed as aggregate findings. Worker-route tests prove the
conformance preflight is token-gated, rejects malformed limits, clamps to
bounded input, and redacts job, version, project, source, path, worker-token,
and signing-key material. Reset receipt packet tests prove signed packet
export/import, tamper rejection, copied-packet escrow recovery, idempotent
duplicate handling, parser validation, and token-gated worker route
export/import/escrow/inventory/recovery without leaking job, version, project,
source, object-key, local-path, worker-token, or signing-key material. They now
also prove reset packet escrow lifecycle cleanup, legal-hold blocking,
corrupt-packet quarantine, quarantine lifecycle cleanup, aggregate diagnostics,
and token-gated lifecycle/quarantine route commands.
`npm run typecheck` passes. The focused media-pipeline/API suite now passes
48 reported tests. The latest shared full
test run is not clean because the out-of-scope
tests/cockpit-navigation-links.test.ts fixture fails on an unexpected
@/components/brand/CoProductionBrand import; the run reports 359 passing tests
and one failing test before completion. The latest `npm run lint` is not clean
because the out-of-scope components/review/InternalAssetReviewPage.tsx file now
trips react-hooks/set-state-in-effect; it also reports the existing 31 shared
warnings. `npm run build` passes with the shared Turbopack NFT warning in
next.config.ts -> app/api/media/tus/[uploadId]/route.ts outside this boundary.

The focused suite proves:

1. concurrent idempotent enqueue resolves to one job and immutable artifacts;
2. a cancellation marker prevents processor execution;
3. absent production scanning quarantines before transcode;
4. a retryable transcode failure schedules bounded recovery;
5. persisted backoff survives a store restart and is enforced again at lease
   claim time;
6. malformed worker JSON values fail closed without polling the queue;
7. an expired lease becomes recoverable without a second active owner;
8. published export selection rejects unpublished versions and unsafe keys;
9. local execution invokes installed ffmpeg and ffprobe against a real
   generated MP4, then stores verified HLS and derivatives.
10. a provider response lost after immutable derivative placement reconciles to
    the verified object and completes the same job without an overwrite retry.
11. twenty concurrent idempotent enqueue attempts resolve to one job and expose
    only one eligible queue item to worker scans.
12. worker diagnostics summarize queued, stale-running, retry-deferred,
    cancelled, capacity, storage-readiness, and quota pressure without leaking
    job, asset, project, version, filename, or object-key identifiers.
13. the immutable pipeline provenance manifest is stored through the adapter,
    binds to the exact source checksum and artifact checksums, carries a
    64-character configuration hash, and excludes local absolute filesystem
    paths.
14. clean local-demo scan receipts and pending production-scan receipts are
    both persisted with the source checksum before publication or quarantine.
15. authenticated export selection can retrieve the pipeline provenance
    manifest for an explicitly published version and rejects unsafe manifest
    object keys.
16. project-scoped admission limits reject additional active work while
    allowing idempotent replay, require authoritative source size under byte
    quotas, and expose only redacted aggregate pressure metrics.
17. lifecycle diagnostics split terminal orphan candidates from recoverable and
    published derivatives, inspect referenced stored objects, keep deletion
    disabled, and avoid leaking artifact object keys or job identifiers.
18. worker diagnostics surface queued, eligible, running, and retry-ready SLO
    breaches as aggregate pressure without leaking job identifiers.
19. replay diagnostics verify stored pipeline manifests against source and
    artifact semantics, detect semantic drift even when the manifest object
    checksum matches its job record, and avoid leaking object keys.
20. storage placement policy diagnostics fail closed when required adapter
    capabilities are unavailable, report missing capabilities and residency
    verification status without leaking identifiers, and persist the policy
    snapshot into the immutable pipeline provenance manifest.
21. encryption policy diagnostics fail closed when required key versions are
    mismatched or rotation is overdue, redact key labels from diagnostics and
    provenance, and persist only key-version digests for audit correlation.
22. source receipt policy fails closed when enqueue lacks an authoritative
    adapter receipt, validates stored object inspection before staging, and
    persists redacted receipt evidence into the provenance manifest.
23. source receipt diagnostics surface migration pressure for missing receipts,
    provider mismatches, missing stored objects, and checksum or size drift as
    aggregate counts without leaking job, project, filename, or object-key
    identifiers.
24. replay diagnostics verify signed provenance manifests, detect invalid
    signatures even when stored object checksums have been recomputed, and do
    not leak signing material.
25. signature-required provenance policy fails closed when no manifest signing
    key is configured.
26. retired manifest signing keys continue to verify old signed provenance
    after primary-key rotation, while missing retired keys fail drift
    diagnostics and neither key is leaked.
27. restore attestation reports a ready published version only when the
    manifest and every derivative object verify, and reports missing derivative
    drift without leaking object keys, job ids, project ids, version ids, paths,
    or signing secrets.
28. the worker restore-attestation route is token-authorized, rejects empty
    version ids, returns the redacted version-scoped report, and remains
    production-gated to credential-bearing admin-host requests.
29. the worker restore-attestation receipt command is token-authorized,
    rejects empty and ambiguous command bodies, persists one signed receipt
    through the adapter namespace, and redacts job, version, project, source,
    object-key, local-path, worker-token, and signing-key material from both
    the response and stored receipt payload.
30. restore-receipt diagnostics report published-version coverage, missing
    receipts, duplicate receipt pressure, signed receipt verification, and
    drift without exposing job, version, project, source, object-key, local-
    path, worker-token, or signing-key material.
31. restore-receipt diagnostics verify retired signing keys after primary-key
    rotation, report missing-key signature drift when retired keys are absent,
    and remain clean when the old key is supplied as a verification key.
32. receipt catalog recovery diagnostics detect corrupt local receipt-index
    records and a fully deleted local receipt index, discover the persisted
    adapter receipt objects under the hashed tenant-object namespace, report
    unindexed receipt pressure, and avoid leaking raw job, version, project,
    source, object-key, path, token, or signing-key material.
33. receipt-index repair rebuilds a lost local control-plane index in apply
    mode after proving dry-run leaves the index missing, verifies receipt
    integrity before repair, matches only one published version by digest,
    remains idempotent on repeat apply, and redacts raw job, version, project,
    source, object-key, path, token, and signing-key material.
34. readiness-only remote providers report restore-receipt catalog recovery
    unsupported and repair apply does not pretend a Drive or object-store
    adapter can be scanned without an explicit catalog capability.
35. a structurally catalog-capable remote provider can feed provider-catalog
    diagnostics and dry-run/apply repair after stored-object inspection and
    checksum validation, while redacting raw job, version, project, source,
    object-key, path, token, and signing-key material.
36. provider-catalog cursors are paged under the configured inspection cap,
    partial checkpoints refuse apply-mode repair, the raw cursor is redacted
    to a digest, and a later complete scan resumes across pages before
    applying one idempotent repair.
37. provider-catalog checkpoint records persist aggregate page, cursor-digest,
    completion, and stale/fresh evidence, remain scoped to the inspected
    provider and scan root, and avoid raw cursor, object-key, job, version,
    project, path, token, or signing-key leakage.
38. encrypted provider-catalog continuation tokens let an authorized repair
    resume from a redacted checkpoint without replaying page one, preserve
    aggregate page counts, expire on the configured TTL, fail closed on provider
    mismatch, and avoid raw cursor, object-key, job, version, project, path,
    token-key, or signing-key leakage.
39. provider-catalog conformance reports give Drive and object-store adapter
    implementors an aggregate readiness target for native catalog pagination,
    stored-object inspection agreement, unsafe-entry accounting, cursor
    checkpoint pressure, and provider quota/backpressure behavior without
    leaking raw cursor, object-key, job, version, project, path, or signing-key
    material.
40. token-gated provider-catalog conformance preflight is exposed through the
    worker POST route with one-command parsing, bounded scan/page limits,
    malformed-input rejection, and aggregate-only redacted responses.

## H1 Operating Contract

Required local/CCNAS configuration:

~~~
CODELIVER_STORAGE_PROVIDER=local|ccnas
CODELIVER_LOCAL_STORAGE_ROOT=/absolute/path        # local only
NAS_MEDIA_ROOT=/absolute/path                       # CCNAS only
CODELIVER_STORAGE_WRITE_ENABLED=1
CODELIVER_STORAGE_RESERVED_BYTES=<integer>
CODELIVER_MEDIA_PIPELINE_WORKER_TOKEN=<secret>
~~~

Production defaults to required malware scanning and keeps a version
quarantined until a trusted hook returns clean. Local demo execution additionally
requires the explicit local-only value CODELIVER_MALWARE_POLICY=allow-local-demo.

Optional bounded-execution controls:

~~~
CODELIVER_MEDIA_PIPELINE_MAX_ATTEMPTS=4
CODELIVER_MEDIA_PIPELINE_RETRY_BASE_MS=30000
CODELIVER_MEDIA_PIPELINE_RETRY_CAP_MS=1800000
CODELIVER_MEDIA_PIPELINE_JOB_LEASE_MS=<at least 4 command timeouts plus 2 minutes>
CODELIVER_MEDIA_PIPELINE_WORKER_LEASE_MS=<at least 4 command timeouts plus 2 minutes>
CODELIVER_MEDIA_PIPELINE_MAX_CONCURRENT_JOBS=1
CODELIVER_MEDIA_PIPELINE_MAX_ACTIVE_JOBS_PER_PROJECT=<integer>
CODELIVER_MEDIA_PIPELINE_MAX_ACTIVE_BYTES_PER_PROJECT=<integer bytes>
CODELIVER_MEDIA_PIPELINE_MAX_SOURCE_BYTES=<storage max by default>
CODELIVER_MEDIA_PIPELINE_LIFECYCLE_INSPECTION_LIMIT=500
CODELIVER_MEDIA_PIPELINE_REPLAY_MANIFEST_MAX_BYTES=1048576
CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CURSOR_TOKEN_KEY=<secret>
CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CURSOR_TOKEN_VERIFICATION_KEYS=<old-secret,...>
CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CURSOR_TOKEN_TTL_MS=21600000
CODELIVER_MEDIA_PIPELINE_SLO_QUEUED_MS=900000
CODELIVER_MEDIA_PIPELINE_SLO_ELIGIBLE_MS=300000
CODELIVER_MEDIA_PIPELINE_SLO_RUNNING_MS=<worker lease by default>
CODELIVER_MEDIA_PIPELINE_SLO_RETRY_READY_MS=300000
CODELIVER_MEDIA_PIPELINE_EGRESS_POLICY=allow-external|local-only
CODELIVER_MEDIA_PIPELINE_REQUIRED_STORAGE_CAPABILITIES=legal-hold,lifecycle-tiering,...
CODELIVER_MEDIA_PIPELINE_REQUIRED_RESIDENCY=<policy label>
CODELIVER_MEDIA_PIPELINE_REQUIRE_SOURCE_RECEIPT=0|1
CODELIVER_MEDIA_PIPELINE_ENCRYPTION_KEY_VERSION=<non-secret key version label>
CODELIVER_MEDIA_PIPELINE_REQUIRED_ENCRYPTION_KEY_VERSION=<non-secret key version label>
CODELIVER_MEDIA_PIPELINE_KEY_ROTATION_DUE_AT=<ISO UTC timestamp>
CODELIVER_MEDIA_PIPELINE_BLOCK_ON_OVERDUE_KEY_ROTATION=0|1
CODELIVER_MEDIA_PIPELINE_MANIFEST_SIGNING_KEY=<secret, at least 32 chars>
CODELIVER_MEDIA_PIPELINE_MANIFEST_VERIFICATION_KEYS=<comma-separated retired secrets>
CODELIVER_MEDIA_PIPELINE_REQUIRE_MANIFEST_SIGNATURE=0|1
CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_RECEIPT_MAX_RECORDS=100
CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_RECEIPT_RETENTION_MS=7776000000
CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_RECEIPT_LEGAL_HOLD=0|1
CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_PACKET_ESCROW_MAX_RECORDS=100
CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_PACKET_ESCROW_RETENTION_MS=7776000000
CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_PACKET_ESCROW_LEGAL_HOLD=0|1
CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_PACKET_QUARANTINE_MAX_RECORDS=100
CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_PACKET_QUARANTINE_RETENTION_MS=15552000000
CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_PACKET_QUARANTINE_LEGAL_HOLD=0|1
CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_PACKET_QUARANTINE_ATTESTATION_MAX_RECORDS=100
CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_PACKET_QUARANTINE_ATTESTATION_RETENTION_MS=31536000000
CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_PACKET_QUARANTINE_ATTESTATION_LEGAL_HOLD=0|1
CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CHECKPOINT_RESET_RECEIPT_MAX_RECORDS=100
CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CHECKPOINT_RESET_RECEIPT_RETENTION_MS=31536000000
CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CHECKPOINT_RESET_RECEIPT_LEGAL_HOLD=0|1
CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CHECKPOINT_RESET_RECEIPT_PACKET_ESCROW_MAX_RECORDS=100
CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CHECKPOINT_RESET_RECEIPT_PACKET_ESCROW_RETENTION_MS=31536000000
CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CHECKPOINT_RESET_RECEIPT_PACKET_ESCROW_LEGAL_HOLD=0|1
CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CHECKPOINT_RESET_RECEIPT_PACKET_QUARANTINE_MAX_RECORDS=100
CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CHECKPOINT_RESET_RECEIPT_PACKET_QUARANTINE_RETENTION_MS=31536000000
CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CHECKPOINT_RESET_RECEIPT_PACKET_QUARANTINE_LEGAL_HOLD=0|1
CODELIVER_MEDIA_PIPELINE_COMMAND_TIMEOUT_MS=1800000
FFMPEG_PATH=ffmpeg
FFPROBE_PATH=ffprobe
~~~

POST /api/transcode/worker processes exactly one requested or eligible job, or
persists exactly one restore-attestation receipt when
restore_attestation_version_id is supplied. It is intentionally synchronous and
token-gated for safe H1 local execution; a production scheduler should call it
with a short request budget or invoke the same service from a dedicated worker
process.

GET /api/transcode/worker returns token-gated aggregate diagnostics by default
and a token-gated version restore attestation when
restore_attestation_version_id is provided. It is suitable for local worker
monitors, readiness probes, SLO breach visibility, and bounded migration/DR
preflight checks, but it is not yet a substitute for a centralized Horizon 2
metrics backend or alert manager.

Cancellation is fail-closed for publication: it prevents new work and stops
child FFmpeg processes. Immutable derivatives committed before cancellation are
unreferenced orphan candidates, never published. Worker diagnostics now count
those candidates and verify referenced storage objects, but deletion remains
disabled until a future lifecycle reclaimer requires explicit attestation.

## Residual Risk Map

### Highest next gap

Provider-catalog packet quarantine evidence now has signed, aggregate manual
attestations for reviewed, retained, and released decisions, plus bounded
attestation retention, legal-hold blocking, signature/keyring verification, and
stale-attestation diagnostics. Operators can record and govern a durable
decision against the current quarantine snapshot without reopening corrupted
rollback packets or exposing escrow filenames, roots, raw packet payloads,
object keys, or signing material. Durable provider-catalog checkpoints now
record redacted resume lineage and token evidence for process restarts,
delayed replicas, multi-hour Drive scans, and DR drills without storing raw
cursors. Continuation-token key-rotation verification now proves old encrypted
resume tokens survive rotation when the prior key is configured as retired
verification material, while wrong retired keys fail closed. Checkpoint
corruption and reset handling now has aggregate diagnostics plus a token-gated
dry-run/apply reset path that preserves receipt objects and fails closed on
malformed checkpoint state. Apply-mode resets now leave durable
signed/checksum-bound reset receipts that survive diagnostics, DR review, and
post-incident audit without exposing raw cursors or checkpoint filenames. Reset
receipts now have bounded retention, legal-hold blocking, lifecycle
diagnostics, and token-gated dry-run/apply cleanup. Reset receipts can now be
exported, imported, escrowed, inventoried, and recovered as signed redacted
packets during migration, legal hold, rollback, or DR drills. Reset receipt
packet escrow now has bounded lifecycle, legal-hold blocking, corrupt-packet
quarantine, quarantine lifecycle cleanup, and aggregate diagnostics. The
highest remaining in-scope gap is reset receipt packet quarantine decision
evidence: quarantined reset-receipt packets are now isolated and
lifecycle-governed, but there is not yet a durable, signed manual attestation
for reviewed, retained, or released quarantine decisions. Actual Drive and future object-store
`listMediaPipelineReceiptObjects` implementations still live outside this lane.
Upstream storage/upload work still needs canonical version creation plus
adapter commit receipts before legacy upload paths are allowed to enqueue this
pipeline.

### Horizon 1 residuals

- Existing direct upload and legacy worker routes remain outside this slice and
  are not safe migration targets. New traffic must use the version-bound route.
- Caption output is either extracted embedded WebVTT or an explicit
  pending_transcription placeholder. It does not invent transcript text or
  start paid transcription.
- HLS uses a manifest mapping safe segment object keys. A future delivery
  broker must resolve that manifest for streaming; exporting the manifest is
  safe but is not a public HLS playback service.
- Asset ownership currently derives tenant isolation from project scope because
  the asset model has no organization/tenant foreign key. The object namespace
  records this as project:<projectId> and must be replaced by canonical
  organization authority when it lands.
- Project quota enforcement is local-control-plane only. It is useful H1
  backpressure for local/CCNAS, but Horizon 2 still needs centralized
  tenant/org quotas, cross-worker atomic claims, billing-budget integration,
  and alerting on sustained quota saturation.
- Authenticated owner export is a stopgap for H1. Public review delivery,
  recipient policy, watermark enforcement, and short-lived signed delivery
  remain separate access-control work.
- Lifecycle diagnostics are metadata-driven from pipeline job state. They are
  sufficient for H1 orphan pressure visibility, but Horizon 2 still needs a
  durable catalog reconciliation job that can discover stray objects not
  referenced by surviving control files.
- Replay diagnostics validate stored pipeline manifests against local job
  state. Horizon 2 still needs cross-region replica comparison, external
  manifest signing, cursorized provider catalog checkpoints, and deterministic
  restore drills from object storage alone.
- Encryption/key-rotation diagnostics are policy fences and provenance
  evidence only. H1 local storage is not a customer-managed encryption
  implementation, and Horizon 2 still needs adapter-level encryption receipts
  plus centralized key-rotation audit.

### Horizon 2 requirements

- Replace filesystem job files with a transactionally claimed durable queue,
  enforce tenant/project concurrency and byte quotas centrally, and publish
  SLOs for ingest, probe, derivative, and recovery latency.
- Introduce a portable object-store writer, multi-region replica state,
  resumable ingest proof, CDN token broker, DR runbooks, migration receipts,
  and rollback tests.
- Send structured metrics, traces, and audit events to an operations backend;
  alert on quarantine backlog, retry exhaustion, worker-slot saturation,
  storage reserve breach, checksum mismatch, and orphan derivative growth.
- Add chaos tests for worker death during transcode, adapter timeout during
  commit, corrupted manifests, delayed replicas, exhausted capacity, and
  replayed worker calls.

### Horizon 3 requirements

- Add policy-driven provider placement, residency boundaries, legal holds,
  retention/lifecycle classes, egress controls, customer-managed key support,
  key rotation receipts, and petabyte-scale catalog/partition operations.
- Add full encoder versions, externally attested scanner engine trust, and
  model lineage to auditable published versions. H1 now records a redacted
  pipeline configuration hash and the scanner hook receipt in the immutable
  provenance manifest.
- Make migration and recovery replay deterministic across regions while
  preserving tenant isolation and approved-final continuity obligations.

## Recursive Loop Status

1. **Inventory:** storage adapter contracts, legacy queue, version authority,
   direct upload behavior, and local FFmpeg availability were inspected.
2. **Highest-risk gaps selected:** first, a version-safe processor did not
   exist; the legacy worker accepted direct paths, had no durable retry or
   cancellation, and could publish mutable outputs. The next in-scope gap was
   enqueue linearizability: equivalent concurrent requests could rely on
   after-the-fact cleanup instead of preventing duplicate visible queue work.
   The latest in-scope gap was operational blindness: a local/CCNAS worker
   could be busy, retry-blocked, stale, or storage-not-ready without a safe
   aggregate pressure view. The current in-scope gap was replay provenance:
   stored derivatives needed a version-bound manifest that could support
   migration, rollback, DR comparison, and audit without relying on database
   metadata alone. The latest in-scope gap was scanner evidence: quarantine
   and publication needed checksum-bound scan receipts before any derivative
   or terminal state was trusted. The current in-scope gap was retrieval
   continuity: the provenance manifest existed in storage but could not be
   selected through the authenticated version-bound export surface. The latest
   in-scope gap was admission backpressure: local/CCNAS enqueue could accept
   unbounded active work for the same project before a Horizon 2 queue exists.
   The current in-scope gap was lifecycle blindness: terminal failed or
   cancelled jobs could leave unpublished derivatives without any safe
   aggregate recovery or orphan-pressure signal. The latest in-scope gap was
   SLO blindness: queue pressure was visible, but local operators could not see
   whether queued, eligible, running, or retry-ready work had breached service
   objectives. The current in-scope gap was replay drift blindness: stored
   provenance manifests existed, but diagnostics did not prove they still
   semantically matched the job's source and derivative graph. The latest
   in-scope gap was placement-policy blindness: storage egress, required
   capabilities, and residency intent were not explicit at the pipeline layer.
   The current in-scope gap was encryption/key-rotation blindness: published
   derivatives had checksums, but no redacted key-version or rotation fence for
   audit, migration, or rollback review. The latest in-scope gap was source-
   receipt blindness: the pipeline could compute a checksum after staging, but
   could not require or preserve the upstream adapter commit receipt that
   should bind upload, version authority, migration, and rollback. The current
   in-scope gap was source-receipt migration blindness: operators could not see
   how many queued or recoverable jobs would fail before enabling receipt-
   required mode. The latest in-scope gap was replay authenticity blindness:
   provenance manifests were storage-checksum-bound but not self-authenticating
   for DR or cross-region restore review. The current in-scope gap was
   manifest key-rotation blindness: a healthy retired signed manifest could
   become unverifiable after the primary signing key rotated. The latest
   in-scope gap was restore-attestation blindness: operators could inspect
   aggregate replay diagnostics but could not request a bounded, redacted,
   version-scoped proof that a published derivative graph was ready for
   migration or restore. The current in-scope gap was restore-attestation API
   surface blindness: migration tooling could request the report only through
   service internals, not through a credential-bearing worker/admin boundary.
   The latest in-scope gap was durable receipt blindness: restore attestation
   could prove readiness on demand, but migration, rollback, legal-hold, and
   DR packets had no signed adapter-stored receipt to carry that proof. The
   current in-scope gap was receipt catalog blindness: durable receipts existed,
   but operators could not see coverage, duplicates, checksum drift, signature
   drift, missing receipts, or payload/status drift as aggregate diagnostics.
   The latest in-scope gap was local catalog-recovery blindness: receipt
   diagnostics depended on the local receipt index and could not discover
   persisted local/CCNAS receipt objects after index loss or corruption. The
   latest in-scope gap was provider-catalog conformance evidence: token-gated
   remote-provider preflight could prove catalog readiness in memory, but DR,
   rollback, migration, and legal-hold packets had no signed, persisted,
   redacted record of which provider, scan limits, findings, cursor state, and
   readiness state were observed during a drill. The current in-scope gap was
   provider-catalog conformance receipt lifecycle pressure: signed local
   control-plane receipts existed, but H2/H3 operations still needed bounded
   retention, legal-hold blocking, purge eligibility, and rollback-safe cleanup
   semantics before long-running local/CCNAS evidence could scale. The latest
   in-scope gap was provider-catalog evidence portability: persisted and
   lifecycle-managed conformance receipts could not yet move between local,
   CCNAS, Drive, and future object-store control planes as a signed, redacted
   migration/rollback packet. The current in-scope gap was packet escrow and
   recovery blindness: signed packet responses existed, but local/CCNAS
   operators had no durable packet escrow index, duplicate packet detection,
   or recovery workflow after packet files were copied between control planes.
   The current in-scope gap was packet escrow lifecycle pressure: escrowed
   packet records could accumulate indefinitely on local/CCNAS control disks
   and lacked dry-run/apply retention controls, legal-hold blocking, and
   rollback-safe deletion semantics. The latest in-scope gap was packet
   escrow observability: operators could invoke lifecycle cleanup, but the
   default worker diagnostics did not yet surface packet escrow age/count
   pressure before manual cleanup or scheduled lifecycle runs.
3. **Bounded improvements:** this H1 pipeline is version-bound,
   adapter-backed, cancellable, quarantined by default, and locally executable.
   Enqueue now uses a per-idempotency-key lock and hidden staging before
   atomic queue publication. The worker route now exposes token-gated,
   redacted aggregate diagnostics for queue pressure and storage readiness.
   Each successful run now stores an immutable provenance manifest with source,
   artifact, provider, probe, scanner receipt, and configuration-hash evidence.
   The authenticated export selector can now return that manifest without
   exposing raw storage paths. Optional project job and byte quotas now gate new
   enqueue work behind a project admission lock while keeping idempotent replay
   available. Worker diagnostics now include bounded, read-only lifecycle
   counts for terminal orphan candidates, recoverable unpublished derivatives,
   published derivatives, missing objects, checksum mismatches, and legal-hold
   capability support. Worker diagnostics also expose configurable SLO
   thresholds and aggregate breach counts. Replay diagnostics now validate
   stored pipeline provenance manifests for published and recoverable jobs
   against source and artifact semantics. Storage placement diagnostics now
   fail closed when configured egress or required storage capabilities are not
   satisfied, and provenance manifests carry the redacted placement-policy
   snapshot. Encryption diagnostics now fail closed when a configured
   key-version or overdue-rotation fence is not satisfied, and provenance
   manifests carry only key-version digests rather than raw key labels. Source
   receipt policy now fails closed when required receipt evidence is missing,
   validates adapter inspection before staging, uses receipt size/checksum for
   idempotency and byte admission, and records redacted receipt evidence in the
   immutable provenance manifest. Source receipt diagnostics now report
   aggregate coverage, active missing receipts, invalid receipts, provider
   mismatches, missing source objects, and checksum drift as migration-
   readiness evidence. Provenance manifests now include deterministic integrity
   envelopes, and optional HMAC signatures are verified by replay diagnostics
   without exposing signing secrets. Replay diagnostics now verify against a
   bounded manifest-signing keyring so retired keys can prove old manifests
   during rotation, rollback, and restore drills. Restore attestation now
   produces a per-version ready/drift report that verifies manifest presence,
   stored-object checksums, manifest integrity, manifest semantics, derivative
   graph completeness, byte totals, and redacted object-key digests. The
   worker route now exposes that report through a token-gated admin-only GET
   parameter while preserving aggregate diagnostics as the default GET. The
   worker POST route now persists signed or checksum-bound restore-attestation
   receipts as adapter objects and returns only redacted receipt placement
   evidence. Worker diagnostics now include a redacted restore-receipt catalog
   section with coverage, duplicate, checksum, JSON, integrity, signature,
   attestation-payload, and status-drift counts. Local/CCNAS diagnostics now
   perform a bounded scan of the hashed tenant-object namespace and report
   discovered, unindexed, invalid, unsafe, truncated, and repair-required
   receipt-catalog pressure without returning object keys or paths.
   Provider-catalog conformance preflights can now be intentionally persisted
   as signed local control-plane receipts with aggregate provider/readiness
   evidence, receipt inventories, and service diagnostics that verify current
   and retired signing keys without exposing raw provider cursors, object
   keys, local paths, or signing material. Provider-catalog conformance
   receipts now have configurable retention controls for maximum local record
   count, retention window, and legal hold. The token-gated worker route can
   dry-run or apply receipt lifecycle cleanup while preserving the newest
   record, reporting only aggregate eligibility/deletion/blocked counts, and
   deleting records by digest-addressed local control keys rather than raw
   paths. Provider-catalog conformance receipt inventories can now export a
   signed redacted packet containing only aggregate source counts and receipt
   records, and a fresh control plane can dry-run or apply packet import after
   packet-integrity, retired-key, per-record receipt-integrity, digest, and
   duplicate checks. Imported records preserve original recorded timestamps so
   lifecycle and rollback evidence do not lose historical age. Provider-catalog
   conformance packets can now be escrowed as local control-plane records,
   inventoried with duplicate packet digest and signature health counts, and
   replayed through a dry-run/apply recovery flow that imports receipt evidence
   from copied packet files while keeping packet contents out of public
   diagnostics. Provider-catalog conformance packet escrow now has
   configurable retention controls for maximum local packet count, retention
   window, and legal hold. The token-gated worker route can dry-run or apply
   packet escrow lifecycle cleanup while preserving the newest packet,
   reporting aggregate eligibility/deletion/blocked counts, and deleting
   packets by safe local escrow filenames rather than raw paths or packet
   payloads. Worker diagnostics now include a redacted provider-catalog packet
   escrow section with packet counts, invalid record counts, duplicate digest
   pressure, packet-integrity pressure, lifecycle eligibility, legal-hold
   blocking, oldest packet age, oldest eligible age, and the active retention
   policy without exposing escrow filenames, roots, packet payloads, or signing
   material. Packet escrow corruption quarantine now moves malformed packet
   records, packet-integrity failures, and packet digest mismatches into a
   separate local control-plane quarantine directory on apply while preserving
   the evidence for manual review. Dry-run reports only aggregate quarantine
   candidates, retained packets, and corruption counts, and recovery continues
   to scan only usable escrow packets after quarantine. Quarantined packet
   evidence can now receive durable signed/checksum-bound manual attestations
   for reviewed, retained, and released decisions. The attestation records bind
   an aggregate quarantine snapshot digest, reason counts, oldest quarantine
   age, payload digest, integrity algorithm, and signed/unsigned state without
   persisting raw packet identifiers in public responses. Packet quarantine
   attestations now have separate configurable retention controls for maximum
   local attestation count, retention window, and legal hold. Worker diagnostics
   and token-gated inventory/lifecycle commands report aggregate attestation
   counts, decision buckets, signature/keyring health, payload mismatch counts,
   stale eligibility, legal-hold blocking, and preserve-latest cleanup behavior
   without returning attestation payloads or local filenames.
4. **Failure and scale attack tests:** idempotency race, ambiguous provider
   commit recovery, cancellation, quarantine, transient retry,
   restart-persisted backoff, stale-observation lease claiming, malformed
   worker JSON, stale lease recovery, export key validation, concurrent
   enqueue visibility, redacted queue diagnostics, immutable provenance
   manifest content and export selection, checksum-bound scan receipts, project
   quota saturation, unknown-size byte quota rejection, lifecycle object
   inspection, orphan/recoverable/published artifact classification, SLO breach
   aggregation, replay manifest semantic drift detection, placement-policy
   capability blocking, encryption key-version mismatch, overdue rotation
   blocking, redacted key diagnostics, missing source receipt rejection,
   redacted source receipt provenance, source-receipt diagnostics redaction,
   manifest signature tamper detection, manifest-signature-required
   configuration rejection, retired signing-key rotation verification, and real
   local transcoding are covered. Restore-attestation readiness and missing-
   derivative drift are covered without leaking object keys, job ids, project
   ids, version ids, local paths, or signing secrets. The worker route coverage
   also proves unauthorized requests fail, empty version ids fail, admin-host
   credentialed access passes the launch gate, and client-host access remains
   closed. Receipt persistence tests prove ambiguous worker commands fail
   closed, unsigned write access is rejected, the committed storage receipt is
   signed when a signing key exists, and raw job, version, project, source,
   object-key, local-path, worker-token, and signing-key material stay out of
   both response and stored receipt payloads. Restore-receipt diagnostics tests
   prove missing coverage, clean signed coverage, duplicate receipt pressure,
   redaction, missing-key signature drift after rotation, and successful
   retired-key verification. Catalog-recovery tests prove corrupt local
   receipt-index records and a fully
   deleted local receipt index are detected while persisted adapter receipt
   objects remain discoverable as aggregate unindexed recovery evidence.
   Repair tests prove dry-run leaves a missing index unchanged, apply rebuilds
   exactly one valid index record from signed adapter evidence, repeat apply is
   idempotent, malformed repair commands fail closed, and worker-route repair
   responses remain aggregate-only and redacted. Provider-catalog tests prove
   readiness-only remote providers stay unsupported, while a structurally
   catalog-capable remote provider can feed diagnostics and dry-run/apply
   repair only after catalog metadata, stored-object inspection, checksum
   evidence, and receipt JSON shape all validate. Cursor tests prove partial
   provider checkpoints block apply-mode repair, expose only a cursor digest,
   can issue an encrypted continuation token for authorized repair, and can
   resume across pages before applying. Provider-catalog conformance receipt
   tests prove a structurally catalog-capable remote provider can persist a
   signed aggregate-only readiness receipt, that diagnostics verify the receipt
   after manifest signing-key rotation with the retired key retained, that a
   tampered receipt is detected as a payload mismatch, and that worker-route
   `persist` commands remain token-gated and redacted. Conformance receipt
   lifecycle tests prove legal hold blocks apply-mode deletion, dry-run reports
   eligible records without mutation, unlocked apply prunes only eligible old
   records while preserving the latest receipt, parser validation fails closed,
   and worker-route lifecycle responses remain aggregate-only and redacted.
   Export/import packet tests prove signed packets import into a fresh control
   plane after signing-key rotation, dry-run import does not mutate state,
   apply import preserves original timestamps, repeat import is idempotent,
   tampered packet payloads fail closed, parser validation fails closed, and
   worker-route packet responses remain token-gated and redacted. Packet escrow
   tests prove signed packets persist to local control-plane escrow, duplicate
   packet digests are detected, copied escrow files can dry-run recovery
   without mutation, apply recovery imports receipts into a fresh control
   plane, repeat recovery is idempotent, and worker-route escrow/inventory
   responses remain aggregate-only and redacted. Packet escrow lifecycle tests
   prove legal hold blocks apply-mode deletion, dry-run reports eligible
   packets without mutation, unlocked apply prunes only eligible old packets
   while preserving the latest packet, parser validation fails closed, and
   worker-route lifecycle responses remain aggregate-only and redacted. The
   same tests prove worker diagnostics expose packet escrow pressure before
   cleanup and clear pressure after unlocked lifecycle apply without leaking
   roots, source keys, packet payloads, or signing material. Packet escrow
   quarantine tests prove malformed packet records, packet-integrity failures,
   and digest mismatches are detected, dry-run leaves escrow unchanged, apply
   moves only corrupt packet records into quarantine while preserving clean
   recovery packets, post-quarantine diagnostics clear corruption pressure,
   recovery still sees exactly the remaining usable packet, parser validation
   fails closed, and worker-route quarantine responses remain aggregate-only
   and redacted. Packet quarantine inventory and lifecycle tests prove
   quarantined packet counts and reason buckets are visible without filenames
   or payloads, legal hold blocks apply-mode cleanup, unlocked apply prunes
   only eligible old quarantine records while preserving the latest quarantine,
   and worker-route quarantine inventory/lifecycle responses remain
   aggregate-only and redacted. Packet quarantine attestation tests prove
   retained and released decisions persist signed aggregate evidence, reviewed
   decisions are token-gated through the worker route, attestation inventory
   reports decision and signature counts, parser validation fails closed for
   missing or unsupported decisions, and public responses stay free of local
   roots, source keys, quarantined filenames, packet payloads, worker tokens,
   and signing keys. Packet quarantine attestation lifecycle and verification
   tests prove legal hold blocks apply-mode deletion, wrong signing keyrings
   surface invalid signatures without leaking secrets, dry-run reports eligible
   stale records without mutation, unlocked apply prunes only eligible old
   attestations while preserving the latest decision, diagnostics expose and
   then clear stale-attestation pressure, and the worker route remains
   token-gated and aggregate-only. Provider-catalog checkpoint tests now prove
   persisted checkpoints include continuation-token digest/key-digest/expiry
   evidence for partial scans, completed resumed scans record the started
   cursor digest and clear next-token evidence, stale checkpoints remain
   aggregate-only, old tokens resume after cursor-token key rotation through
   retired verification keys, wrong retired keys fail closed, and raw cursors,
   continuation-token keys, object keys, project ids, job ids, version ids,
   paths, and signing keys remain redacted. Checkpoint reset tests prove stale
   and corrupt checkpoint pressure appears in aggregate diagnostics, malformed
   checkpoints block catalog recovery diagnostics instead of being silently
   overwritten, dry-run leaves checkpoint state unchanged, apply deletes only
   safe checkpoint files, receipt objects and restore-receipt indexes are
   preserved, malformed reset commands fail closed, and the worker route stays
   token-gated and aggregate-only. Checkpoint reset receipt tests prove
   dry-run records no receipt, apply persists one signed aggregate reset
   receipt through the local control plane, worker diagnostics verify the
   receipt as valid_signed, route apply returns only reset snapshot and payload
   digests, and raw checkpoint filenames, cursors, object keys, job ids,
   project ids, version ids, paths, worker tokens, and signing keys remain
   redacted. Reset receipt lifecycle tests prove diagnostics surface retention
   pressure and legal-hold blocking, dry-run leaves receipts untouched,
   legal-hold apply deletes nothing, unlocked apply prunes only eligible old
   receipts while preserving the latest signed receipt, parser validation fails
   closed, and the worker route returns aggregate-only lifecycle results.
   Reset receipt packet tests prove signed redacted packets export and import
   across signing-key rotation, tampered packets fail closed, copied escrow
   packets can recover receipts idempotently, parser validation rejects
   malformed packet commands, the token-gated worker route exposes
   export/import/escrow/inventory/recovery/lifecycle/quarantine controls, legal
   hold blocks escrow and quarantine cleanup, unlocked apply prunes only
   eligible stale packet evidence, corrupt packet records move to quarantine,
   and diagnostics remain aggregate-only without leaking job, version, project,
   source, object-key, path, worker-token, or signing-key material.
5. **Evidence recorded:** focused tests, typecheck, and production build pass.
   Current focused evidence on 2026-07-15: `npm run typecheck` passed, and
   the focused media-pipeline/API test command passed 48/48 tests. Scoped ESLint
   over the touched media-pipeline, worker-route, and focused test files
   passed, `git diff --check` over the scoped files passed, and `npm run build`
   passed. The build still emits the pre-existing Turbopack NFT warning through
   `next.config.ts -> lib/tus/store.ts ->
   app/api/media/tus/[uploadId]/route.ts`. The latest full-test results are
   listed above and remain blocked by out-of-scope review/cockpit fixture
   failures.
6. **Next selection:** checkpoint reset receipt packet quarantine attestation.
   The media-pipeline
   boundary can now escrow, recover, lifecycle-manage, diagnose, quarantine,
   inventory, manually attest, verify, lifecycle-govern corrupt packet
   evidence, persist redacted provider-catalog checkpoint resume lineage,
   verify continuation-token key rotation, and reset malformed or stale
   provider checkpoints without touching receipt objects while leaving signed
   reset receipts with bounded retention, legal-hold cleanup, packet export,
   packet import, packet escrow inventory, copied-packet recovery, packet
   escrow lifecycle cleanup, corrupt-packet quarantine, quarantine lifecycle
   cleanup, and aggregate diagnostics. H2/H3 DR drills still need durable,
   signed quarantine decision attestations so reviewed, retained, and released
   reset-packet evidence can be governed without reopening corrupted packet
   payloads or relying on chat/operator memory. Actual Drive and future object-store
   `listMediaPipelineReceiptObjects` implementations still live outside this
   lane. Upstream storage/upload work still needs canonical version creation
   and adapter ingest receipts before legacy upload paths are allowed to
   enqueue this pipeline.
