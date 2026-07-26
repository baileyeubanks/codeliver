# Co-VideoPro — Historical 2026-07-16 State Audit

**Date:** 2026-07-16
**Worktree:** `~/Desktop/Projects/contentco-op/cco-videopro-definitive-20260715`
**Branch:** `codex/co-videopro-definitive-20260715`
**Baseline commit:** `e068ee8` — "checkpoint: preserve prior co-videopro transformation state" (674 files: the previous autonomous session's uncommitted work, preserved unchanged before this mission)
**Base commit:** `585a703` — co-deliver `main` HEAD
**Audit method:** static repository inspection (this session); runtime re-verification and screenshot capture are tracked as pending items in §9.

---

> **Superseded:** This file preserves the 2026-07-16 baseline and must not be
> cited as current product truth. Current authority is `STATUS.md`,
> `BLOCKERS.md`, `00_REPO_CONTEXT.md`, `DEPLOY_CONTRACT.md`, and the reality
> maps under `docs/reality/co-deliver/`.

## 2026-07-26 superseding snapshot

At M2 application-source baseline
`2639e8973211476649f95029d1a3d33a5fccf57d`, `/api/upload/tus` is the only
production catalog writer. A clean committed upload is source-bound through
one service-only atomic RPC to one asset and exact V1. Authenticated
`/api/media/versions/[versionId]` playback is exact-version, range-capable, and
receipt-bound. Legacy multipart/TUS routes, metadata-only asset POST, and
arbitrary V2 `file_url` POST are explicit `410 Gone` tombstones.

Commit publication now preflights capacity for the full immutable copy, uses
a separate sealed inode with deterministic crash cleanup, and requires a
one-link receipt. Public review rows are allowlisted; invites must be active
and reference an existing asset, and password-protected invites fail closed.
Exact-version frame comments use complete 0–100 percentage pins. Both database
migrations remain unapplied; the pin migration refuses to reinterpret any
existing legacy pin. Neither M2 runtime port is listening, and no live
database/RPC/privilege, provider, real-file, or anonymous-playback receipt
exists. The full upload → asset → V1 → playback → anonymous comment →
attributable approval → lock → delivery spine remains open.

Current source gates: typecheck pass; lint 0 errors/40 warnings; 1,153 tests
with 1,150 pass/0 fail/3 runtime skips; production build pass; independent
exact-diff reviews with no Critical or Important findings.

Everything below this point is the historical 2026-07-16 snapshot.

---

## 0. Provenance and product identity

This worktree is a git worktree of the **co-deliver** repository (`~/Desktop/Projects/contentco-op/cco-codeliver` is the main worktree). Co-deliver was a media review/approval/delivery product. A prior autonomous session (2026-07-15) began transforming it into a unified production product under the working names **"Co-Produce" / "Co-Production Pro"**. This mission renames and re-scopes that effort as **Co-VideoPro**, the AI-native OS for professional video production.

Current naming state (grep counts over `app/ components/ lib/ packages/`):

| Name | Files | Where |
|---|---|---|
| `codeliver` | 77 | storage keys, tests, docs, schema filenames, internal ids |
| `Co-Production Pro` | 35 | rendered UI brand, metadata, emails |
| `Co-Deliver` / `co-deliver` | 17 | deploy contract, docs, storage keys |
| `Co-VideoPro` | 3 | storage key (`co-videopro-review-seek-step`), design-evidence dir |

- `package.json` name is still `co-deliver`.
- Browser title: "Co-Production Pro | Content Co-op" (`app/layout.tsx`).
- Demo workspace storage key: `co-deliver.demo-workspace.v1` (`lib/demo/workspace-store.ts:24`).
- The product has **three names in flight**. Unification on Co-VideoPro is a required mission deliverable.

## 1. Repository architecture

### 1.1 Stack (verified `package.json`, configs)

- Next.js **16.2.10** (App Router, `proxy.ts` as middleware), React **19.2.3**, TypeScript strict, `tsc --noEmit` = **0 errors** (but see blind spots below).
- Tailwind v4 CSS-first + a **5,330-line hand-maintained `app/globals.css`** design system (dark navy/green; light theme via `html[data-theme="light"]`).
- Supabase: `@supabase/ssr` + `supabase-js`; three clients — `lib/supabase.ts` (service role), `lib/supabase-auth.ts` (SSR cookie), `lib/supabase-browser.ts` (browser). Data schema `co_production` enforced in production by `lib/data-authority.ts`.
- State: zustand stores (`lib/stores/annotationStore.ts`, `notificationStore.ts`, `playerStore.ts`) + **demo workspace store** (`lib/demo/workspace-store.ts`, localStorage-persisted).
- Media: `hls.js`, `konva`/`react-konva` (annotation drawing), tus (`@tus/server`, `tus-js-client`) resumable upload, custom FFmpeg media pipeline (`lib/media-pipeline/`).
- AI: Anthropic via env key (`app/api/ai/*`); `marked`, `qrcode`, `jszip`, `recharts`, `file-saver`, `nanoid`.
- Tests: **93 test files** — `node --test` with type stripping (`npm test` runs 86 `tests/*.test.ts`; 7 `.test.mjs` contract/journey tests). No vitest/jest/playwright configs.

### 1.2 Request pipeline

`proxy.ts` runs on every request: host-surface resolution (admin/client), unknown-host 403, **production API launch gate** (allowlist; blocks legacy `/api/media`, `/api/vault`, `/api/comments` with `API_LAUNCH_GATED`), Supabase cookie auth, role→surface check, public prefixes for `/api/auth`, `/api/health`, `/api/review`, `/review`, `/download`, login/signup.

### 1.3 Data access pattern

- **Zero server-component data fetching.** All dashboard pages are client components fetching 82 API route handlers, or reading the demo store.
- **Dual runtime:** (a) production: Supabase-backed API routes; (b) **demo mode**: auto-enabled in dev when Supabase env is absent (`lib/demo/mode.ts`), driven by `lib/demo/workspace-store.ts` (localStorage key above) with seeded projects/assets.
- No `.env`/`.env.local` exists in the worktree — only `.env.example`. Local runs therefore default to demo mode.

### 1.4 Database (historical migration inventory)

Tables (schema `co_production`): `projects`, `project_members`, `assets`, `versions`, `reviews`, `review_invites`, `comments`, `comment_attachments`, `comment_reactions`, `annotations` (pin/rect/freehand/arrow/text), `approval_workflows`, `approval_history`, `approvals`, `folders`, `tags`, `asset_tags`, `notifications`, `notification_preferences`, `teams`, `team_members`, `team_invites`, `activity_log`, `transcriptions`, `edit_decisions`, `transcode_jobs`, `share_analytics`, `comparison_sessions`, `project_analytics_cache`, `usage_events`, `webhooks`, `webhook_deliveries`, `brand_checks`, `presence`. RLS covered by migration 011 + hardening in `012`/`20260715093300_fail_closed_co_production_authority`.

**This is a review-and-delivery schema.** None of the CRM / creative / commercial / planning / sequence / delivery-spec entities exist (see §3).

### 1.5 Media pipeline (real, not fake)

- Historical note: canonical tus lived at `app/api/upload/tus/*`. The former
  `app/api/media/tus/*` path is now a `410 Gone` tombstone; see the superseding
  snapshot above.
- FFmpeg pipeline: `lib/media-pipeline/{service,ffmpeg,config,errors}.ts`, jobs in `transcode_jobs`, worker endpoints `app/api/transcode/{route,worker,jobs/[id]}` behind worker auth (`app/api/transcode/_lib/worker-auth`).
- Transcripts: `app/api/assets/[id]/transcript/*` + batch; `transcriptions` table; `lib/transcript/`; UI `components/transcript/TranscriptWorkbench.tsx`, `WaveformTranscript.tsx`.
- Player: `components/player/{VideoPlayer,PlayerControls,PlayerTimeline,FrameIndicator}.tsx` (frame indicator exists; frame accuracy to be runtime-verified).

### 1.6 Prior session's contract layer (important)

`lib/co-produce/lifecycle-contract.ts` (2,263 lines) is a **type-checked lifecycle contract**: 18 canonical record contracts (`project, asset, version, review, comment, annotation, approval_workflow/step/history, review_invite, activity_event, notification, team, team_member, transcription, edit_decision, transcode_job, project_analytics`) each with status fields, allowed values, and transition rules; `planned.*` records (e.g. `planned.client_lead`) explicitly marked **not-implemented**; 12 route contracts matching today's nav; capability groups with permissions, readiness, audit contracts; a self-validator `validateCoProduceLifecycleContract()`. Supporting strategy docs: `docs/strategy/co-produce-lifecycle-contract.md`, `co-produce-goal-extension-2026-07-14.md`, `transcript-audio-analysis-pillar-2026-07-14.md`.

**Assessment:** this is the strongest prior artifact — an honest, validated model of what exists vs planned. It models the *review-centric* lifecycle only; it is not wired to new DB tables or new surfaces beyond the cockpit lifecycle drawer (`components/cockpit/CoProduceLifecycleDrawer.tsx`).

### 1.7 Deployment

3-stage Dockerfile, port **4103**, health at `/api/health` (+`live`/`ready`/`dependencies`), Coolify webhook rebuild from GitHub `baileyeubanks/codeliver`, canonical host `deliver.contentco-op.com`, `scripts/rebuild-public-runtime.sh`. DEPLOY_CONTRACT.md references the `codeliver` repo path — stale for a Co-VideoPro identity.

### 1.8 Build/health caveats

- `tsconfig.json` `include` covers only `app/`, `lib/`, `components/`, `.next/types` — **`proxy.ts`, `tests/`, `packages/*`, `scripts/` are not typechecked.**
- `packages/{ui,brand,types,api-client}` exist as path-mapped workspace packages (adopted from the monorepo); not part of `npm test`/`tsc` scope.

## 2. Product inventory (page surfaces)

| Surface | Route | Classification | Evidence |
|---|---|---|---|
| Dashboard home | `app/(dashboard)/page.tsx` | Redirect shell | client redirect to `/projects` |
| Projects list | `app/(dashboard)/projects/page.tsx` (670 lines) | Functional (demo+remote) | fetches `/api/projects`, demo store |
| Project create | `projects/new/page.tsx` | Partial | creates project record only |
| Project cockpit | `projects/[id]/page.tsx` + `components/projects/ProjectCockpit.tsx` (**2,392 lines**) | Functional for asset review; **not** a Project Operating Record | upload, media cards, versions, approvals, lifecycle drawer |
| Archive / Trash | `projects/archive|trash/page.tsx` | Functional (demo) | added by prior session |
| Reviews list | `reviews/page.tsx` | Partial | aggregates review state |
| Media library | `library/page.tsx` | Partial | cross-project browse |
| Activity | `activity/page.tsx` | Partial | activity feed |
| Settings | `settings/page.tsx` | Partial | profile/brand/team/preferences |
| Internal asset review | `(review)/projects/[id]/assets/[assetId]/page.tsx` (5-line wrapper) + `components/review/InternalAssetReviewPage.tsx` | Functional | full review workspace |
| Public review | `app/review/[token]/page.tsx` (**1,176 lines**) + `PublicReviewWorkspace.tsx` | Functional | token access, comments, annotations, approvals |
| Invite landing | `app/invite/[token]/page.tsx` | Functional | team invite acceptance |
| Login / Signup | `app/login`, `app/signup` | Functional | demo + Supabase auth paths |

**Absent surfaces (required by the product definition):** Home (project-aware dashboard), Clients/Contacts, Inquiries/Leads/Opportunities, Creative (briefs, treatments, scripts, storyboards), Proposals/Estimates/Contracts, Schedule/Calendar, Crew/Talent/Locations/Equipment, Call sheets, Field mode, Sequences/Editor, Deliverables/QC, Client portal (beyond token review links), Finance, Hermes surface, Insights/analytics beyond `project_analytics_cache`.

## 3. Workflow tracing (20 mission workflows)

Legend: ✅ real end-to-end · ◐ partial · ❌ absent

| # | Workflow | Status | Truth |
|---|---|---|---|
| 1 | Inquiry creation | ❌ | no inquiry entity/route |
| 2 | Lead qualification | ❌ | `planned.client_lead` only |
| 3 | Brief creation | ❌ | no brief entity |
| 4 | Proposal generation | ❌ | no proposal/estimate entities |
| 5 | Estimate approval | ❌ | approval system is asset-scoped only |
| 6 | Project creation | ◐ | name/description only; no linkage to brief/proposal |
| 7 | Pre-production planning | ❌ | no schedule/crew/location/task entities |
| 8 | Crew/location scheduling | ❌ | absent |
| 9 | Media ingest | ◐ | tus upload real in production; demo mode simulates phases client-side |
| 10 | Proxy/processing | ◐ | real FFmpeg worker in production; not exercisable locally (no NAS/FFmpeg env verified) |
| 11 | Transcript creation | ◐ | API + table + workbench UI; provider path unverified locally |
| 12 | Clip selection | ◐ | `edit_decisions` + review cut markers exist; no selects/bin model |
| 13 | Sequence editing | ❌ | no sequence/track/clip model; no NLE UI |
| 14 | Review upload | ✅ | versions upload, review links |
| 15 | Frame-accurate feedback | ◐ | annotations (pin/rect/freehand), `FrameIndicator`; frame accuracy to verify at runtime |
| 16 | Revision creation | ◐ | new versions upload; no consolidated revision-request workflow |
| 17 | Final approval | ✅ | approval workflows + history |
| 18 | Deliverable encoding | ◐ | transcode jobs exist; no deliverable spec/preset model |
| 19 | Client download | ◐ | token review + download events; no delivery packages/expiration UX |
| 20 | Archive | ◐ | project archive + trash; no archive record/analytics learning |

## 4. UI audit (static; runtime pass pending — §9)

- **Shell** (`components/Shell.tsx`, 352 lines): top header — brand, hamburger drawer nav (`WorkspaceNavigation`), global command palette (⌘K, real fuzzy ranking in `navigation-model.ts`), notifications popover, account menu, offline notice. Solid bones.
- **Navigation model** (`components/navigation/navigation-model.ts`): capability-gated sections — Workspace (Projects, Reviews, Media library, Activity), Lifecycle (Archive, Trash), Administration (Settings). **No project-level contextual navigation, no lifecycle destinations, no CRM/creative/commercial entries.** Role set: owner/producer/editor/reviewer/viewer (hardcoded `WORKSPACE_ROLE = "owner"` in Shell).
- **Project cockpit**: asset-review-centric (media cards, upload, versions, approvals, lifecycle drawer, review timeline). Shell chrome is suppressed on cockpit routes (`isProjectCockpit` → bare white surface), so **project context and global nav disappear inside a project** — the opposite of the target persistent-context requirement.
- **Two design eras coexist:** committed co-deliver surfaces vs prior session's cockpit/brand/navigation components; branding split across three names (§0).
- **Demo seed data** (`lib/demo/workspace.ts`): 4 projects, 8 assets with realistic review states — but includes contamination (§5) and no lifecycle depth (no briefs/proposals/schedules).
- Known stale artifacts: `.next-covideopro-4113/4114.log|.pid` (prior dev servers on ports 4113/4114; logs empty/stale; no server currently verified running).

## 5. Contamination register (mission §1 violation)

| Item | Location | Action |
|---|---|---|
| "Astro Cleaning Services" demo project + folder | `lib/demo/workspace.ts:17,31` | Remove from seed; replace with production-relevant client |
| "ACS Brand Story_v1" demo asset | `lib/demo/workspace.ts:141-154` | Remove/replace |
| Mention contact `caio@astrocleanings.com` | `components/comments/MentionSuggestions.tsx:18` | Replace |
| Demo storage key `co-deliver.demo-workspace.v1` | `lib/demo/workspace-store.ts:24` | Migrate key with back-compat shim |

No ACS business *logic* (routes, crews, quotes, pay) exists in this worktree — contamination is seed-data/branding level, not architectural.

## 6. Former-product fragmentation remnants

- `lib/co-produce/*`, `components/cockpit/CoProduceLifecycleDrawer.tsx`, `docs/strategy/co-produce-*`: the prior session's "Co-Produce" naming — to be folded into Co-VideoPro naming, not deleted (the contract layer is load-bearing for tests).
- Sibling repos remain separate products (cco-coscript, cco-coedit, cco-codeliver…) — out of scope for this worktree; Co-VideoPro must not re-create their boundaries internally.

## 7. What the prior session built (checkpoint `e068ee8`)

112 modified + ~560 new files: cockpit suite (`components/cockpit/*`), navigation suite with command palette, brand components, demo workspace runtime, lifecycle contract + strategy docs, transcript/edit-decisions/analysis APIs, health endpoints, vault/usage-metering agent harness (`app/api/vault/*`, `docs/CO_CREDIT_VAULT_AGENT_HARNESS.md`), projects archive/trash, notification authority, storage upload enterprise map, auth/account/branding enterprise map. Tests were green per its docs; `tsc` currently clean.

## 8. Gap summary vs the mission

1. **No Project Operating Record** — project = name + assets. The 22-stage lifecycle has no data model beyond review.
2. **No CRM, creative, commercial, planning, delivery, or intelligence entities** (§3).
3. **Navigation is workspace-flat**; no global/project/workspace layering; cockpit drops global context.
4. **Three product names**; deploy contract still co-deliver.
5. **Demo seed is thin** and contaminated (§5) — fails the "realistic seed projects" requirement.
6. **Runtime/visual verification is due this session** (§9).
7. Typecheck blind spots (`proxy.ts`, `tests/`, `packages/`).

## 9. Pending verification queue

- [ ] Boot dev server; capture screenshots of shell, projects, cockpit, review, login (populated + empty states)
- [ ] Exercise demo workflows end-to-end (upload → review → comment → approve)
- [ ] Verify player frame behavior, transcript workbench, command palette, responsive states
- [ ] Run full `npm test` and record results
