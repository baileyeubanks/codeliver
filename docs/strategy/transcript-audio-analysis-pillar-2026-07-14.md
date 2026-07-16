# Transcript And Audio Analysis Pillar

Date: 2026-07-14

Authority: `docs/strategy/co-produce-goal-extension-2026-07-14.md`, including
`Enterprise Operating Horizon`, `Transcript Truth Model`, and
`Audio Intelligence Contract`.

This document records one bounded pillar iteration. It does not claim that the
transcript and audio-analysis pillar, its cross-pillar integration, or the
enterprise goal is complete.

## Recursive Loop Record

### Inventory

The checkout already had:

- version records and an exact-version resolver
- a legacy `transcriptions` table with asset, optional version, language,
  status, and JSON segments
- a placeholder asset-level transcription route and component
- concurrent version-bound `edit_decisions` types, API work, and migration
- a canonical strategy that separates source tokens, transcript revisions,
  candidates, compositions, decisions, renders, and published versions

The legacy transcript contract had no word confidence, provider boundary,
waveform alignment, immutable source identity, deterministic replay,
calibration, privacy policy, or acoustic candidate evidence.

### Highest-Risk Primitives Selected

The first selected primitive was immutable source/version provenance plus
deterministic replay. Every downstream token, segment, caption, waveform bin,
candidate, decision proposal, batch plan, and composition preview now carries
or verifies the same asset/version identity. APIs require an explicit
`version_id`; they do not silently follow the current version.

The takeover loop selected the next recorded gap: checksum-bound append-only
persistence, transactional audit, and queue/lifecycle authority. The new
boundary refuses persistence or enqueue unless a trusted ingest or storage
authority reproduces the exact source identity with a SHA-256 media checksum.
Transcript and analysis payloads receive separate SHA-256 manifests, and an
analysis input digest is recomputed from the exact persisted transcript.

The current `Version` record still has no checksum field, so
`transcriptSourceFromVersion` deliberately returns `mediaSha256: null`. That
means production API writes remain fail-closed until storage and migration
owners provide the trusted receipt and durable adapter. No client-supplied
checksum can open the path.

## Current Slice

### Horizon 1: Coherent Production Core

| Capability | Current evidence | State |
| --- | --- | --- |
| Version-bound transcript envelope | `lib/transcript/core.ts` | Implemented |
| Provider portability boundary | provider descriptor, estimate, authority, invocation validation | Implemented |
| Safe local/demo adapter | deterministic, network-free, zero-cost fixture | Implemented |
| Safe-demo integrity | canonical fixture regeneration in runtime parsing | Implemented; forged content fails even with a recomputed public digest |
| Language, speakers, diarization | language tags, speaker records, confidence and review state | Implemented contract and fixture |
| Caption accessibility | cue timing, reading speed, line length and timing warnings | Implemented contract and workbench view |
| Waveform-token alignment | exact bins in source time with validation | Implemented |
| Filler candidates | verbatim timed token evidence | Implemented |
| Silence candidates | transcript gap plus quiet waveform evidence and speech guards | Implemented |
| Human review | preview, accept, reject, adjust and terminal state helpers | Implemented |
| Edit-decision reuse | `remove_filler`, `remove_silence`, scan sources and existing input shape | Implemented |
| Reversible composition | keep/exclude source map, zero media mutation, publication disabled | Implemented preview only |
| Append-only persistence boundary | `lib/transcript/durable.ts` | Implemented contract plus atomic in-memory reference adapter |
| Queue boundary | `lib/audio-analysis/queue.ts` | Implemented contract plus event-sourced in-memory reference adapter |
| Retention and legal hold | append/release holds, deletion request, authority-verified attestation | Implemented contract plus reference adapter |
| Scoped APIs | transcript read/preview, batch plan, analysis preview/composition | Implemented; enqueue and writes return fail-closed `503` |
| Workspace | responsive semantic transcript, waveform, filters, captions and candidate actions | Standalone; integration intentionally untouched |

External or paid transcript adapters are not installed. The only callable
provider is `safe-demo`; it reads no media, performs no network request, costs
zero, and persists nothing. A safe-demo claim is regenerated from its declared
source and replay inputs before it is trusted; changing content and recomputing
the public FNV replay digest is insufficient.

The old proposal and accept/reject handlers changed a database row and then
attempted a separate best-effort activity-log write. Those non-atomic writes
are removed. Proposal persistence, decision transitions, enqueue, and batch
execution return `503 durable_authority_unavailable` with the missing
authority requirements. Composition remains a read-only plan. No render,
publish, asset URL change, or version creation exists in this slice.

### Horizon 2: Enterprise Scale

Implemented primitives:

- portable adapter contract with capability declarations
- fail-closed credentials, explicit-action, network, reservation, cost and
  latency gates
- deterministic transcript and analysis batch plans with concurrency and
  critical-path budgets
- tenant-scoped idempotency digests with same-command replay and conflicting
  reuse rejection
- atomic transcript plus analysis append with the audit event in the same
  transaction boundary
- append-only SHA-256 artifact, lifecycle, queue, and audit chains
- analysis-to-transcript replay recomputation, not only matching IDs
- bounded organization queue depth and active leases for backpressure
- lease fencing, renewal, retry scheduling, attempt limits, dead-letter state,
  queued cancellation, leased cancellation, and worker acknowledgement
- metadata-only telemetry plus availability, p95 latency, privacy and replay
  SLO evaluation
- bounded token, waveform, candidate and batch sizes
- malformed-payload parsing, invalid-estimate rejection, and integer budget
  validation before provider or analysis work
- stored proposal provenance checks before composition preview

Not yet production authority:

- database/object-store implementations of the exported append-only and queue
  interfaces, tenant RLS, and distributed transaction/fencing proof
- storage-issued checksum receipts wired to version resolution
- provider workers, provider failover, regional routing, and real usage receipts
- lifecycle workers that perform content deletion and issue receipts; this
  slice verifies receipts but performs no deletion itself
- backup/restore and disaster-recovery exercises
- virtualized million-token workspace and measured large-project browser proof
- delegated tenant policy and cross-tenant API integration tests

### Horizon 3: Governed Media Intelligence

Implemented primitives:

- provider/model/adapter and pipeline/configuration lineage
- immutable input/output replay digests and deterministic fixtures
- canonical safe-demo regeneration plus SHA-256 persisted payload manifests
- legal-hold precedence over retention expiry and authority-verified deletion
  attestations
- labeled-corpus precision/recall and candidate-rate evaluation
- baseline comparison and drift alerts
- high-confidence display blocked until a detector profile proves at least
  95 percent precision over at least 100 evaluated examples
- privacy contracts and content-free telemetry

Not yet production authority:

- approved Content Co-op evaluation corpora and annotation governance
- signed artifact/audit manifests and production media SHA-256 acquisition
- tenant policy authorization, residency enforcement, and data-subject workflows
- prompt lineage for providers that require prompts
- signed model manifests, evaluation promotion policy and alert routing
- policy-driven automation beyond human-reviewed proposals

## Attack Tests And Measurements

Focused Node tests cover:

- replay equality and runtime immutability
- forged safe-demo content with a recomputed replay digest
- source/version tampering and legacy cross-version rejection
- token-to-waveform bin alignment
- paid-provider denial before invocation without credentials or reservation
- cost, latency, token, candidate and batch budget rejection
- waveform-confirmed silence and suppression without acoustic evidence
- calibration certification gates
- explicit terminal human decisions and adjusted revisions
- deterministic edit-decision conversion
- reversible non-publishing compositions
- privacy-safe telemetry
- evaluation drift and SLO failure reporting
- missing, stale, future, and mismatched source checksum receipts
- transcript/analysis atomic commit, injected partial failure, duplicate writes,
  concurrent idempotent replay, orphan analysis, and cross-transcript replay
- payload, audit, lifecycle, and queue-history tampering
- queue saturation, concurrent claims, stale fencing tokens, lease expiry,
  retry exhaustion, dead-letter state, and cancellation/completion races
- retention-before-expiry denial, legal-hold precedence, hold release, deletion
  request, forged deletion receipt, and verified deletion attestation
- route-source proof that no owned API bypasses the transactional authority

The focused transcript/audio suite contains 51 passing tests. At final
verification, the full repository suite contains 191 passing tests, typecheck
passes, and the optimized Next.js build completes with all six owned API routes.
Repository lint exits with zero errors and 54 warnings, all outside this
pillar's owned files.

Measured safe fixture profile:

- source duration: 22 seconds
- transcript tokens: 32
- speakers: 2
- filler candidates: 2
- waveform-confirmed silence candidates: 3
- estimated provider cost: 0 microunits
- media mutations: 0
- external calls: 0

## Residual Risk Map

| Priority | Gap | Why it is next |
| --- | --- | --- |
| P0 | Production durable-adapter integration | The contract and adversarial reference adapter are complete, but production writes stay disabled until schema, RLS, checksum receipts, and a distributed adapter are owned and staged. |
| P0 | Transactional decision integration | Unsafe split writes are removed; decision persistence now requires the same atomic artifact/audit authority before it can be re-enabled. |
| P1 | Trusted waveform/VAD artifact ingestion | Legacy rows deliberately suppress silence candidates because they lack acoustic evidence. |
| P1 | Queue worker and usage settlement | Queue, backpressure, cancellation, replay, retry, and dead-letter contracts exist; no provider worker or billing settlement is enabled. |
| P1 | Lifecycle worker and policy authorization | Hold and retention semantics are enforced in the boundary, but production deletion, residency, role policy, and data-subject orchestration remain cross-pillar work. |
| P1 | Evaluation corpus governance and drift operations | Metrics exist; labeled corpus ownership, promotion gates and alerts remain. |
| P2 | Transcript revisions, speaker repair and caption exports | The source-token contract is immutable; reviewed text/speaker revisions need separate durable objects. |
| P2 | Large-project and assistive-technology certification | The standalone workbench needs integrated mobile/desktop, keyboard and screen-reader proof. |

## Next Selected Gap

The next highest-risk gap is the production adapter handoff: storage must issue
the verified source receipt, data ownership must provide additive schema and
tenant RLS, and operations must implement the exported append-only store and
queue interfaces with distributed fencing and restore proof. That work crosses
the explicitly prohibited migration, storage, auth, billing, and deployment
boundaries. Until it is coordinated, every affected API operation stays
fail-closed and the local reference adapters remain proof tools only.
