# Co-VideoPro — Media Architecture

How media is intended to move through the system at M2 application-source
baseline `2639e8973211476649f95029d1a3d33a5fccf57d` (2026-07-26). This is
source truth; the database migrations are unapplied and no configured
real-file runtime receipt exists.

## 1. Ingest

- **Only production writer:** tus protocol at `app/api/upload/tus/*`, used by
  `components/assets/AssetUpload.tsx` and the production Projects surface.
- **Atomic catalog authority:** after byte commit, durable checksum/provider
  receipt, and a clean scan verdict, one service-only RPC attaches the upload
  to one asset and one exact V1. Retries must resolve the same pair; conflicting
  or duplicated inherited storage identity fails closed.
- **Retired writers:** `/api/media/upload`, `/api/media/tus*`,
  `POST /api/projects/[id]/assets`, and
  `POST /api/assets/[id]/versions` cannot create bytes, asset metadata, or
  arbitrary V2 references. They return explicit `410 Gone` responses.
- **Storage authority:** provider and writes are explicit; `local` and `ccnas`
  require their applicable roots. Objects carry immutable SHA-256, provider
  version identity, committed size, and timestamp receipts. Scanner release
  and derivative readiness remain separate gates.
- **Filesystem commit boundary:** capacity is preflighted for the entire
  immutable copy before staging bytes are copied into a separate deterministic
  placement inode, sealed and checksum-validated through held no-follow
  handles, then published without overwrite. Crash reconciliation removes
  placement aliases/orphans, exact-offset recovery can inspect sealed staging
  read-only, and receipts require one read-only final link. CCNAS must still
  prove these semantics at runtime.
- **Evidence boundary:** migration
  `20260726084644_atomic_upload_catalog_v1.sql` is source-only. Existing data,
  effective database privileges, the RPC, and a real upload have not been
  exercised.

## 2. Processing (background, worker-authorized)

- Pipeline: `lib/media-pipeline/{service,ffmpeg,config,errors,job-store,repository}.ts`; jobs persisted in `co_production.transcode_jobs`.
- Worker routes: `app/api/transcode/{route,worker,jobs/[id]}` behind `app/api/transcode/_lib/worker-auth` (timing-safe token). Never in request-response paths.
- Products: proxies, thumbnails, audio analysis (`lib/audio-analysis`), caption extraction (`CaptionExtraction` in ffmpeg.ts). ffmpeg 8.1.1 present locally; 45 pipeline tests (incl. real processing) green.
- Transcripts: `app/api/assets/[id]/transcript/*` (+ batch), `co_production.transcriptions`, `lib/transcript/*` (durable segments), workbench UI (`components/transcript/TranscriptWorkbench.tsx`, `WaveformTranscript.tsx`).

## 3. Edit model (new this phase)

- **Selects:** `co_production.selects` — asset+range with source (`transcript`/`review`/`manual`) and transcript segment provenance.
- **Sequences:** `co_production.sequences` (version, status `draft→in_review→approved→locked`, fps, created_from) + `co_production.sequence_clips` with **real source/record times** (validated: positive ranges, duration parity — no speed changes yet). `clipsFromSelects` assembles back-to-back radio cuts; transcript→select→sequence is the assembly path.
- Not yet built (roadmap, honesty rule D8): visual timeline, trim/ripple/roll UI, sequence playback, sequence→review-version render.

## 4. Review

- Versions per asset (`co_production.versions`), review invites (token-scoped, `review_invites`), comments with `frame_number`, time-seconds, pins, and Konva-drawn annotations (`pin|rectangle|freehand|arrow|text`), threaded reactions/attachments.
- Approval workflows + stages + history with permission-ranked decisions.
- **Revision consolidation (new):** `revision_requests` link scattered comments into actionable rounds (`open→in_progress→addressed→verified`, verification guarded by unresolved comments).
- **Managed playback:** authenticated
  `/api/media/versions/[versionId]` authorizes the exact asset/version, rejects
  soft-deleted assets, supports HTTP ranges, and validates the open file handle
  against its provider receipt before streaming. It does not yet prove
  anonymous review-token playback or any live runtime behavior.
- **Public review authority:** responses serialize explicit external-safe
  allowlists rather than raw rows. An invite must be active and reference an
  existing asset; password-protected invites fail closed until governed
  password verification exists.
- **Public frame comments:** source routes require a complete finite 0–100
  percentage pin pair, bind it to the invite's exact version, and return the
  same external-safe projection. Migration
  `20260726113000_comment_pin_percentage_contract.sql` aborts before DDL when
  legacy pin data exists, preventing silent 0–1 reinterpretation; it is
  source-only and unapplied.

## 5. Delivery

- `co_production.deliverables` (source/schema): spec jsonb
  (resolution/codec/aspect/captions/audio/watermark), frozen
  `source_version_id` from QC onward,
  `specced→encoding→qc→ready→delivered|expired`.
- Encoding rides the transcode pipeline; download events via share analytics; watermark support exists in sharing (`app/api/sharing/watermark`).
- No current receipt proves attributable approval, lock, a final package, or
  delivery of the approved exact version.

## 6. Performance posture

- Virtualization: not yet needed at demo scale; large-library pass is R6 (OPEN_RISKS).
- Canonical managed-original streaming in source uses
  `/api/media/versions/[versionId]`; `hls.js` remains available for adaptive
  derivatives when that pipeline is configured.
- Browser memory: demo blobs in IndexedDB (`lib/demo/media-blob-store`) with session fallback.
