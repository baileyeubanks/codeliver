# Lane 1a — Visual Surface Audit: Core Routes

**Scope:** `/welcome`, `/login`, `/signup` (public) and `/` (Overview), `/opportunities`, `/reviews`, `/activity` (authenticated demo) — each at 1440×900, 768×1024, 375×812.
**Method:** read-only. Screenshots via `audit/scripts/shot.mjs` (batch `audit/scripts/lane1a-batch.json`), computed-style/overflow/control probe via `audit/scripts/probe.mjs` → `audit/data/lane1a-probe.json`, interaction probe `audit/scripts/interact.mjs` (tabs, filters, modal, compose toggle only — no mutating or destructive actions, no credentials typed).
**Global artifact note:** the circular "N" button bottom-left in every shot is the **Next.js dev-mode indicator**, not product UI (confirmed: `elementFromPoint` over it returns `NEXTJS-PORTAL`, `audit/scripts/foot-shot.mjs` output). It occludes content at the bottom-left corner (e.g. the `/welcome` footer's leading characters at 768px, sidebar footer text on dashboard pages) but will not exist in production. It is excluded from all verdicts below.

Computed metrics below are from `audit/data/lane1a-probe.json` unless noted.

---

## 1. `/welcome` (public)

Shots: `audit/shots/welcome-1440x900.png`, `audit/shots/welcome-768x1024.png`, `audit/shots/welcome-375x812.png`, `audit/shots/welcome-long-768x1024.png`, `audit/shots/welcome-foot-768.png`

1. **Identity check — YES.** A full-bleed film-reel hero with monumental ivory display type: it looks like the front door of a cinematic production studio, which is exactly what the name promises.
2. **First impression.** "This studio does serious, expensive-looking work." The refinery-sunset poster, slow grain and 118px headline read as a film journal, not a SaaS dashboard.
3. **Visual hierarchy.** 1st: headline "The cinematic operating world for modern brand storytelling."; 2nd: the two invitations ("Start a project" ivory pill, "Enter the studio" glass); 3rd: the deck paragraph. Correct order for a front door — promise, then door, then explanation.
4. **Density & spacing.** Deliberate negative space; balanced. Copy block uses `gap: 26px`, padding `0 clamp(22px, 4vw, 54px) clamp(30px, 5vh, 52px)` (globals.css:5814-5824). Buttons `padding: 15px 28px` (globals.css:5834). Nothing cramped.
5. **Type.** Families: Bricolage Grotesque (display), Inter (body), Geist Mono (eyebrow/footer). Sizes @1440: 118px display, 17.5px deck, 16/14/11/10.5/10/8.5px = **8 distinct sizes** (>6, drift). Weights 400–800. The 118px display is intentional; the tail of small sizes (8.5–11px in 4 steps) is not clearly systematic.
6. **Color.** Rendered: ivory `rgb(242,237,226)` and alphas 0.78/0.66/0.62/0.42/0.16 over midnight `rgb(10,13,18)` / `rgb(11,25,40)`, one cobalt `rgb(74,125,255)` accent (reel progress), hairline `rgb(184,178,164)`. Tight, on-palette, no ad-hoc colors.
7. **L1 violations.** This is a marketing surface, so prose is the product — quoted for the record:
   - "A Content Co-op studio · Est. for the work" — `app/welcome/page.tsx:52` (`.cpv-eyebrow`). At 375px it wraps to two lines and nearly touches the headline (`welcome-375x812.png`).
   - "Part independent film journal, part private client screening room, part studio command center — beautiful work, clear creative direction, and calm client confidence in one connected record." — `app/welcome/page.tsx:57-60` (`.cpv-deck`).
   - "Create · Connect · Convert" and "Inquiry → Brief → Proposal → Production → Edit → Review → Delivery" — `app/welcome/page.tsx:74-75` (`.cpv-reel__foot`).
   - No how-to-use instructions. **No L1 violation** beyond the pipeline-diagram footer, which is borderline decorative taxonomy.
8. **L2 violations.** None. No checks, badges, counts, or status claims. "REEL 01 — THE ATMOSPHERE 01 / 03" is a media index, backed by the `REEL` array (`app/welcome/page.tsx:16-31`).
9. **Empty/loading/error.** No data states exist on this route (static). Videos fail to posters by design (`ShowreelClip.poster`). Not applicable.
10. **Interactive inventory.** Exactly 3 controls, all live links: "CLIENT SIGN IN" → `/login`; "Start a project" → `/signup`; "Enter the studio" → `/login?demo=1`. The showreel has **zero controls** (probe: `welcome buttons: []`) — auto-advances with no pause; a motion-sensitive user gets relief only via `prefers-reduced-motion` (globals.css:5935-5943). No dead controls.
11. **Responsive integrity.** No horizontal overflow at any viewport (probe: scrollW == clientW at 1440/768/375; `main` has `overflow-x: hidden`). At 375px the eyebrow wraps awkwardly and the deck runs to ~12px from the right edge; at 768px the footer is partially covered by the dev-mode "N" overlay (artifact, see header note). Otherwise intact.
12. **Verdict — SHIP.** Cohesive, confident, and the only surface that fully delivers the "cinematic" brand promise.

---

## 2. `/login` (public)

Shots: `audit/shots/login-1440x900.png`, `audit/shots/login-768x1024.png`, `audit/shots/login-375x812.png`

1. **Identity check — YES.** Centered single-purpose auth card on a warm paper field; reads instantly as a sign-in page.
2. **First impression.** Calm, trustworthy, slightly corporate — a producer feels "my client's screening room is behind this."
3. **Visual hierarchy.** 1st: "Sign in to Co-VideoPro"; 2nd: email field (pre-filled in demo); 3rd: blue "Open local workspace" submit. Correct.
4. **Density & spacing.** Balanced, arguably airy — the card occupies ~31% of viewport width at 1440 with large dead space around it (by design for auth). Portal/session/return info cards sit below the form.
5. **Type.** Inter + Bricolage Grotesque + Geist Mono; sizes @1440: 25px h1, 16/14/12/11/10/9/8.5px = **8 distinct sizes** (>6, drift; 9px and 8.5px are very small for info-card labels). Weights include a non-standard **650** (probe) alongside 400/500/600/700.
6. **Color.** Ink `rgb(11,25,40)`, accent `rgb(30,77,140)` (+10% alpha tint), muted `rgb(95,107,120)`, paper `rgb(250,246,239)`, card `rgb(240,235,224)`, plus `rgb(91,122,94)` (sage, "Local demo workspace" header lock icon) and `rgb(44,58,77)`. Consistent; no ad-hoc values.
7. **L1 violations.**
   - "Review and approve work with Content Co-op." — `app/login/page.tsx:95`. Subtitle, acceptable context-setting.
   - "Demo data stays in this browser" — rendered by `AuthShell` (visible in all three login shots) — informational, fine.
   - PORTAL / SESSION / RETURN cards: "Local demo workspace" / "Local browser only" / "Local paths only" — `components/auth/AuthShell.tsx`; truncated with ellipsis at 1440 and 768 ("Local demo w…", "Local paths o…", `login-768x1024.png`), so the explanatory text doesn't even survive the layout.
   - **No instruction-manual prose.** Clean on L1.
8. **L2 violations.** The "Demo" pill (`app/login/page.tsx:90`) is a mode indicator backed by `useDemoMode()` — record-backed. No checks/badges/counts. Clean.
9. **Empty/loading/error.** Error path exists (`role="alert"`, focus-managed, `app/login/page.tsx:108-118`) plus loading state on submit ("Signing in...", spinner swaps icon, :175-178). Not triggered: audit rules forbid typing credentials, and the demo path cannot fail. Surface-mismatch notice (:98-106) untriggered.
10. **Interactive inventory.** 6 controls: skip link (live), brand link → `/login?demo=1`, email input, password input, show/hide password (aria-pressed toggle, live), submit (live — used by the sanctioned auth path), "Create an account" → `/signup?demo=1`. No dead controls.
11. **Responsive integrity.** No overflow at any viewport (probe). At ≤768px the info cards truncate their values with ellipsis (`login-768x1024.png`); at 375px they stack and read fully (`login-375x812.png`).
12. **Verdict — SHIP.** Does one thing cleanly; only nit is ellipsized info cards mid-viewport.

---

## 3. `/signup` (public)

Shots: `audit/shots/signup-1440x900.png`, `audit/shots/signup-768x1024.png`, `audit/shots/signup-375x812.png`

1. **Identity check — YES.** Same auth shell, wider two-column form grid; unmistakably account creation.
2. **First impression.** Low-friction and safe — four fields, one button, nothing clever.
3. **Visual hierarchy.** 1st: "Create your account"; 2nd: Name/Email fields; 3rd: blue "Create account". "Back to sign in" is appropriately quiet. Correct.
4. **Density & spacing.** Balanced. Password + Confirm sit side-by-side at 1440 (`signup-1440x900.png`), stack at 375 (`signup-375x812.png`) — grid collapses correctly.
5. **Type.** Same system as login: 8 distinct sizes @1440 (25/16/14/12/11/10/9/8.5px, >6 drift), weight 650 present. Hint text "At least 6 characters" at ~12px muted — legible.
6. **Color.** Identical palette to login (probe data confirms same rgb set). Consistent.
7. **L1 violations.**
   - "Use one identity for comments, approvals, and delivery activity." — `app/signup/page.tsx:137`. Value statement, acceptable.
   - "At least {AUTH_PASSWORD_MIN_LENGTH} characters" — `app/signup/page.tsx:223-225`. A password rule is legitimate form microcopy, borderline.
   - Success-state copy (untriggered, code-read only): "Follow any verification instructions sent by the identity provider, then sign in." — `app/signup/page.tsx:123`; "Sign in with the local demo identity to continue." — :122. These are instructional sentences; they'd appear post-submit.
   - Rest state is **clean on L1**.
8. **L2 violations.** None in rest state. Success state shows a `CheckCircle2` "Account request received / Verify your account" (:110-119) — backed by an actual API 200 or local registration, so the check is earned.
9. **Empty/loading/error.** Client validation errors with field-level focus management (`app/signup/page.tsx:39-50`, `aria-invalid`, `aria-describedby`), 503-specific message (:93-95), loading spinner (:246). Not triggered: submitting requires typing credentials, forbidden by audit rules. Code inspection confirms the states exist and are wired.
10. **Interactive inventory.** 9 controls: skip link, brand, "Back to sign in" → `/login?demo=1`, 4 inputs, show/hide passwords (single toggle for both, aria-controls both ids — :216), submit. All wired; no dead controls.
11. **Responsive integrity.** No overflow (probe). Same ellipsized info cards as login at 768. 375px stacks cleanly.
12. **Verdict — SHIP.** Mirror-quality of login; validation and focus handling are above average.

---

## 4. `/` Overview (authenticated demo)

Shots: `audit/shots/overview-1440x900.png`, `audit/shots/overview-768x1024.png`, `audit/shots/overview-375x812.png`

1. **Identity check — YES.** "What needs attention, Bailey?" over a media-card board: it looks like a producer's morning triage, not a generic dashboard.
2. **First impression.** "I know exactly what's on fire and what to touch first" — the films literally are the interface.
3. **Visual hierarchy.** 1st: the attention question + "7 open loops across 5 productions"; 2nd: production cards with real thumbnails; 3rd: "Needs you" exception rail. Right order — status, work, repairs.
4. **Density & spacing.** Balanced-to-dense at 1440: content `px-6 py-5` (24px/20px), card grid `gap: 16px`, section `mb-7` (28px). At 375px cards go full-bleed single column with generous media — good.
5. **Type.** Sizes @1440: 20px h1, then 16/14/13.12/12.8/12.48/12/11.52/11/10/8.5px = **11 distinct sizes — drift.** The fractional sizes (13.12 = 0.82rem, 12.48 = 0.78rem, 11.52 = 0.72rem, 9.44 = 0.59rem) indicate an ad-hoc rem ladder rather than a scale. Weights 400/500/580/600/650/700 — 580 and 650 are non-standard stops.
6. **Color.** Ink `rgb(11,25,40)`, muted `rgb(95,107,120)`, accent `rgb(30,77,140)`, ivory `rgb(242,237,226)`, hairline `rgb(184,178,164)`; severity signals: `rgb(207,68,51)` (red text), `rgb(196,114,42)` (orange open-loop dots), `rgb(161,74,74)` (danger bg), dark media wells `rgb(10,13,18)` + 68% alpha scrim. Palette holds; the orange dot `rgb(196,114,42)` appears only here — mild one-off.
7. **L1 violations.**
   - "Quiet board — good day. The floor is yours." — `app/(dashboard)/page.tsx:90` (zero-exception subtitle; not in shots since 7 exceptions exist).
   - "Quiet board — good day. Exceptions land here when a promise starts to drift, and they clear only when the work changes state." — `app/(dashboard)/page.tsx:168`. Two full explanatory sentences on the surface when the rail is empty — instruction-manual copy.
   - Non-demo empty state: "The exception rail reads the local Project Operating Record. Connect this environment to your organization workspace, or open a project to continue." — `app/(dashboard)/page.tsx:73`. Pure instruction manual.
   - In the observed (populated) state the surface is largely prose-free; violations are confined to empty states.
8. **L2 violations.** All status marks are record-backed: "7 open loops across 5 productions" is computed by `deriveExceptions(...)` from the workspace store (`app/(dashboard)/page.tsx:31-49`); stage chips (Development/Pre-production/Production/Post/Review) come from `project.stage` (:120); orange open-loop dots render only when `loops > 0` (:130); "Needs you" rows are real exception records with owner and clear-condition in the title attribute (:155). **No decorative status found.** Caveat: the backing records are the seeded demo dataset (`lib/demo/record-seed.ts`), true of the whole demo.
9. **Empty/loading/error.** Zero-exception copy exists (:90, :168, quoted above); non-demo empty state exists (:71-78). Loading: client component renders from store synchronously — no skeleton; acceptable in demo. Not separately screenshotted (would require mutating the workspace).
10. **Interactive inventory.** 40+ controls; all are links with real hrefs (probe) — nav, "+ Inquiry" → `/opportunities?compose=inquiry`, "+ Project" → `/projects/new`, 5 project cards, 6+ exception rows each linking to a repair surface, "All 7 open loops" → `/activity`, 6 media thumbs → review surfaces. Header chrome (Search, Upload, Notifications, BE avatar) present but not exercised in this lane. **No inert controls found.**
11. **Responsive integrity.** No overflow at any viewport (probe). Grid 4→2→1 columns works; mobile swaps sidebar for bottom tab bar (`overview-375x812.png`). Card thumbnails hold aspect. Clean.
12. **Verdict — SHIP.** The strongest dashboard surface: real hierarchy, every status mark earned. Type-scale drift is the only systemic nit.

---

## 5. `/opportunities` (authenticated demo)

Shots: `audit/shots/opportunities-1440x900.png`, `audit/shots/opportunities-768x1024.png`, `audit/shots/opportunities-375x812.png`, `audit/shots/opportunities-compose-1440x900.png`

1. **Identity check — YES.** Inbox + clients + proposal pipeline: it is visibly the place "where new work becomes a production."
2. **First impression.** Business-like and slightly wordy — a CRM-flavored work queue; the discovery Q&A block signals real production craft.
3. **Visual hierarchy.** 1st: H1 + the two-sentence subtitle (heavy); 2nd: inbox cards with status pills; 3rd: proposal money rail ($10,255 / $5,708 tabular figures). Money drawing the eye third is right, but the subtitle competes with the inbox.
4. **Density & spacing.** Balanced. Cards `p-4` (16px), gaps 8–16px, header `pb-4`. The discovery block nests a card inside a card (border within border, `opportunities-1440x900.png`) — one level too deep visually.
5. **Type.** Sizes @1440: 12 distinct (20/16/14/13.12/12.8/12.48/12/11.52/11.2/11/10/8.5px) — **drift**, including a singleton 11.2px (0.7rem). Weights 400–700 + 580.
6. **Color.** Standard ink/muted/accent/paper set; `rgba(30,77,140,0.1)` pill tints; `rgb(161,74,74)` danger bg (Decline hover or toast). No off-palette colors rendered.
7. **L1 violations.**
   - "Where new work becomes a production. Qualify inquiries, keep client context, and move proposals to approval." — `app/(dashboard)/opportunities/page.tsx:118-119` — two-sentence instruction under the H1, visible in all three shots.
   - "Why this matters: Deliverables drive the estimate. A 9:16 cutdown found after greenlight is a change order, not a favor." — rendered by `DiscoveryBlock` (`app/(dashboard)/opportunities/page.tsx:400`, text from `lib/covideopro/discovery.ts`) — an explanatory rationale sentence printed on the surface (visible in shot). Pedagogic by design, but it is precisely instruction-manual prose.
   - Placeholder "Type the answer, or choose Unknown below…" — :404 (instructional placeholder).
   - Empty inbox: "New inquiries land here for triage before they become productions." — :177.
   - Discovery-complete: "Missing: {fields} — flagged, not hidden." — :372; toasts: "Marked unknown — it stays visible as a gap." (:428), "Conflict noted — flagged for the brief." (:434).
   - Non-demo empty: "Connect this environment to your organization workspace to manage inquiries, clients, and proposals." — :102.
   - **This is the most L1-exposed surface in the lane** — mitigation: the copy is good and producer-literate; the question L1 forces is whether the surface should teach at all.
8. **L2 violations.** Status pills (New/Triaged/approved/sent) map directly to `inquiry.status` / `proposal.status` (:30-36, :189, :286) — record-backed. "Inbox (2)" and "Clients (5)" are array lengths (:172, :239) — record-backed. "DISCOVERY · 3 OF 8" is computed from answer records (:397). "Discovery complete · {n} of 8 answered" (:367) computed. **No decorative status.** Dollar totals computed by `proposalEstimateTotal` (:279).
9. **Empty/loading/error.** Empty inbox state exists (:173-178); mutation failures surface as 3.6s toast with the store's reason (:58-61) — verified pattern in code, not triggered (would require a mutating click). Compose open/close verified (`opportunities-compose-1440x900.png`).
10. **Interactive inventory.** ~20 controls: New inquiry (toggles compose — verified live), Triage/Qualify/Decline (mutating — not clicked, handlers wired to `setInquiryStatus` :80-83), Start adaptive discovery (mutating, wired :352-355), Save answer/Unknown/Conflicting answers (wired :415-437), confidence select, proposal step buttons, "Open in project" links. **"Record client approval" (:309-319) flips a proposal to approved with one click, no confirm, and picks the primary contact's email silently** — high-stakes action with a hair trigger; not exercised per audit rules. No dead controls.
11. **Responsive integrity.** No overflow (probe). At 375px the pipeline rail stacks below the inbox and the discovery block remains usable (`opportunities-375x812.png`); at 768 the two-column client grid holds (`opportunities-768x1024.png`). Note `.demo-pill { display: none }` under 768px (globals.css:2893) — **inquiry status pills vanish on mobile**: a "New"/"Triaged" status visible on desktop is invisible at 375 (`opportunities-375x812.png` vs 1440 shot). Status deletion by breakpoint.
12. **Verdict — POLISH.** Functionally the richest surface audited, but it carries the heaviest instructional prose (L1), hides status pills on mobile, and puts a one-click "Record client approval" on the same row as a ghost link.

---

## 6. `/reviews` (authenticated demo)

Shots: `audit/shots/reviews-1440x900.png`, `audit/shots/reviews-768x1024.png`, `audit/shots/reviews-375x812.png`, `audit/shots/reviews-mine-tab-1440x900.png`, `audit/shots/reviews-detail-modal-1440x900.png`

1. **Identity check — MOSTLY.** It's a share-link administration table; a producer expecting "reviews" (cuts to watch) finds "review links" (portals to manage). The kicker "Review authority" admits the reframing.
2. **First impression.** Orderly and admin-flavored; the four readiness tiles promise control before the table delivers rows.
3. **Visual hierarchy.** 1st: "Review links" + subtitle; 2nd: the four metric tiles; 3rd: the table. Fine, though the tiles repeat what the table already shows with only 2 rows.
4. **Density & spacing.** Hollow below the fold: 2 table rows in a 1440×900 viewport leaves ~45% of the surface empty (`reviews-1440x900.png`). Tiles `min-h-[74px]`, table `padding: 10px 16px` (globals.css:1134) — top half balanced, bottom half vacant.
5. **Type.** Sizes @1440: **13 distinct** (24/20/16/14/13.12/12.8/12.48/12/11.52/11/10.88/10/8.5px) — worst drift in the lane; 10.88px (0.68rem) is a singleton.
6. **Color.** Standard set plus two ad-hoc renderings: **badge-approved hardcodes `#4ade80` text on `rgba(34,197,94,0.2)` (globals.css:708)** — a neon green that fights the cream/cobalt palette (visible in shot); `rgb(58,109,176)` blue badge; `rgb(138,127,108)` khaki dim. Flag the green as ad-hoc.
7. **L1 violations.**
   - "Track client portals, approval authority, recipient readiness, download access, and share status." — `app/(dashboard)/reviews/page.tsx:151` — one explanatory sentence under the H1.
   - Empty state: "Review links appear after a project asset is shared from the cockpit. No delivery or notification is implied until a link is created." — :253 — instruction manual (untriggered; 2 links exist).
   - Detail modal: "Notification status is controlled by share settings and provider readiness." — :435, visible in `reviews-detail-modal-1440x900.png` — a disclaimer sentence printed as a settings row; pure L1.
   - Tile captions ("Review portals created", "Ready for recipients", "Decision authority", "Invited reviewers" — :103-122) are glosses, minor.
8. **L2 violations.**
   - **"Active links — 2 — Ready for recipients" (:107-110): "Ready for recipients" is a hardcoded caption; no record proves any recipient can actually open the link** (no delivery/open event exists in the model). The count is computed; the readiness claim is decoration.
   - **"Recipients — 4 — Invited reviewers" (:118-122): sums `invited_count` from seed records (`lib/demo/workspace-store.ts:422,441`)** — the invitations themselves are seed-fabricated; there is no invite record per recipient.
   - Table badges Approval/Review/DL (:300-317) — backed by `permission` / `allow_comments` / `allow_downloads` fields. Earned (within the seeded demo).
   - Active toggles — backed by `is_active`, and flipping writes back to the demo store (`setDemoShareLinkActive`, :130-138). Earned — **but the toggle is inert outside demo mode**: `toggleLink` returns early `if (!demoMode)` (:131), so in production the control renders but does nothing.
9. **Empty/loading/error.** Loading skeleton exists (:232-247, non-demo only); empty state exists (:248-261) with CTA; both verified in code. "Created by me" tab verified live (`reviews-mine-tab-1440x900.png` — both seed rows are "You", list unchanged, tab state visibly switches). Detail modal opens/closes correctly (shot above).
10. **Interactive inventory.** ~15 controls: "Create from cockpit" → bp review surface (live link), "Open projects", All/Created-by-me tabs (verified), row click → modal (verified), Copy (wired to `navigator.clipboard` with **empty catch — silent failure**, :126-128), external-link anchors to `/review/demo?...` (real URLs), deactivate toggles (mutating — not clicked; inert in non-demo, :131), modal close (verified). **Dead/inert: the Active toggle in any non-demo deployment.**
11. **Responsive integrity.** **Broken at ≤768px.** The generic table collapse (globals.css:2898-2912: `thead{display:none}`, rows forced into `grid-template-areas: "select thumb title status" "select thumb title actions"`) is designed for 5-cell rows; this table has **9 columns** (`reviews/page.tsx:266-276`) with no grid-area assignments, so cells pile up: at 375px the Approval badge, Copy button and DL badge render on top of each other as garbled overlapping text (`reviews-375x812.png`, crop confirmed). At 768px there is no literal overlap, but the header disappears and bare numbers "1  2" render with no column labels (`reviews-768x1024.png`). No page-level horizontal scroll (probe) — the failure is intra-row.
12. **Verdict — POLISH.** Desktop is orderly and mostly honest, but the mobile table collision is a visible defect, the "Ready for recipients"/"Invited reviewers" claims outrun any record (L2), the neon badge is off-palette, and the Active toggle is inert outside demo.

---

## 7. `/activity` (authenticated demo)

Shots: `audit/shots/activity-1440x900.png`, `audit/shots/activity-768x1024.png`, `audit/shots/activity-375x812.png`, `audit/shots/activity-audit-filter-1440x900.png`, `audit/shots/activity-uploads-filter-1440x900.png`

1. **Identity check — YES.** A filtered event ledger with actor, action, asset and timestamp: it looks like an audit trail.
2. **First impression.** "Nothing hides here" — the readiness tiles and the muted ledger read as accountability, which suits a client-facing studio.
3. **Visual hierarchy.** 1st: "Production activity"; 2nd: four count tiles; 3rd: the filter tabs + trail. Correct; the tiles duplicate the filter tabs' information (Comments 1, Versions 1, Approvals 1).
4. **Density & spacing.** Hollow below: 3 events occupy ~20% of the 1440×900 surface (`activity-1440x900.png`). Rows `px-4 py-3` (16/12px), tiles `min-h-[74px]`. Top half balanced, rest vacant.
5. **Type.** Sizes @1440: **10 distinct** (24/20/16/14/13.12/12.48/12/11.52/11/10/8.5px) — drift. Row meta at 10px uppercase (`activity/page.tsx:267`) is small but legible.
6. **Color.** Standard set; kind icons use accent/muted plus `rgb(107,95,174)` (purple, uploads) and `rgb(91,122,94)` (sage, approvals) — two hues that appear only as icon accents; cohesive enough, mildly ad-hoc vs the two-hue core palette. Check icon `text-[var(--green)]` for approvals (:50).
7. **L1 violations.**
   - "Comments, approvals, version uploads, share events, and notification audit entries in one production trail." — `app/(dashboard)/activity/page.tsx:129` — one explanatory sentence under the H1, visible in all shots.
   - Tile captions: "Captured in audit history", "Timecoded collaboration", "Uploads and new cuts", "Decision trail" (:85-104) — glosses.
   - Empty state: "Activity appears after uploads, comments, approval decisions, share notifications, or backend audit events." — :199 (untriggered).
   - Filter-empty: "This filter will populate when matching events are recorded." — :241, verified on screen (`activity-audit-filter-1440x900.png`). Instruction-manual adjacent, but functional for an empty filter.
8. **L2 violations.**
   - Row-level icons are earned by `action` string matching (:48-54) — the check icon on "Morgan Lee approved asset on ICA_ROADSHOW_x_FINAL" corresponds to a real activity record; **but that record is seed-fabricated** (`lib/demo/workspace-store.ts:456-457`) — the approval never happened; it exists to make the demo look alive. Within-demo this is honest rendering of dishonest seed data.
   - Counts (Events 3 / Review comments 1 / Versions 1 / Approvals 1) are computed from the same store (:81-106). Earned arithmetic on seeded records.
   - No hardcoded badges on this surface.
9. **Empty/loading/error.** Loading skeleton (non-demo, :178-193), zero-event empty state (:194-207), and per-filter empty state (:236-243) all exist; the Audit filter's empty state was triggered and screenshotted (`activity-audit-filter-1440x900.png`) — handled gracefully. All five filter tabs verified clickable (All/Comments/Approvals/Uploads/Audit).
10. **Interactive inventory.** ~10 controls: "Review cockpit" → bp asset review (live), "Upload media" → `/projects` (live link, though its label over-promises — it lands on the projects list, not an upload dialog), 5 filter tabs (verified live), event rows are **not clickable** (no link to the underlying asset — a dead end for an audit trail; the row shows `ICA-ROADSHOW-FINAL` as plain text, :269). No inert buttons.
11. **Responsive integrity.** No overflow (probe). At 375px the timestamp column correctly hides (`hidden sm:block`, :272) and filters wrap (`activity-375x812.png`). Tiles stack 1-up — tall but intact.
12. **Verdict — POLISH.** Structurally sound and the honest-filter behavior is good; polish items are the duplicate tiles/tabs, the non-clickable audit rows, and "Upload media" landing on a list.

---

## Cross-surface findings (systemic)

1. **Type-scale drift everywhere.** Distinct rendered font sizes per surface: welcome 8, login 8, signup 8, overview 11, opportunities 12, reviews 13, activity 10 — every surface exceeds the 6-size ceiling. Fractional stops (13.12/12.48/11.52/10.88/9.44px = 0.82/0.78/0.72/0.68/0.59rem) and non-standard weights (580, 650) indicate the scale grew by local edits, not by system. Evidence: `audit/data/lane1a-probe.json`.
2. **Two palettes are fighting.** The auth shell and dashboard use warm paper (`rgb(250,246,239)`) + cobalt (`rgb(30,77,140)`); `/welcome` uses midnight + ivory + a different cobalt (`rgb(74,125,255)`). Each is internally coherent; the seam between welcome → login is a full brand handoff, and inside the dashboard `badge-approved` hardcodes neon `#4ade80` (globals.css:708).
3. **L1 exposure is concentrated in subtitles and empty states.** The recurring pattern is one-two explanatory sentences under every H1 (opportunities:118, reviews:151, activity:129) plus instruction-manual copy in empty states (page.tsx:73,168; reviews:253) and one disclaimer rendered as a settings row (reviews:435). The populated surfaces themselves are nearly prose-free — the manual appears exactly when the user has the least context.
4. **L2 is mostly clean.** Counts, pills, dots and stage chips are computed from store records on every surface audited. The exceptions: reviews' "Ready for recipients" caption (no backing record), "Invited reviewers" arithmetic over seed-fabricated invitations (workspace-store.ts:422,441), and demo-seed approvals that no human performed (workspace-store.ts:456-457). Plus one truly inert control: the reviews Active toggle outside demo mode (reviews/page.tsx:131).
5. **Mobile table collapse is generic and unsafe.** The ≤768px `.table` collapse (globals.css:2898-2912) assumes a 5-cell row anatomy; the 9-column reviews table visibly collides at 375px. Any future table with non-standard cells inherits the same bug.
6. **Status deletion by breakpoint.** `.demo-pill { display: none }` under 768px (globals.css:2893) removes inquiry status pills on phones — status that exists on desktop silently disappears on mobile (opportunities).
7. **Dev-mode overlay caveat.** The Next.js "N" dev indicator occludes bottom-left content in every capture; it is not product UI and was excluded from all verdicts (confirmed via `NEXTJS-PORTAL` hit-test, `audit/scripts/foot-shot.mjs`).

## Verdict summary

| Surface | Verdict | One line |
|---|---|---|
| /welcome | SHIP | Fully delivers the cinematic promise; zero dead controls. |
| /login | SHIP | Single-purpose, honest, clean at all widths. |
| /signup | SHIP | Login's equal; validation and focus handling solid. |
| / (Overview) | SHIP | Best dashboard surface; every status mark earned. |
| /opportunities | POLISH | Richest function, heaviest prose; pills vanish on mobile; one-click approval. |
| /reviews | POLISH | Mobile table collision, neon badge, readiness claims ahead of records. |
| /activity | POLISH | Sound ledger; duplicate tiles/tabs, rows not clickable. |
