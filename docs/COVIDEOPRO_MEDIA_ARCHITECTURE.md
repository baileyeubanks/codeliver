# Co-VideoPro — Media Architecture

How media moves through the system, as verified in this worktree (2026-07-16). Companion to the Current State and Workflows docs.

## 1. Ingest

- **Resumable (canonical):** tus protocol — `app/api/upload/tus/*` (+ legacy `app/api/media/tus/*`), `@tus/server` + `@tus/file-store` server side, `tus-js-client` in `components/assets/AssetUpload.tsx`. `serverActions.bodySizeLimit: 500mb`.
- **Legacy small-file fallback:** `app/api/media/upload` (multipart, ≤25 MiB) — role gate before body parsing (client/unclassified → 403), traversal sanitization (`sanitizeMediaFilename`), race-safe no-overwrite writes (`wx` flag + collision suffix), bounded body reader, project-authorized asset registration.
- **Storage authority:** NAS root via `NAS_MEDIA_ROOT` (`lib/storage/*` adapters; fail-closed when unconfigured). Originals vs derived artifacts are distinct objects; derived keys versioned (`lib/storage/object-key.ts`).

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

## 5. Delivery

- `co_production.deliverables` (new): spec jsonb (resolution/codec/aspect/captions/audio/watermark), frozen `source_version_id` from QC onward, `specced→encoding→qc→ready→delivered|expired`.
- Encoding rides the transcode pipeline; download events via share analytics; watermark support exists in sharing (`app/api/sharing/watermark`).

## 6. Performance posture

- Virtualization: not yet needed at demo scale; large-library pass is R6 (OPEN_RISKS).
- Streaming: signed/streamed via `/api/media/stream`; hls.js available for adaptive playback.
- Browser memory: demo blobs in IndexedDB (`lib/demo/media-blob-store`) with session fallback.
