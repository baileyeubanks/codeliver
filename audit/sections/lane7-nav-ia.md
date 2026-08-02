# Lane 7 — Navigation, Information Architecture & Dead Ends

App: Co-VideoPro at http://localhost:4103 (demo mode `?demo=1`). Read-only audit. All clicks via Playwright scripts in `audit/scripts/`; screenshots in `audit/shots/`.

## 1. Full nav tree (source of truth: `components/navigation/navigation-model.ts`)

Top-level surfaces, rendered by `WorkspaceRail` (desktop, `components/navigation/WorkspaceRail.tsx:37-58`) and `WorkspaceNavigation` drawer (mobile, `components/navigation/WorkspaceNavigation.tsx:145-181`), both driven by `WORKSPACE_NAVIGATION`:

| Section | id | Label (shortLabel) | href | icon | capability | mobile? | file:line |
|---|---|---|---|---|---|---|---|
| Workspace | home | Overview (Home) | `/` | home | home:read | yes | navigation-model.ts:107-117 |
| Workspace | projects | Projects (Projects) | `/projects` | folder | projects:read | yes | navigation-model.ts:118-128 |
| Workspace | opportunities | Opportunities (Pipeline) | `/opportunities` | opportunities | opportunities:read | yes | navigation-model.ts:129-139 |
| Workspace | reviews | Reviews (Reviews) | `/reviews` | reviews | reviews:read | no (mobile flag absent) | navigation-model.ts:140-149 |
| Workspace | activity | Activity (Activity) | `/activity` | activity | activity:read | no | navigation-model.ts:150-159 |
| Production | field | Field (Field) | `/field` | field | projects:read | no | navigation-model.ts:166-174 |
| Library | library | Media library (Library) | `/library` | library | media:read | no | navigation-model.ts:181-189 |
| Admin | archive | Archive (Archive) | `/projects/archive` | archive | projects:read | no | navigation-model.ts:197-204 |
| Admin | trash | Trash (Trash) | `/projects/trash` | trash | projects:read | no | navigation-model.ts:206-213 |
| Admin | settings | Workspace settings (Settings) | `/settings` | settings | workspace:manage (owner only) | no | navigation-model.ts:215-223 |

Additional shell chrome:
- Header search button → `CommandPalette` (`components/Shell.tsx:243-253`), opened via ⌘K (`Shell.tsx:165-172`).
- Header "Upload" button → `GlobalUploadDialog` (`Shell.tsx:256-269`), demo-mode only.
- Help icon → `mailto:hello@contentco-op.com` (`Shell.tsx:270-277`) — a mailto, not a help surface.
- Notifications bell → popover with links to `/activity` (`Shell.tsx:295-313`).
- Account menu → Profile/Preferences (`buildSettingsHref(...)` → `/settings?...`), role preview select, Log out (`Shell.tsx:332-368`).
- Rail "Recent projects" section → `/projects/{id}` cockpit links, max 4 desktop (`WorkspaceRail.tsx:60-76`), max 6 in mobile drawer (`WorkspaceNavigation.tsx:116-143`).
- "New project" exists only inside CommandPalette (`Shell.tsx:128-138`), not as a nav item.

Project cockpit (`/projects/[id]`) **opts out of the shell entirely** (`Shell.tsx:200-202` renders bare children, no rail/header) and has its own 12-tab navigation in `components/cockpit/cockpit-navigation.ts:42-53`: Overview, Creative, Proposal, Plan, Media, Sequences, Reviews, Approvals, Delivery, Tasks, Versions, Metadata.

Route inventory (`find app -name page.tsx`): 18 pages. Nav maps to 10 of them. URL-only pages: `/login`, `/signup`, `/welcome`, `/invite/[token]`, `/review/[token]` (public, by design), `/projects/[id]` (cockpit), `/projects/[id]/assets/[assetId]` (internal review), `/projects/new`.

## 2. Click-through results (Playwright, demo auth, 1440x900)

Script: `node audit/scripts/lane7-nav-walk.mjs`. Every nav item resolved — **no dead nav links, no 404s, no inert tabs, no "coming soon"/placeholder text** (scanned for coming soon / not implemented / under construction / placeholder / work in progress / TODO / not available):

| href | HTTP | final URL | result |
|---|---|---|---|
| `/?demo=1` | 200 | same | Overview dashboard (shot `audit/shots/lane7-1440x900.png`) |
| `/projects?demo=1` | 200 | same | Projects list |
| `/opportunities?demo=1` | 200 | same | Pipeline |
| `/reviews?demo=1` | 200 | same | "REVIEW AUTHORITY — Review links… Create from cockpit" (see §4) |
| `/activity?demo=1` | 200 | same | Activity feed |
| `/field?demo=1` | 200 | same | Field surface |
| `/library?demo=1` | 200 | same | Media library |
| `/projects/archive?demo=1` | 200 | same | Archive |
| `/projects/trash?demo=1` | 200 | same | Trash |
| `/settings?demo=1` | 200 | same | Settings |
| `/projects/new?demo=1` | 200 | same | New project form |

Error/edge surfaces (verbatim text captured):
- `/review/bogus-token` → HTTP **200** but body is an error card: "Review unavailable — Invalid or expired review link." (shot `lane7-review_bogus_token-1440x900.png`). 200-for-error masks dead links from crawlers/monitors.
- `/projects/does-not-exist?demo=1` → HTTP **200**, body: "PROJECT UNAVAILABLE — This project cockpit is not available." — again soft-200.
- `/definitely-not-a-route?demo=1` → HTTP **404**, branded not-found page: "WORKSPACE ROUTE UNAVAILABLE … Projects / Sign in" (`app/not-found.tsx`).
- `/invite/bogus-token` → redirects to `/login?next=%2Finvite%2Fbogus-token&demo=1`.

## 3. Built-but-unreachable components — the headline

Method: parsed the import graph (regex on import/export-from + dynamic import, resolving `@/` alias) seeded from every file under `app/`; anything under `components/` not transitively imported is unreachable. 54 of 109 `.tsx` components are unreachable. Verification command is the Python import-graph script in this section's history; spot-verified by grep (zero hits for `ReviewWorkspace`, `InternalReviewComposer`, `SearchModal`, `UploadMonitor`, `AnnotationCanvas` outside their own files).

**⭐ "Where is our wipster app?" — `components/review/ReviewWorkspace.tsx` (733 lines, export at :86) is built but wired to NOTHING.** It imports a full 7-panel review suite (`./panels/InfoPanel`, `CommentsPanel`, `ReviewersPanel`, `DownloadPanel`, `CaptionsPanel`, `ActivityPanel`, `SharePanel` — lines 31-37) plus realtime comment/presence hooks (`lib/hooks/useRealtimeComments`, `useRealtimePresence`) — all of which are unreachable with it. The public token route uses the **other** workspace instead: `app/review/[token]/page.tsx:16` imports `PublicReviewWorkspace` (295 lines) and renders it at :861.

Full unreachable inventory (54):

- **review/**: `ReviewWorkspace.tsx` (733 LoC), `InternalReviewComposer.tsx`, `panels/{InfoPanel,CommentsPanel,ReviewersPanel,DownloadPanel,CaptionsPanel,ActivityPanel,SharePanel}.tsx`
- **ai/** (entire dir): `AIBrandCheck.tsx`, `AISuggestions.tsx`, `AISummary.tsx`, `AITranscription.tsx`
- **analytics/** (entire dir): `AssetTimeline.tsx`, `ExportReport.tsx`, `ProjectDashboard.tsx`, `ReviewerStats.tsx`
- **annotations/** (entire dir): `AnnotationCanvas.tsx`, `AnnotationToolbar.tsx`, `shapes/{ArrowShape,FreehandLine,PinMarker,RectShape}.tsx`
- **assets/**: `AssetCard`, `AssetFilters`, `AssetGrid`, `BulkActions`, `FolderBreadcrumb`, `FolderTree`, `ImageViewer`, `PDFViewer`, `TagManager`, `TrashBin` (only `AssetUpload.tsx` is wired)
- **transcript/** (entire dir): `TranscriptWorkbench.tsx` (re-exported by `transcript/index.ts` which is itself unimported), `CandidateReviewList.tsx`, `WaveformTranscript.tsx`
- **usage/** (entire dir): `BudgetStatus.tsx`, `UsageEstimatePanel.tsx`, `UsageReceiptTable.tsx` (`usage/index.ts` unimported)
- **versions/** (entire dir): `VersionCompare.tsx`, `VersionList.tsx`, `VersionUpload.tsx` — cockpit uses `cockpit/VersionCompareDock.tsx` instead (`projects/ProjectCockpit.tsx:69`)
- **sharing/**: `QRCodeGenerator.tsx`, `WatermarkConfig.tsx` (`ShareModal`, `ShareLinkList`, `ShareAuthorityPreview` are wired)
- **teams/**: `AuditLog.tsx`, `RoleManager.tsx`, `TeamInvite.tsx`, `TeamSettings.tsx` (TeamInvite is referenced only by unwired code)
- **notifications/**: `NotificationBell.tsx`, `NotificationItem.tsx`, `NotificationList.tsx` (Shell hand-rolls its own bell at `Shell.tsx:279-314`)
- **comments/**: `MentionSuggestions.tsx`
- **root**: `SearchModal.tsx` (Shell uses CommandPalette instead), `UploadMonitor.tsx` (GlobalUploadDialog used instead)

Whole feature verticals — AI, analytics, transcript, annotations, usage/budget, version management — exist as complete UI code with zero route reachability. Roughly half the component tree is dead weight.

## 4. Legibility (fresh video producer POV)

- **Three different "review" concepts with three different homes**: `/reviews` = a *share-link administration* table (page H1 is "REVIEW AUTHORITY / Review links", CTA "Create from cockpit" → `/projects`, verbatim from lane7 walk); `/review/[token]` = the public client-facing player; `/projects/[id]/assets/[assetId]` = internal review in route group `(review)` whose layout (`app/(review)/layout.tsx`) just returns children (no shell). Nothing labeled "Review" in nav takes you to an actual review player — a producer clicking "Reviews" expecting wipster-style playback lands on a link-management table. And the real workspace (`ReviewWorkspace`) is unwired (§3).
- **"Opportunities" nav label vs "Pipeline" mobile shortLabel** vs page content about "Inquiries, leads, clients, and proposal pipeline" — three names for one concept (navigation-model.ts:130-133).
- **"Field"** ("The shoot day in your pocket — shots, releases, clearances", :170) is jargon-only; a new user cannot predict what's behind it.
- **"Media library" (nav) vs "Library" (section) vs cockpit "Media" tab** — overlapping naming.
- **Orphan-by-URL surfaces**: `/welcome`, `/signup`, `/invite/[token]` (unreachable except external links — fine), `/projects/new` (palette-only), and the internal review `/projects/[id]/assets/[assetId]` (reachable via library asset hrefs, `app/(dashboard)/library/page.tsx:236`, and `buildInternalDemoAssetHref`, `app/(dashboard)/projects/[id]/page.tsx:176`).
- **Cockpit is a hard shell break**: on `/projects/[id]` the entire workspace chrome (rail, search, notifications, account) vanishes (`Shell.tsx:200-202`) and is replaced by 12 cockpit tabs; there is no global-nav escape hatch except cockpit's own "Back to projects" (`app/(dashboard)/projects/[id]/page.tsx:341`). ⌘K is explicitly disabled in cockpit (`Shell.tsx:163`).
- **Settings is owner-only** (capability `workspace:manage`, navigation-model.ts:222); producer/editor/reviewer/viewer roles get no Settings entry at all, though account menu still links Profile/Preferences via `buildSettingsHref` — worth verifying those links for non-owner roles (demo role-switcher exists in account menu, `Shell.tsx:344-359`).
- Where to start: Overview does answer "What needs attention, Bailey?" (mobile shot) — good; but the path from Overview to "review a cut" is Overview → project cockpit → Media/Reviews tab → asset → internal review, four levels deep, and the nav's own "Reviews" is a decoy.

## 5. Mobile nav at 375x812

- Fixed **bottom bar** ("Mobile workspace" nav, `display:grid; position:fixed`, rect y=754 h=58 at 375x812 — measured via computed style) with exactly **4 entries: Home, Projects, Pipeline, More** — the model's `mobile: true` items are sliced to 3 (`WorkspaceNavigation.tsx:47` `.slice(0, 3)`), so Reviews/Activity/Field/Library are NOT in the bottom bar.
- "More" opens a full **drawer** (`role="dialog"`) with Recent projects (5 shown) + all 4 sections (10 items) + search button — everything reachable. Screenshot: `audit/shots/lane7-mobile-drawer-375x812.png`.
- Rail is `display:none` on mobile (measured). Home shot: `audit/shots/lane7-mobile-home-375x812.png`.
- Drawer footer shows role ("Owner"). No unreachable items on mobile, but the 3-slot bottom bar means Reviews is always 2 taps away despite being a primary nav item (marked `primary: true` but not `mobile`, navigation-model.ts:148).

## Evidence index

- Scripts: `audit/scripts/lane7-nav-walk.mjs`, `audit/scripts/lane7-mobile-and-errors.mjs`, `audit/scripts/lane7-mobile-vis.mjs`
- Shots: `audit/shots/lane7-*-1440x900.png` (one per route), `lane7-mobile-home-375x812.png`, `lane7-mobile-drawer-375x812.png`
- Import-graph analysis: Python script (run from repo root) seeding from `app/` and resolving `@/` imports; output: 54/109 components unreachable.
