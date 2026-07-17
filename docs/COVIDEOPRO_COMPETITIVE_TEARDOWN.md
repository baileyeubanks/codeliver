# Co-VideoPro — Competitive Teardown: Wipster, Sandcastles + the Transcript-NLE Thesis

**Date:** 2026-07-17 · **Purpose:** inform the next build wave — web video editing, sound-bite editing, transcript tooling, and the reasoning engine (Hermes). Sources: public product pages/reviews + local capture evidence (`codex-coscript-sandcastles/evidence/*`).

---

## 1. Wipster (wipster.io) — the review-platform benchmark

What it is: cloud review/approval for video, image, audio, PDF. NZ-founded (2012), ~$25/user/mo teams tier, free 5GB tier.

**Observed strengths (worth matching or beating):**
- **No-login client review links** — friction-free client feedback (we have this: token review surface).
- **Click-on-frame, time-coded comments** with pinpoint markers (we have: frame_number + pins + Konva drawings — we're *deeper* here).
- **Comments become checkable tasks** — feedback closes a loop. We go further: our revision rounds consolidate comments into verified rounds (Wipster's tasks are flat; ours carry round identity + verification gates).
- **Version toggle + side-by-side compare** (we have VersionCompare dock — verify parity in QA).
- **Review status tracking through cycles** (our stage spine is richer: full lifecycle vs their review-only).
- **NLE panels** (Premiere/After Effects) and publish integrations (Brightcove/Vimeo/Wistia) — *their differentiator we lack*.

**Their weaknesses (our openings):**
- Review-only: no CRM, briefs, proposals, planning, delivery/QC, payments. Our Project Operating Record spans the whole lifecycle.
- "Lacks advanced AI tagging" (ioMoVo review) — our transcript + selects + Hermes reasoning can own this.
- Per-seat pricing at scale; self-hosted is not an option (ours is).

## 2. Sandcastles (sandcastles.ai) — the AI transcript/research benchmark

What it is: AI short-form content engine — channel **watchlists** (IG/TikTok), **viral outlier detection** ("top 1% in every niche"), per-video **transcript + analysis**, and **script generation** for short-form. Confirmed via local step-captures of the source product (this repo's sibling `codex-coscript-sandcastles/evidence/`).

**What to take:**
- **Transcript as a first-class object of analysis**, not just captions: every video gets transcript → structure → insights. Our selects carry transcript segment provenance already; next: segment-level features (speaker, pace, hook detection).
- **Outlier/score ranking** — a reasoning primitive: rank content by a computed signal. For us: rank selects by estimated strength (hook? clarity? client-mentioned?) to propose radio cuts.
- **Script-from-evidence generation** — draft text grounded in analyzed sources. For us: briefs, treatments, radio-cut scripts grounded in the project's own transcripts and decisions, with provenance (never ungrounded generation).
- **Watchlists as a monitoring primitive** — for us: client/competitor reference watchlists feeding briefs and mood boards (later phase).

**What NOT to take:** consumer-viral gimmickry, dark-gradient marketing aesthetic, growth-hacker framing. We are a professional production OS.

## 3. The third reference (context): Descript

The transcript-editing category king: delete text → delete video; sound-bite extraction; speaker labels; filler-word removal; Studio Sound. Any "sound-bite editing / transcript" feature we build will be judged against it. Our differentiator: Descript is a tool; ours is one mode of a connected production record (the sound bite is already linked to the brief, the proposal, the review round, and the deliverable).

## 4. What this means for Co-VideoPro (prioritized)

### Wave E1 — transcript-driven sound-bite editor (highest leverage)
We already have: selects with segment provenance, clipsFromSelects radio-cut assembly, transcript segments with speakers. Build:
1. **Transcript workbench → sound bites**: text search, speaker filter, per-segment/range select creation (partially landed via Sequences-section transcript block — move/extend into the workbench surface with playback sync).
2. **Sound-bite bank**: selects become reusable, labeled, searchable (tags, speaker, project).
3. **Reasoning pass 1 (deterministic)**: segment features — duration, speaker turns, question/answer pairing, keyword density; rank selects; propose a radio-cut order. No LLM required; fully testable.
4. **Reasoning pass 2 (Hermes/LLM, provenance-bound)**: "summarize this interview", "find the 3 strongest sound bites about X", "draft a 60s radio cut script" — every claim linked to segment ids; audit via existing vault/agent-run harness.

### Wave E2 — truthful sequence playback + minimal timeline
1. Sequence playback engine: play `sequence_clips` back-to-back from source media (HLS proxies; clip switching at boundaries), not a flattened render — honest preview.
2. Minimal timeline UI: clip blocks with real durations, playhead, trim handles adjusting source in/out (validated), split, delete, ripple-delete. Metronic Wave-2 ports: `ui/resizable.tsx` for panes, range.css already landed for scrub controls, kanban primitive NOT appropriate here.
3. Sequence → review version render (ffmpeg concat with accurate cuts) → closes Slice B fully.

### Wave E3 — review parity + beyond
1. Side-by-side version compare QA vs Wipster (we have the dock; verify).
2. NLE panel/export: EDL/XML export of sequences for Premiere/Resolve handoff (their panel is a plugin; our handoff is a truthful export — right-sized for us).
3. Publish-to-host integrations: later; deliveries surface first.

### Wave E4 — research/watchlist (later, optional)
Sandcastles-style watchlists feeding briefs/references. Only after E1–E3 land; do not fragment focus.

## 5. Design principles reaffirmed by the teardown

- **Transcript is infrastructure**: every transcript-bearing asset should unlock selects, bites, captions, summaries, and search from one segment model.
- **Reasoning with provenance or nothing**: Hermes outputs must cite segment/record ids and persist as decisions/activity — never free-floating chat text.
- **Consolidation beats volume**: Wipster users live in comment chaos; our revision rounds + decisions are the answer — keep investing there.
- **No fake NLE**: E2 lands only with real playback and real model edits (validated transitions already in place).
