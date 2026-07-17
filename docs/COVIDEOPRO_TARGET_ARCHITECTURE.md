# Co-VideoPro — Target Architecture

**Date:** 2026-07-16 · **Status:** governing design for the upgrade mission · **Companion:** `COVIDEOPRO_CURRENT_STATE.md`, `COVIDEOPRO_PRODUCT_MODEL.md`, `COVIDEOPRO_DECISIONS.md`

This document defines the information architecture, shell, data architecture, and build phasing for Co-VideoPro. It is written against the verified current state (see Current State doc), not against an imagined greenfield.

---

## 1. Design principles (binding)

1. **One Project Operating Record.** Every surface is a view into a single project record that spans inquiry → archive. Modules never keep private copies of project truth.
2. **Three context layers.** Global (the company), Project (one production), Workspace (immersive tools). Users always know which layer they are in.
3. **Components serve the workflow.** The existing design system (globals.css, cockpit suite, navigation suite) is reused; no template-led page inventory.
4. **No fake surfaces.** A nav destination, tab, or control exists only when its behavior is real (persisted, permission-aware, stateful). Unbuilt capabilities are absent, not decorative.
5. **Dual runtime, one model.** The demo workspace store (local dev, no Supabase) and the Supabase API runtime share entity shapes and state machines defined once in `lib/`. Demo mode is a truthful local runtime, not a mock showcase.
6. **Explicit states and transitions.** Lifecycle state changes go through validated transition functions, never arbitrary strings.

## 2. Information architecture

### 2.1 Global layer (the company)

Global destinations live in the header nav drawer + ⌘K palette; the shell already provides both. Target model (extends `components/navigation/navigation-model.ts`):

| Section | Destination | Route | Status |
|---|---|---|---|
| Operate | Home | `/` (becomes real home, not redirect) | **build** |
| Operate | Projects | `/projects` | exists |
| Operate | Opportunities | `/opportunities` (inquiries, leads, pipeline, clients, contacts) | **build (Slice A)** |
| Create | Media | `/library` | exists |
| Create | Reviews | `/reviews` | exists |
| Create | Deliveries | `/deliveries` | **build (Slice C)** |
| Workspace | Activity | `/activity` | exists |
| Workspace | Insights | `/insights` | later (only when backed by real rollup data) |
| Workspace | Archive / Trash | `/projects/archive`, `/projects/trash` | exists |
| Administration | Settings | `/settings` | exists |

Rules: Schedule, Resources, Finance, and Hermes do **not** get global nav entries until their backing entities exist. Hermes appears first as a project-level capability (§6), not a global silo. Capabilities remain role-gated via the existing `WorkspaceCapability` mechanism, extended with new capabilities (`opportunities:read/write`, `deliveries:read/write`, `creative:read/write`, `commercial:read/write`).

### 2.2 Project layer (one production)

The project cockpit (`/projects/[id]`) becomes the **Project Operating Record shell**. It keeps its immersive chrome-less layout but gains a persistent **project context bar** (§3.2) and **lifecycle-aware contextual navigation**. Contextual views are cockpit **sections** addressed by URL (`/projects/[id]?section=<id>`), extending the existing `CockpitSection` mechanism rather than a route-tree rewrite:

| Section | Content | Status |
|---|---|---|
| `overview` | Project home: stage, next actions, approvals needed, schedule, team, latest media, active review, delivery/financial state, recent decisions, risks | **build (new default)** |
| `creative` | Brief, references, treatment/script documents, versions, comments, approvals | **build (Slice A: brief)** |
| `proposal` | Proposal + estimate versions, approval state, change orders | **build (Slice A)** |
| `plan` | Milestones, tasks, schedule, crew/locations | placeholder-free: appears when plan entities land (Slice A adds tasks/milestones minimal) |
| `media` | Asset grid, upload, folders, transcripts (today's cockpit core) | exists |
| `edit` | Sequences, selects, timeline | **build (Slice B groundwork)** |
| `review` | Review items, versions, consolidated feedback, revision rounds | exists → **extend (Slice C)** |
| `delivery` | Deliverables, specs, QC, packages, download audit | **build (Slice C)** |
| `activity` | Project-scoped activity + audit | exists (filter) |

Sections whose entities have not landed are **not rendered as tabs** (principle 4). The tab set grows as slices land — the record is the constant, the views accumulate.

### 2.3 Workspace layer (immersive tools)

Specialized full-surface tools, each preserving project identity in a compact context bar:

- **Review workspace** — exists (`(review)/projects/[id]/assets/[assetId]`, public `/review/[token]`). Slice C adds consolidated-feedback mode.
- **Transcript workbench** — exists (`components/transcript/TranscriptWorkbench`). Slice B wires selects → sequence.
- **Sequence editor** — new (Slice B groundwork): real sequence/track/clip model, trim/split core, no pretend-NLE chrome.
- **Script/brief editor** — new (Slice A): structured documents with versions, inside `creative` section.

## 3. Shell architecture

### 3.1 Global shell (exists — extend, don't replace)

`components/Shell.tsx` + `WorkspaceNavigation` + `CommandPalette`: header brand, drawer nav, search/palette, notifications, account. Changes:
- New navigation model entries per §2.1 with capability gates.
- Home route becomes a real project-aware home (attention queue: approvals waiting, reviews active, inquiries to triage, upcoming milestones).
- Brand unification: `CoProductionBrand` → Co-VideoPro lockup; metadata, emails, storage keys (see DECISIONS D3).

### 3.2 Project context bar (new, inside cockpit)

Persistent top strip on all project sections: brand mark → global home, **project switcher**, project name + **lifecycle stage chip**, contextual tabs, command-palette trigger, processing indicator, notifications. Fixes the current "cockpit drops all global context" problem (Current State §4) without un-immersing workspaces.

### 3.3 Command palette

Extend command sources: projects, assets (exist) + inquiries, briefs, proposals, deliverables, and **actions** ("New inquiry", "New brief", "New proposal", "Upload media", "Create review link"). Actions are capability-gated.

## 4. Data architecture

### 4.1 Canonical model definition

Entity shapes, state machines, and transition validators live ONCE in `lib/` (framework-free TypeScript), consumed by both runtimes:

- `lib/co-produce/lifecycle-contract.ts` — existing contract layer; extended with the new records (keeps its self-validator + tests).
- New: `lib/covideopro/record.ts` — Project Operating Record types + stage model; `lib/covideopro/transitions.ts` — pure transition functions (inquiry→lead→opportunity, brief draft→approved, proposal draft→sent→approved, project stage advance, deliverable spec→qc→delivered, revision consolidation).
- Existing `lib/types` DB shapes remain the Supabase contract; new tables get matching types.

### 4.2 Demo runtime (local dev truth)

`lib/demo/workspace-store.ts` extends from review-centric state to the full record: organizations, contacts, inquiries, briefs, proposals, plan items, sequences, deliverables, decisions — with mutation functions per entity (matching the existing `addDemo*` / `toggleDemo*` pattern) and **localStorage persistence under a versioned key** `co-videopro.workspace.v2` (migration shim reads v1). Seed data (`lib/demo/workspace.ts`) is rebuilt as a realistic production slate (§5) and decontaminated.

### 4.3 Supabase runtime (production truth)

New migration `014_project_operating_record.sql` (schema `co_production`): `organizations`, `contacts`, `inquiries`, `briefs`, `brief_versions`, `proposals`, `proposal_versions`, `estimate_lines`, `plan_items`, `sequences`, `sequence_clips`, `deliverables`, `decisions`, `revision_requests` — RLS policies mirroring `project_members` authority, status enums as CHECK constraints matching the transition validators. API routes under `app/api/` are added per slice (same handler pattern as existing routes). **Local dev without Supabase credentials continues to run on the demo runtime; the Supabase path is schema-and-test complete.**

### 4.4 Media architecture (unchanged foundations)

tus ingest, FFmpeg worker pipeline, transcriptions, versions remain as-is; Slice B/C add: `sequences`/`sequence_clips` referencing `assets`+`versions`, `selects` as marked transcript/edit-decision ranges, `deliverables` referencing a frozen version. Detail in `COVIDEOPRO_MEDIA_ARCHITECTURE.md` (written with Slice B).

## 5. Seed slate (realistic, decontaminated)

Replace `lib/demo/workspace.ts` seed with a plausible production company slate (drawn from Content Co-op's real client shape — energy/industrial/conference brands): 4–5 projects at **different lifecycle stages** (one inquiry mid-triage, one brief in revision, one proposal awaiting approval, two in production/post with assets/comments/revision rounds, one delivered with QC + download audit), each with contacts, a changing brief, proposal versions, plan items, many assets with transcripts and time-coded comments. No ACS content.

## 6. Hermes (scoped honestly)

Hermes lands as **project intelligence over the record**, not a chat toy: project summary, missing-preproduction flags, review-feedback consolidation, approval blockers — implemented as deterministic + AI-backed analyzers over the record with visible source context, proposed actions, and audit entries in `activity_log`. The existing vault/agent-harness (`app/api/vault/*`) provides provenance/audit plumbing. Global autonomous routing is out of scope for this mission phase.

## 7. Phasing (vertical slices)

| Phase | Slice | Lands |
|---|---|---|
| 0 | Baseline | Current-state doc, runtime boot, screenshots, test baseline |
| 1 | Shell + Record skeleton | Nav model v2, project context bar, section tabs, record types + transitions + tests, seed slate v2, rebrand, decontamination |
| 2 | **A: Inquiry→Brief→Proposal→Approval→Project** | Opportunities surface, creative brief section, proposal/estimate section, approval→project creation, workflow tests |
| 3 | **C: Sequence→Review→Consolidated feedback→Revision** | Consolidated feedback view, revision requests, decisions, delivery section with QC |
| 4 | **B: Ingest→Transcript→Selects→Sequence** | Selects from transcript, sequence model + minimal editor, review-version from sequence |
| 5 | Hardening | Perf passes, a11y, visual QA matrix, docs completion, final report |

## 8. Explicit non-goals for this phase

Desktop-NLE feature breadth (multicam, effects stacks, nested sequences), global Hermes autonomy, client-portal rebrand beyond the existing token review surface, finance ledger depth, production deployment. These are roadmap items, and are never represented as built.
