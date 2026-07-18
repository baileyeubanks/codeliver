# Co-VideoPro — Upgrade Log

Running record of the 2026-07-16 upgrade mission. Newest last. Each entry: change, rationale, files, schemas/migrations, screenshots, tests, limitations, next slice.

Baseline: `e068ee8` (checkpoint of the prior session's transformation state).

---

## U1 — Mission baseline documents (commit `ebaada3`)

- **Change:** Wrote `docs/COVIDEOPRO_CURRENT_STATE.md` (evidence audit), `COVIDEOPRO_TARGET_ARCHITECTURE.md`, `COVIDEOPRO_PRODUCT_MODEL.md`, `COVIDEOPRO_DECISIONS.md`.
- **Rationale:** Mission requires an evidence-based audit and a governing architecture before implementation.
- **Evidence:** Route/schema/component inspection; agent-0 architecture report (subagent quota then exhausted — D6).
- **Limitations:** UI audit section was static until U4 runtime verification.

## U2 — Project Operating Record core (commit `3560be6`)

- **Change:** Canonical entity model + state machines + tests + schema migration.
- **Files:** `lib/covideopro/record.ts` (9-stage lifecycle spine + 14 entity types), `lib/covideopro/transitions.ts` (pure validators for inquiry, brief, proposal, sequence, revision request, deliverable, project stage), `tests/covideopro-record-transitions.test.ts` (14 tests), `supabase/migrations/20260716120000_project_operating_record.sql` (14 tables + `projects.stage`, RLS owner policies), `tsconfig.json` (`allowImportingTsExtensions` — matches the repo's `.ts`-import convention; removed 31 stale `@ts-expect-error` suppressions across 14 files).
- **Tests:** 14/14 new tests green; suite 484/491 (7 pre-existing failures unrelated).
- **Limitations:** Migration authored but not executed against a live Supabase (no local credentials) — see OPEN_RISKS R1.

## U3 — Demo runtime v2 + realistic decontaminated seed (commit `ee77ef6`)

- **Change:** The local demo workspace store became the full Project Operating Record runtime.
- **Files:** `lib/demo/workspace-store.ts` (12 record collections; storage key `co-videopro.workspace.v2` with v1→v2 migration; validated mutation API with activity events; `getDemoWorkspaceSnapshot` for headless tests), `lib/demo/record-seed.ts` (new), `lib/demo/workspace.ts` (seed slate), `tests/covideopro-demo-store.test.ts` (6 tests).
- **Seed:** ICA (review), Schneider + EPC (post), bp (production), Conexon (development), HLSR + QSR inquiries; briefs with versions, proposal versions with estimate lines, plan items, transcript selects, radio-cut sequence, revision round, decision, deliverables with QC.
- **Contamination removed (D7):** "Astro Cleaning Services" project/folder/asset from demo seed.
- **Tests:** 6/6 new tests green, incl. v1→v2 migration and full lifecycle flows.
- **Limitations:** Persistence is localStorage (browser-local) in demo runtime; Supabase path is schema-complete but not integration-tested (R1).

## U4 — Runtime baseline + rebrand + shell v2 (commit `d399f35`)

- **Change:** Booted the app (Next 16.2.10, port 4115, demo mode auto without Supabase env); captured baseline screenshots; renamed the product to Co-VideoPro; built global nav v2, Home, Opportunities.
- **Baseline found:** 451 passing / 7 failing tests; branding split across three names; cockpit isolated from global context.
- **Rebrand (D3):** literal rename across 43 files; `CoProductionBrand` raster lockup replaced by a theme-aware text wordmark (retired rasters left in `public/brand` for reference); `package.json` name `co-videopro`; login-shell duplicate `"Co-VideoPro"` theme key merged; "Root" login theme decontaminated of ACS business language; ACS mention contact removed from `MentionSuggestions`.
- **Shell:** navigation-model v2 — Operate (Home, Projects, Opportunities) / Create (Reviews, Library) / Workspace (Activity, Archive, Trash) / Admin (Settings); capabilities `home:read`, `opportunities:read/write`; lifecycle-contract permission contracts extended.
- **New surfaces:** `app/(dashboard)/page.tsx` Home (attention queue: inquiries, proposals awaiting approval, open revisions, QC deliveries, upcoming plan items; productions-by-stage; recent activity). `app/(dashboard)/opportunities/page.tsx` (inquiry inbox with triage/qualify/decline/convert-to-project, proposal pipeline with estimate totals and approval actions, clients with contacts).
- **Screenshots:** `docs/design-evidence/mission-baseline-20260716/01-06` (login, projects, cockpit, reviews, home, opportunities).
- **Tests:** copy/brand/navigation/exterior suites updated to the new canon; 484 passing.
- **Limitations:** Remote (Supabase) mode Home/Opportunities render honest fallbacks (record APIs not yet wired — next slices).

## U5 — Cockpit: Project Operating Record shell (commit `8166b4c`)

- **Change:** The project cockpit became the lifecycle-contextual record shell.
- **Files:** `components/cockpit/cockpit-navigation.ts` (lifecycle-ordered sections incl. creative/proposal/plan/delivery), `components/cockpit/CockpitNavigation.tsx` (icons), `components/projects/ProjectRecordSections.tsx` (new: Creative, Proposal, Plan, Delivery sections), `components/projects/ProjectCockpit.tsx` (stage chip + section wiring), `app/globals.css` (cockpit-record styles).
- **Behavior:** Stage chip advances the lifecycle through gated transitions (`advanceProjectStage` — real context checks: org+contact, brief, approved proposal, production day, sequence, active review, final approval, deliverables). Brief/proposal editing versions forward (approved → superseded + new draft). Estimate lines editable in draft with computed totals. Plan items and deliverables transition via validators.
- **Fake controls removed:** rail shortcuts "Creative brief"/"Brand guidelines" previously routed to metadata; now Creative brief/Proposal reach real sections.
- **Screenshots:** `07-10` (creative, proposal, plan, delivery).
- **Tests:** cockpit-control-regressions 18/18 green.
- **Limitations:** Stage regression is intentionally impossible (revision = new round, per PRODUCT_MODEL §1).

## U6 — Slices B and C cores (commit `d8c0243`)

- **Change:** Real sequences replace the asset-list-that-posed-as-sequences; revision consolidation lands in the Reviews section.
- **Files:** `components/projects/ProjectRecordSections.tsx` (SequencesSection: sequences with clips, source/record times, selects, guarded assemble-from-selects; ReviewConsolidationSection: per-asset revision rounds + one-click consolidation of scattered open comments), `ProjectCockpit.tsx` wiring.
- **Screenshots:** `11-12` (sequences, reviews with revision rounds).
- **Tests:** 24 targeted tests green.
- **Limitations:** Sequence playback/preview not yet wired to the player (clips are data-truthful; visual timeline is the next slice). Select creation from the transcript workbench UI is not yet wired (selects seeded + API-ready).

## U7 — Full suite green (commit `9e666ec`)

- **Change:** Fixed the 7 pre-existing baseline failures.
- **Files:** `app/api/assets/bulk/route.ts` (anti-enumeration 404 for cross-project selections; filter chain order), `tests/asset-tag-bulk-tenant-security.test.ts` (FakeQuery mirrors PostgREST `update().select()` returning rows), `app/api/media/upload/route.ts` (role gate before body parse; staff may use raw NAS upload without service token), `lib/supabase.ts`, `lib/server-env.ts` (`@/` alias → relative imports).
- **Tests:** **535/535 pass; `tsc --noEmit` 0 errors.**
- **Limitations:** none known in these paths.

## Next slices (roadmap, not done)

1. Sequence visual timeline + player wiring (Slice B completion); transcript workbench → select creation UI.
2. Review-version-from-sequence (render/flatten a sequence into a reviewable version).
3. Remote-mode record APIs (Supabase routes for the new entities) so Home/Opportunities/sections work outside demo mode.
4. Deliveries global surface + download audit events.
5. Hermes project summary over the record (deterministic analyzers first).

## U8 — Production build verified + final report

- `npm run build` (Next 16.2.10, Turbopack) → **exit 0**; all routes compile, `/opportunities` prerenders static.
- Final evidence report: `docs/COVIDEOPRO_FINAL_REPORT_2026-07-16.md`.
- Proof bundle: tsc 0 errors · 535/535 tests · build exit 0 · 17 screenshots.

## U9 — Skills lanes + Metronic + reasoning engine (2026-07-17)

- **Skills leveraged:** stripe-best-practices (payments lane), sms-communications (notification outbox). Metronic v9.5.0 audited via 6-agent swarm → `COVIDEOPRO_METRONIC_PORT_PLAN.md` (license gate: Extended tier required for paid SaaS; repo must stay private).
- **Payments:** milestones (deposit 30%/balance) auto-created on proposal approval; provider-neutral checkout (deterministic mock; Stripe Checkout Sessions gated on `rk_`, `sk_` refused); validated transitions; Proposal UI; migration `20260716130000_payments_notifications.sql`.
- **Notifications:** outbox with E.164 normalization, sha256 idempotency + dedupe, dry-run-only dispatch (missing provider → `pending_provider`, never claimed delivery); share-link enqueue; Reviews UI block.
- **Metronic Wave 1 ported:** dense type tokens, derived radius scale, scrollable family, range/scrub styling → `app/globals.css`.
- **Competitive teardown:** `COVIDEOPRO_COMPETITIVE_TEARDOWN.md` (Wipster, Sandcastles, Descript context) → Waves E1–E4 roadmap.
- **Reasoning engine v1:** `lib/covideopro/reasoning.ts` — deterministic segment features, sound-bite scoring, chronological radio-cut proposals with segment-level rationale; one-click "Propose 90s radio cut" in Sequences (transcript → reasoned selects → assembled sequence). Note: no "hacker" skill is installed (checked ~/.agents/skills, ~/.claude/skills); analysis used public sources + local capture evidence.
- **Tests:** 550/550 (4 reasoning + 14 payments/notifications new). tsc clean. Screenshots 18–20.

## U10 — Frontier wave: real timeline + edit ops + EDL (2026-07-17)

- **SequenceTimeline** (`components/projects/SequenceTimeline.tsx` + cv-timeline dark surface): real playback — the video element plays the actual source file and advances through clips at source boundaries; playhead sync; click-to-seek; clip select; drag trim handles; split at playhead; ripple-delete; EDL export button.
- **Edit operations** (validated, store-level): `trimSequenceClip` (source range + right-ripple), `splitSequenceClip` (source offsets computed), `removeSequenceClip` (ripple close). 5 new tests (EDL format + timecode + all three ops).
- **EDL export** (`lib/covideopro/edl.ts`): CMX 3600 with frame-accurate timecode at sequence fps, reel/clip names, select provenance comments — the truthful Premiere/Resolve handoff (benchmark battle card).
- **Demo media made real:** generated `public/demo/interview-source.mp4` (ffmpeg, 150s) and rescaled the podcast transcript/selects/clips into its real duration — playback times are truthful, not simulated.
- Suite: **555/555**, tsc clean. Screenshot 21.

## U11 — Loop iterations 1–3 (2026-07-17)

- **Loop 1 (G2):** SRT/VTT caption export (`lib/covideopro/captions.ts`) + select range refinement; render module split (render-plan client-safe / render server-only) after visual QA caught a node-builtin client-bundle leak. TDD, 3 tests.
- **Loop 1.5 (G11):** demo role switcher ("View as") — session.role persisted, real capability gating in Shell nav/palette.
- **Loop 2 (G4, delegated to agent-15, independently verified):** Playwright E2E harness (`@playwright/test@1.61.1`, `playwright.config.ts`, `tests/e2e/`): 5 demo smoke flows (login, home, opportunities triage, brief approval, sequences timeline) + design-evidence capture — **6/6 pass in the parent agent's own run (7.2s)**. Agent found+fixed a real product bug: `.workspace-shell .demo-pill{display:none}` hid all status pills on shell pages.
- **Loop 3 (G1, in flight):** parity plan adopted (docs/COVIDEOPRO_G1_PROD_PARITY_PLAN.md); M1 delegated to agent-17.
- Suite: 562/562 node:test + 6/6 e2e; tsc clean.

## U12 — Intentionality re-alignment + El Paso doctrine slice (2026-07-17)

- **Intentionality extraction** (find-intentionality skill): `COVIDEOPRO_INTENTIONALITY.md` — the user's own doctrine from `PRODUCTION_MACHINE_v1.md` (FORM/JUDGMENT/CRAFT, five agents, six documents, named drops, El Paso forcing function), brand artwork adoption (CVP BLUE family → `public/brand/cvp-*`), and the UI-regression critique.
- **Loop re-aligned** (`COVIDEOPRO_IMPROVEMENT_LOOP.md`): El Paso entities top of register; named drops documented.
- **E3 design restoration:** media-first Home (production cards, quiet attention rows, latest-media strip); Opportunities monograms + prominent amounts; status-pill CSS bug fixed by agent-15 visible throughout.
- **E1+E2 El Paso entities:** production_days, crew_members, locations, releases, call_sheets in record.ts + transitions (chaseList, call-sheet versioning) + demo store + seed (El Paso: 5 days, 3 crew, 3 locations, Adam/Gisela/Ephram releases) + migration `20260716140000_production_entities.sql` (GRANTs + FORCE RLS from the start, M1 lesson) + Production block in Plan section (days, chase board ⚠2 unsigned, locations/agreements, unit, call-sheet generation with printable content incl. CHASE warning).
- Tests: 5 new production-entity tests; suite **566/566**; e2e 6/6; tsc clean. Screenshots 23–25.

## U13 — T1: Finish Review ritual + Decision Ledger (Webster tranche 1, gate 8)

- `finishDemoReview`: the guest's closing act — durable decision with the reviewer's open comments attached as provenance; outcome → implementation mapping (approved/notes → done, changes → pending).
- `FinishReviewBar` in the guest approval rail (Approve/Request changes/Notes only) — screenshot 28.
- Decision Ledger in cockpit Reviews: decisions with decider, source, supersession, implementation status + transitions (screenshot 27).
- Decision model + migration 20260716150000 (supersedes_id, implementation_status); 4 tests; suite 570/570; tsc clean.

## U14 — T2: Adaptive Discovery (Webster blueprint §6.1)

- `lib/covideopro/discovery.ts`: 8-question bank, each with a visible "why this matters"; deterministic normalization to a structured brief seed; missing/blank answers are visible gaps, never empty truth; next-question semantics (unknown closes, conflicted re-asks).
- Store: start/answer/complete + `getDiscoveryForInquiry`; completed discovery seeds a brief v1 on inquiry conversion.
- Opportunities: per-inquiry discovery panel (question card, why note, confidence selector, Unknown/Conflict paths, completion + missing summary). Seed: Wendy's mid-flow. Migration 20260716160000.
- 4 tests; suite 574/574; screenshot 29.

## U15 — Identity adoption: Webster by co-videopro (2026-07-17)

- **Name decided by the user's board package:** the product is **Webster by co-videopro** (one restrained identity; red/blue/green/yellow as operational signals only). Renamed across code+tests; lockup = WEBSTER wordmark (Bricolage Grotesque) + one four-color registration mark (Bailey's CVP monogram), used once per surface per the board system (`~/Desktop/webster/WEBSTER_BOARD_SYSTEM.md`, adopted).
- Fonts per board system: Bricolage Grotesque (display), Instrument Sans (body), Geist Mono (numbers/timecodes). Semantic tokens (--signal-*) + stage→signal mapping (discover=amber, scope/plan=blue, shoot/story/review=red, deliver/learn=green) in globals.css.
- Boards absorbed from `~/Downloads/Webster_Product_Board_Package` (5 boards; board 03 governs T4 mobile dark field instrument).
- Suite 578/578; tsc clean; screenshots 31–33 (login, home, welcome).

## U16 — Identity: Webster retired → Co‑ProVideo + CCO universe adoption (2026-07-17)

- Webster was a false start; retired. The product is **Co‑ProVideo by Content Co-op**, inside the **CCO OS** universe (co-videopro = admin shell, client surface simplified, public contentco-op.com untouched).
- `docs/CCO_DESIGN_UNIVERSE_ADOPTION.md`: dialect law, surface mapping, ROOT deletion ledger. Mega audit preserved verbatim at `docs/CCO_DESIGN_UNIVERSE_MEGA_AUDIT.md`. Naming/colorway law in §5; muted CVP artwork (`public/brand/cvp-mark-muted.png`, `cvp-stacked-muted.png`, ffmpeg hue=s=0.5).
- Cut Check spec verified and parked (back burner, user decision). Commits a11c907 → 4c7d85c.

## U17 — N1: Recent Assets rail + cinematic theater reconciliation (2026-07-17)

- Recent Assets rail in the review dock; parallel session's graphite/cinematic restyle swept the cockpit — branches unified ff-only, tests reconciled to the winning direction, suite green. Commits 357e944, f7b5412.

## U18 — ROOT port: estimate line editor + Gen-3 document layer (2026-07-17)

- Money console cherry-picks landed: spreadsheet-cell estimate line editor and the Gen-3 dark cinematic document grammar (quote cover, TOTAL DUE NOW band). Verified in-browser. Commit 4f62712.

## U19 — Cream editorial flip: contentco-op.com vibe everywhere (2026-07-17)

- User ruling: the public site's warm cream is law. Light cream canvas, parchment/white cards, navy ink, sapphire signal across the workspace; dark survives only as nature — the player well, the showreel hero, the Gen-3 quote cover, opt-in `html[data-theme="dark"]`. Commit db75821. Suite 592/592; e2e 6/6; tsc clean.

## U20 — N2: exception-first Home + activity-ordered recents (2026-07-17)

- `lib/covideopro/exceptions.ts`: deterministic exception engine — unsigned releases near shoot (critical ≤2d), stale proposals (>7d), stale revision rounds (>5d), QC-stale deliverables (>3d), overdue plan items (milestone = critical). Every exception carries owner + repair verb + clear condition; clears by state change only, never dismissal; ranked by severity and sharpness.
- Home "Needs you" rail now renders the ranked exceptions with repair-verb pills and severity color (critical = signal red kind chip); region "Attention queue" preserved; quiet-board empty state. Header counts open loops; stage cards dot projects with exceptions.
- Nav drawer "Recent projects" ordered by latest project activity (`lib/demo/recent-projects.ts`, stable fallback to workspace order).
- Seed truth pass: Conexon proposal sent 2026-07-08, ICA social deliverable in QC since 2026-07-13, Conexon brief milestone dated 2026-07-15 — three live exceptions at any "today" from 2026-07-17 on. El Paso release chase fires naturally Aug 4–20.
- Tests: 4 engine + 4 recents node tests (suite **600/600**); e2e 9/9 incl. new `n2-evidence.spec.ts` (rail ranking/verbs, drawer order, 375px hold); tsc clean. Evidence: `docs/design-evidence/e2e/n2-*.png`.
- Observed, parked for a polish loop: cockpit top-left chrome cluster (Upload/bell/avatar) overlaps the rail header at desktop widths — pre-existing, out of N2 scope.

## U21 — T5: shot list + readiness roll-up (mission-goal slice 1)

- **Shot entity** (record.ts): scene, description, size (wide/medium/close/insert/aerial/other), priority (must/nice), status (planned/covered/dropped), owned by a production day. Edges in transitions.ts; migration `20260717120000_shots.sql` (GRANTs + FORCE RLS from the start).
- **`lib/covideopro/shots.ts` readiness engine:** deterministic, keyed to the day's lifecycle — scheduled day: unplanned/listed; in-progress/wrapped: behind → ready (all must covered) → wrapped (all covered). Dropped never counts; cancelled/scout/contingency days never roll up.
- **Exception kind `shots_unplanned`:** a principal day inside 14 days with no shot list fires (critical ≤2 days, repair verb "Build shot list"); reuses the readiness engine.
- **ProductionBlock shot board:** per-day coverage header (covered + must counts), readiness chip, shot rows with size/priority chips and Mark covered / Drop / Reopen verbs, inline + Add shot form (scene/description/size/priority). Seed: 9 shots across El Paso's three principal days (musts carry clearance notes — "no control screens", "one approved frame").
- Tests: 5 roll-up + 1 exception tests (suite **606/606**); e2e 11/11 incl. `t5-shots.spec.ts` (roll-up moves on cover, inline add grows the list); tsc clean. Evidence `docs/design-evidence/e2e/t5-shot-list.png`.

## U22 — T4: mobile field workspace (mission-goal slice 2)

- **`/field`** — the shoot day in your pocket (375px-first, cream editorial). Project select defaults to the project with the nearest shoot; day-chip scroller; the day card (date, type, call/wrap tabular, notes, status verb); shot list with 44px cover verbs on principal days; releases-on-this-day with chase verbs; locations & clearances; unit.
- **`lib/covideopro/field.ts`**: deterministic day selection — nearest upcoming live day, most-recent-past fallback, cancelled never anchors; default project = nearest upcoming shoot across the slate.
- Discoverability: "Open field view →" link in the cockpit Production days header.
- Tests: 4 field-selection tests (suite **610/610**); e2e 12/12 incl. `t4-field.spec.ts` (anchor day, scout has no shot list, chip switch, cover verb moves the roll-up at 375px); tsc clean. Evidence `docs/design-evidence/e2e/t4-field-mobile.png`.

## U23 — NEW SHELL law adopted + S1a: left rail navigation (mission slice 3)

- **User-declared direction (2026-07-17):** two shell renders + `co-provideo-capability-architecture.md` are law. Preserved in-repo: `docs/COVIDEOPRO_CAPABILITY_ARCHITECTURE.md` + `docs/design-evidence/shell-law-20260717/`. Goal rewritten around the shell migration + four-layer rhythm (Signal → Preview → Doorway → Studio — no dead ends).
- **S1a shipped:** left grouped rail replaces the desktop inline top nav. Groups: WORKSPACE (Overview, Projects, Opportunities, Reviews, Activity) · PRODUCTION (Field) · LIBRARY (Media library) · ADMIN (Archive, Trash, Settings) + RECENT PROJECTS (activity-ordered, N2 engine reused) + role footer. Only real surfaces — the dead-end law.
- One navigation source: `WORKSPACE_NAVIGATION` restructured in place (drawer inherits the new groups); rail component `WorkspaceRail.tsx` at ≥901px; mobile bottom bar + drawer untouched. Header grid re-colummned (brand | search | actions).
- Reconciled: navigation-model viewer pin now includes `field`; `primaryNavigation` retired from WorkspaceNavigation.
- Suite **610/610**; e2e **14/14** incl. `s1-rail.spec.ts` (groups, active states, recents order, rail navigation, mobile preservation); tsc clean. Evidence `s1-rail-desktop.png` / `s1-rail-mobile.png`.
