# Co-VideoPro — Product Model (Project Operating Record)

**Date:** 2026-07-16 · **Status:** governing entity/state specification · **Companions:** `COVIDEOPRO_TARGET_ARCHITECTURE.md`, `COVIDEOPRO_DECISIONS.md`

The Project Operating Record is the single authoritative accumulation of everything a project touches, from first inquiry to archive. This document specifies the entities and state machines implemented **now** (Slices 1–4), and sketches the full target model.

---

## 1. Project lifecycle stage (the spine)

`projects.stage` — one value, project-wide, advanced only through validated transitions:

```
inquiry → intake → development → preproduction → production → post → review → delivery → archived
```

| Stage | Meaning | Entry requirement |
|---|---|---|
| `inquiry` | inbound request captured, not yet qualified | inquiry record created |
| `intake` | qualified as an opportunity; client + contacts linked | contact + client confirmed |
| `development` | creative brief + proposal in progress | brief v1 exists |
| `preproduction` | proposal approved; plan, schedule, crew forming | proposal approved → project created |
| `production` | shoot days underway | first production day reached/started |
| `post` | media ingested, edit underway | first sequence created |
| `review` | versions in client review | first review link sent |
| `delivery` | approved; encoding/QC/packages | final approval recorded |
| `archived` | closed, with learnings | all deliverables delivered |

Stage never regresses silently; a regression (e.g. new revision round) is an **event**, not a stage rewrite — `review` re-entered via a `revision_request`, recorded in activity.

## 2. Implemented entities (Slices 1–4)

All new entities carry: `id`, `project_id` (nullable only where noted), `created_at`, `updated_at`, `created_by`, and an explicit `status` driven by the transition table in §3.

### 2.1 Commercial / CRM
- **organizations** — client companies (`name`, `industry`, `website`, `notes`). Workspace-scoped, no `project_id`.
- **contacts** — people (`organization_id`, `name`, `email`, `role` e.g. producer-facing title, `is_primary`).
- **inquiries** — inbound requests (`organization_id?`, `contact_id?`, `source`, `summary`, `received_at`, `status`). An inquiry may exist before any project; on qualification it links/creates a project.
- **briefs** — creative brief per project (`objectives`, `audience`, `message`, `references[]`, `deliverables_notes`, `status`, `version`). Versions immutable: edits create `brief_versions` snapshots.
- **proposals** — commercial offer per project (`title`, `narrative`, `status`, `version`, `valid_until`). **estimate_lines** (`proposal_id`, `category`: crew|equipment|travel|post|deliverable|other, `description`, `quantity`, `unit_rate`, `markup_pct`, `optional`). Versions immutable like briefs. Approval records `approved_by`, `approved_at`; approval is the gate that creates the production project (or advances stage to `preproduction`).

### 2.2 Planning (minimal viable)
- **plan_items** — unified planning row (`kind`: milestone|task|production_day, `title`, `date`/`start_date`, `assignee`, `status`: pending|in_progress|done|blocked, `depends_on[]`). Crew/location/equipment full models are a later phase; plan_items carry `meta` for crew/location notes now.

### 2.3 Media / Edit
- **assets, versions, transcriptions, edit_decisions** — exist (Current State §1.4); unchanged.
- **selects** — a marked range pulled from a transcript or review (`asset_id`, `version_id?`, `in_seconds`, `out_seconds`, `label`, `source`: transcript|review|manual, `transcript_segment_ids[]`).
- **sequences** — an edit (`project_id`, `name`, `status`: draft|in_review|approved|locked, `version`, `fps`, `created_from`: manual|transcript-assembly).
- **sequence_clips** — ordered clips (`sequence_id`, `asset_id`, `version_id?`, `track_index`, `timeline_in_seconds`, `timeline_out_seconds`, `source_in_seconds`, `source_out_seconds`, `select_id?`). This is the truthful NLE foundation: real source/record times, no decorative timeline.

### 2.4 Review consolidation / Delivery
- **revision_requests** — consolidated client feedback per asset+version (`asset_id`, `version_id`, `summary`, `status`: open|in_progress|addressed|verified, `round` int).
- **decisions** — recorded outcomes (`project_id`, `subject`, `body`, `decided_by`, `source`: review|comment|meeting|hermes, `comment_ids[]`) — the project's decision memory.
- **deliverables** — a promised output (`project_id`, `name`, `spec`: resolution/codec/aspect/captions/audio, `source_version_id`, `status`: specced|encoding|qc|ready|delivered|expired, `qc_notes`, `delivered_at`, `download_events[]` as related rows later).

### 2.5 Intelligence
- Existing `activity_log` + `edit_decisions` + vault `agent_runs` remain the audit/provenance substrate. Hermes outputs persist as `activity_log` entries with `source=hermes` and attached context ids. No new chat tables this phase.

## 3. State machines (transition tables — implementation contract)

### inquiry.status
`new → triaged → qualified → converted` · `new/triaged → declined`
- `qualify` requires contact + organization linked. `convert` requires an accepted proposal linkage path or explicit "convert to project" action → creates/links project, sets `projects.stage=intake→development`.

### brief.status
`draft → in_review → approved → superseded`
- Edits after approval create a new version and reset to `draft` (version++, prior version `superseded`).

### proposal.status
`draft → in_review → sent → approved | declined` · `approved → superseded` (change order creates new version)
- `send` requires ≥1 non-optional estimate line. `approve` records identity + timestamp and is the project-creation gate.

### sequence.status
`draft → in_review → approved → locked`
- `in_review` requires ≥1 clip and a linked review version.

### revision_request.status
`open → in_progress → addressed → verified`
- Creating one when none open starts `round = max(round)+1` for that asset. `verified` requires all linked comments resolved or explicitly waived.

### deliverable.status
`specced → encoding → qc → ready → delivered` · `ready → expired`
- `qc` requires a source version frozen (`source_version_id` immutable from here).

## 4. Full target model (north star — not built this phase)

Per mission §9: teams/roles/permissions beyond the current model; treatments, scripts + script_versions, scenes, storyboards/frames, shots/shot_lists; contracts, invoices, payments, expenses, purchase/change orders; production days, calendar events, crew members, role assignments, talent, locations, equipment/kits, call sheets, releases, dependencies, risks; storage locations, proxies, thumbnails, waveforms (partially exist), tags/collections/bins, markers/annotations (exist), OCR; tracks, transitions, effects, caption tracks, keyframes, renders/exports; reviewer drawings (exist), mentions (exist in comments), notification routing; encoding presets, delivery packages, recipients, watermarks (partially exist), download events, archive records; hermes sessions, agents, tasks, recommendations, context snapshots, memory, policies, tool invocations, approval requests, audit events (vault partially exists).

These land by slice, each with the same discipline: contract → migration + demo slice → transitions + tests → surface → visual QA.

## 5. Invariants

1. Every lifecycle entity resolves to exactly one `project_id` (except workspace-scoped organizations/contacts and pre-conversion inquiries).
2. Versioned documents (brief, proposal) are append-only; the "current" pointer moves, history never mutates.
3. No status field is written outside its transition validator (unit-tested).
4. Every transition writes an `activity_log` event with actor, before/after status, and source surface.
5. The demo runtime and Supabase runtime enforce the same transitions from the same `lib/` validators.
