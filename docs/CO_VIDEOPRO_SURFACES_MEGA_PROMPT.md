# Co-VideoPro — MEGA BUILD SPEC v3.0
## *"The Infrastructure of Storytelling"*

**For:** the implementing agent / swarm (`ok-computer` execution · `deep-researcher` intel · `websites` polish).
**Authored:** 2026-08-01. **Merges:** the v2.0 narrative/domain brief + a live audit of the actual tree at
`Desktop/Projects/contentco-op/cco-videopro-definitive-20260715` @ `codex/co-videopro-definitive-20260715`.
**Governs with:** `../CCO_PRODUCT_CANON.md` (architecture authority) · `../CCO_GOAL.md` (gate ladder) ·
`docs/COVIDEOPRO_CCO_UNIVERSE_ADOPTION.md` (dialect law).

> **Why v3.0 exists.** v2.0 had the vision and the domain depth. What it lacked was the ground truth —
> what is actually built, what is a 109KB monolith, what is a 267-line stub — and a licensing reality
> check on the repos it told you to fork. Both are now in. **Ambition is preserved; the fantasy is removed.**
> Build big. Just build on what's really there.

---

# PART I — THE AGREED SPOT

## §0.1 Ratify this first

We have been drifting: re-skinning surfaces and rebranding across a dozen clones. **Converge here.**
This section is a proposal for Bailey to ratify in one word. Until ratified it is the working
assumption, and nothing merges.

| Axis | Agreed spot |
|---|---|
| **Repo** | `cco-videopro-definitive-20260715` — the only Co-VideoPro line. Other CVP forks (`cco-videopro-ui-enrichment`, visual-lane clones, `co-videopro-sites-preview`) are **donors, not build targets**. |
| **Branch** | `codex/co-videopro-definitive-20260715`. Work branches as `feat/<surface>-<date>`. Never `main`. |
| **Name** | **Co-VideoPro.** `Co‑ProVideo` is a defect — the live Vercel deploy still ships it in `<title>` while source is already fixed. Correcting the deploy is **G2** in `CCO_GOAL.md`. |
| **Deploy** | `co-videopro.com` (Vercel, LIVE) = staff + studio. `client.contentco-op.com` = client role surface (no DNS yet). |
| **DB** | CCO-DB `briokwdoonawhxisbydy`. **Co-VideoPro never mutates a commercial total.** It receives accepted packages. |
| **Three portals** | Admin (control room) · Crew (mission) · Client (premiere) — but they are **role projections of one product**, not three codebases. One design system, one data model, three permission surfaces. |

## §0.2 Dialect law (do not repaint outside this)

- **Public** → Cream Editorial (`#f0ebe0` parchment, Fraunces, copper).
- **Working** (cockpit, boards, budgets, logging) → Royal Light Cockpit (cool gray, white cards, royal blue `#2E6BF0`, dark media islands).
- **Stage/media** (player, review, NLE) → Dark Cinema (near-black wells only).
- **Deep writing** (script) → Paper Desk (deferred lane).
- **Banned:** Bloomberg / green-phosphor "Terminal" surfaces. `ROOT`, `Mission Control`, `/root/`, `CCO_ROOT`.
- **Color = state only**, never decorative. **Every number is a door** (clickable to its source).

## §0.3 GROUND TRUTH — Keep / Rebuild / Kill

*Measured from the live tree, not from docs. This is the spine of the entire effort:
**extend what's mature, split the monolith, rebuild the stub.***

| Verdict | Surface | Evidence in tree | Directive |
|---|---|---|---|
| **KEEP & EXTEND** | **Review + player spine** | `components/player/*` (VideoPlayer 320L, PlayerControls 339L, PlayerTimeline 197L, FrameIndicator); `components/review/*` 15 files (PublicReviewWorkspace 295L, VersionCompare 275L, InternalAssetReviewPage, annotations); `PublicReviewPage.tsx` **1766L** | **Your single best asset**, and the NLE's playback foundation. Do not rebuild. Refactor into shared `@covideopro/player-core`. |
| **KEEP & EXTEND** | **Transcript stack** | `components/transcript/*` (TranscriptWorkbench 236L, WaveformTranscript), `lib/transcript/*`, `lib/audio-analysis/*` | Powers footage logging **and** text-based editing — the NLE's unfair advantage. |
| **KEEP** | **Domain libs (real plumbing)** | `lib/media-pipeline/*` (14) · `lib/tus/*` (7) · `lib/storage/*` (14) · `lib/vault/*` (12) · `lib/covideopro/*` (20, incl. `documents.ts` quote/invoice renderers) · `lib/sharing/*` (11) · `lib/review/*` (12) · `lib/metering/*` (9) | Reviewed and real. Build on it, don't reinvent. |
| **KEEP** | Estimate engine | `EstimateLineEditor.tsx` 15KB | Becomes the Proposal/Budget core (§5.2/§5.4). |
| **SPLIT — rebuild as composition** | **`ProjectCockpit.tsx` — 109KB monolith** + `ProjectRecordSections.tsx` 69KB | one file | **#1 source of drift.** Decompose into route-level surfaces (§5–§7). **No new feature lands inside it. Ever.** |
| **PROMOTE** | Pre-pro panels (thin) | ProjectBriefPanel 10KB · Milestones/Comms/Deliverables/Files/Team/Calendar ≈3–5KB each | Each becomes a first-class surface with real data authority — not a tab on the monolith. |
| **REBUILD FROM ZERO** | **The NLE** | `SequenceTimeline.tsx` — **267 lines** | §7. This is the headline. A 267-line stub is not an editor. |

**Reality check:** you have a *world-class review product* and a *placeholder editor*, wearing a monolith.
v2.0 read the situation as "add features." It is actually **"split, then build the editor."**

---

# PART II — DOCTRINE

## §1 Narrative layer (the why)

The story: **"We turn infrastructure and vision into cinematic reality."**

| Principle | Execution |
|---|---|
| **Cinematic Rhythm** | Transitions feel like cuts. Loading feels like title cards. Empty states are scene transitions, not errors. |
| **Industrial Elegance** | Schneider's world is power grids and physical AI. The UI is a **high-end control room** — precise, authoritative, beautiful. *Minority Report* meets Apple. |
| **Narrative Progression** | Every screen has an inciting incident (what's next?), rising action (the work), resolution (approval). |
| **Systematic Intuition** | Things are where they are because the *system* demands it, not because a template said so. |
| **Agency & Delight** | The user feels **powerful**. Micro-interactions and rewarding completion states — never at the cost of speed. |

## §2 Operating principles (the anti-vibe contract)

1. **No useless buttons.** Every control maps to a job someone does today by hand or in another tool.
   The **"Job it kills"** column below is mandatory. A control with no job is deleted in review.
2. **Enterprise = trustworthy, not busy.** Density *with hierarchy* (Palantir/Linear), not clutter.
   Fewer, deeper surfaces. Keyboard-first. Destructive actions reversible or confirmed.
3. **One source of truth per fact.** The frozen quote version drives PDF, approval, payment, invoice,
   reporting, and handoff. Nothing else mints money.
4. **Gate on evidence.** "Done" = a rendered page, an API response, an export file, a row. **Never** a
   markdown file that claims it. *(This program's documented failure mode is rich source over unproven
   runtime — see `CCO_GOAL.md`.)*
5. **Prove one real path before breadth.** One real Schneider job end-to-end beats ten half-surfaces.
6. **Honest states.** Never render a completion signal without the backing event. AI output is a
   *suggestion* a human confirms — never silent authority. No fake certainty in projections.
7. **Accessibility is not optional.** WCAG 2.1 AA, full keyboard operability, focus management,
   reduced-motion honored. Enterprise buyers audit this.
8. **Performance budgets are acceptance criteria** (§8.4), not aspirations.

---

# PART III — INTELLIGENCE

## §3 The recon protocol (hack-skills + firecrawl + browser)

Study best-in-class products to extract **implementation patterns** — structure, feature grammar,
interaction models, public API shapes — then transcend them.

### §3.1 Hard boundary (fail closed)

- **Only** public marketing pages, public docs, public demos, and app surfaces reached with **your own
  signed-up test account**.
- **Never** bypass auth, defeat paywalls, evade rate limits or bot-detection, scrape PII, or touch
  anything unauthorized. No credential testing against third parties.
- Respect `robots.txt` and sane request rates.
- The hack-skills repo is used here for **fingerprinting and structure-reading of public surfaces only**.
  If a technique would cross into attacking a third party — **stop**.
- **Never copy** assets, code, or copy text. Extract patterns; write our own.

### §3.2 Toolchain

**Skills** — `Desktop/Projects/hack-skills/skills` (102 skills). Use the reconnaissance ones:

| Skill | Use for |
|---|---|
| `recon-and-methodology` / `recon-for-sec` | Fingerprint a stack, map surface area, build a structured product inventory before dissecting. |
| `api-recon-and-docs` | Discover public endpoints, OpenAPI schemas, versioning, hidden docs → learn how they model projects/assets/comments/timelines. |
| `graphql-and-hidden-parameters` | Read a public GraphQL schema → their **domain model**. Highest-signal artifact for "how should our data look." |
| `http2-specific-attacks`, `http-host-header-attacks` | **Read-only fingerprinting sections** — identify CDNs, edge frameworks, HLS/DASH streaming strategy. |
| `websocket-security`, `traffic-analysis-pcap` | **Read-only** — understand realtime transport: how Frame.io/Figma-class apps push presence, comments, playback sync. Directly informs §7.5 collaboration. |
| `web-cache-deception` | Read-only — their media/proxy caching model. |

**Extraction** — the `firecrawl` skills:

```bash
firecrawl map https://<target>                      # full public route inventory
firecrawl scrape https://<target>/features/review   # feature grammar → clean markdown
firecrawl crawl https://<target>/docs --limit 80    # whole docs tree = their domain model
firecrawl search "OpenTimelineIO web timeline implementation"
```

**Live app model** — with your own test account, use the browser tools
(`mcp__Claude_Browser__read_page`, `read_network_requests`, `read_console_messages`).
`read_network_requests` on a competitor's review or editor page is **the fastest way to learn their
playback + collaboration protocol**: what the scrubber fetches, how proxies are requested, how
comments POST, what the WS frames carry.

### §3.3 Target matrix — extract 3 patterns each → `docs/recon/<target>.md`

| Product | Phase | The 3-pattern goal |
|---|---|---|
| **Frame.io** | Review | Frame-accurate comment↔timecode binding; version stacks & compare; share/permission model. *(We're already strong here — study to close gaps, not rebuild.)* |
| **Descript** | Post | **Text-based editing** (edit transcript → edits the cut); filler-word/silence removal UX. Our transcript stack's superpower path. |
| **CapCut Web / Clipchamp** | NLE | Browser NLE architecture: multitrack canvas timeline, proxy playback, WebCodecs decode, trim/ripple interaction grammar. |
| **DaVinci Resolve / Premiere** | NLE | Keyboard shortcut ecosystem (parity is non-negotiable for pros); color panel + scopes; trim modes. |
| **StudioBinder / Celtx / Yamdu** | Pre-pro | Breakdown → schedule → call sheet pipeline; script-to-set traceability; stripboard model. |
| **Filmustage** | Pre-pro | AI script breakdown: element tagging (props/cast/wardrobe/VFX) and how tags flow downstream. |
| **Movie Magic** | Budget | Topsheet account structure (ATL/BTL/Post/Other); `.mmbx` interchange. **Enterprise table stakes.** |
| **Milanote / Notion** | Pre-pro | Brief & moodboard block model — "a document you build, not a form you fill." |
| **Linear** | Planning | Keyboard-first board↔list duality; command palette; optimistic mutations; issue→sub-issue → our shot/task model. |
| **Wrapbook / SetHero** | Production | Crew roster, availability, call-time comms, payroll-grade time tracking. |
| **OpenTimelineIO** | NLE (data) | The **interchange schema**. Adopt it; don't invent a timeline format. |
| **Vercel / Stripe dashboards** | Cross-cutting | Enterprise density with calm; empty/loading/error states. A *quality bar*, not a theme. |

**Phase-0 output:** `docs/recon/INDEX.md` — every pattern worth adopting, ranked, tagged to the surface
it informs, each with a one-line "how we transcend it."

## §4 THE OSS ARSENAL — **verified 2026-08-01, with licenses**

> ⚠️ **v2.0 told you to fork these and said nothing about licensing.** Two of them would create a
> legal problem for a company. All repos below were fetched and confirmed to exist; the license column
> is the part you cannot skip.

| Repo | Verified | License — **read this** | What to take |
|---|---|---|---|
| **`Techiebutler/freeframe`** | ✅ 151★ | **MIT — fully permissive** ✅ | **The safest, highest-value reference.** Self-hosted Frame.io alternative: Next.js 14 + FastAPI + Postgres + Celery/Redis + FFmpeg multi-bitrate HLS + S3/MinIO, JWT magic-link auth, frame-accurate timecoded comments, annotations, version compare, approval workflows, **export to Resolve/FCP/Premiere**. Mine its HLS + comment↔timecode + NLE-marker-export design. |
| **`ncounterspecialist/twick`** | ✅ 522★ | **Sustainable Use License v1.0** — free for commercial *products*, but **may not be resold as a standalone SDK**. ✅ for us | Modular React video SDK: `@twick/timeline`, `@twick/canvas` (Fabric.js), `@twick/browser-render` (WebCodecs MP4 export), `@twick/render-server` (Node+Puppeteer+FFmpeg), `@twick/effects` (GL shaders). **Study its export decision tree: browser for short, server for long.** |
| **`openvideodev/react-video-editor`** | ✅ 1.8k★ | ⚠️ **Dual-license — commercial license REQUIRED for orgs >3 employees.** | PixiJS v8 (`@openvideo/engine-pixi`) + WebCodecs, Next.js 15, Tailwind v4, Zustand. Best reference for **GPU-accelerated compositing**. **Reference the architecture; do not vendor the code without buying the license.** |
| **`remotion-dev/remotion`** | ✅ 55.1k★ | ⚠️ **Company license required in commercial use.** | React-as-video, Player component, Lambda/Vercel rendering. Ideal for **programmatic deliverable variants** (20 branded cuts, lower thirds, social sizes). **Budget for the license before depending on it.** |
| **`headline-design/seq`** | ✅ 19★ (early) | **MIT** ✅ | AI-native NLE: storyboard-from-text, browser export via FFmpeg.wasm, Next.js 16/React 19. Small and young — **mine for UX patterns of AI-assisted editing**, not as a foundation. |
| **`mifi/editly`** | Cited — verify | Verify before use | Declarative JSON→video via Node+FFmpeg. Use for **automated rough cuts** from logged footage and template exports. |
| **`tejaswigowda/ffmpeg-webCLI`** | Cited — verify | Verify before use | FFmpeg.wasm in-browser: client-side proxy gen, thumbnails, format conversion, metadata strip. |
| **OpenTimelineIO** | ✅ | Apache-2.0 (project) | **Adopt the schema.** Note: JS bindings are WIP and `otio-wasm` is experimental — so **adopt the documented data model, implement in TS ourselves**, and use OTIO as the export/interchange target. The `OpenTimelineIO-Specification` repo is the artifact to read. |
| **`vidstack/player`** | ✅ 3.6k★ | **MIT** ✅ *(blueprint said Apache-2.0 — corrected)* | Headless player components (React/Web Components). **Native PiP / AirPlay / Chromecast** — all confirmed gaps in Wistia. Adopt **only** if those justify it; we already ship `hls.js` + a frame-accurate player. Not a default rewrite. |
| **`wistia/wistia-player`, `-react`, `wistia/hls.js`, `wistia/tusd`** | ✅ | **MIT** ✅ | Reference implementations from a company operating this at scale. We already use `hls.js` + tus — read their forks for edge cases. |
| `ad-si/awesome-video-production`, `wentianli/awesome-video-editing` | Cited | n/a | Mine for integration candidates + AI research roadmap. |

> **📁 Completed recon:** `docs/recon/wistia.md` — 700+ features triaged into ADOPT / BRIDGE /
> DIFFERENT-PRODUCT. Read it before touching §7.4, §6.2, or the delivery layer. **It also contains a
> standing warning:** do not execute that teardown's Sprint 1–6 plan as written — it would replace our
> hardened `media-pipeline`/`vault`/`sharing` stack and pivot us into video-marketing SaaS.

**Directive:** **FreeFrame (MIT) is the reference to study deepest** — it is the only P0 with a fully
permissive license. Twick is usable as-is. **OpenVideo and Remotion require paid licenses for a company
of our size — architecture inspiration only until Bailey decides to buy in.** Flag any dependency that
changes this calculus *before* writing code against it.

---

# PART IV — THE THREE PRODUCT SURFACES

Route home: `app/(dashboard)/projects/[id]/`. Each surface = its own route segment + component tree +
`lib/projects/<surface>.ts` authority module. **None of these live in `ProjectCockpit.tsx`.**

---

## §5 SURFACE 1 — PRE-PRODUCTION · *"The Blueprint"*

> Pre-production is not "planning." It is **the architecture of the film**. Every decision here saves
> 10× on set. This surface is mission control for imagination.

### §5.1 Creative Brief — `/projects/[id]/brief` · *"The Inciting Incident"*
*Extends `ProjectBriefPanel.tsx`. Recon: Milanote, Notion, Filmustage.*
**A conversation that becomes structure — not a form.**

| Element | Job it kills |
|---|---|
| **Structured intake** — Client & brand context → creative intent (mood/tone/reference) → logistics (timeline, budget range, deliverables) → technical reqs (formats, platforms, a11y) → launch | Re-typing the same intake into email/Docs/PDF every single project |
| **AI brief generation** — paste a client call transcript; extract key messages, visual refs, tone keywords, budget hints, timeline constraints, stakeholder names | Listening back through a 60-minute discovery call to hand-build a brief |
| **Brand Kit Importer** — client uploads logo → color quantization extracts palette → font selection → **auto-generates a design token set** that propagates to their client portal | Hand-theming every client portal; "brand DNA ingestion," not white-labeling |
| **Visual Reference Engine** — spatial moodboard canvas (arranged by *sequence*, not just collection). Cards: image, video w/ loop in–out, audio, color swatch, note | Reference links dying in Slack; refs with no temporal meaning |
| **Competitive Intelligence panel** — embed competitor videos; auto-derive shot count, average shot length, color palette, music tempo, text-overlay density | Eyeballing "make it like theirs" with zero data |
| **Stakeholder mapping** — visual org chart; tag Decision Maker / Influencer / Reviewer / Legal | Discovering at approval time that the wrong person signed off. **Drives §7.6 approval routing.** |
| **Deliverable spec table** — format, aspect, duration, count, due date | Ambiguity about what's actually being delivered. **This table is the contract** with §5.2 and §9. |

```typescript
interface CreativeBrief {
  id: string; project_id: string;
  client_brand_kit: BrandKit;                    // extracted colors, fonts, logo → design tokens
  creative_intent: {
    tone: ToneEnum[]; mood_keywords: string[];
    visual_references: ReferenceCard[]; audio_references: AudioReference[];
  };
  logistics: {
    timeline: { start: Date; delivery: Date; milestones: Milestone[] };
    budget_range: { min: number; max: number; currency: string };
    deliverables: DeliverableSpec[];             // ← the contract with Proposal + Delivery
  };
  stakeholders: Stakeholder[];                   // ← drives approval routing
  ai_extracted_insights: AIInsight[];            // suggestions, human-confirmed, never silent authority
  status: 'draft' | 'client_review' | 'approved' | 'locked';
}
```

**Acceptance:** a real Schneider brief whose deliverable table renders *unchanged* in the proposal and
the delivery surface.

### §5.2 Proposal & Estimate — `/projects/[id]/proposal` · *"The Pitch"*
*Core = `EstimateLineEditor.tsx` + `lib/covideopro/documents.ts`. Recon: Pitch, Qwilr.*
**The money surface. The one immutable authority.**

| Element | Job it kills |
|---|---|
| **Dynamic pricing engine** — line items across pre-pro (creative dev, scouting), production (shoot days, crew rates, gear), post (edit hours, color, sound, VFX), deliverables (formats/versions). Each line: hours, rate, **fringes (union vs non-union)**, markup | Building every quote from scratch in a spreadsheet |
| **Interactive scopes** — toggle modules ("+ drone package $4,500") with live total | The email thread of "what if we cut the drone?" |
| **Visual sizzle** — moodboard refs, treatment video, animated storyboard embedded in the proposal | Sending a spreadsheet to sell a cinematic vision |
| **IMMUTABLE VERSIONING** — a sent version is frozen; edits mint a new version; diff view highlights changes | *"Which quote did the client actually approve?"* — **the source-of-truth spine** |
| **Document render** — Gen-3 dark cinematic cover + editorial body → PDF (`documents.ts` exists) | Designing a proposal PDF by hand every time |
| **E-signature + approval** — attributable, bound to one exact version, routed via §5.1 stakeholders | Chasing "did you approve this?" across email |
| **Payment schedule → Stripe** (deposit/milestone/final) | Manually creating Stripe links and reconciling them |

> **Competitive gap:** StudioBinder and Celtx have **no proposal surface** — they jump brief→schedule.
> This is CCO's revenue-critical surface and a genuine differentiator.

**⚠️ Known open item:** `STATUS.md` flags **exact-version approval attribution** as unresolved
(approval packets still accept caller-supplied reviewer identity). **Close this before P2 ships.**

**Acceptance:** one real proposal → PDF → client approval → Stripe link, with the **same number** on all
four, provably from one frozen version row.

### §5.3 The Pre-Production Bible — `/projects/[id]/plan` · *"The Plan"*
*New surface. Recon: StudioBinder, Celtx, Filmustage, Movie Magic.*
**Not a document. A living data structure every department feeds from.**

**A. Script Breakdown (the foundation)**
- **Import:** Final Draft `.fdx`, PDF, **Fountain** (plain-text markup — build the parser).
- **Auto-tagging:** AI proposes tags for every element — cast, props, locations, extras, stunts, VFX,
  wardrobe, makeup. **Producer confirms/refines** (honesty law). Tags then flow automatically to
  schedule, budget, shot list, and call sheets.
- **Scene database:** every scene is a row — number, INT/EXT, location, time of day, cast present,
  props, page length, estimated shoot time. *Change a scene's location and every downstream document
  updates.* **Kills:** re-entering the same scene facts into five documents.

**B. Shot List Builder**
- **Grid of shot cards**, not a table: thumbnail (reference or storyboard), shot size (ECU→ELS), camera
  movement, gear, estimated setup time.
- **Storyboard:** draw in-browser (Excalidraw-style canvas) or upload; link panels to shots. AI can
  propose panels from scene descriptions.
- **Shooting-order optimization:** cluster by location (minimize company moves), actor availability,
  lighting similarity (all golden-hour together), gear requirements. **Kills:** the producer's
  whiteboard-and-instinct day-planning session.
- Each shot links to the **deliverable it serves** → coverage traceability.

**C. Schedule & Stripboard**
- **Digital stripboard** — the industry-standard view. Color-coded strips by location/INT/EXT.
  Drag-reorder. Auto-calculates shoot days, company moves, meal breaks (and meal penalties).
- **Calendar sync** — Google/Outlook; crew availability overlays.
- **Conflict detection** — double-booked crew, permit expiring mid-shoot, actor unavailable Day 3.
  The system **screams** with visual alerts. **Kills:** discovering the conflict on the day.

**D. Call Sheet Generator**
- Auto-generated from the stripboard: date, scenes, cast + crew call times, location addresses with GPS
  links, parking, **nearest hospital**, weather (API). Beautiful, printable, mobile-optimized, one-tap
  calendar add. **Kills:** building a call sheet PDF the night before every shoot.
- **Living document** — it updates as the schedule shifts, and notifies.

### §5.4 Budget — `/projects/[id]/budget` · *"The Financial Nervous System"*
*Derived from §5.2 — never re-entered. Recon: Movie Magic, Wrapbook.*

| Element | Job it kills |
|---|---|
| **Topsheet view** — industry-standard accounts (Above the Line / Below the Line / Post / Other), expandable to line detail | Translating a quote into a format a studio finance person recognizes |
| **Rate card library** — union rates (SAG-AFTRA, IATSE, DGA) + custom non-union; **auto-applies fringes** (pension, health, payroll tax) | Hand-computing fringes and getting them wrong |
| **Actuals vs. budget** — POs, crew timecards, invoices flow in; **Plaid** real-time bank sync | Guessing where the money went until the project's over |
| **Predictive warning** — "at current burn, post exceeds budget ~12% by [date]" — **labeled honestly as an estimate** | Finding out you're over *after* you're over |
| **Movie Magic `.mmbx` import/export** | Studios that require budgets in MM. **Enterprise table stakes.** |
| **Per-project P&L** | Reconciling profitability by hand after wrap |

### §5.5 Planning Kanban — `/projects/[id]/board` · *"The War Room"*
*New surface. Recon: **Linear** (the bar to clear), Notion.*

**Production-specific columns, not generic To-Do/Doing/Done:**
`Development → Script Locked → Breakdown Complete → Budget Approved → Crew Booked → Locations Scouted → Gear Reserved → Shoot Ready → Wrap`

| Element | Job it kills |
|---|---|
| **Dependency mapping** — "Location Scout" blocks "Gear Reservation." Visual dependency lines; a slip **auto-cascades** to dependents | Mentally maintaining the critical path |
| **Department swimlanes** — Producer, Director, DP, Production Design, Wardrobe, Locations. Cross-department handoffs are explicit | "I thought *you* booked it" |
| **Crew assignment cards** — drag crew onto tasks; card shows headshot, role, rate, **availability conflict indicator**; click → full profile (past projects, gear owned, skills) | Cross-referencing a roster spreadsheet against a calendar |
| **Board / List / Timeline** — three projections of one dataset | Maintaining a board *and* a Gantt separately |
| **Command palette `⌘K`** — create, assign, move, jump | Mousing through menus for every action. **Linear-grade or don't ship it.** |
| **Optimistic mutations + realtime presence** | Refreshing to see if a teammate moved a card |

**Tasks reference domain objects** — a shot, an asset version, a deliverable — never floating text.

---

## §6 SURFACE 2 — PRODUCTION · *"The Mission"*

> Production is chaos. Software's job is to **impose order without killing creativity**. This must work
> on a phone on set, a tablet in a director's hand, and a laptop in a production van.

### §6.1 Coordination — `/projects/[id]/field` *(route exists)*

| Element | Job it kills |
|---|---|
| **Set Mode** — large touch targets, high contrast for daylight, **offline-capable** checklists, GPS-tagged capture. PWA | Fighting a desktop UI on a phone on set with no signal |
| **Digital sign-in** — crew scans a QR on the call sheet; GPS-verified; auto-logs to time tracking | Paper sign-in sheets and manual timecard entry |
| **Live roster** — who's on set / in transit / wrapped, via push | Texting nine people "you here?" |
| **Department comms** — threaded per project *and per department*, file attach, @mentions, tied to **scenes/shots/tasks** | Slack sprawl with no link to the work. *Not Slack — production-native.* |
| **Live Set Feed** — camera-to-cloud (or proxy upload station) low-latency preview; client portal shows *"Your shoot is live."* | The client calling to ask how it's going |
| **Director's viewfinder** — upload frame grabs; compare **side-by-side against the storyboard panel** | *"Did we get the shot?"* |
| **Location & weather intelligence** — GPS-pinned scout photos/notes on a map (reusable location DB); weather alerts: *"Rain in 2h — consider covering Scene 4 (EXT) first"* | Hunting for the address at 6am; losing a day to weather |

### §6.2 Footage Logging & Ingest — `/projects/[id]/media` · **the production→post bridge**
*Extends `MediaCard`/`MediaTable`/`FolderTree` + `lib/media-pipeline/*` + `lib/tus/*` + `lib/storage/*`.*

> **This is where most production software fails — it stops at the shoot. CCO owns the handoff to post.**

| Element | Job it kills |
|---|---|
| **Ingest & proxy** — resumable checksummed upload (tus exists), auto proxy (H.264), thumbnails, waveforms | Manual card offload + transcode juggling |
| **Metadata extraction** — camera, lens, resolution, fps, codec, color space, ISO, shutter, timecode, duration | Hand-logging clip specs |
| **Scene/take auto-detection** — parse `Scene_01_Take_03` filenames; or **AI slate-clap detection** | Manually tagging hundreds of clips |
| **Auto-transcription** (Whisper-based) + **speaker ID** | *"Find every take where the CEO says 'innovation'"* — and script-supervisor notes |
| **Logging** — clip notes, keywords, star ratings, color labels, circle-takes, Good/NG/Pick/Alt, **synced in realtime across users** | Sorting hundreds of clips from memory |
| **Shot-to-footage matching** — link §5.3 shot list items to captured clips → **coverage report** | *"Did we get everything on the list?"* discovered in the edit |
| **Smart selects** — filter by rating/keyword/**transcript hit** → a sequence-ready bin | Building selects by hand |
| **Marker export** — Premiere XML / FCPXML / Resolve EDL / CSV | Retyping notes into the NLE |

**Acceptance:** real footage in → auto-metadata + transcript → logged + rated → filtered to a selects bin
that **opens directly in the NLE**.

### §6.3 Research & Reference — `/projects/[id]/research`
- Reference library searchable by color, mood, shot type; **timecoded video refs** that jump to the moment.
- **Web capture** via the §3 firecrawl tooling (our own research, not scraping others' private data).
- **Moodboard-to-set comparison** — reference vs. live set photo, side by side. *Did we match the vision?*
- Rich notes with embedded media, tagged to scenes/shots/crew.
- **Promotion:** a reference becomes a shot or a brief block in one action.

### §6.4 Tasks & Checklists
Department templates (Camera Prep, Location Wrap, Wardrobe Continuity, Sound Report) — mobile,
**offline-capable**. Blocking tasks with visual indicators ("Color cannot begin until Director's Cut is
approved"). One-tap time tracking w/ GPS + optional photo proof → feeds §5.4 actuals and crew pay.

---

## §7 SURFACE 3 — POST-PRODUCTION · *"The Alchemy"* — **THE NLE**

> `SequenceTimeline.tsx` is 267 lines. **Delete the concept; build the engine.** This is the most
> ambitious surface: its own package `@covideopro/nle`, with `docs/nle/ARCHITECTURE.md` written and
> approved **before** any UI code.

### §7.1 Architecture Decision Record — decide and document first

- **Timeline model = OpenTimelineIO-compatible.** Adopt OTIO's documented schema (tracks, clips, gaps,
  transitions, markers, effects, time transforms). **Implement in TypeScript ourselves** — the JS
  bindings are WIP and `otio-wasm` is experimental — and use OTIO as the **serialization/interchange
  target**. This buys EDL/AAF/FCPXML/OTIO export and real-NLE interop nearly free. *Do not invent a
  timeline format.*
- **Playback = proxy-first, frame-accurate.** Reuse the existing `player/*` stack as the core.
  **WebCodecs** for hardware decode; **PixiJS v8 / WebGL2** for compositing; `<video>`+canvas fallback.
  **WebAudio** for sample-accurate scrub.
- **Compositing off the main thread.** Web Workers + OffscreenCanvas. The UI thread does layout and
  input only. *This is the difference between 60fps and jank.*
- **Non-destructive & event-sourced.** Every edit is an operation on the OTIO doc; undo/redo is the op
  log. Source media is never mutated.
- **Collaboration = CRDT over WebSocket.** Start single-user but **CRDT-shaped**, so multiplayer is a
  switch, not a rewrite. Study payloads per §3.2 before implementing.
- **Export = server-side FFmpeg** for final; browser render for short/preview. **Adopt Twick's decision
  tree** (browser for short clips, server for long-form). `lib/media-pipeline/*` is the foundation.
- **Project state** = JSON-serializable, saved to Supabase, shareable by URL, cloud-renderable by
  sending the JSON to the render server.
- **Realtime budget:** Supabase Realtime caps ~500 concurrent connections on Pro — **design channel
  architecture per-project**, don't open a channel per component.

### §7.2 Feature surface — every feature earns its place

| Feature | Job it kills | Pri |
|---|---|---|
| Multitrack magnetic timeline (V/A/adjustment/text tracks, waveforms, thumbnails, snapping, ripple delete) | The whole point | **P0** |
| Frame-accurate transport — **J/K/L**, frame-step, in/out, dynamic scrub | Editing by mouse-drag guesswork | **P0** |
| Full trim grammar — ripple, roll, slip, slide, dynamic trim; blade/razor (single, multi, all-tracks) | The "simple trimmer" toys pros abandon in an hour | **P0** |
| **Keyboard shortcut parity** with Premiere/Resolve + custom keymaps | Retraining an editor's hands. **Non-negotiable.** | **P0** |
| Track targeting & sync lock | Accidental edits on the wrong track | **P0** |
| Bins ↔ timeline (drag §6.2 selects straight in) | Re-importing footage that's already in the system | **P0** |
| **Text-based editing** — edit the transcript, edit the cut; bi-directional sync, keep/delete selection, **inline silence indicators**, word correction → captions, speaker ID | The slow first assembly of interview/corporate work. **Our differentiator — and confirmed shipping in Wistia's editor, so it's proven, not speculative.** | **P0** |
| **Mid-video bulk silence removal + filler-word removal** | Manually cutting every "um" and dead air in a 40-min interview. **Confirmed gap in the market leader** (Wistia does intro/outro silence only; filler removal unconfirmed) — cheap for us via ffmpeg + LLM on transcript data we already have | **P0** |
| **Storyboard sprite scrubbing** — one sprite sheet (e.g. 2000×448 = 32 frames), CSS `background-position` | Blind scrubbing. Generate once in `lib/media-pipeline/ffmpeg.ts`; serves **both** the NLE clip strip and the review-player seek preview | **P0** |
| **Versioning into the review spine** — cut → V-n → client review | The gap between "edit done" and "client sees it." **This is why the NLE lives here and not in Premiere.** | **P0** |
| Markers ↔ review comments (client note appears on the timeline at the frame) | Losing notes between review and edit | **P0** |
| Transitions + effects (dissolve/wipe/GLSL shaders), transform/crop, **speed ramps w/ bezier + optical-flow interpolation**, nested sequences/compound clips | Round-tripping to Premiere for a dissolve | P1 |
| Color — lift/gamma/gain wheels, curves (RGB/Luma), Hue-v-Sat, **LUT management (WebGL shader preview)**, **scopes (waveform/vectorscope/histogram)** | Bouncing to Resolve for a quick grade | P1 |
| Audio — multichannel WAV/BWF, track volume/pan/mute/solo, VU meters, keyframed levels, **auto-duck under dialogue**, AI noise reduction (RNNoise) | Exporting stems for basic level fixes | P1 |
| **Captions** — transcript → styled → burn-in / SRT / VTT | Manually captioning every corporate deliverable | P1 |
| Keyframing — position/scale/rotation/opacity, bezier, **graph editor**; rich text w/ animated lower-thirds; **chroma key w/ spill suppression** (WebGL) | Basic motion work leaving the system | P1 |
| **Export presets** — YouTube 4K, Reels 9:16, 1:1, 4:5, broadcast MXF, ProRes, H.264/HEVC + custom builder; **background render queue** | Re-exporting by hand for every platform | P1 |
| **Interchange export** — EDL / OTIO / FCPXML / AAF | Being a dead-end that can't hand off to finishing | P1 |
| Multicam — sync by TC/waveform, angle switching | Multicam event work done in another tool | P2 |
| Direct publish — client portal, Vimeo, YouTube | Manual upload dance | P2 |

### §7.3 The integration thesis — *why build this at all*

**Co-VideoPro's NLE does not need to beat Resolve at finishing.** It needs to own the **80% first
assembly** of corporate/interview/event work — the slow, repetitive part — *inside* the system that
already holds the footage, transcript, shot list, review comments, budget, and client. Then hand clean
**OTIO/FCPXML** to a finishing suite for the last 20%.

**Its two unfair advantages:**
1. **The transcript stack** → text-based editing (nobody in production management has this).
2. **The review spine** → edit → version → client review → approval, without leaving the app.

Build to those. **Not to feature-parity vanity.**

### §7.4 Review & Approval — *"The Conversation"*
*Already our strongest surface — close the gaps, don't rebuild. Recon: FreeFrame (MIT), Frame.io, Wipster.*
- Frame-accurate comments: click a frame, draw arrows/shapes, attach reference images, timecode auto-pinned.
- Version compare: side-by-side or wipe-slider, frame-synced playback, per-version threads.
  **Elevate:** AI-generated change summary — *"v3 has 3 fewer shots and a different music bed."*
- Multi-stage approval: Internal → Client → Final, approvers routed from §5.1 stakeholder roles.
  Status: Pending → Changes Requested → Approved. **Attributable and bound to an exact version.**
- Guest review: password-protected links, no account, **branded to the client** (§8.3).
- **NLE marker export** (Premiere XML / FCPXML / EDL / CSV) — study FreeFrame's implementation.

### §7.5 Collaboration recon (specific deliverable)
Using §3.2 read-only WS inspection on your own accounts, answer: message framing, op granularity,
presence/cursor model, conflict resolution, reconnect/replay. → `docs/nle/COLLAB_MODEL.md`, **before**
implementing multiplayer.

### §7.5b Review gaps to close *(from `docs/recon/wistia.md`)*
- **Batch review bundles** — one no-account link covering up to ~25 assets (Wistia's "Share for Review").
  Small delta on `lib/sharing/*`; lets a client review a whole delivery in one pass.
- **Workflow statuses + assignees** — Needs Review / In Review / Approved, with notify. **Transcend:**
  ours binds to an *exact immutable version*; theirs doesn't.
- **Viewer-side interactive transcript** — word highlight, autoscroll, **search within transcript**.
- **PiP / AirPlay / Chromecast** — all three absent from Wistia. Free differentiation.
- **Comments + activity log fully in our API and exportable** — both are gaps in theirs.
- **WCAG 2.1 AA to the Deque-audited bar** — that's the level enterprise buyers verify.

### §7.6 Asset Management — *"The Archive as a Museum"*
Visual grid with hover-to-play and metadata overlays — not a file list. **AI search** by spoken dialogue,
visual content ("the factory floor shot"), color palette, mood. Client-curated **collections** shared via
branded links. **Auto format variants** (16:9 / 9:16 / 1:1 / 4:5) from master. **Rights management** —
usage rights, expiration, talent releases, **alerts before rights expire**.

---

### §7.7 SURFACE 3b — **CLIENT DELIVERY LAYER** *(new — the commercial last mile)*
*Source: `docs/recon/wistia.md` Tier 2. Ships after P5.*

Content Co-op **makes** the film. The client then needs to **host, embed, and measure** it — today that
value leaks to Wistia/Vimeo at $79–479/mo. Owning the last mile extends §7.6 and is a **real revenue
line**, not a pivot. Build on `lib/media-pipeline/*` + `hls.js` + `lib/vault/*` + `lib/sharing/*` —
**this is a sprint, not a platform migration.**

| Element | Job it kills |
|---|---|
| Branded hosting + embed snippet for delivered masters | Client re-uploading our masters elsewhere and paying for the privilege |
| **~12 embed options** — autoplay, `playerColor`, responsive foam, `resumable`, end-behavior, preload, quality caps, `?time=` deep-link, doNotTrack | Hand-rolling embed behavior per client. *(Wistia documents 37. Ship the 12 that matter — §2.1: no useless buttons.)* |
| oEmbed endpoint + **JSON-LD `VideoObject`** + video sitemap | The client's CMS and Google can't see the film we delivered |
| **LLM-friendly embed** — static transcript HTML so AI answer engines can cite the video | Invisibility in AI search. Cheap, and the current SEO frontier |
| Engagement analytics — per-second heatmap, quartile milestones, rewatch arrays | *"Did anyone actually watch the film?"* — the question that renews contracts. **Our edge: infinite retention in our own Postgres vs Wistia's 2-year cap** |
| **Milestone event contract** — `play` · `percent_watched {25,50,75,100}` · CTA/form conversions | Bespoke integration work per client. **Match the contract exactly** → every MAP playbook ever written for Wistia works with us on day one. **Decide this schema early; it's expensive to change.** |
| Domain restrictions, expiring links, password gating | Enterprise governance asks — mostly already in `lib/vault/*` + `lib/sharing/*` |

**🚫 Explicitly out of scope** *(would make us a Wistia competitor — a different company, different
buyer, different sales motion; see recon Tier 3)*: lead-gen email gates + anonymous→known identity
graph, MAP adapter suite (HubSpot/Marketo/Pardot/Eloqua), channels + podcast RSS, **webinars/live**
(Wistia charges $429–829/mo *as an add-on* because it's a business unto itself), A/B testing engine.
**These require an explicit product decision from Bailey and their own canon entry.**

### §7.8 Ship an MCP server — the strategic signal
Wistia already ships an MCP server (OAuth, agent-driven upload/edit/analytics) **and** LLM-friendly
embeds. **They are agent-native.** For a company that runs on agent swarms, being less
agent-addressable than a video-hosting vendor is an embarrassing gap. Expose Co-VideoPro's
project/asset/version/review/timeline operations over MCP so our own agents — and clients' — can drive
it. On top of a clean API this is small, and it's exactly how this business already operates.

---

# PART V — SYSTEMS, SEAM, EXECUTION

## §8 Cross-cutting

**§8.1 Design system (P1 — blocks everything).** One tokenized system *in code* (Tailwind config +
`globals.css` token layers, already started). Three dialects share one primitive layer. shadcn/ui base,
heavily customized. 8pt grid, typographic scale, single icon set. Every component ships light/dark and
**designed empty/loading/error states**. Ship a living component gallery route so drift is *visible and
killable*. **Success: nobody can tell Admin, Crew, and Client were built at different times.**

**§8.2 Data authority & the money seam.** `lib/data-authority.ts` + `lib/covideopro/*`. The frozen quote
version is the only writer of commercial totals. Boards, media, and the NLE **read** project/asset/version
data and **write** production data (tasks, logs, cuts) — **never money**. Enforced by `lib/middleware/rbac.ts`.

**§8.3 Enterprise readiness.** RBAC (admin/producer/editor/crew/client — `lib/access-control.ts` exists),
full audit trail (who did what to which version), SSO/SAML path, per-client data isolation, signed/expiring
media URLs (the vault + invite work already does this). **Dynamic client branding** — the portal morphs to
the client's tokens from §5.1's Brand Kit Importer on login. Living, not static white-label.

**§8.4 Performance budgets — acceptance criteria, not aspirations.**
- Initial load < 2s · interaction < 100ms · animations 60fps.
- **NLE: timeline scrub + playback locked 60fps; proxy seek < 1 frame; no main-thread block > 16ms.**
- Board mutations optimistic (< 50ms perceived). Media grid virtualized for 1000+ clips.

## §9 The handoff seam (CCO OS → Co-VideoPro)
The accepted commercial package — frozen quote version + deliverable spec + client + brief — crosses from
CCO OS into a Co-VideoPro project. Co-VideoPro **reads** it; totals are immutable on this side.
`lib/co-produce/lifecycle-contract.ts` is the contract surface. This is **G7** in `CCO_GOAL.md`.

## §10 Execution

### THE GOAL
```
/goal
Build the production system that runs a real Content Co-op job end to end —
brief → proposal → plan → shoot → log → EDIT → review → approve → deliver —
inside one product, with the money provably immutable, and with an editor whose
unfair advantage is native transcript + review integration.
Own the 80% first assembly. Hand the last 20% to finishing, cleanly, via OTIO.
Category leader by Q2 2027.
```

### THE LOOP (evidence-gated)
```
/loop
1. RECON  — §3. Produce docs/recon/<target>.md 3-pattern extracts for the active surface.
2. DESIGN — surface spec + all states in the component gallery (code, not Figma-only).
3. BUILD  — on feat/ off the canonical branch. Split the monolith; never grow it.
4. PROVE  — a rendered page / API response / export file demonstrates the "Job it kills."
            No doc-only "done." No screenshot of a static mock.
5. REVIEW — Bailey sees it RUNNING. Iterate to "this removes real work," not "this looks cool."
6. LAND   — merge to the canonical branch (never main). Update the Keep/Rebuild/Kill ledger.
7. NEXT   — next surface by phase order.
```

### PHASES (dependency-ordered; each ends on running proof)

| Phase | Scope | Proof it's done |
|---|---|---|
| **P1 Foundation & Split** | §0 ratified · design system §8.1 · **decompose `ProjectCockpit`** into route surfaces | The monolith is gone; each surface is its own route; gallery shows zero drift |
| **P2 Money Spine** | Brief §5.1 → Proposal §5.2 → Budget §5.4 (+ close exact-version attribution) | One real quote: same number on PDF, approval, Stripe, reporting — from one frozen row |
| **P3 Plan & Board** | Bible §5.3 · Kanban §5.5 | Brief → shot list → stripboard → generated call sheet, no re-entry; a project run by keyboard |
| **P4 Production Data** | Field §6.1 · **Logging/Ingest §6.2** · Research §6.3 | Real footage in → metadata + transcript → logged → selects bin that opens in the NLE |
| **P5 THE NLE** | §7 — ADR first, then engine, then features P0→P1 | Selects bin → multitrack assembly → text-based edit → captioned cut → versioned into review → **client approves it** |
| **P6 Seam & Enterprise** | §9 handoff · §8.3 | An accepted CCO OS package opens as a Co-VideoPro project; RBAC + audit verified live |
| **P7 Delivery Layer** | §7.7 client hosting/embed/analytics · §7.8 MCP server | A delivered Schneider film is embedded on the client's own site from our host, with a per-second engagement heatmap we own — and an agent can drive the whole thing over MCP |

Phases close only on the `CCO_GOAL.md` ladder: **a response, a row, a receipt, a rendered page.**

## §11 Anti-patterns — auto-reject in review
- A control that can't name the job it kills. **Delete it.**
- A new feature added **inside** `ProjectCockpit.tsx` or any monolith.
- A surface repainted in a dialect it doesn't belong to; any Terminal/green-phosphor styling.
- The NLE (or anything) minting money outside the frozen quote version.
- "Done" claimed by a doc, a passing test alone, or a static mock.
- **Vendoring code from a repo whose license we haven't cleared** (§4 — OpenVideo and Remotion require
  paid commercial licenses).
- Copying a competitor's assets, code, or copy. Extract *patterns*.
- Fake certainty in an AI suggestion or budget projection.
- A new status doc spawned instead of updating this file, the canon, or the goal.

## §12 Success criteria — the mind-blow checklist
- [ ] A designer from Linear or Vercel would nod in respect.
- [ ] A first-time client says "wow" within 30 seconds.
- [ ] A crew member completes their entire on-set workflow on a phone, offline, without confusion.
- [ ] Bailey can run a company status meeting from the admin dashboard alone.
- [ ] **Zero** visual inconsistency across Admin / Crew / Client.
- [ ] Every empty, error, and loading state feels intentional and on-brand.
- [ ] **An editor cuts a real corporate piece start-to-finish in CCO Edit and doesn't ask for Premiere.**
- [ ] **The NLE exports a broadcast-ready file an editor would confidently deliver to a network.**
- [ ] A real Schneider job runs the full path — brief to locked delivery — with real money.
- [ ] Someone screenshots the UI and posts it unprompted.

---

*Ratify §0. Then P1 begins. Recon precedes every surface; running proof closes every phase.*
**You are not maintaining software. You are building the instrument the work is made on.**
