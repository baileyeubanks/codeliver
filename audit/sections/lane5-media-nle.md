# Lane 5 — Media Pipeline & the "Mini NLE" Question

Audit date: 2026-07-25. App observed live at http://localhost:4103 (`/api/health` → `{"status":"ok","product":"Co-VideoPro","port":4103}`). All UI claims below were OBSERVED in a throwaway Playwright browser; scripts and screenshots under `audit/`. No repo files were modified.

**Headline: the doc claim "R4: sequence playback not built — clips are data only" is FALSE.** A bespoke sequence timeline with real playback, trim/split/ripple-delete and EDL export exists and was observed playing in the running demo. It is a genuine mini-NLE seed, with one major limitation (single-source playback).

---

## 1. Upload

### Demo mode (what the running app at :4103 actually does)
- Demo mode is on when `NODE_ENV=development` without Supabase env, or `?demo=1` (`lib/demo/mode.ts:5-19`).
- The top-bar Upload button opens `GlobalUploadDialog` — demo-only: `components/Shell.tsx:391` renders `GlobalUploadDialog` only when `demoSuffix` is truthy.
- Bytes go **only to the browser**: `components/navigation/GlobalUploadDialog.tsx:59-61` → `putDemoMediaBlob()` in `lib/demo/media-blob-store.ts:38-62`, which writes the `File` blob into IndexedDB database `co-deliver-demo-media` (store `media`) with an in-memory `Map` fallback (`media-blob-store.ts:17`). Nothing touches the server, disk, or tus in demo mode.
- No size ceiling in demo mode — the dialog does zero size validation (`GlobalUploadDialog.tsx:35-69`); the practical ceiling is the browser's IndexedDB quota.
- **OBSERVED end-to-end**: uploaded a generated 42,265-byte H.264 clip (`audit/scripts/lane5-test-clip.mp4`) via the dialog → navigated to `/projects/ica?demo=1` → IndexedDB contained `{fileName:"lane5-test-clip.mp4", blobBytes:42265}` and the asset title rendered on the cockpit page. Evidence: `audit/scripts/lane5-upload-test.mjs` + `lane5-followup.mjs` output; screenshots `audit/shots/lane5-upload-dialog.png`, `lane5-cockpit-after-upload.png`.
- Playback wiring for demo assets: `useDemoMediaObjectUrl(assetId)` creates a `blob:` object URL (`media-blob-store.ts:84-107`), consumed in `components/projects/ProjectCockpit.tsx:478-481`.

### Production path (built, not exercised in demo)
- Real tus resumable upload, both sides: client `tus-js-client@4.3.1` in `components/assets/AssetUpload.tsx:15,170-228` (50 MB chunks, pause/resume/cancel, retry policy, resume-from-previous); server `app/api/media/tus/route.ts` (creation extension, `MAX_SIZE = 12 GiB` at line 22) and `app/api/upload/tus/` (the endpoint AssetUpload actually posts to, `AssetUpload.tsx:171`), backed by `lib/tus/*` and `lib/storage/filesystem-adapter.ts` (offset-verified appends, SHA-256 per part, atomic hard-link commit, `filesystem-adapter.ts:232-301,461-500`).
- Real size ceilings: 12 GB on the legacy route (`app/api/media/tus/route.ts:22`); the primary path enforces a server-reported `maxUploadBytes`/`maxChunkBytes` fetched from `/api/storage/readiness` (`AssetUpload.tsx:111-147,257-269`), plus `CODELIVER_MEDIA_PIPELINE_MAX_SOURCE_BYTES` (`lib/media-pipeline/config.ts:277-281`).
- `components/UploadMonitor.tsx` is **dead code**: it is a static shell that always renders "No uploads in progress" (`UploadMonitor.tsx:41-53`) and is imported nowhere (grep across `components/` and `app/` finds only its own file). The working upload queue UI lives inside `AssetUpload.tsx`.

## 2. Transcode — FFmpeg is real, not stubbed
- `lib/media-pipeline/ffmpeg.ts` — `LocalMediaProcessor` spawns real `ffmpeg`/`ffprobe` via `child_process.spawn` (`ffmpeg.ts:130`); implements `probe` (238), `transcodeHls` → H.264/AAC 4-second HLS VOD playlists (284-348), `generateThumbnail` (350), `generateWaveform` via `showwavespic` (381), `extractCaptions` → WebVTT (409). Cancellation, timeout, progress parsing from `-progress pipe:2` all implemented.
- Wired into `lib/media-pipeline/service.ts:25,1450,3900,3958` and the worker route `app/api/transcode/worker/route.ts` (requires `x-codeliver-media-worker-token`); job queue persisted in `supabase/migrations/013_transcode_jobs.sql`. ffmpeg path configurable via `FFMPEG_PATH` (`config.ts:445`).
- **Sequence render also uses real ffmpeg**: `lib/covideopro/render.ts:6,51-57` runs per-input seek + `concat` filter, verified with ffprobe; exposed at `app/api/render/sequence/route.ts` (traversal-guarded to `public/demo`, route.ts:27-31).
- OBSERVED proof: `node --test tests/covideopro-sequence-render.test.ts` → **4/4 pass**, including test "real ffmpeg render produces a file with the assembled duration" (`tests/covideopro-sequence-render.test.ts:76`). Host has ffmpeg 8.1.1 (`/opt/homebrew/bin/ffmpeg`).
- Client player is HLS-capable: `components/player/VideoPlayer.tsx:4` imports `hls.js`, used by `components/review/ReviewMediaSurface.tsx:47`.

## 3. Sequence/timeline playback — EXISTS (doc claim falsified)
- `components/projects/SequenceTimeline.tsx` (267 lines): playhead sync, click-to-seek, per-clip trim handles with live drag (`SequenceTimeline.tsx:145-181`), split at playhead (122), ripple delete (131), CMX-3600 EDL export via `lib/covideopro/edl.ts` (183-197). Playback engine seeks a `<video>` element clip-to-clip mapping timeline time → source time (59-99).
- Route wiring: rendered in `components/projects/ProjectRecordSections.tsx:821` inside the project cockpit's **Sequences** tab, per seeded sequence, alongside Selects and a transcript "Propose 90s radio cut" / SRT/VTT export flow. "Render to review" (`ProjectRecordSections.tsx:816`) → `renderSequenceToAsset()` (`lib/demo/workspace-store.ts:2463-2503`) → POST `/api/render/sequence` → new playable render asset.
- **OBSERVED live**: `/projects/schneider-epc?demo=1` → Sequences tab shows "McLaren Podcast — radio cut" (3 clips, 1:32); clicking "Play sequence" produced `video.currentTime=8.86, paused=false` with playhead advancing (`audit/scripts/lane5-playback.mjs` output; screenshots `audit/shots/lane5-sequence-timeline.png`, `lane5-sequence-playing.png`).
- **Limitation (the honest version of the R4 claim)**: playback loads only the FIRST clip's asset (`SequenceTimeline.tsx:48-49` — `firstAsset = assets.find(id === ordered[0].asset_id)`; single `src`). Sequences spanning multiple source files will not play past the first asset. Editing mutations are also demo-store-only; there is no `/api/sequences` route (grep of `app/api` confirms) even though the schema has full `co_production.sequences` / `co_production.sequence_clips` tables.

### Component inventory (what exists today)
- `components/player/`: `VideoPlayer.tsx` (hls.js, review shortcuts, frame projection), `PlayerControls.tsx`, `PlayerTimeline.tsx`, `FrameIndicator.tsx`. Renders real media — observed playing `/demo/ica-ceo-preview.mp4` and `/demo/interview-source.mp4` in demo; HLS in production review surfaces.
- `components/versions/`: `VersionList.tsx`, `VersionUpload.tsx`, `VersionCompare.tsx` — wired under the cockpit Versions tab; server routes `app/api/assets/[id]/versions/` and `app/api/versions/compare/`.
- `components/transcript/`: `TranscriptWorkbench.tsx`, `WaveformTranscript.tsx`, `CandidateReviewList.tsx` — drive the selects → sequence assembly flow observed in the Sequences tab screenshot.
- `components/assets/`: `AssetUpload.tsx` (real tus client), `AssetGrid/AssetCard/AssetFilters`, `FolderTree.tsx` + `FolderBreadcrumb.tsx` (bin-style folder navigation), `ImageViewer`, `PDFViewer`, `TagManager`, `TrashBin`, `BulkActions`.
- Schema already carries everything a bin/NLE needs: 80 `CREATE TABLE` across 25 migration files, incl. `co_production.sequences` and `co_production.sequence_clips` (with `track_index`, timeline + source in/out seconds — `supabase/migrations/20260716120000_project_operating_record.sql:168-196`), `selects`, `edit_decisions` (`20260715024552_versioned_edit_decisions.sql:118`), `transcode_jobs`, `folders`/`tags`.

## 4. NAS / project-folder requirement
- Implemented, fail-closed: `NAS_MEDIA_ROOT` is a hard runtime requirement — `lib/storage/media-root.ts:18` throws if unset; must be absolute (line 21). Deploy contract (`DEPLOY_CONTRACT.md:34,47`) mandates fail-closed behavior; health checks at `app/api/health/_lib/checks.ts:191`.
- `lib/storage/filesystem-adapter.ts` is a full `ccnas`/`local` filesystem adapter: staged multipart ingest under `.codeliver-ingest/staging`, offset/SHA-256 verification, atomic hard-link commit, capacity reporting via `statfs`, symlink-safe path resolution (`filesystem-adapter.ts:45-512`).
- Folder browsing of the NAS exists as an API: `GET/POST /api/media/browse` (`app/api/media/browse/route.ts`) — lists/creates directories under the media root with extension-based type classification. **But no UI consumes it** (grep: zero component imports of `/api/media/browse`) — the "bin with server folder access" is half-built: server side done, client side absent.
- Aspirational/not-built: per-project folder provisioning on the operator's desktop ("projects create a project folder…") — no code creates a project folder at project-create time; object keys are derived in `lib/storage/object-key.ts`, not user-visible folder trees. Client-folder linkage ("connected to the client's folder") is doc-level only (`docs/reality/co-deliver/file-and-version-authority.md`).

## 5. Shortest credible path to "mini NLE with a bin" (RECOMMENDATION ONLY)

The owner is closer than the docs suggest. Roughly 70% of the ask exists in demo-grade form.

**Phase 1 — make the existing seed truthful (S, ~1–2 weeks)**
- Multi-source sequence playback: extend `SequenceTimeline.tsx:48-49` to resolve the active clip's asset URL at clip boundaries (two `<video>` elements with handoff, or swap `src` at boundary in the existing `onTimeUpdate`). Reuses everything else.
- Wire `UploadMonitor`-style global queue or delete the dead component; surface `AssetUpload`'s real queue in the cockpit.
- Bin v1: reuse `components/projects/MediaCard.tsx` + `components/assets/FolderTree.tsx` as a left-rail bin in the Sequences tab; enable "add asset to sequence at playhead" (store mutation already pattern-proven: `addSelect`/sequence assembly in `lib/demo/workspace-store.ts`).

**Phase 2 — bin with server folder access (M, ~2–4 weeks)**
- Bin browser UI over the existing `GET /api/media/browse` route, with "import into project" that registers the NAS file as an asset (asset row + object key, no copy).
- `/api/sequences` CRUD persisting to `co_production.sequences`/`sequence_clips` (tables and shapes already final); swap demo-store mutations for API calls behind the existing demo/live split.
- Drag-and-drop from bin to timeline track; clip reorder (data model already supports arbitrary `timeline_in/out`).

**Phase 3 — mini NLE proper (L, ~1–2 months)**
- Multi-track rendering from `track_index` (schema-ready), per-track audio, JKL shuttle + frame-step on the existing `FrameIndicator`/player-policy shortcuts.
- Waveform overlays on clips via existing `generateWaveform` pipeline artifact; HLS proxy playback in the timeline via the existing transcode service.
- Production "render to review" using `lib/covideopro/render.ts` against NAS sources (currently demo-guarded to `public/demo`), writing renders back as new versioned assets.

**XL (explicitly out of credible near-term scope)**: transitions/compositing, color tools, audio mixer, AAF/XML round-trip with Premiere/Resolve beyond the existing EDL export.

---

### Evidence index
- Scripts: `audit/scripts/lane5-upload-test.mjs`, `lane5-followup.mjs`, `lane5-playback.mjs`, `lane5-test-clip.mp4` (42 KB generated test clip)
- Screenshots: `audit/shots/lane5-upload-dialog.png`, `lane5-cockpit-after-upload.png`, `lane5-sequence-timeline.png`, `lane5-sequence-playing.png`, `lane5-schneider-cockpit.png`, `lane5-after-upload.png`
- Commands: `node --test tests/covideopro-sequence-render.test.ts` → 4 pass / 0 fail; `curl localhost:4103/api/health` → 200 ok
