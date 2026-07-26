# CO-VIDEOPRO — MEGA BUILD PROMPT & COMPLETE SURFACE/BUTTON MAP

> **What this is.** A single copy-paste prompt for an AI build agent (Codex seat, Claude Code, or equivalent) to **finish and ship Co-VideoPro at `co-videopro.com`**. It is grounded in the *actual* code of `cco-videopro-definitive-20260715` as of 2026-07-17 — every surface, every button, exactly where it is and exactly what it does, plus the exact gaps between "renders" and "production-ready." Nothing here is invented; every non-trivial claim carries a `file:line` anchor.
>
> **How to use it.** Paste §0–§9 into the builder. It is written in the second person ("you"). The builder's job is to bring the app from *demo-truthful* to *production-truthful* and deploy it, without ever shipping a fake surface. Do not delete the demo runtime — it is the local source of truth.

---

## 0. PRIME DIRECTIVES (read first, they override everything below)

1. **One Project Operating Record.** Every surface is a *view* into one project record spanning `inquiry → archive`. No module keeps a private copy of project truth.
2. **No fake surfaces.** A nav item, tab, or button exists only if its behavior is real (persisted, permission-aware, stateful). If you can't make it real this pass, **remove it** — do not leave it decorative. This is the #1 rule and the most common current violation (see §7-A/§7-B).
3. **Dual runtime, one model.** The local **demo** runtime (localStorage) and the **remote** Supabase runtime enforce the *same* entity shapes and the *same* state machines from the same framework-free `lib/` validators. Demo is a truthful runtime, never a mock screen.
4. **Explicit transitions only.** No status field is ever written outside its transition validator in `lib/covideopro/transitions.ts`. Every transition writes an `activity_log` event (actor, before/after, source surface).
5. **Ship honesty.** Tests green (`npm test`), `tsc --noEmit` clean, `npm run build` passes with **no NAS mount**, and the surface you claim to have built renders HTTP 200 and behaves as specified. If a step is skipped, say so.
6. **No push / no deploy without the go signal.** Commit locally; do not `git push` or trigger Coolify until the human approves. (Repo doctrine: Claude orchestrates, seats build, Bailey gives the cutover go.)

---

## 1. MISSION

Co-VideoPro is an **AI-native video-production operating system** for an enterprise video studio (Content Co-op). It is a single Next.js app that carries a production from first inbound inquiry, through creative brief + priced proposal + approval, planning + shoot, media ingest + transcript + edit, client review + consolidated feedback + approval, to QC + delivery + payment + archive. It is *Frame.io + a production CRM + a proposal/estimate engine + a truthful NLE-lite*, unified under one lifecycle record.

**Baseline reality (verified 2026-07-17):** the app is deep and largely working in **demo mode**: full global shell, 10 dashboard surfaces, a 2,444-line project cockpit with 12 lifecycle sections, a real public review workspace with a real HTML5 player, a real transcript→selects→sequence→render editorial chain (with a *playing, trimmable, splittable, EDL-exporting* timeline), a real tus chunked-upload pipeline, and a validated entity model with unit-tested transitions. **What is NOT done:** most mid-lifecycle record sections are demo-only (no remote Supabase API), migration `014` is authored but unexecuted, a dozen components are built-but-orphaned, several buttons are decorative placeholders, remote mode hard-codes owner role + identity, and the deploy contract still says "co-deliver." **Your mission is to close those gaps and ship at `co-videopro.com`.**

---

## 2. STACK, REPO, RUNTIME

- **Repo:** `~/Desktop/Projects/contentco-op/cco-videopro-definitive-20260715`, branch `codex/co-videopro-definitive-20260715`. Isolate your diff from baseline `e068ee8`.
- **Framework:** Next.js `16.2.10` (App Router), React `19.2.3`, TypeScript `5.9`, Node `>=20.9`.
- **Styling:** Tailwind `4.2.1` (`@import "tailwindcss"` in `app/globals.css`) + a large CSS-variable design system in the same file. Icons: `lucide-react 0.575`.
- **Data/back end:** Supabase (`@supabase/ssr 0.8`, `@supabase/supabase-js 2.98`). Media: `@tus/server 2.4.1` + `tus-js-client 4.3.1`, `hls.js 1.6.15`, FFmpeg worker pipeline. State: `zustand 5.0.11`. Extras: `konva`+`react-konva` (annotations, currently orphaned), `recharts` (analytics, orphaned), `qrcode`, `jszip`, `marked`, `file-saver`, `nanoid`.
- **Scripts:** `dev` (`next dev --port ${PORT:-4103}`), `build`, `start`, `lint`, `test` (`node --test tests/*.test.ts`), `test:e2e` (Playwright), `typecheck` (`tsc -p tsconfig.json --noEmit`).
- **Runtime selection** (`lib/demo/mode.ts:5-31`): demo mode is ON when the URL carries `?demo=1`, **or** (dev only) when `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` are absent. `useDemoSuffix()` returns `"?demo=1"` (demo) or `""` (remote), and is threaded through every internal link via `withWorkspaceQuery(href, suffix)`.
- **Demo persistence:** localStorage key **`co-videopro.workspace.v2`** (`workspace-store.ts:106`), with a one-time read of legacy `co-deliver.demo-workspace.v1` (`:107, 781-784`). Cross-tab sync via the `storage` event; store consumed through `useDemoWorkspace()` (`useSyncExternalStore`).
- **Deploy target:** canonical public host **`https://co-videopro.com`** (the `/welcome` page already prints `co-videopro.com`). Health at `/api/health` (+ `/api/health/live|ready|dependencies`). Coolify webhook rebuild from GitHub `main`. **NOTE:** `DEPLOY_CONTRACT.md` still names "co-deliver" / `deliver.contentco-op.com` — renaming it is a work item (§7-D).

---

## 3. DESIGN SYSTEM (exact tokens — do not restyle; reuse)

From `app/globals.css`. **Dark is the app default; light theme applies on `html[data-theme="light"]`; the project cockpit forces light.** There is currently **no theme toggle in the chrome** — dark mode is only reachable in demo mode via Settings → Preferences (§6.9). Decide (§7) whether to surface a real toggle.

**Dark theme (`:root`):** `--bg #080a0d` · `--bg-elevated #0d1116` · `--surface #12171d` · `--surface-2 #181f27` · `--surface-3 #222b35` · `--ink #edf3ff` · `--ink-secondary #c9d4e2` · `--muted #91a0b4` · `--dim #627083` · `--border rgba(255,255,255,.1)`.
**Accent (signature lime/chartreuse):** `--accent #b9ff77` · `--accent-hover #9fe65f` · `--accent-dim rgba(185,255,119,.11)` · `--accent-glow rgba(185,255,119,.18)`.
**Status hues:** `--blue #7ca8d8` · `--orange #e4ad5b` · `--red #de7676` · `--purple #a855f7` · `--teal #14b8a6` · `--green #22c55e` · `--coral #f97316` · `--pink #ec4899`.
**Light theme (`html[data-theme="light"]`):** `--bg #edf1f4` · `--surface #ffffff` · `--ink #121d2a` · `--accent #76c943` / hover `#66b438` · `--blue #286eb5` · `--green #14694e`.
**Shape/motion:** `--radius 8px` (`-sm 6px`, `-lg/-xl 8px`) · shadows `--shadow-sm/md/lg/xl` · `--transition-fast 150ms` / `--transition 200ms` / `--transition-slow 300ms` (all `cubic-bezier(.4,0,.2,1)`).
**Type:** `--font-display "Manrope"` (600/700/800) · `--font-body "Inter"` (400/500/600/700), loaded from Google Fonts in `app/layout.tsx`. Body line-height 1.5, antialiased.
**Shell metrics:** workspace header height 72px desktop / 64px ≤760px; header grid columns `224px auto minmax(220px,1fr) auto`; nav-drawer width `min(340px,92vw)`; command palette `min(680px,100%)`.

**Brand assets** (`components/brand/CoProductionBrand.tsx`, served from `/public/brand/`):
- horizontal **`/brand/cvp-long.png`** (730×187) — the default chrome lockup (header, drawer, auth, welcome).
- stacked **`/brand/cvp-stacked.png`** (1600×852) — welcome hero.
- compact mark **`/brand/cvp-mark.png`** (786×565) — cockpit compact.
- Default alt/label: **"Co-VideoPro by Content Co-op."** Chrome lockup width var `--co-production-brand-width` 164px desktop → 118px at the smallest breakpoint.
- Metadata (`app/layout.tsx:4-19`): `title "Co-VideoPro | Content Co-op"`, `description "All-in-one video production workspace for planning, review, approval, editing, and delivery."`

---

## 4. INFORMATION ARCHITECTURE (three layers)

**Global layer (the company)** — persistent shell chrome; nav model in `components/navigation/navigation-model.ts`, icons in `navigation-icons.ts`:

| Group | Label (shortLabel) | Route | lucide icon | Capability gate | In desktop bar? |
|---|---|---|---|---|---|
| Operate | Home | `/` | House | `home:read` | ✓ |
| Operate | Projects | `/projects` | FolderKanban | `projects:read` | ✓ |
| Operate | Opportunities (Pipeline) | `/opportunities` | Target | `opportunities:read` | ✓ |
| Create | Reviews | `/reviews` | MessageSquareText | `reviews:read` | ✓ |
| Create | Media library (Library) | `/library` | LibraryBig | `media:read` | ✓ |
| Workspace | Activity | `/activity` | Activity | `activity:read` | ✓ |
| Workspace | Archive | `/projects/archive` | Archive | `projects:read` | drawer/palette only |
| Workspace | Trash | `/projects/trash` | Trash2 | `projects:read` | drawer/palette only |
| Administration | Workspace settings | `/settings` | Settings | `workspace:manage` (owner) | drawer/palette only |
| (palette action) | New project | `/projects/new` | Plus | `projects:create` | palette only |

**Capability→role matrix** (`navigation-model.ts:47-99`) — roles: owner, producer, editor, reviewer, viewer. Owner has all; producer all but `workspace:manage`; editor loses `opportunities:*` + `workspace:manage`; reviewer/viewer are read + comment/approve only. **CRITICAL GAP:** in **remote mode the role is hard-coded to `owner`** (`Shell.tsx:63`) and identity to a fixed demo owner (`Shell.tsx:69-72`) — capability gating is only *exercised* in demo. Fix in §7-C.

**Project layer (one production)** — the cockpit at `/projects/[id]`, which **bypasses the global shell entirely** (`Shell.tsx:189-191` returns bare children; the cockpit supplies its own chrome). Sections are URL-addressed by **`?surface=<id>`** (not `?section=`), plus a special `?view=review` full-review mode and `?asset=<id>` selector.

**Workspace layer (immersive tools)** — public review workspace (`/review/[token]`), the cockpit review mode, the sequence timeline, the transcript workbench.

---

## 5. ENTITY MODEL & STATE MACHINES (the behavior spec behind every button)

Source of truth: `lib/covideopro/record.ts` (shapes) + `lib/covideopro/transitions.ts` (validators). **Every status button below drives exactly one of these edges; never assign a status directly.**

**Project stage (spine)** — `inquiry → intake → development → preproduction → production → post → review → delivery → archived`. One step forward only; never silently regress. Gates (`transitions.ts:344-393`): intake⇐org+contact; development⇐brief exists; preproduction⇐approved proposal; production⇐scheduled production_day; post⇐≥1 sequence; review⇐active review link; delivery⇐final approval + ≥1 specced deliverable; archived⇐all deliverables delivered/expired.

| Entity | Status values | Key transitions & guards |
|---|---|---|
| **Inquiry** | new, triaged, qualified, converted, declined | new→triaged/declined; triaged→qualified/declined; qualified→converted/declined. qualified⇐org+contact; converted⇐project_id |
| **Brief** | draft, in_review, approved, superseded | draft→in_review (⇐objectives); in_review→approved (⇐audience+message)/draft; approved→superseded. Versions immutable (`brief_versions`) |
| **Proposal** | draft, in_review, sent, approved, declined, superseded | draft→in_review→sent (⇐≥1 non-optional line, qty>0, rate≥0)→approved (⇐actorEmail)/declined; approved→superseded (change order) |
| **EstimateLine** | — | `total = qty·rate·(1+markup/100)`; optional lines excluded from required total. Categories: crew/equipment/travel/post/deliverable/other |
| **PlanItem** | pending, in_progress, done, blocked | kinds: milestone/task/production_day (status set directly, no validator) |
| **Select** | — | `out>in`, `in≥0`. source: transcript/review/manual, carries `transcript_segment_ids[]` |
| **Sequence** | draft, in_review, approved, locked | draft→in_review (⇐≥1 clip + linked review version)→approved→locked. `created_from`: manual/transcript-assembly |
| **SequenceClip** | — | out>in on source & timeline; **source and timeline durations must match** (no speed change, tol .001) |
| **RevisionRequest** | open, in_progress, addressed, verified | verified blocked while unresolved comments >0 unless waived; `round = max+1` per asset |
| **Decision** | (impl) pending, in_progress, done, wont_do | source: review/comment/meeting/hermes |
| **Deliverable** | specced, encoding, qc, ready, delivered, expired | qc⇐frozen `source_version_id`; ready→delivered/expired. spec: resolution/codec/aspect/captions/audio/watermark |
| **PaymentMilestone** | pending, checkout_created, paid, void | checkout_created⇐method=checkout; pending→paid⇐method=manual. kinds: deposit/balance |
| **ProductionDay** | scheduled, in_progress, wrapped, cancelled | scheduled→in_progress→wrapped; cancelled→scheduled |
| **Location** | none, drafted, sent, signed | agreement chain |
| **Release** | unsent, sent, signed | feeds a "chase list" of unsigned releases near shoot |
| **CallSheet** | — | `version = max+1` per production day |
| **NotificationOutboxItem** | queued, dry_run_sent, pending_provider, failed | provider-neutral; dry-run default (no live send until wired) |
| **Organization / Contact** | — | workspace-scoped CRM, no status |

**Demo seed slate** (`lib/demo/workspace.ts` + `lib/demo/record-seed.ts`) — 5 projects across stages: `ica` (review), `schneider-epc` (post), `bp` (production), `conexon` (development), `el-paso` "Physical Edge — El Paso" (preproduction); 5 orgs, 6 contacts, 2 inquiries (HLSR new, Wendy's triaged), 3 briefs, 2 proposals (ICA approved w/ 6 lines, Conexon sent), 6 plan items, 3 selects + 1 draft sequence (`seq-pod-radio-cut`, 3 clips) on `mclaren-podcast-v3` (has a real `file_url`), 1 revision round, 1 decision, 2 deliverables, 2 payment milestones, 2 outbox items, and the full El Paso production block (5 production days, 3 crew, 3 locations, 3 releases). **No ACS content** — keep it that way.

---

## 6. COMPLETE SURFACE & BUTTON MAP

Legend: **[LIVE]** works in both runtimes · **[DEMO]** demo-only (remote shows empty/placeholder) · **[REMOTE]** wired to an API · **[PH]** placeholder/no-op/disabled · **[ORPHAN]** built but imported nowhere · **[ROLE:x]** gated by capability x. Positions are literal.

### 6.1 GLOBAL SHELL — persistent on every dashboard route (NOT the cockpit) · `components/Shell.tsx`

**Top bar** (grid `224px auto minmax(220px,1fr) auto`, height 72px):
- **Hamburger** (`Menu` 19) — brand cell far-left, **≤760px only** — opens nav drawer (`setNavigationOpen(true)`). [LIVE] `Shell.tsx:199-211`
- **Brand lockup** "Co-VideoPro home" (`cvp-long.png`) — left — `Link`→`/` (carries demo suffix). [LIVE] `:212-214`
- **Desktop primary nav** — center-left — Home / Projects / Pipeline links (icon-only ≤900px, hidden ≤760px), `data-active`+`aria-current`. [LIVE][ROLE per item] `WorkspaceNavigation.tsx:66-81`
- **Global search button** "Search commands, projects, and media" (`Search` 18) — header center — opens **Command palette** (`setCommandOpen(true)`); shows a green/orange connectivity dot; collapses to a 40px icon ≤900px. Also ⌘K/Ctrl+K. [LIVE] `:232-242`, keydown `:154-162`
- **Help** (`CircleHelp` 19) — actions cluster left — `mailto:hello@contentco-op.com` (hidden ≤760px). [LIVE, static mailto] `:245-252`
- **Notifications bell** (`Bell` 19) — actions middle — toggles popover; red dot when `demoWorkspace.activity.length>0`. [LIVE toggle / **PH data** — reads demo seed even in remote, not wired to `/api/notifications`] `:255-269`
- **Account button** (initials avatar + `ChevronDown` 14) — actions far-right — toggles account menu. [LIVE] `:291-306`
- **Skip link** "Skip to workspace content" (focus-only, top-left) → `#workspace-content`. [LIVE] `:195`
- **Offline notice** (`WifiOff` 15, sticky, top of `<main>`) — "Offline. Changes that require the server are paused." when `!navigator.onLine`. [LIVE] `:349-353`

**Notifications popover** (`#workspace-notifications`): header **"View all"** `Link`→`/activity`; up to 3 activity rows (each `Link`→`/activity`, text `{actor} {activityLabel(action)}`); empty "No new notifications." [LIVE routing / **PH data source**] `:270-288`

**Account menu** (`#workspace-account-menu`): name+email header (**hard-coded identity in remote**); role line; **"View as" role `<select>`** owner/producer/editor/reviewer/viewer (re-gates nav live) **[DEMO only]** `:319-334`; **Profile** (`User`)→`/settings?section=account`; **Preferences** (`Settings`)→`/settings?section=preferences`; **Log out** (`LogOut`) → demo `signOutDemoSession()`+`/login?demo=1`, remote `supabase.auth.signOut()`+`/login`. [LIVE] `:335-341`

**Nav drawer** (slide-over, focus-trapped): **Close** (`X`); **"Search workspace"** (opens palette); **Recent projects** collapsible (up to 6, **[DEMO]**); one collapsible section per nav group with icon+label+description rows; footer "Co-VideoPro workspace · {role}". [LIVE][ROLE] `WorkspaceNavigation.tsx:104-209`

**Command palette** (`CommandPalette.tsx`, ⌘K): search input (fuzzy `rankCommands`, arrow-nav, Enter runs); **Close** (`X`); result options = **New project** action `[ROLE:projects:create]` + every visible nav item + (demo) every project + (demo) every asset; empty "No commands or media match this search." [LIVE / project+media entries **DEMO**] `:80-131`

**Mobile bottom bar** (≤760px): Home / Projects / Pipeline + **More** (opens drawer). [LIVE] `WorkspaceNavigation.tsx:83-102`

> **Orphaned shell candidates — resolve in §7-A:** `components/SearchModal.tsx` (dead, superseded by palette), `components/UploadMonitor.tsx` (dead — the only "processing" panel, not mounted), `components/notifications/NotificationBell.tsx`+`NotificationList`/`Item` (not used by shell). There is **no theme toggle** and **no live upload/processing indicator** in the chrome.

### 6.2 AUTH & ENTRY

**`/welcome`** (`app/welcome/page.tsx`) — marketing front door, server component, static. Nav **"Sign in"**→`/login`; CTA **"Open the workspace"** (`ArrowRight`)→`/login?demo=1`. H1 "We turn ideas into impact."; `cvp-stacked.png` hero; badges "Media center stage / Agents take the forms / You keep the craft / Self-hosted, always"; prints `co-videopro.com`; 4 pillar cards (Production planning / Media & transcript / Edit & review / Delivery & payments); footer "CREATE · CONNECT · CONVERT". [LIVE static]

**`/login`** (`app/login/page.tsx`) via `AuthShell`: context "Account access" (`ShieldCheck`) + "Demo" badge; H1 "Sign in to Co-VideoPro"; surface-mismatch alert (non-demo); error alert (`authFailureMessage`); **Email** (demo prefills session email); **Password** (`type=password`, demo default "demo") + **Show/Hide** (`Eye`/`EyeOff`); **Submit** "Sign in"/"Open local workspace"/"Signing in…" — demo `signInDemoSession(email)`+replace(returnPath+demo); remote `POST /api/auth/login`; footer **"Create an account"**→`/signup`. [LIVE] `login/page.tsx:86-184`

**`/signup`** (`app/signup/page.tsx`): success panel ("Your workspace is ready"/"Verify your account"); **Back to sign in**; **Name** (max 120), **Email**, **Password** (`minLength 6`), **Confirm**, **Show/Hide**; hint "At least 6 characters"; **Submit** "Create account" — demo `registerDemoAccount`, remote `POST /api/auth/signup` (503→"temporarily unavailable"). [LIVE] `signup/page.tsx:109-247`

**`/invite/[token]`** (`TeamInviteAcceptance.tsx`): states loading/unauthorized/ready/error/complete. Unauthorized → **"Sign in"**→`/login?next=/invite/{token}`. Ready → readiness strip (Workspace/Role/Expires) + **"Accept invitation"** (`PATCH /api/teams/invites`→`/projects`) + **"Decline"**. [LIVE][REMOTE] `TeamInviteAcceptance.tsx:125-257`

**`/auth/callback`** (`route.ts`): OAuth code exchange, sanitizes `next`, `exchangeCodeForSession`, role/surface checks, 303 redirect, `Cache-Control:no-store`. [LIVE][REMOTE]

### 6.3 HOME — `/` (`app/(dashboard)/page.tsx`) · attention queue

Layout: header (greeting + open-loop count + 2 buttons) → "Productions by stage" card grid → two columns: "Needs you" attention list (left) + "Latest media" strip (right). **Remote mode = a single empty state (`page.tsx:110-122`) — HOME IS DEMO-ONLY.**
- **"Inquiry"** (`Plus`) — header right — `Link`→`/opportunities?compose=inquiry`. [DEMO] `:136`
- **"Project"** (`Plus`) — header right — `Link`→`/projects/new`. [LIVE] `:137`
- **Production stage cards** (grouped by stage) — `Link`→`/projects/{id}`. [DEMO] `:145-179`
- **Attention rows** (≤6) — `Link`→ item.href (`/opportunities`, `/projects/{id}?surface=proposal|reviews|delivery|plan`). [DEMO] `:188-197`
- **"All N open loops"** (`ArrowRight`, when >6) — `Link`→`/activity`. [DEMO] `:201-205`
- **Latest-media thumbnails** (≤6) — `Link`→ asset href. [DEMO] `:213-226`
- Empty (remote): "Home works with the local workspace" + **"Open projects"**→`/projects`.

### 6.4 PROJECTS LIST — `/projects` (`app/(dashboard)/projects/page.tsx`) · production library

Layout: left `FolderTree` rail → main: header (title + 3 buttons) → 4 readiness stat cards → 4-step lifecycle strip → status strip → (conditional) selection bar → `ProjectToolbar` → (conditional) inline new-workspace input → content (skeleton/empty/`MediaTable`/`MediaCard` grid). Demo uses store; remote fetches `/api/projects`,`/api/folders`,`/api/assets`. Row/card action menus are **[DEMO]** (passed `undefined` in remote).

**Folder rail** (`FolderTree.tsx`): **Library/Bookmarks `<select>`**; **Collapse** (`PanelLeftClose`); per-row **expand chevron** + **folder button** (`onFolderSelect` or `Link`→`/projects/{id}`); footer **Archive**→`/projects/archive`, **Trash**→`/projects/trash`. [LIVE]
**Header:** **Toggle rail** (`Menu`); **"New workspace"** (`Plus`)→`/projects/new`; **"Upload media"/"Uploading…"** (`Upload`) — demo `addDemoAssets`, remote Supabase Storage `deliverables` bucket + `POST /api/projects/{id}/assets`; **"Open review"** (`MessageSquare`)→ first asset href. [LIVE] `:398-440`
**Selection bar** (≥1 selected): **"Share for review"** (`Share2`)→ `DemoShareModal`; **"Cancel"**. [DEMO] `:520-533`
**Toolbar** (`ProjectToolbar.tsx`): **Search** input; **Sort `<select>`** (A–Z/Created); **Select-all checkbox**; **Batch actions** (`CheckSquare`) — **[PH: no handler]** `:92-94`; **"New workspace"** (`FolderPlus`); **Upload split button** — main Upload [LIVE] + chevron menu whose only item **"Cloud import not connected"** is **[PH: disabled]** `:126-138`; **View toggle** (Masonry/Grid/Table); **Thumbnail-size slider**. [LIVE except noted]
**Inline new-workspace:** Name input + **"Create workspace"** (demo `createDemoProject` / remote `POST /api/projects`) + **"Cancel"**. [LIVE]
**Table** (`MediaTable.tsx`): header select-all; per row select checkbox, thumbnail `Link`, title `Link`, **actions** (`MoreHorizontal`) → **Open review** [LIVE] / **Share for review** / **Archive** (`archiveDemoAsset`) / **Move to Trash** (`moveDemoAssetToTrash`) **[DEMO]**.
**Card** (`MediaCard.tsx`): same actions.
**Share modal** (`DemoShareModal.tsx`, **[DEMO]**): Close; Step 1 deliverables (Select all/Clear, per-asset checkbox); Step 2 handoff (4 intent radios Internal/Client/Approval/Final; Reviewer name/email; Expiration date; View-limit number; Identify reviewers/Watermark/Allow download checkboxes); Step 3 notify (Email/Text/iMessage checkboxes, disabled unless enabled in settings); footer **Cancel** + **"Create N link(s)"** → `createDemoShareLinks`; success view (**Copy all**, per-link **Copy**/**Open**, **Create more**, **Done**).
**Empty state:** skeletons; FolderOpen + title/desc; CTAs **"New workspace"** (only when 0 projects) + **"Upload Media"**; `demo-toast` confirmations.

**`/projects/new`** (`projects/new/page.tsx`): **Back**→`/projects`; **"Activity trail"**→`/activity`; **Project name** (required), **Client/company**, **Brief** textarea, **Business context** textarea; **"Create workspace"** (`ArrowRight`) — demo `createDemoProject`→`/projects/{id}?demo=1`, remote `POST /api/projects`; **"Cancel"**. Right aside is informational. [LIVE]
**`/projects/archive`** & **`/projects/trash`** (`DemoAssetCollection.tsx`): **Back**→`/projects`; **"Open library"**→`/projects`; per-row **"Restore"** (`RotateCcw`) → `restoreDemoArchivedAsset`/`restoreDemoAsset`; empty-state return link. Permanent delete intentionally not exposed. [DEMO] `:64-162`

### 6.5 OPPORTUNITIES — `/opportunities` (`app/(dashboard)/opportunities/page.tsx`)

**Remote mode = empty state (`:96-109`) — DEMO-ONLY.** `?compose=inquiry` opens the composer. Layout: header (title + "New inquiry") → toast → composer → two columns: Inbox + Clients (left), Proposal pipeline (right).
- **"New inquiry"** (`Plus`) — toggles composer. `:121-123`
- **Composer:** summary textarea; **Source `<select>`** (Website/Referral/Repeat/Direct); Org/Contact name/Contact email; **"Save inquiry"** (`addInquiry`); **"Cancel"**.
- **Per-inquiry actions** (state-dependent): **Triage** / **Qualify** / **Convert to project** (→ name field → **Create project** `convertInquiryToProject` / **Cancel**) / **Decline** — all `setInquiryStatus`. `:213-230`
- **Client cards:** project names `Link`→`/projects/{id}`.
- **Proposal pipeline:** **Send to internal review** / **Mark as sent to client** / **Record client approval** (`setProposalStatus`); **Open in project**→`/projects/{id}?surface=proposal`. `:293-321`
- Empty: "Inbox zero". *(Note: discovery imports exist but no discovery UI on this page — see §7-B.)*

### 6.6 REVIEWS — `/reviews` (`app/(dashboard)/reviews/page.tsx`) · review-link tracker

Layout: header (title + 2 buttons) → 4 readiness cards → filter tabs → links table → details modal. Demo uses `shareLinks`; remote fetches `/api/sharing`. **Active toggle is [DEMO].**
- **"Create from cockpit"** (`Plus`) → demo `/projects/bp?asset=bp-rodeo-v2&view=review&demo=1`, remote `/projects`. `:155-161`
- **"Open projects"** (`MessageSquare`)→`/projects`.
- **Filter tabs:** "All links" / "Created by me".
- **Row** (clickable→details modal); **Copy** (`Copy`, clipboard); **Open review** (`ExternalLink`, new tab); **Active toggle** [DEMO].
- **Details modal:** Close; Active toggle; read-only Share-Link input + Copy.
- Empty: Link2 + "No review links yet" + **"Open review cockpit"**.

### 6.7 LIBRARY — `/library` (`app/(dashboard)/library/page.tsx`) · read-only asset browser

Layout: header (title + "Upload in project") → 4 readiness cards → search + file-type filters → asset grid. Demo maps `assets`; remote fetches `/api/assets`.
- **"Upload in project"** (`Upload`)→`/projects` (no upload here). `:139-145`
- **Search** input; **file-type buttons** all/video/image/audio/document (`aria-pressed`).
- **Asset cards** → `Link`→ asset href / `/projects/{project_id}/assets/{id}`.
- Empty: LibraryBig + message + **"Open projects"**. [LIVE][REMOTE]

### 6.8 ACTIVITY — `/activity` (`app/(dashboard)/activity/page.tsx`) · audit trail

Layout: header (title + 2 buttons) → 4 readiness cards → trail card: filter tabs → event rows. Demo uses `activity`; remote fetches `/api/activity`.
- **"Review cockpit"** (`MessageSquare`); **"Upload media"** (`Upload`)→`/projects`.
- **Filter tabs:** All / Comments / Approvals / Uploads / Audit (client-side).
- Event rows non-interactive (time/actor/action/kind).
- Empty: BellRing + "No production activity yet" + **"Open project cockpit"**; filter-empty: Clock + "No matching activity". [LIVE][REMOTE]

### 6.9 SETTINGS — `/settings` (`app/(dashboard)/settings/page.tsx`) · 7 tabs

`?section=` drives the tab (kept in URL). Left vertical tablist: **Account, Organization, Security, Preferences, Notifications, Systems, Brand**. **Nearly all write controls are `disabled` unless demo mode**; remote submits early-return with a notice, except `NotificationPreferences` (real API) and the Org audit JSON export (client blob).
- **Account** (`IdentitySettings.tsx`): First/Last name, Role title, **Email** (read-only **[PH]**), **"Save profile"**; 12 reviewer-color swatches. [DEMO]
- **Organization:** Active-workspace `<select>`; Org/Workspace name + **"Save names"** `[ROLE]`; delegation checkboxes `[ROLE owner]`; 3 feature-flag toggles `[ROLE]`; **"Export JSON"** (client blob) `[ROLE:audit.export]`.
- **Security:** MFA/Idle/Session `<select>`s + "Require approval" toggle `[ROLE:policy.manage]`; Password-auth toggle `[ROLE + SSO verified]`; per-session **"Revoke"**; provider-readiness list **[PH display]**.
- **Preferences:** **Dark interface** / Reduced motion / High contrast toggles; Locale/Time zone/Week-start `<select>`s; **"Reset"→"Confirm reset"** (local workspace reset). [DEMO] *(this is the only path to dark mode today.)*
- **Notifications:** demo → per-channel enable toggle + 3 event checkboxes; Email digest `<select>`; Text (E.164 validation, "Save number"); iMessage dry-run toggle. **Remote → `NotificationPreferences.tsx`: "Save" (`PUT /api/notifications/preferences`), per-event In-app/Email toggles + Email-frequency `<select>` across 9 event types (`GET` on load).** [LIVE both, this is the one settings area wired remote]
- **Systems** (`StudioSystemsSettings.tsx`): group filter segment; **"Health check"**→`/api/health/ready`; 16-row capability matrix with REAL health links (`/api/health/dependencies|ready|live`) + **[PH toast-only]** buttons (Review suggestions/Open proposals/Review policy) + **[PH disabled]** buttons (Connect repo/Add remote/Open plugins/Start session/Run probe/Choose source/Create worktree); system-proof links (Live/Ready/Dependencies/Channels/Brand).
- **Brand** (`BrandSettings.tsx`): scope segment (Org/Workspace); per-value inputs each paired with an **Override checkbox** — Brand name, Player label, Action color (picker+hex), Logo `<select>` (2 demo assets), Corner radius 0/4/8, Content Co-op attribution toggle; **"Save draft"** (`governance.saveDraft`, localStorage); draft bar **Discard**/**Publish demo brand**; version history **Preview**/**Roll back** `[ROLE/flag]`; custom logo upload intentionally **[PH: backend-gated]**.

### 6.10 PROJECT COCKPIT — `/projects/[id]` (`components/projects/ProjectCockpit.tsx`, 2,444 ln) · the Operating Record shell

**Bypasses the global shell.** Sections via `?surface=<id>`. Two-row context bar + left section rail + main content + right operator dock.

**Context bar row 1 (header), left→right:** brand `Link`→`/projects`; mobile hamburger; **project switcher `<select>`** (`router.push('/projects/{value}')`); **lifecycle STAGE CHIP** (button, `PROJECT_STAGE_META.label`, `onClick handleAdvanceStage` → `advanceProjectStage` one step with the §5 gates, toast on block) **[DEMO ONLY — no chip in remote]** `:1500-1511`; **search input** "Search project or media" (live typeahead → up to 5 asset buttons → `selectAsset`); **"Share"** (`Share2`, disabled `!canShare||!activeAsset`) `[ROLE:reviews:comment]`; **"Upload"/"Uploading"** (`Plus`, disabled `uploading||!canUpload`) `[ROLE:media:write]`; **notifications bell** + popover (rows → `selectDockTab("activity")`, **Preferences**→`/settings`, **Done**); **account avatar** + menu (**Account settings**/**Branding and preferences**→`/settings`, **Sign out**). [LIVE]

**Context bar row 2 (`CockpitToolbar.tsx`), left→right:** **Mode toggle** Review/Edit/Focus (`Alt+1/2/3` — sets rail+dock layout); **Rail toggle** (`PanelLeft`, `[`); **Dock toggle** (`PanelRight`, `]`); **"Commands"** (`Search`, ⌘K); **Save layout** (`Save`) + "Saved" pill; **Lifecycle drawer** trigger; **Presence cluster** (≤3 avatars + "N in project"/Offline); **Overflow menu** (`Ellipsis`: Operator dock checkbox / Commands / Save layout). [LIVE]

**Section rail** (`CockpitNavigation.tsx`) — **all 12 tabs always render** (no entity-conditional hiding; entity-conditionality lives in each section's empty state): **Overview, Creative, Proposal, Plan, Media, Sequences, Reviews, Approvals, Delivery, Tasks** (numeric due-today badge), **Versions, Metadata**. Selecting **Overview** clears `?surface` and *toggles* the overview drawer; others set `?surface=<id>`. Below tabs: **Settings** link; shortcuts **Creative brief / Proposal / Assets** + **Team**→`/settings?section=organization`; **"Compact rail"** collapse. Mobile: Overview/Media/Reviews/Tasks + **More**.

**§6.11 Section: Overview (default) — the internal review workspace.** Center: **"Latest review" media `<select>`** (or **"Upload media"** when none); review-readiness strip (5 tiles, Transcript tile **[PH]**); **Systems** posture link→`/settings?section=systems`; **video frame** (`tabIndex=0`, keys Space/K play, ←/→ seek, ↓ add cut) with click-to-pin overlay + frame-pin buttons; **Play/Pause**; **scrubber**; **seek-interval `<select>`** (1/2/5/10s, persisted); **Mute**; **Fullscreen**; **comment composer** (input Enter-submit, **timecode** button, **"Add comment"** → demo `addDemoReviewComment` / remote `POST /api/assets/{id}/comments`); **`CockpitReviewTimeline`** (comment/cut markers click-seek + zoom-out/slider/zoom-in/fit). Empty: "No review media" + Upload. [LIVE both]
**Operator dock** (`CockpitDock.tsx`, tabs Review/Versions/Inspector/Activity): Review — **"View review"** (`openReviewCockpit` → `?view=review`), **"Start review"** (share modal), Open/Resolved comment filters, per-comment **timecode** + **resolve/reopen** (`toggleCommentStatus`), **"Add comment"**, live-session **"Pin comment"** + **"Start screen share"** **[PH disabled]** `:2099-2101`, approval **"Record approval"** `[DEMO]`, **"Open share controls"**; Versions — `VersionCompareDock` (deliverable + Reference/Current `<select>`s, **Split/Overlay** toggle, overlay slider, **"Open version history"**→`versions` section; remote shows a notice + history only); Inspector — read-only + **"View all metadata"**; Activity — list + **"View all"**→`/activity`; **Dock close** (`X`).

**§6.12 Section: Creative — `?surface=creative`** (`CreativeSection`, **[DEMO]**): **"Draft brief"/"Revise brief"** → editor (Objectives/Audience/Core message/References/Deliverables textareas, **"Save as vN"**, **"Cancel"**); status buttons **"Submit for review"** / **"Approve brief"** / **"Back to draft"** (§5 Brief edges); version history line. Empty: "No brief yet" + **"Draft brief"**.

**§6.13 Section: Proposal — `?surface=proposal`** (`ProposalSection`, **[DEMO]**): **"Draft/Revise proposal"** → editor (Title, Narrative, **"Save version"**); status **"Send to internal review"** / **"Mark sent to client"** / **"Record client approval"**; **estimate line table** (Required + Optional totals); **"Add estimate line"** form (category `<select>` crew/equipment/travel/post/deliverable/other, Description, Qty, Rate$, Markup%, **"Add line"**, Optional checkbox); **payment milestones** (after approval): **"Create checkout link"** (mock provider) + **"Record payment"** (mock, no live charge). Empty: "No proposal yet" + **"Draft proposal"**.

**§6.14 Section: Plan — `?surface=plan`** (`PlanSection`, **[DEMO]**): **"Add plan item"** form (kind `<select>` Task/Milestone/Production day, Title, Date, Assignee, **"Add"**); grouped lists with **"Mark <next>"** status buttons; **Production block** (production days: **"Mark <next>"**, **"Generate/Regenerate call sheet"**, expandable call-sheet text; releases: **"Mark <next>"**; locations: **"Mark <next>"**; crew list). Empty: per-group "No … yet."

**§6.15 Section: Media — `?surface=media`** (inline, [LIVE both]): **"Upload media"**; per-asset **thumbnail button** → `selectAsset` + `overview`. Empty: "No project media" + Upload. *(Note: this is a bespoke inline grid; `MediaCard`/`MediaTable`/`FolderTree`/`ProjectToolbar` are the projects-LIST components, not used here.)*

**§6.16 Section: Sequences — `?surface=sequences`** (`SequencesSection` + `SequenceTimeline.tsx`, **[DEMO]**): per sequence — **"Render to review"/"Rendering…"** (`renderSequenceToAsset` → `POST /api/render/sequence`, creates a video asset) + **"Send to review"** (draft→in_review); **`SequenceTimeline`** — **Play/Pause/Resume sequence** (real clip-to-clip playback), **track click-seek**, **clip select+seek**, **in/out trim handles** (drag → `trimSequenceClip`), toolbar **Split** (`Scissors`, at playhead), **Delete** (`Trash2`, ripple), **EDL** (`Download`, CMX 3600 export); **selects list** (include checkbox `togglePick`, in/out `<input>`s → `updateSelectRange`); **transcript group** — **"Propose 90s radio cut"** (reasoned auto-assemble), **"Export SRT"/"Export VTT"**, per-segment **"Make select"**; **"Assemble sequence"** form (name + **"Assemble from N selects"**). Empty: "No sequences yet…" / "No selects yet…".

**§6.17 Section: Reviews — `?surface=reviews`** (inline + sub-blocks): **"Create link"/"Upload media"**; per-link **"Revoke"/"Restore"/"Revoked"** (`setShareLinkActive`; remote `DELETE /api/assets/{id}/share`) + **"Open"**; **Review consolidation** (`[DEMO]`): per revision-round **status-advance**, **"Consolidate N comments"**; **Decision ledger** (`[DEMO]`): **"Start implementation"/"Mark done"**; **Notification outbox** (`[DEMO]`): **"Process outbox (dry-run)"**. Empty: "No review links".

**§6.18 Section: Approvals — `?surface=approvals`** (inline): per-stage **"Approve"** (only `demoMode`, `approveDemoStage`) `[DEMO]`. Empty: "No approval workflow".

**§6.19 Section: Delivery — `?surface=delivery`** (`DeliverySection`, **[DEMO]**): **"Spec deliverable"** form (File name/Resolution/Codec + Aspect `<select>` 16:9/9:16/1:1/4:5, **"Spec deliverable"**); per-deliverable **"Move to <next>"** (§5 Deliverable chain). Empty: "No deliverables specced yet."

**§6.20 Section: Tasks — `?surface=tasks`** (inline): per-task **checkbox** (`toggleDemoTask`, **disabled in remote**) `[DEMO]`. Empty: "No tasks".

**§6.21 Section: Versions — `?surface=versions`** (inline, [LIVE]): per-asset **"Review"** → `selectAsset` + `overview`. Empty: "No versions".

**§6.22 Section: Metadata — `?surface=metadata`** (inline): 3 read-only `<dl>` cards (Project / Active media / Review authority). Values **[PH static]** in demo ("1920 x 1080", "23.98 fps"), "Not reported" in remote.

**Cockpit overlays:** Command palette; Share modal (`ShareModal` remote / `DemoShareModal` demo); **Upload status modal** (validating→transferring→proxy→indexing→complete/error, dismissable on terminal); **Toast**.

### 6.23 PUBLIC REVIEW WORKSPACE — `/review/[token]` (`PublicReviewWorkspace.tsx` + `ReviewMediaSurface.tsx`) · the canonical "1 top bar · 1 stage · 1 rail"

Token → `/api/review/{token}`; capability from `permissions` (view/comment/approve). `token==="demo"`/`?demo=1` runs the demo store, no network.
- **Top bar:** brand lockup (custom brand or `CoProductionBrand`); breadcrumb (project, **intent badge**, asset title, **status badge**); summary (review-state badge, permissions, "Reviewing as {name}", views/expiry); **Download** `<a download>` — only if `download_enabled && file_url` `[ROLE:download]`.
- **Player** (`components/player/PlayerControls.tsx`): **scrub bar** (click-seek + buffered); **Seek back** (`SkipBack`); **Play/Pause** (`Play`/`Pause`); **Seek forward** (`SkipForward`); **time `mm:ss / mm:ss`**; **seek-interval `<select>`** (1/2/5/10s, persisted `codeliver.review.seek-interval`); **Mute/volume** (`Volume2`/`VolumeX` + slider); **playback rate** (0.25–2×) menu; **Fullscreen** (`Maximize`); **frame indicator** `HH:MM:SS:FF │ F{n}`. Keyboard: Space/k, j/l (±10s), ←/→ (±interval), ↓ (cut), m, f, [/] (rate), ,/. (frame step). Click-to-pin on video/image → `InlineReviewComment` popover. Cut markers (↓/timeline) → demo `addDemoReviewCutMarker` / live `POST /api/review/{token}/edit-decisions`. **No draw/annotation tools, no quality/HLS picker UI, no loop/theater/compare on the public player** (HLS auto-attaches for `.m3u8`).
- **Timeline** (`PlayerTimeline.tsx`): comment markers (green resolved / orange open, click-seek, hover body); cut markers (`Scissors`, colored by status).
- **Rail:** review-flow 3-step guide; **Comment filters** Open/All/Resolved; **comment rows** (`CommentThread` — numbered, initials, timecode chip click-seek, pin/resolved badges; **Reply/Resolve disabled in public**, `page.tsx:1155-1156`); **composer** (`PublicReviewComposer` — **Place/Adjust pin** [image-only], **Reviewer name** (required), timestamp chip, comment textarea Cmd/Ctrl+Enter, **Send comment** → demo/public API; view-only notice when `!canComment`). No attach/@mention/rich-text/draw.
- **Approval block** (when `permissions==="approve"`): per-step `ApprovalStepCard` → `ApprovalActions` (**Approve**, **Approve with Changes** [note], **Request Changes** [note required], submit/cancel → demo / `PATCH /api/review/{token}/approvals`); demo **FinishReviewBar** (Approve & finish / Request changes & finish / Finish without decision).
- **Internal review** = `/(review)/projects/[id]/assets/[assetId]` is a **pure redirector** (`InternalAssetReviewPage.tsx`) → `/projects/{id}?asset={id}&view=review` (the cockpit overview above is the internal workspace).

### 6.24 UPLOAD — `components/assets/AssetUpload.tsx` (the real tus pipeline, mounted in the cockpit)

On mount `GET /api/storage/readiness` → phase checking/ready/blocked; chunk 50MB; flags `exe/bat/sh/cmd/msi`. tus to `/api/upload/tus` (resumable, retries, idempotency key, quarantine unless committed+released). Controls: **Dropzone** (click/drop, disabled unless ready); hidden **file input** (multi); per-file **Pause** (`abort()`), **Resume** (`start()`), **Retry** (new attempt), **Cancel/Remove** (`abort(true)`); cockpit overlay header + progress + footer **Close**. [LIVE][REMOTE]

### 6.25 TRANSCRIPT WORKBENCH — `components/transcript/TranscriptWorkbench.tsx` **[ORPHAN — built, imported nowhere]**

Full surface (waveform click-seek, candidate markers, search, speaker filter, low-confidence toggle, Transcript/Candidates/Captions tabs, per-word click-seek, candidate **Preview/Accept/Reject**) — **not wired to any page**. The live "make select from transcript" path is the cockpit **Sequences** section instead (§6.16). Resolve in §7-A.

---

## 7. BUILD-OUT GAP LIST — what "build out co-videopro.com" concretely means

This is the actionable core. Each item is a discrete, verifiable task. Work them in the §8 order.

### 7-A. Orphaned components — decide **wire or delete** (Prime Directive 2)
Every one of these is fully built but imported nowhere in the live tree. For each: either wire it into the real surface it belongs to (and make its data real) **or delete it**. Do not leave them.
- `components/review/ReviewWorkspace.tsx` + `components/review/panels/*` (7 panels) — a complete alt review UI, fed empty data. The public review workspace (§6.23) is the canonical one → **delete** unless you consciously migrate to it.
- `components/annotations/*` (`AnnotationToolbar`, `AnnotationCanvas` (Konva), `shapes/*`) — a complete drawing toolset. **The docs claim drawn annotations exist; they are NOT wired to either review surface.** Either wire pen/shape/color/undo/clear into the public + cockpit review stages (high product value — Frame.io parity) or delete and drop the claim.
- `components/versions/{VersionList,VersionCompare,VersionUpload}.tsx` — superseded by `VersionCompareDock`. Delete or reconcile.
- `components/sharing/{WatermarkConfig,QRCodeGenerator}.tsx` — watermark text/position/opacity + QR. The live share flow has watermark on/off only. Wire WatermarkConfig into `ShareModal` if watermark control is wanted; otherwise delete.
- `components/comments/MentionSuggestions.tsx` — uses `MOCK_USERS`. Wire to real workspace members or delete.
- `components/SearchModal.tsx`, `components/UploadMonitor.tsx`, `components/notifications/NotificationBell.tsx` (+List/Item) — superseded by the palette / cockpit upload modal / inline popover. Delete.

### 7-B. Placeholder controls — **implement or remove** (never leave decorative)
- Projects toolbar **"Batch actions"** (`ProjectToolbar.tsx:92-94`, no handler) — implement bulk archive/trash/share or remove.
- Projects toolbar **"Cloud import not connected"** (`:126-138`, disabled) — implement or remove the split-menu.
- Cockpit dock **"Start screen share"** (`ProjectCockpit.tsx:2099-2101`, disabled) — implement live-session screenshare or remove the live-session block.
- Cockpit review dock **"Transcript & cleanup"** tiles (all "unavailable") — wire to the transcript pipeline or remove.
- Settings **Systems** disabled/toast-only buttons (Connect repo, Add remote, Open plugins, Start session, Run probe, Choose source, Create worktree, Review suggestions, Open proposals, Review policy) — either make them do the thing or convert the matrix to honest read-only status.
- Settings **Brand** custom logo upload ("Asset boundary", backend-gated) — build the upload endpoint or keep it explicitly labeled as roadmap.
- Settings **Account** email field (read-only) & **Security** provider-readiness list — wire or label.
- Cockpit **Metadata** static values ("1920 x 1080", "23.98 fps") and the Overview **Transcript** readiness tile — derive from real media metadata or mark "not processed" honestly.
- Opportunities discovery imports (`startDiscovery`/`DISCOVERY_QUESTIONS`, unused) — build the discovery UI (the entity model + demo seed already exist) or remove the imports.

### 7-C. Remote-mode parity — make production as real as demo (the biggest lift)
Today the entire mid-lifecycle record is **demo-only**; in remote mode Creative/Proposal/Plan/Sequences/Delivery/Home/Opportunities/consolidation/ledger/outbox short-circuit to empty. To ship a *usable* product you must:
1. **Execute migration `014_project_operating_record.sql`** (schema `co_production`: organizations, contacts, inquiries, briefs, brief_versions, proposals, proposal_versions, estimate_lines, plan_items, sequences, sequence_clips, deliverables, decisions, revision_requests) with RLS mirroring `project_members`, and CHECK constraints matching the transition validators. It is authored but unexecuted (`R1`).
2. **Write the remote API routes** under `app/api/*` for every record entity, reusing the **same** `lib/covideopro/transitions.ts` validators the demo store uses (Prime Directive 3/4). Pattern-match existing handlers. Then flip each demo-only section (§6.12–6.20) to read/write remotely when `!demoMode`.
3. **Fix the remote shell truth:** replace the hard-coded `role="owner"` and identity (`Shell.tsx:63,69-72`) with the authenticated user's real role + profile, so capability gating actually applies in production.
4. **Wire header notifications to `/api/notifications`** — today the bell + popover read demo seed data even in remote (`Shell.tsx:268,276`).
5. **Generate TS types** from the new schema and keep `lib/types` in sync.

### 7-D. Deploy & domain — actually go live at co-videopro.com
1. **Rewrite `DEPLOY_CONTRACT.md`** from "co-deliver" to Co-VideoPro: canonical host `https://co-videopro.com`, port (align on 4103 vs the 4113–4115 the running instances used — pick one), health `/api/health`, package name already `co-videopro`.
2. **Env:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SITE_URL`/`NEXT_PUBLIC_SITE_URL=https://co-videopro.com`, `NAS_MEDIA_ROOT` (runtime), optional `RESEND_*`, `ANTHROPIC_API_KEY`. Build must pass with **no NAS mount**; media ops must fail closed if `NAS_MEDIA_ROOT` is missing.
3. **Coolify:** webhook rebuild from GitHub `main`, repo root as build context, probe `/api/health`, Docker base `node:20-slim`. Do **not** serve public review from `next dev`.
4. DNS/TLS for `co-videopro.com`; redirect any legacy hosts at the app layer.

### 7-E. Roadmap (real features, honestly unbuilt today)
- **Hermes** as project intelligence over the record (summary, missing-preproduction flags, feedback consolidation, approval blockers) — deterministic analyzers first, `activity_log` provenance via the existing vault harness. Not a chat toy; no global nav entry until backed.
- **Deliveries global surface** (`/deliveries`) + download-audit events; call-sheet builder + field mode.
- **Perf** (500+ asset libraries), **a11y audit**, **Playwright E2E** browser automation.
- Consider a **theme toggle** in chrome (dark exists but is demo-Preferences-only today).

---

## 8. EXECUTION CONTRACT (how to work)

1. **Read first:** `docs/COVIDEOPRO_PRODUCT_MODEL.md`, `_TARGET_ARCHITECTURE.md`, `_DECISIONS.md`, `_CURRENT_STATE.md`, `_OPEN_RISKS.md`, and this file. Boot the app in demo mode and reproduce the surface you're about to touch before changing it.
2. **Slice discipline** (per new capability): **contract (lib types + transition) → migration + demo-store slice → transition unit tests → surface wiring → visual QA capture.** Same validators feed both runtimes.
3. **Order:** 7-A (delete/reduce noise) → 7-B (kill placeholders) → 7-C (remote parity: migration → APIs → shell truth → notifications) → 7-D (deploy) → 7-E (roadmap). Do 7-C in the target-architecture slice order (Shell/record skeleton already done → Opportunities/Creative/Proposal → Review/consolidation/Delivery → Sequences → hardening).
4. **Gates for every commit:** `npm test` green (baseline was 535/535), `tsc --noEmit` 0 errors, `npm run build` passes with no NAS mount, and the touched surface renders 200 + behaves as §6 specifies. Add tests for every new transition/route.
5. **Honesty:** if a nav/tab/button can't be made real this pass, remove it. Never expand the nav model or add a tab whose section short-circuits. Keep demo seed ACS-free.
6. **No push/deploy** until the human gives the cutover go. Commit locally; keep `git diff e068ee8..HEAD` clean and legible. Log decisions in `docs/COVIDEOPRO_DECISIONS.md` and progress in `_UPGRADE_LOG.md`.

---

## 9. DEFINITION OF DONE

- [ ] Zero orphaned components in `components/` (each wired or deleted) — grep proves no `imported nowhere` survivors from §7-A.
- [ ] Zero decorative controls — every button in §6 either does the specified thing or is gone (§7-B closed).
- [ ] Migration `014` executed in staging; every §6.12–6.20 record section reads/writes remotely via shared validators; **remote mode behaves like demo, not empty** (§7-C).
- [ ] Remote shell shows the real user's role + identity; capability gating applies in production; header notifications come from `/api/notifications`.
- [ ] `DEPLOY_CONTRACT.md` is Co-VideoPro/`co-videopro.com`; a production build runs and `/api/health` returns 200 behind the domain; public review + tus upload + HLS + signed downloads run against the prod build, not `next dev`.
- [ ] `npm test` green, `tsc --noEmit` clean, `npm run build` passes with no NAS mount; a fresh visual-QA capture set exists for every changed surface.
- [ ] No ACS content anywhere; demo seed remains a realistic, decontaminated production slate.

---

*Grounded in `cco-videopro-definitive-20260715` as of 2026-07-17. Anchor files: `app/(dashboard)/*`, `components/Shell.tsx`, `components/navigation/*`, `components/projects/ProjectCockpit.tsx`, `components/projects/ProjectRecordSections.tsx`, `components/projects/SequenceTimeline.tsx`, `components/review/*`, `components/player/*`, `components/sharing/ShareModal.tsx`, `components/assets/AssetUpload.tsx`, `lib/covideopro/{record,transitions}.ts`, `lib/demo/*`, `app/globals.css`.*
