# RECON — Wistia → Co-VideoPro

**Source:** 8-agent public-source teardown, 2026-08-01 (`Kimi_Agent_Wistia Feature Reverse Engineering`).
700+ features from support/docs/security.wistia.com, official GitHub, live public embed-config fetch.
Method verified clean: **public endpoints and docs only, no auth bypass, no proprietary code lifted** —
consistent with §3.1 of the mega spec.
**Triaged against our tree 2026-08-01.** This file follows the §3.3 protocol: extract patterns, rank,
tag to a surface, say how we transcend.

---

## VERDICT IN ONE PARAGRAPH

The teardown is excellent and about **two different products at once.** Wistia is a *video hosting and
marketing* platform — its moat is the `visitor_key` identity graph, lead-gen email gates, and MAP
(HubSpot/Marketo/Pardot) sync. Co-VideoPro is a *production* platform — brief → shoot → edit → review →
deliver. **Roughly a third of this audit is directly adoptable, a third is a legitimate new surface
(the client delivery last mile), and a third would turn us into a Wistia competitor** — a different
company, not an enrichment. That last third is a strategic call for Bailey, not something to absorb
silently. Triage below.

**⚠️ Do NOT execute the blueprint's Sprint 1–6 plan as written.** It proposes replacing our stack with
Mux + Vidstack and building lead-gen/channels/webinars. We already ship `hls.js`,
`lib/media-pipeline/*` (ffmpeg, transcode, workers, queue), `lib/storage/*`, `lib/vault/*` (signed
URLs), and an 11-file `lib/sharing/*` with access control, view receipts, and analytics. Adopting Mux
wholesale **throws away reviewed, hardened work** — the exact detached-rebuild trap in `CCO_GOAL.md`.

---

## TIER 1 — ADOPT NOW (improves surfaces we already agreed to build)

| # | Pattern | Where it lands | Why / how we transcend |
|---|---|---|---|
| 1 | **Storyboard sprite for seek preview** — one 2000×448 JPG holding 32 frames of 200×112, positioned by CSS `background-position` | §7 NLE scrubbing · §7.4 review player | Dirt cheap, enormous UX gain. Classic sprite technique, no extra requests. **Generate in `lib/media-pipeline/ffmpeg.ts` at transcode time.** Transcend: also use it as the NLE timeline's clip thumbnail strip — one asset serving two surfaces. |
| 2 | **Transcript-based editing is real and shipping** — bi-directional sync, keep/delete selection, inline silence indicators, word correction → captions, speaker ID | §7.2 P0 | **This validates our headline differentiator.** Wistia ships it in their editor on *all plans including Free*. Transcend: they have **no mid-video bulk silence removal** (intro/outro only) and **filler-word removal is not confirmed first-party** — both are cheap wins for us via ffmpeg + LLM. |
| 3 | **Workflow statuses + assignees** — Needs Review / In Review / Approved, assignee w/ email notify | §5.5 board · §7.4 review | Maps onto our approval workflow. Transcend: ours binds to an **exact immutable version** (theirs doesn't). |
| 4 | **Share for Review** — no-account review links bundling **up to 25 videos** | `lib/sharing/*` | We have single-asset invites. **Batch review bundles** is a small delta with real client value (send a whole delivery for one review pass). |
| 5 | **Interactive transcript** — brand-color word highlight, autoscroll, search within transcript, downloadable | §7.4 · client delivery | We have `TranscriptWorkbench`. Add the *viewer-side* interactive transcript + in-transcript search. |
| 6 | **Chapters, captions (SRT/VTT), audio description track** | §7.2 P1 captions | Confirms the caption feature set. Their AD pricing ($1/min AI, $8–12/min human) is a useful benchmark for our own deliverable pricing in §5.2. |
| 7 | **Accessibility bar: Deque-audited WCAG 2.1 AA**, keyboard controls, high-contrast, viewer caption styling | §8.4 / §2.7 | This is the enterprise bar, independently audited. **Match it explicitly** — Schneider-class buyers ask. |
| 8 | **Local-first capture with double backup** — record locally + cloud, streamed backup on upload failure, background upload on tab close; **group recording w/ per-participant local HD tracks** | §6.1 production capture | Genuinely relevant: remote executive interviews are core Content Co-op work. Per-participant isolated tracks = a real edit-quality win over Zoom-grade capture. |
| 9 | **Player gaps to beat: no PiP, no AirPlay, no Chromecast, no cross-device resume for anonymous viewers** | §7.4 · delivery layer | Free differentiation. Vidstack (**MIT**, verified) supports these natively — or add to our player directly. |
| 10 | **No true version history** — Wistia's "Replace" is Overwrite (keep stats) or Swap (old saved as separate media). **Pseudo-versioning only.** | §8.2 | **We already win here.** Our immutable version spine is a genuine competitive advantage — *press it in positioning.* |
| 11 | **Comments not exposed in their Data API; Team Activity log not exportable** | our API surface | Ours should be fully API-addressable and exportable. Easy, real, enterprise-relevant. |
| 12 | **LLM-friendly embed** — static transcript HTML so AI answer engines can cite the video (launched Nov 2025) | delivery layer / SEO | Smart and cheap. The AI-era SEO play. Adopt. |
| 13 | **`@wistia/wistia-player` + `-react` are MIT**; they maintain a **fork of hls.js**, plus `tusd`/`tus-js-client` | reference | We already use `hls.js` and tus. Their forks are worth reading for edge cases at scale. |

## TIER 2 — THE BRIDGE: a legitimate new surface

### **Client Delivery Layer** — the last mile after "locked delivery"

This is the honest, non-pivot expansion. Content Co-op **makes** video for enterprise clients. Those
clients then need to **host, embed, and measure** it. Today that value leaks to Wistia/Vimeo. Owning
the last mile is a natural extension of §7.6 (the archive) and a **real revenue line** — not a new company.

| Element | Job it kills | Notes |
|---|---|---|
| Branded hosting + embed snippet for delivered assets | Client re-uploading our masters to Wistia and paying $79–479/mo | Our vault already does signed/expiring URLs. |
| Embed options subset — autoplay, `playerColor`, `videoFoam` (responsive), `resumable`, `endVideoBehavior`, `preload`, quality caps, `time` deep-link, `doNotTrack` | Hand-rolling embed behavior per client | Wistia documents **37**. We need maybe 12. **Ship the 12 that matter; skip the tail.** |
| oEmbed endpoint + JSON-LD `VideoObject` injection + video sitemap | Client's marketing team can't get the video into their CMS or Google | Cheap, standards-based. |
| Engagement analytics — per-second heatmap, quartile milestones, rewatch arrays | "Did anyone actually watch the film we made?" — the question that renews contracts | **Our unfair advantage: infinite retention in the client's own Postgres vs Wistia's 2-year cap.** |
| **Milestone event contract** — `play` / `percent_watched {25,50,75,100}` / CTA + form conversions | Bespoke integration work per client | Match Wistia's contract **exactly** → every MAP playbook ever written works with us on day one. Highest-leverage interop decision in the whole audit. |
| Domain restrictions, expiring links, password | Enterprise governance asks | `lib/vault/*` + `lib/sharing/*` already carry most of this. |

**Build on our stack, not a rewrite.** `lib/media-pipeline/*` + `hls.js` + `lib/vault/*` +
`lib/sharing/*` already cover transcode, adaptive playback, signed access, and view receipts.
**Add: storyboard sprite, embed route, oEmbed, JSON-LD, beacon + heatmap rollup.** That is a sprint,
not a platform migration.

## TIER 3 — DIFFERENT PRODUCT (flag; do not build without an explicit decision)

These serve **marketers**, not producers. Building them means competing with Wistia head-on — a
different company with a different buyer, sales motion, and support burden.

| Area | What it'd take | Verdict |
|---|---|---|
| **Lead-gen Turnstile email gates** + identity graph (`visitor_key` anonymous→known) | Consent/PII handling, GDPR posture, a whole compliance surface | **Marketing product.** Not our buyer. |
| **MAP sync** — HubSpot, Marketo, Pardot, Eloqua, Klaviyo, bidirectional | Per-vendor adapters + ongoing maintenance forever | **Marketing product.** (The *event contract* in Tier 2 gets us interop without owning adapters.) |
| **Channels + podcast RSS** — Netflix-style galleries, auto RSS, subscriber lists, directory badges | A publishing platform | Different product. |
| **Webinars / live** — LiveKit rooms, registration funnels, simulive, RTMP simulcast, Q&A/polls | Wistia charges **$429–829/mo** as an add-on because it's a business unto itself | **Absolutely different product.** Highest-cost, lowest-fit item in the audit. |
| **A/B testing w/ Bayesian auto-winner** | Experiment framework + stats engine | Real gap in their product, genuinely clever — but it's a *marketing* feature. Park it. |
| Full 37 embed options, 8 plugins, 2 JS API surfaces | Enormous surface for our use case | Ship ~12 options. §2.1: no useless buttons. |

**If Bailey wants the marketing platform, it should be its own product line with its own canon entry —
not smuggled into Co-VideoPro's roadmap.**

---

## THE ONE STRATEGIC SIGNAL

> **Wistia ships an MCP server** (`api.wistia.com/mcp` — OAuth, agent-driven upload/edit/Remix/analytics)
> **and LLM-friendly embeds.** They are already agent-native.

For a company whose whole operating model is agent swarms, being *less* agent-addressable than a
video-hosting vendor would be an embarrassing gap. **Co-VideoPro should expose its own MCP server** —
project/asset/version/review/timeline operations — so our own agents (and clients' agents) can drive
it. This costs little on top of a clean API and is directly aligned with how this business already runs.

Also note their AI vendor map (useful build-vs-buy benchmarks): Deepgram + OpenAI transcription,
ElevenLabs voice + HeyGen lip-sync for dubbing ($2/min/lang), Adobe Podcast for speech enhancement,
Amazon Bedrock. And their terms: **no training on customer content by default, $100 AI liability cap,
no PHI** — a reasonable template for our own AI terms.

---

## CORRECTIONS TO THE BLUEPRINT

1. **Vidstack is MIT, not Apache-2.0** (verified 2026-08-01, 3.6k★). Still fine to use — MIT is more
   permissive. But we already have a working frame-accurate player + `hls.js`; **adopt Vidstack only
   if PiP/AirPlay/Chromecast justify it**, not as a default rewrite.
2. **"Mux pipeline" would replace working, hardened code.** `lib/media-pipeline/*` (14 files, ffmpeg +
   workers + queue) and `lib/vault/*` (12 files, signed access) are reviewed and real. Abstracting a
   provider behind `video_assets` is sound *architecture advice*; ripping out our pipeline is not.
3. **The cost model assumes a hosting SaaS** at 1,000 videos/mo and 500k delivered minutes. That is not
   Co-VideoPro's shape today — it's the shape of the Tier-3 product. Don't budget from it.
4. **Sprint order inverts our gate ladder.** The blueprint starts at hosting/embed; `CCO_GOAL.md`
   requires deployment truth (G2) and DB reality (G4) first. Recon findings feed the surfaces; they
   don't reorder the ladder.

---

## RANKED ADOPTION QUEUE

1. **Storyboard sprite** (§7 + review) — cheapest high-impact win in the entire audit.
2. **Milestone event contract** (25/50/75/100) — decide the schema *now*; it's expensive to change later.
3. **Mid-video bulk silence + filler-word removal** — a confirmed gap in the market leader, and our
   transcript stack already has the data to do it.
4. **Batch review bundles** (up to 25 assets, no-account) — small delta on `lib/sharing/*`.
5. **PiP / AirPlay / Chromecast** — free differentiation against the leader.
6. **Interactive transcript + in-transcript search** (viewer side).
7. **MCP server** — the strategic signal.
8. **Client Delivery Layer** (Tier 2) — after P5, as the commercial last mile.
9. **WCAG 2.1 AA audit to Deque standard** — the enterprise bar.

*Everything in Tier 3 waits for an explicit product decision.*
