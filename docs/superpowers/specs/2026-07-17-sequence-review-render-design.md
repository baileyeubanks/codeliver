# Design: Sequence → Review Version Render (Slice B completion)

**Date:** 2026-07-17 · **Status:** approved-in-mission (autonomous mode; user may veto) · **Process:** superpowers brainstorming → writing-plans → TDD

## Context

`sequence_clips` hold ordered clips with validated source/record times. The demo asset `mclaren-podcast-v3` has a real playable source (`/demo/interview-source.mp4`). The remaining gap to close Slice B: turn an assembled sequence into a flattened, reviewable video that can go to client review.

## Approaches considered

1. **Extend `lib/media-pipeline` with multi-input concat jobs** — production-real (transcode_jobs, worker auth, NAS output). Deferred: needs NAS + worker env locally; heavier intrusion. Roadmap for production deploy.
2. **Demo render route + pure concat-plan function (CHOSEN)** — a small `app/api/render/sequence/route.ts` that runs the installed ffmpeg with the concat demuxer against public/demo sources, writing `public/demo/renders/<id>.mp4`. Truthful locally with zero new infra; the same plan function feeds approach 1 later.
3. **Client-side MediaRecorder capture** — rejected: slow, fragile, capture-quality dependent.

## Design

- `lib/covideopro/render.ts` — pure `buildConcatPlan(sequence, clips, resolveFile)` → ordered `{file, inSeconds, outSeconds}[]`; rejects non-contiguous timelines and missing files. Plus `renderArgs(plan)` → ffmpeg argv (concat demuxer, re-encode h264/aac for clean cuts).
- `app/api/render/sequence/route.ts` — POST `{sequenceId}`; demo: reads the demo plan against `public/demo/*`, renders to `public/demo/renders/`, returns `{url, durationSeconds}`. Validates with ffprobe.
- Store: `renderSequenceToAsset(sequenceId)` → calls the route, registers the render as a NEW project asset (`<name> (render)`, file_url = render url), records a `sequence_render` activity + links `sequences.review_asset_id` (new optional field... avoided: the share-link guard already works on any asset; keep sequences unchanged).
- UI: SequencesSection per-sequence **"Render to review"** → POST, progress toast, then "Create review link" affordance via existing DemoShareModal. Sequence `draft → in_review` becomes satisfiable (share link on the render asset).
- Guard rails: render only when every clip's asset has a playable file; error states surface truthfully.

## Tests (TDD)

1. `buildConcatPlan`: ordering, contiguity validation, missing-file rejection.
2. Real render (node:test, tmp output): plan against `public/demo/interview-source.mp4` → ffmpeg render → ffprobe duration ≈ Σ clip durations (±0.5s).
3. Store: `renderSequenceToAsset` creates the render asset with truthful duration; missing source → honest error.

## Done when

- "Render to review" produces a real mp4 (ffprobe-verified), the render asset appears in project media, and a review link can be created on it — all locally, no fake states.
