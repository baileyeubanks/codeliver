# Lane 1b — Visual audit: Projects family

Read-only audit, 2026-07-25. App at http://localhost:4103, demo mode (`?demo=1`) via the sanctioned "Open local workspace" button. No files edited; no destructive actions completed. Screenshots in `audit/shots/`; probe output in `audit/scripts/lane1b-probe-report.json`, `lane1b-probe2-report.json`, `lane1b-probe3-report.json` (scripts `audit/scripts/probe{,2,3}-lane1b.mjs`, batch `audit/scripts/batch-lane1b.json`).

**Route note:** `/projects/[id]/assets/[assetId]` (`app/(review)/projects/[id]/assets/[assetId]/page.tsx` → `components/review/InternalAssetReviewPage.tsx:129-132`) only validates identity and `router.replace`s to `/projects/ica?demo=1&asset=charles-drummond-v5&view=review`. The "internal asset review workspace" is therefore the ProjectCockpit (`components/projects/ProjectCockpit.tsx`, 2,489 lines) in review view. Evidence: shot `asset-charles-1440x900.png`, `finalUrl` in batch output. The owner's "wipster-type app" lives here: player + timecoded comments + versions + approvals + share, in one cockpit.

---

## 1. `/projects` — Production library

Shots: `projects-1440x900.png`, `projects-768x1024.png`, `projects-375x812.png`.

1. **Identity: YES.** Looks like a media project library: folder rail, asset table with thumbnails, durations, versions, statuses.
2. **First impression:** "This is a real review tool." A producer sees client folders (ICA, Schneider + EPC, bp, Conexon) and per-asset review state at a glance. Slight unease: the top third of the page is explanation panels, not media.
3. **Hierarchy:** 1st = "ICA" H1 + three buttons; 2nd = four stat cards (Workspaces/Visible assets/Review-ready/Active links); 3rd = the four lifecycle explainer cards. Wrong order — the asset table (the actual work) sits below ~470px of scaffolding (`projects-1440x900.png`).
4. **Density:** content `px-6 py-4` (24px/16px), cards `min-h-[74px]`, grid `gap-2` (8px); table rows comfortable. Stat + lifecycle rows consume 2 × ~90px bands (`app/(dashboard)/projects/page.tsx:455-506`).
5. **Type:** Inter / Instrument Sans (body 16px/400). H1 `text-2xl font-semibold`; eyebrows 11px/600 uppercase. Page-local sizes: 11/12/14/20/24px = 5 — OK.
6. **Color:** CSS-var driven: bg `#F0EBE0` (rgb(240,235,224)), ink `#0B1928` (probe: computed body). Status pills orange "Requires Changes", blue "In Review", green "Approved" — token-based, no ad-hoc hex seen on this surface.
7. **L1 violations (verbatim):**
   - "Manage project media, review readiness, share links, versions, and delivery state from one workspace." — header `<p>`, `page.tsx:414-416`.
   - Lifecycle explainer cards: "1. Intake — Project shell and brief", "2. Ingest — Media upload and versions", "3. Review — Comments and approvals", "4. Delivery — Share links and exports" — `<section aria-label="Production lifecycle">`, data at `page.tsx:42-63`.
   - Status strip footnote: "Transcript, waveform, and export readiness appear after processing jobs report back." — `.library-status-row`, `page.tsx:513`.
   - Empty-state copy (not triggered here): "Upload media to start versioning, review, comments, approvals, and delivery." — `page.tsx:596`.
8. **L2 check:** Workspaces 5, Visible assets 4, Review-ready 4, Active links 2 — all computed from demo workspace state (`page.tsx:170-195`); status strip counts (2 in review / 1 changes requested / 1 approved) computed `page.tsx:509-512`. Table "Reviewers 1/2 / 2/2 / 0/1" — backed by hardcoded demo seed fields (`lib/demo/workspace.ts:49-52` etc.). Note: `ICA_ROADSHOW_x_FINAL` shows "2/2" yet has **no** approval-stage records in `lib/demo/workspace-store.ts:587-617` (stages exist only for denie/charles) — the fraction is seed-decoration, not derived from records. Version chips V5/V4/V2 match seeded `version_count`. Verdict: mostly record-backed; one inconsistent reviewer fraction.
9. **States:** loading = skeleton grid (`page.tsx:572-582`); empty = icon + copy + CTAs (`page.tsx:583-616`); not triggered (demo always has data). No error path in demo.
10. **Interactive inventory:** rail toggle, folder tree, New workspace (link + toolbar button opens inline create form, works), Upload media (file input; demo mode fabricates a local asset record with stock thumbnail `page.tsx:277-295` — works but the "upload" is simulated), Open review link, search box, A–Z/date sort, Select all, view-mode switch, thumbnail-size slider, row share/archive/trash (demo only), bulk "Share for review" bar. No dead controls found on this surface.
11. **Responsive:** 768px — rail collapses behind hamburger, cards stack 2-col then 1-col, table becomes cards; clean (`projects-768x1024.png`). 375px — single column, bottom tab bar appears; no horizontal overflow visible (`projects-375x812.png`).
12. **Verdict: POLISH.** Real and record-backed, but the top ~470px of explainer panels buries the media; L1 cleanup would let the table lead.

---

## 2. `/projects/new` — Project intake form

Shots: `projects-new-1440x900.png`, `projects-new-768x1024.png`, `projects-new-375x812.png`. Form left empty as instructed.

1. **Identity: YES** — it is a project-creation form, but only ~40% of the surface is form; the rest is meta-commentary about the form.
2. **First impression:** "Why is a 4-field form lecturing me about CRM and billing?" Reads like a status memo, not a creation flow.
3. **Hierarchy:** 1st = H1 "New production workspace"; 2nd = a four-cell "readiness strip" (Project write: Live / Client context: Payload / Billing authority: Gated / Expense ledger: Planned); 3rd = the actual form. Wrong order: the strip answers questions nobody asked yet (`new/page.tsx:181-200`).
4. **Density:** max-w-6xl, form card `p-4 sm:p-5`, fields `space-y-5` (20px), inputs `px-4 py-2.5`. Form itself is well spaced; page is long because of the aside.
5. **Type:** same family; sizes 11/12/14/16/18/24 = 6 — at the flag threshold.
6. **Color:** token-driven throughout; no ad-hoc hex.
7. **L1 violations (verbatim, heavy — this is the worst L1 surface in the lane):**
   - "Capture the client, proposal context, and production workspace in one intake path. CRM, contracts, signatures, invoices, deposits, payments, and expenses stay readiness-gated until durable records exist." — header `<p>`, `new/page.tsx:166-169`.
   - "The project shell is created immediately. Front-office context is saved into the project intake payload without claiming CRM, contract, billing, or payment authority." — form card intro, `new/page.tsx:210-213`.
   - Readiness strip details: "Creates the workspace" / "Saved with the intake brief" / "No payment state claimed" / "Awaiting durable records" — `new/page.tsx:65-86`.
   - Aside "What happens next": "1. Client intake — Lead, client, proposal, and deposit readiness"; "2. Project shell — Name, brief, and workspace authority"; "3. Upload media — Add source files when the shell opens"; "4. Review link — Share a permission-aware portal"; "5. Delivery trail — Track approvals, exports, and activity" — `new/page.tsx:18-44`.
   - "Front-office readiness" items, e.g. "Deposit, invoice, payment — No money state is marked received until billing authority exists." — `new/page.tsx:46-63`.
   - Aside footer: "Transcript cleanup, waveform analysis, notification delivery, exports, CRM, contracts, signatures, invoices, deposits, payments, and expenses remain readiness-gated inside the project surface." — `new/page.tsx:350-353`.
   - Screen-reader-only: "Project creation is the only live write in this intake step." — `new/page.tsx:197`.
8. **L2 check:** "Live / Payload / Gated / Planned" are hardcoded strings (`new/page.tsx:65-86`) — decorative status badges with no record behind them; presented in the same visual language as the record-backed stat cards on `/projects`. Flag.
9. **States:** error alert exists (`new/page.tsx:217-224`, e.g. empty name → "Project name is required before a workspace can be created."); submit disabled state "Creating workspace...". Not triggered (form left empty per instructions).
10. **Interactive inventory:** 4 fields (Project name*, Client / company, Brief, Business context), Create workspace, Cancel, Activity trail link, back link. All live; nothing inert.
11. **Responsive:** 375px — clean single column, readiness strip stacks with dividers (`projects-new-375x812.png`); no overflow.
12. **Verdict: POLISH (heavy L1 trim).** Form is fine; the page is an instruction manual wrapped around 4 inputs.

---

## 3. `/projects/archive` and 4. `/projects/trash`

Shots: `projects-archive-1440x900.png`, `projects-trash-1440x900.png`, `projects-archive-375x812.png`, `projects-trash-375x812.png`, plus 768px pair. Both render `components/demo/DemoAssetCollection.tsx` (mode archive|trash).

1. **Identity: YES.** Both are retention lists with restore controls; empty in the seeded demo.
2. **First impression:** calm, honest, sparse. "Nothing here, and here's what this room is for."
3. **Hierarchy:** 1st = title; 2nd = three readiness cards (Held assets / Restore / Retention); 3rd = empty-state panel. Acceptable on an empty list; cards again outrank content when items exist.
4. **Density:** cards `min-h-[74px]`, empty panel `px-5 py-14` — generous, fine.
5. **Type:** 11/12/14/16/20/24 — 6 sizes, threshold.
6. **Color:** token-driven, no ad-hoc hex.
7. **L1 violations (verbatim):**
   - Archive: "Review retained deliverables, restore them to the production library, and keep client links unchanged." — `DemoAssetCollection.tsx:35`.
   - Trash: "Review removed deliverables before restoration. Permanent deletion is intentionally not exposed here." — `:36` (the "intentionally" sentence is a design-rationale note on a user surface).
   - Empty: "No archive items are waiting. Assets moved here from the project library will appear with restore controls." — `:38`.
   - Row hint (only when items exist): "Restore keeps the asset in local demo authority" — `:147`.
8. **L2 check:** "Held assets 0" is computed from workspace state (`:41-46`) — backed. "Restore: Ready / Local state only" and "Retention: Kept / Links preserved" are hardcoded strings (`:47-58`) — decorative status, though honestly worded. Flag as static badges.
9. **States:** empty state observed and screenshotted (both modes). No loading/error states in demo (`demoMode ? false` loading pattern elsewhere).
10. **Interactive inventory:** back link, Open library link, Return to production library button, per-row Restore (live: calls `restoreDemoArchivedAsset`/`restoreDemoAsset`, `:151-161`). Trash exposes **no** delete control — by design, and the copy says so. No dead controls.
11. **Responsive:** 375px clean single column; no overflow (`projects-archive-375x812.png`).
12. **Verdict: SHIP (with an L1 trim).** The most disciplined surfaces in the lane.

---

## 5. `/projects/ica` — Project cockpit (asset review workspace)

Shots: `project-ica-1440x900.png` (default review of Denie McDonald_v4), `asset-charles-1440x900.png` (Charles Drummond_v5, review view), `dock-versions2-1440x900.png`, `dock-inspector-1440x900.png`, `dock-activity-1440x900.png`, `comments-resolved-1440x900.png`, `mode-edit-1440x900.png`, `mode-focus-1440x900.png`, `mode-lifecycle-1440x900.png`, `asset-charles-768x1024.png`, `asset-charles-375x812.png`.

1. **Identity: YES.** This is the wipster-class surface: player, timecoded comments, review timeline, version compare, approvals, share. A producer recognizes it instantly.
2. **First impression:** "Dense but real — frame, comments, approval state, version, all live." Also "there's a lot of system plumbing on stage" (SYSTEMS / NETWORK / COLLABORATION / MEDIA WORKER chips).
3. **Hierarchy:** 1st = video frame; 2nd = five-cell readiness strip (Status / Comments / Approvals / Transcript / Share); 3rd = system-health chip row + right dock. Readiness strip correctly outranks the chips; the chips should not be above the player at all (`project-ica-1440x900.png`).
4. **Density:** cockpit is tight: strip cells ~64px tall, player ~16:9 at ~590px wide in the central column, dock ~340px. At 1440px the center column carries player + composer + timeline + pipeline strip — vertical scroll required (page is taller than 900px; timeline/pipeline below fold).
5. **Type:** Inter/Instrument Sans. **17 distinct rendered font sizes in `main` (7.2px → 16px; probe `styles.uniqueFontSizes`) — far over the >6 flag.** Sub-9px text (7.2/8.48/8.5/8.8/8.96px) appears in the system chip row and status strip — illegible at arm's length.
6. **Color:** tokens (`#F0EBE0` bg, `#0B1928` ink, accent `#1E4D8C` family). Player chrome dark navy. `InternalAssetReviewPage` loading/error screens use inline hex (`#f0ebe0`, `#1e4d8c`, `#a14a4a`, `#c97474`, `#d5cfc0` — `InternalAssetReviewPage.tsx:197-255`) duplicating tokens ad hoc; also error body text `text-[#d5cfc0]` (`:228`) is light-tan-on-cream — likely failing contrast (verbatim style, not triggered in this run).
7. **L1 violations (verbatim):**
   - System chips: "Browser online only", "presence unverified", "Not used in demo", "FFmpeg backend not claimed", "Roster only; realtime unverified" (probe `chips`; truncated renderings visible in `asset-charles-1440x900.png` row under the readiness strip).
   - Dock, Live session: "SCREEN SHARE — Planned", detail truncated "Disabled until session co…" (`comments-resolved-1440x900.png`; source `ProjectCockpit.tsx:2116-2122`).
   - Dock, Transcript and cleanup: "Transcript — Demo transcript not processed", "AI cleanup — Suggestions appear after analysis finishes", "Filler words: unavailable / Long silences: unavailable / Pacing pauses: unavailable" (`ProjectCockpit.tsx:2160-2176`).
   - Empty dock (not triggered): "Upload the first file to start review, comments, versions, and approvals." (`:2018`).
   - Lifecycle drawer: "Co-VideoPro lifecycle — Agent and human checkpoints across four production phases." + per-phase "Agent — Unavailable", "Human-in-the-loop — Scope required / 4 media ready / 1 approved / Package review ready" (`mode-lifecycle-1440x900.png`).
   - Upload simulator messages (not triggered): "Checking format, size, and review compatibility.", "Preparing a browser-friendly review representation." etc. (`app/(dashboard)/projects/[id]/page.tsx:200-249`).
8. **L2 check:**
   - "Comments 2 open / 1 resolved", "Approvals 0/2 stages, 1/3 reviewers", "Step 1 of 2 — 1/2 approved" — **record-backed** from seeded approval stages and comments (`lib/demo/workspace-store.ts:587-617`; counts derived `ProjectCockpit.tsx:562-566`). Resolved tab click confirmed the resolved record renders (Morgan Lee, 00:04, "Name spelling and title treatment are approved.") — `comments-resolved-1440x900.png`.
   - "Share 2 active" — backed by seeded share links (`workspace-store.ts:420-449`).
   - **Media inspector hardcodes "Resolution 1920 × 1080" and "Frame rate 23.98 fps" in demo mode (`ProjectCockpit.tsx:2218-2219`)** — fabricated technical metadata presented as file properties. Flag: decoration masquerading as probe data (`dock-inspector-1440x900.png`).
   - Readiness chips "TRANSCRIPT Not processed", "MEDIA WORKER Not used in demo", "PRESENCE 4 listed" — honest negative statuses; backed by absence of jobs, self-labeled.
   - 375px: "Pre-Production — COMPLETE" pipeline card (`asset-charles-375x812.png`) — computed by `projectPipeline` from records (`ProjectCockpit.tsx:569-581`, `PipelineStrip.tsx:6-10`), so derived, but the word "COMPLETE" on a project mid-revision is a bold claim; derived from stage position, not from a completion record.
9. **States:** loading skeleton (`[id]/page.tsx:287-320`), "Project unavailable" panel (`:322-350`), review-route error panel with Try again (`InternalAssetReviewPage.tsx:209-261`) — error states exist but were not triggered (valid ids used). Empty dock copy exists (`:2014-2021`).
10. **Interactive inventory (clicked each):**
    - Dock tabs Review / Versions5 / Inspector / Activity — all live, switch panels (`dock-versions2`, `dock-inspector`, `dock-activity` shots). Version compare offers Split/Overlay toggles + "Open version history".
    - Comment tabs Open (2) / Resolved (1) — live (`comments-resolved-1440x900.png`); per-comment resolve toggle present (1 `button.cockpit-resolve` in DOM) — not clicked (state mutation).
    - "Record approval" buttons — present under each unapproved stage; not clicked (mutation).
    - **"Start screen share" — rendered visible but `disabled` + `aria-disabled="true"` (probe `screenShare`)** — inert control on stage; honest labeling ("Planned") saves it, but a disabled button is still furniture.
    - "Pin comment" — live (focuses composer). "View review" — live. Player transport, speed menu, volume, fullscreen — rendered, not exercised beyond presence.
    - **"Edit" mode tab — clicking it emitted toast "Stage advanced to Review" and the project stage pill changed (subsequent shots show "Delivery"→"Review" pill changes; `mode-edit-1440x900.png`)** — a view-mode tab that writes lifecycle state. Flag: control whose affordance (view switch) masks a mutation.
    - Focus — hides player chrome, live (`mode-focus-1440x900.png`). Commands — opens command surface. Lifecycle — opens workflow drawer (`mode-lifecycle-1440x900.png`).
    - "View all" links (Comments/Approvals/Recent assets/Share readiness) — live section switches.
11. **Responsive:** 768px — dock collapses to modal, player leads, timeline readable; minor: top-left "BE" avatar overlaps the Review/Edit/Focus tab labels (`asset-charles-768x1024.png`). 375px — status strip truncates ("Changes req…"), comment composer stacks full-width, pipeline card "Pre-Production COMPLETE" appears; **probe found an `ARTICLE` element at right=488px (113px past the 375px viewport, clipped) and buttons at negative offsets** (`overflow.375x812` in probe report) — clipped off-canvas content; avatar/tab overlap also present at 375 (`asset-charles-375x812.png`). 1440/768 document scrollWidth == clientWidth (no page-level horizontal scroll anywhere).
12. **Verdict: POLISH.** The core loop (frame + timecoded comment + approval state) is genuinely product-grade and record-backed; demote the plumbing chips, fix the fabricated 1920×1080/23.98 inspector values, the 17 font sizes, and the Edit-tab mutation surprise.

---

## Cross-surface notes

- **L1 pattern:** every projects surface leads with explanatory prose describing what the surface does or what is "gated/planned/unavailable". Worst: `/projects/new` (7 distinct prose blocks around 4 inputs). Lightest: archive/trash.
- **L2 pattern:** counts tied to the demo store are real; the recurring offenders are (a) hardcoded "readiness" word-badges (Live/Payload/Gated/Planned/Ready/Kept) that mimic the visual language of real status, and (b) the inspector's fabricated resolution/frame-rate.
- **Evidence limits:** empty/loading/error states and upload flow were not triggered where they required mutation; comments marked accordingly.
