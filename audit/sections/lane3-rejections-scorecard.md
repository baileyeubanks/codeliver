# Lane 3 — Rejected-Prototype Complaints Scored Against the Live App

Date: 2026-07-25 · App under test: Co-VideoPro at http://localhost:4103 (demo mode, `?demo=1`) · Repo: `cco-videopro-definitive-20260715`
Method: read-only. All routes visited via `audit/scripts/shot.mjs --auth`; screenshots in `audit/shots/`; code citations by file:line. No files modified outside `audit/`.

Verdict key: **FULL** = complaint is satisfied by this app · **PARTIAL** = a corresponding surface exists but has a concrete gap · **ABSENT** = verified no corresponding surface exists (grep evidence) · **REPEATED FLAW** = the exact pattern the owner rejected is present in this app.

## Summary table

| # | Slot | Corresponding surface | Verdict | Effort to close |
|---|------|----------------------|---------|-----------------|
| 01 | REQUESTS | `/opportunities` (Inbox of inquiries) | PARTIAL — no green checks, but instructional copy pattern persists (and worse on `/review/[token]`) | S |
| 02 | PROJECTS | `/projects` + `lib/storage/filesystem-adapter.ts` (`ccnas` kind) | PARTIAL — NAS adapter is real code; "project folder on operator's desktop" model does not exist | XL |
| 03 | PIPELINE | `PipelineStrip` inside `/projects/[id]` cockpit overview + `/opportunities` proposal pipeline | PARTIAL — stage strip exists, no kanban/board view | M |
| 04 | CLIENTS | "Clients (5)" card grid at bottom of `/opportunities` | PARTIAL — list exists but buried, no profile drill-in, no people→company assignment | M |
| 05 | STUDIO | `/projects/ica?asset=…&view=review` cockpit review workspace | PARTIAL — strong review space; no mini-NLE, no bin with server/local folder access | XL |
| 06 | WHITEBOARD | — | ABSENT (verified by grep) | L (greenfield) |
| 07 | BRIEF | Cockpit "Creative" surface = versioned brief **with authoring UI** | FULL | — |
| 08 | CALENDAR | Cockpit "Plan" (dates as `mm/dd/yyyy` fields), `/field` day chips | PARTIAL leaning ABSENT — no calendar grid anywhere | L |
| 09 | NETWORK | `/settings` → Organization → membership table; orphaned `components/teams/*` | PARTIAL — member table exists in settings; no directory surface; teams components unused | M |
| 10 | PRODUCTION | `/field` ("The shoot day in your pocket") | FULL-ish → PARTIAL: real production-day surface, actually matches its name | S |
| 11 | ASSETS | `/library` Media library + cockpit Media section | PARTIAL — library is real but thumbnails broken (blank tiles) in live demo | S–M |
| 12 | POST | Cockpit "post-production" pipeline stage (computed) + Sequences/Versions surfaces | PARTIAL — post exists only as a pipeline-stage label, not a named surface | M |
| 13 | REVIEW | `/review/[token]` (Wipster-class client portal) + in-app review workspace | FULL — exists and is the strongest surface; reachable via `/reviews` and cockpit | — |
| 14 | REPORTING | `/activity` audit trail; `components/analytics/*` + `components/usage/*` exist but **imported nowhere** | PARTIAL — audit trail yes, reporting no; analytics are dead code | M |

---

## Per-slot detail

### 01 REQUESTS — `/opportunities` (Inquiries inbox)
- **(a) Surface:** `/opportunities`, header "Inquiries, clients, and proposal pipeline" (`app/(dashboard)/opportunities/page.tsx:116`). Evidence: `audit/shots/opportunities-1440x900.png`.
- **(b) PARTIAL.** The rejected prototype's sins were (1) explanatory text above titles and (2) green check marks. This app has **no green-check decoration** on opportunities, and no per-card instructions. However the instructional-copy pattern persists: the page header carries a full sentence of how-to framing ("Where new work becomes a production. Qualify inquiries, keep client context, and move proposals to approval." — line 117-119), and the discovery panel writes coaching text verbatim on the surface ("Why this matters: Deliverables drive the estimate. A 9:16 cutdown found after greenlight is a change order, not a favor." — visible in screenshot). The worst offender is the client review page, which prints numbered usage instructions directly on the final surface: "Review flow — 1. Watch the cut and pause where feedback is needed. 2. Leave a comment tied to the current timestamp or frame. 3. Record your approval when the cut is ready." (`audit/shots/review-demo-1440x900.png`, rendered by `components/review/PublicReviewWorkspace.tsx`). That is exactly "instructions on how to use the tool written verbatim on a final surface".
- **(c) Delta:** strip/collapse instructional prose on `/opportunities` and `/review/[token]`; move "Why this matters" coaching into tooltips or a dismissible help affordance; keep titles self-explanatory.
- **(d) S.** Files: `app/(dashboard)/opportunities/page.tsx` (header + discovery copy), `components/review/PublicReviewWorkspace.tsx` (Review flow block), `lib/covideopro/discovery.ts` (question rationale strings).

### 02 PROJECTS — `/projects` + storage layer
- **(a) Surface:** `/projects` with project library tree and asset table. Evidence: `audit/shots/projects-1440x900.png`.
- **(b) PARTIAL.** (i) *Real project data:* the demo loads 5 seeded productions with real-feeling assets, versions, reviewers, statuses (ICA, Schneider + EPC, bp, Conexon, Physical Edge) — but it is seeded localStorage demo data (`lib/demo/workspace-store.ts:629` seeds; page badges itself "Local reconstruction"), and the real backend path is Supabase rows (`app/api/projects/route.ts:20-42`), not folders. (ii) *"Project folder on the operator's desktop / ccnas NAS":* the storage layer genuinely supports a NAS — `lib/storage/config.ts:117-134` defines provider `ccnas` rooted at env `NAS_MEDIA_ROOT` (must be an absolute path, `lib/storage/media-root.ts:18-21`), and `lib/storage/filesystem-adapter.ts:45-67` implements `FilesystemStorageAdapter` with `kind: "local" | "ccnas"`, label "CCNAS storage", `external = kind === "ccnas"`; `lib/storage/runtime.ts:19` wires the `ccnas` case. But it is a **server-side ingest root**: directories are created only under that root when media objects are placed (`filesystem-adapter.ts:405,473` via `ensureSafeDirectoryTree`). Project creation (`app/api/projects/route.ts` POST) writes a Supabase row only — **no folder is created anywhere** on project create, and nothing maps to "the operator's desktop" (a desktop client/sync agent does not exist).
- **(c) Delta:** create a per-project folder under `NAS_MEDIA_ROOT` at project creation; expose the folder path in the cockpit; a desktop companion (or at minimum a documented mount convention) for "folders on the operator's desktop"; replace demo seeds with real project loading.
- **(d) XL.** Files: `app/api/projects/route.ts`, `lib/storage/filesystem-adapter.ts`, `lib/storage/config.ts`, `lib/storage/media-root.ts`, `lib/storage/runtime.ts`, `app/(dashboard)/projects/page.tsx`, plus a new desktop/sync component.

### 03 PIPELINE
- **(a) Surface:** two. `PipelineStrip` ("Production pipeline", 4 stage cards Creative/Plan/Sequences/Delivery with state, progress bar, owner, next action — `components/projects/PipelineStrip.tsx:23-57`, rendered in cockpit overview at `components/projects/ProjectCockpit.tsx:1977`); and the "Proposal pipeline" column on `/opportunities` (`app/(dashboard)/opportunities/page.tsx:275-276`). Evidence: `audit/shots/opportunities-1440x900.png` (right column) and `audit/shots/asset-review-1440x900.png` (status chips row).
- **(b) PARTIAL.** The strip holds up visually (clean cards, real progress) but it is a read-only status strip, not the "single clean approval pipeline" board the owner approved — no kanban, no drag, no stage columns. The proposal pipeline has status pills and actions (send / record client approval) which is closer to the spirit.
- **(c) Delta:** a board view (projects or deliverables as cards across stage columns) reusing the existing `PipelineStageSignal` model.
- **(d) M.** Files: `components/projects/PipelineStrip.tsx`, `lib/covideopro/pipeline.ts`, new board component under `components/projects/`, mount in `ProjectCockpit.tsx` or `/projects`.

### 04 CLIENTS
- **(a) Surface:** "Clients (5)" grid at the bottom of `/opportunities` (`app/(dashboard)/opportunities/page.tsx:239-272`). Cards show org initials, industry, contacts, linked projects. Evidence: `audit/shots/opportunities-1440x900.png` (bottom edge, "Clients (5)").
- **(b) PARTIAL.** A client list exists, matching "list of all clients" — but it is the *last* section of a long page, not the first screen; there is no profile drill-in (cards are static articles, only project names link out); and there is no UI to assign people to companies — contacts are displayed (`contact.name` joins) but membership assignment only exists for *workspace members* in settings (`components/auth/IdentitySettings.tsx:401-417`, org membership table), unrelated to client orgs.
- **(c) Delta:** promote Clients to a first-class route (`/clients`); client profile page (contacts, projects, proposals, activity); contact↔organization assignment UI backed by `app/api/organizations` + `app/api/contacts` (both routes exist).
- **(d) M.** Files: new `app/(dashboard)/clients/*`, `app/(dashboard)/opportunities/page.tsx` (extract), `app/api/organizations/route.ts`, `app/api/contacts/route.ts`, nav entry in `components/navigation/navigation-model.ts`.

### 05 STUDIO
- **(a) Surface:** closest is the in-app review workspace at `/projects/[id]?asset=…&view=review` (redirect target of `/projects/[id]/assets/[assetId]`, `app/(review)/projects/[id]/assets/[assetId]/page.tsx`). Evidence: `audit/shots/asset-review-1440x900.png` — player, timecoded comments, review timeline, versions, approvals, live presence.
- **(b) PARTIAL.** As a "revision review space" it is genuinely strong (timecoded commenting, version stacking, approval steps, presence). The other two thirds of the ask are missing: **no mini-NLE** — the cockpit top bar has an "Edit" mode and there is a Sequences surface ("Real assemblies: clips with source and record times, built from transcript selects") with `lib/edit-decisions.ts`, but Sequences is empty in demo (`audit/shots/cockpit-sequences-1440x900.png`) and there is no timeline editor/trim UI; **no bin with server/local project folder access** — media bin is per-project DB records, not a filesystem view (see 02).
- **(c) Delta:** populate/build the Sequences assembly editor (selects→timeline), bin view backed by the storage adapter roots, transcript-driven selects already stubbed in `components/transcript/TranscriptWorkbench.tsx`.
- **(d) XL.** Files: `components/projects/ProjectCockpit.tsx` (Sequences section), `lib/edit-decisions.ts`, `components/transcript/TranscriptWorkbench.tsx`, `lib/storage/*` (bin), player components.

### 06 WHITEBOARD
- **(a) ABSENT.** Verified: `grep -rni "whiteboard" app components lib --include="*.ts*"` → zero matches. No route, no component, no nav entry (`components/navigation/navigation-model.ts:102-226` full list contains no whiteboard).
- **(b) Not at all.** Nothing to screenshot; absence confirmed by grep.
- **(c) Delta:** whole feature — canvas surface, sticky notes/drawing, ideally attached to a project or brief.
- **(d) L (greenfield).** New `app/(dashboard)/whiteboard` or cockpit section, new `components/whiteboard/`, nav registration. (If a tldraw-style library is wanted that is a new dependency — flag for owner decision.)

### 07 BRIEF
- **(a) Surface:** cockpit left rail "Creative" (a.k.a. shortcut "Creative brief") at `/projects/[id]?surface=creative`. Evidence: `audit/shots/cockpit-creative-1440x900.png`.
- **(b) FULL.** This directly answers "the brief maker/creator — whats that look like?": a real authoring UI — Draft brief / Revise brief, form fields for objectives, audience, message, references, deliverables, "Save as v2" versioning with supersede logic and status transitions (`components/projects/ProjectRecordSections.tsx:75-160`, store logic `lib/demo/workspace-store.ts:1769-1800`). Versioned record display (v1 · approved) on the surface.
- **(c) Delta:** none for the complaint itself. (Optional: brief repository browse across projects doesn't exist outside each cockpit.)
- **(d) —** done.

### 08 CALENDAR
- **(a) Surface:** closest are cockpit "Plan" (`/projects/[id]?surface=plan`) and `/field` day chips. Evidence: `audit/shots/cockpit-plan-1440x900.png`, `audit/shots/field-1440x900.png`.
- **(b) PARTIAL leaning ABSENT.** Verified no calendar grid: `grep -rni "calendar" app components lib` returns only lucide icon imports, a "week starts on" preference (`components/auth/IdentitySettings.tsx:827`), and `CalendarDays` used as the *Sequences* icon — no grid component. Plan stores dates (`mm/dd/yyyy` inputs, production days, milestones — screenshot shows "Production days (0)"), and Field shows date chips (08-17 scout, 08-18 principal…), but it is lists-with-dates, exactly the "list pretending" pattern.
- **(c) Delta:** month/week grid rendering production days + milestones + review due dates, fed from the same records Plan and Field already use.
- **(d) L.** Files: new `components/calendar/`, mount in cockpit Plan section and/or new route; data from `lib/demo/workspace-store.ts` (production days, milestones) and `app/(dashboard)/field/page.tsx`.

### 09 NETWORK
- **(a) Surface:** partial — Settings → Organization "Membership and delegation" table (`components/auth/IdentitySettings.tsx:262,401-417`); per-project "Team" shortcut in the cockpit rail (seen in `audit/shots/cockpit-creative-1440x900.png`); presence avatars in review workspace. `components/teams/` (`TeamSettings.tsx`, `RoleManager.tsx`, `TeamInvite.tsx`, `AuditLog.tsx`) exists but is **imported nowhere** (verified: grep for imports of these names outside `components/teams` only hits `app/invite/[token]/page.tsx` via `TeamInviteAcceptance`, a different component).
- **(b) PARTIAL.** There is a people surface, but buried in settings and governance-flavored (roles/delegation), not a network/team directory of who does what across productions. The dedicated teams components being dead code means the intended directory was never wired in.
- **(c) Delta:** a team directory surface (people, roles, project assignments, contact) — likely wire up or replace the orphaned `components/teams/*`; expose per-project team from the cockpit shortcut.
- **(d) M.** Files: `components/auth/IdentitySettings.tsx`, `components/teams/*` (dead code — reuse or delete), new route or cockpit section, `app/api/teams`.

### 10 PRODUCTION
- **(a) Surface:** `/field` — "The shoot day in your pocket — shots, releases, clearances" (`app/(dashboard)/field/page.tsx`; nav `navigation-model.ts:167-174`). Evidence: `audit/shots/field-1440x900.png`.
- **(b) PARTIAL (closest to FULL of the "isnt what it says it is" trio).** Unlike the rejected prototype, this surface *is* what it says: per-project shoot days with call/wrap times and status, locations & clearances (agreement signed/sent, cleared/restricted counts), and unit/crew list with roles and day counts. Gaps: it's a day-list, not a production tracker across stages; "Mark in progress" is the only action; no shot list UI despite "shots" in the tagline.
- **(c) Delta:** shot-list capture, release/clearance document attachment, tie day status back into cockpit Plan milestones.
- **(d) S–M.** Files: `app/(dashboard)/field/page.tsx` (289 lines, self-contained), demo store fields for days/clearances.

### 11 ASSETS
- **(a) Surface:** `/library` Media library + cockpit "Media" section. Evidence: `audit/shots/library-1440x900.png`.
- **(b) PARTIAL.** The surface is honestly named — cross-project asset search with type filters (All/Video/Image/Audio/Document), stats (8 assets, 4 projects, 5 in review queue, 2 approved), click-through to project. Two live defects: **all thumbnails render blank** in the demo (8 empty tiles, screenshot) — the poster frames don't load; and the library is metadata-only (no file path, no storage location, no NAS linkage — ties back to 02).
- **(c) Delta:** fix thumbnail/poster serving in demo mode; add storage location/folder affordance; batch actions.
- **(d) S–M.** Files: `app/(dashboard)/library/page.tsx` (267 lines), demo asset seed `lib/demo/workspace-store.ts` (thumbnail URLs), possibly `app/api/media` for poster route.

### 12 POST
- **(a) Surface:** partial — post-production exists only as (i) a computed pipeline stage (`components/projects/ProjectCockpit.tsx:704,739-741`, `"post-production"` progress from review-asset ratio) and a lifecycle drawer stage (`components/cockpit/CoProduceLifecycleDrawer.tsx:31`), plus (ii) de-facto post surfaces: Sequences (assembly), Versions, Delivery. There is no surface named Post.
- **(b) PARTIAL.** Post-production work *happens* here (review/versions/delivery) but no surface owns the name, so the owner's "I dont even know what this is?" would repeat: post is scattered across cockpit sections with no single doorway. Also note Sequences is empty in demo, so the most NLE-like post surface shows nothing.
- **(c) Delta:** name a Post surface (or rename Delivery/Sequences grouping) that aggregates: cut under review, open change requests, version stack, export/delivery readiness (`lib/storage/delivery-readiness.ts`, `lib/storage/release-readiness.ts` already exist as data sources).
- **(d) M.** Files: `components/projects/ProjectCockpit.tsx`, `components/cockpit/cockpit-navigation.ts`, readiness libs above.

### 13 REVIEW
- **(a) Surface:** YES — two tiers. Client-facing portal `/review/[token]` (evidence: `audit/shots/review-demo-1440x900.png`: branded portal, review player with timeline feedback markers, comment+approval flow, staged decisions "Step 1 Client Lead / Step 2 Content Co-op Producer", approve / approve-with-changes / request-changes). Internal workspace at `/projects/[id]?asset=…&view=review` (evidence: `audit/shots/asset-review-1440x900.png`: player, timecoded comment composer, review timeline, comments/approvals/transcript/share status chips, live presence). Reachability: `/reviews` top-level nav lists all review links (`audit/shots/reviews-1440x900.png`), "Open review" button on `/projects`, cockpit rail "Reviews".
- **(b) FULL.** This *is* the Wipster-class product, and it's reachable from primary nav, project library, and cockpit. It is the strongest surface in the app. Two caveats carried from slot 01: the portal prints usage instructions ("Review flow 1/2/3") verbatim on the client surface, and the workspace status row includes demo-noise chips ("Browser online only", "Not used in demo").
- **(c) Delta:** none for existence/reachability. Polish: remove instructional block + demo-noise chips from client-facing surface.
- **(d) —** done (cleanup is S, folded into slot 01 fix).

### 14 REPORTING
- **(a) Surface:** partial — `/activity` ("Production activity", audit trail with event/comment/version/approval counters and filterable trail; `app/(dashboard)/activity/page.tsx`; evidence `audit/shots/activity-1440x900.png`). A reporting stack exists in code — `components/analytics/ProjectDashboard.tsx`, `ReviewerStats.tsx`, `AssetTimeline.tsx`, `ExportReport.tsx` (+ PDF comment-report route `app/api/analytics/export/pdf/route.ts:159`) and `components/usage/*` — but **none of these components are imported anywhere** (verified: `grep -rn 'from "@/components/analytics' app components` and same for `usage` return zero importers outside their own dirs). Dead code.
- **(b) PARTIAL.** Audit trail: yes, live and clean (and mercifully free of the rejected green-check styling — verdict chips are plain text). Reporting/analytics dashboard: **no reachable surface**. The owner's complaint was about presentation clutter; this app's risk is the opposite — the reporting exists but is unwired.
- **(c) Delta:** wire `ProjectDashboard`/`ReviewerStats`/`ExportReport` into a reachable route (cockpit section or `/activity` tab), or delete the dead code; add green-check-free status styling per owner taste.
- **(d) M.** Files: `components/analytics/*`, `components/usage/*`, `app/(dashboard)/activity/page.tsx`, `app/api/analytics/export/pdf/route.ts`, `components/cockpit/cockpit-navigation.ts` (if added as cockpit section).

---

## Cross-cutting findings

1. **Instructional copy is the app's systemic flavor of the owner's #1 complaint.** No green check marks anywhere (good), but sentence-length explanatory subtitles sit under nearly every H1 (`/opportunities:117`, `/library`, `/activity`, cockpit section headers), and the client review portal prints a 3-step how-to (`PublicReviewWorkspace`). One shared pass could strip or collapse these.
2. **Dead component clusters:** `components/analytics/*` (4 files), `components/usage/*` (3 files), most of `components/teams/*` are written but unreachable. Either wire them in (cheap wins for slots 09 and 14) or remove.
3. **NAS story is half-built:** `ccnas` storage provider is real, env-gated, and path-safe; but project creation never makes folders and there is no desktop-side story — the owner's central "app acts like a server connected to client folders" vision is an architectural gap, not a polish gap (XL).
4. **Broken demo thumbnails** on `/library` undermine the ASSETS surface at demo time.
5. **Strongest assets (don't rebuild):** the review portal + in-app review workspace (13), brief authoring (07), Field (10), and the cockpit shell itself already match the owner's taste for clean, text-light, working surfaces.
