# Co-Produce Lifecycle And Data Contract

Date: 2026-07-15  
Status: Additive contract; not a production-readiness claim

## Purpose

This document defines the durable product contract behind the four Co-Produce
reference images:

- `co-produce-lifecycle-dashboard-2026-07-15.png`
- `co-produce-system-map-2026-07-15.png`
- `co-produce-review-cockpit-canonical-2026-07-15.png`
- `co-produce-agentic-production-cycle-brand-2026-07-15.png`

The normative machine-readable contract is
`lib/co-produce/lifecycle-contract.ts`. The images are product intent. They are
not evidence that every pictured capability is implemented.

## Non-Negotiable Authority

Co-Deliver remains the authority for identity, workspace membership, projects,
assets, versions, reviews, comments, approvals, review invites, notifications,
delivery, and audit.

Co-Script may own project-scoped brief, script, storyboard, schedule, and
production-note revisions. Co-Edit may own version-scoped transcript,
composition, edit-decision, graphics, audio, and render revisions. Neither may
create a second project, identity, permission, version, review, billing, or
audit authority.

The project vault may eventually own durable agent-run contracts and events.
The current local/in-memory harness is not that authority and is therefore
listed as unavailable.

## Stable Identity

The contract uses stable, namespaced IDs:

- phase IDs: `pre-production`, `production`, `post-production`,
  `delivery-assets`
- owner IDs: the four phase IDs plus `workspace-shell` and
  `human-agent-loop`
- capability IDs: `<owner>.<capability>`, for example
  `post-production.reviews-feedback`
- surface IDs: stable functional locations such as `nav.reviews` and
  `cockpit.approve`
- route IDs: keys in `CO_PRODUCE_ROUTES`
- record types: keys in `CO_PRODUCE_RECORDS`

Renaming visible copy does not rename an ID. An ID change is a contract change
and requires an explicit migration or compatibility alias.

## Lifecycle Ordering

The only ordered production phases are:

1. Pre-production
2. Production
3. Post-production
4. Delivery & Assets

The human+agent loop is cross-cutting and has no fifth-phase semantics. The
workspace shell is also not a phase.

Phase status is a derived projection with these values:

- `not-started`
- `in-progress`
- `waiting-on-human`
- `blocked`
- `complete`

Progress uses integer basis points. It is derived from capability readiness and
canonical records. A client must not write phase progress or phase status as an
independent source of truth. In particular, an unavailable capability cannot be
counted as complete.

## Record And Status Semantics

Every capability names one primary durable record type and zero or more
supporting record types. `CO_PRODUCE_RECORDS` declares:

- owning module
- deployment state: `canonical` or `planned`
- physical storage when canonical
- scope and parent authority
- write rule
- status authority and transition rule

Canonical status fields remain authoritative where they exist:

| Record | Status authority |
| --- | --- |
| Project | `projects.status`: `active`, `archived`, `completed` |
| Asset | `assets.status`: ingest, review, approval, and final states |
| Version | append-only; `is_current` is a derived pointer, not version status |
| Review | `reviews.status`: `open`, `completed`, `cancelled` |
| Comment | `comments.status`: `open`, `resolved`, `archived` |
| Approval workflow | `approval_workflows.status` |
| Approval step | `approvals.status`; every decision appends approval history |
| Review invite | active access derives from persisted policy, expiry, revocation, and limits |
| Activity event | immutable explanation of a committed action, never the action authority |
| Transcription | worker-owned processing state bound to an immutable version |
| Edit decision | reversible source-time decision state; never implicit publication |
| Transcode job | idempotent worker state; never review or approval authority |

All `planned.*` record types have `not-implemented` status semantics and no
storage name. They define the required future boundary without claiming a live
table or API.

## Readiness And Route Honesty

Readiness has four states:

- `operational`: the route and canonical record path exist.
- `read-only`: the route may project canonical data but does not own a write.
- `guarded`: the route and record path exist but runtime, recipient, worker, or
  policy gates must pass.
- `unavailable`: no live capability claim is allowed.

An unavailable capability always has:

- `route.kind = "unavailable"`
- `routeId = null`
- `audit.responsibility = "unavailable"`
- access denied even if a caller supplies every permission
- `resolveCoProduceCapabilityRoute(...) = null`

There is no demo fallback and no broad redirect to a plausible-looking page.

Available routes come from a fixed local registry. Dynamic values occupy one
encoded path segment and must match the safe-segment policy. Missing, extra,
slash-bearing, traversal, query, fragment, or absolute-URL input is rejected.

## Permission Boundaries

Current workspace grants stay compatible with the cockpit navigation model:

- `projects:read`, `projects:create`
- `media:read`, `media:write`
- `reviews:read`, `reviews:comment`, `reviews:approve`
- `activity:read`
- `workspace:manage`

Future module grants are explicit and currently planned:

- `preproduction:write`
- `production:manage`
- `postproduction:write`
- `delivery:manage`
- `analytics:read`
- `storage:manage`
- `integrations:manage`
- `agents:propose`, `agents:approve`

Workspace grants never satisfy a public review-invite requirement, and a review
invite never satisfies a workspace requirement. Public invite permissions are
ordered `view < comment < approve`. `comment` cannot approve. `approve` does
not grant workspace access.

Planned permissions do not make unavailable capabilities available.

## Event And Audit Responsibility

Read-only views append no events. Mutating capabilities declare one of:

- `append-after-commit`: append sanitized audit evidence only after the
  authoritative write commits.
- `append-attempt-and-outcome`: record a sanitized attempt and terminal result
  for long-running upload, export, or worker-backed operations.
- `unavailable`: emit nothing because the feature has no live mutation path.

Approval decisions append `approval_history`. Other current project actions use
`activity_log`. Tokens, credentials, source URLs, and provider secrets are never
audit payloads.

## Capability Matrix

The TypeScript registry maps every named functional surface to one capability.
Repeated labels in multiple images are surface references on the same
capability, not duplicate ownership.

### Workspace Shell

| Capability | Readiness | Route intent | Permission | Primary record | Audit |
| --- | --- | --- | --- | --- | --- |
| `workspace-shell.dashboard` | read-only | dashboard | `projects:read` | `project` | read-only |
| `workspace-shell.projects` | operational | projects | `projects:read` | `project` | read-only |
| `workspace-shell.project-overview` | read-only | project | `projects:read` | `project` | read-only |
| `workspace-shell.search` | read-only | dashboard action | `projects:read` | `project` | read-only |
| `workspace-shell.notifications` | read-only | dashboard action | `projects:read` | `notification` | read-only |
| `workspace-shell.team-management` | guarded | settings | `workspace:manage` | `team_member` | after commit |
| `workspace-shell.activity` | read-only | activity | `activity:read` | `activity_event` | read-only |
| `workspace-shell.settings` | guarded | settings | `workspace:manage` | `team` | after commit |
| `workspace-shell.timeline` | read-only | asset review | `media:read` + `reviews:read` | `version` | read-only |
| `workspace-shell.details` | read-only | project | `projects:read` + `media:read` | `asset` | read-only |
| `workspace-shell.storage-management` | unavailable | none | `storage:manage` | `planned.storage_allocation` | unavailable |

### Pre-production

| Capability | Readiness | Permission | Primary record |
| --- | --- | --- | --- |
| `pre-production.project-brief` | unavailable | `preproduction:write` | `planned.project_brief_revision` |
| `pre-production.scripts-storyboards` | unavailable | `preproduction:write` | `planned.script_revision` |
| `pre-production.shot-lists-schedules` | unavailable | `preproduction:write` | `planned.shot_schedule` |
| `pre-production.locations-talent` | unavailable | `preproduction:write` | `planned.location_talent_release` |
| `pre-production.tasks-approvals` | unavailable | `preproduction:write` | `planned.production_task` |

### Production

| Capability | Readiness | Route intent | Permission | Primary record | Audit |
| --- | --- | --- | --- | --- | --- |
| `production.live-production` | unavailable | none | `production:manage` | `planned.production_session` | unavailable |
| `production.on-set-media` | guarded | project upload action | `media:write` | `asset` | attempt and outcome |
| `production.logging-metadata` | read-only | project | `media:read` | `asset` | read-only |
| `production.team-communication` | unavailable | none | `production:manage` | `planned.production_log` | unavailable |
| `production.daily-reports` | unavailable | none | `production:manage` | `planned.production_log` | unavailable |

### Post-production

| Capability | Readiness | Route intent | Permission | Primary record | Audit |
| --- | --- | --- | --- | --- | --- |
| `post-production.editor-workspace` | unavailable | none | `postproduction:write` | `planned.sequence_revision` | unavailable |
| `post-production.reviews-feedback` | operational | asset review | `reviews:read` + `reviews:comment` | `comment` | after commit |
| `post-production.public-review` | guarded | public review | invite `view` | `review_invite` | after commit |
| `post-production.public-review-comment` | guarded | public review action | invite `comment` | `comment` | after commit |
| `post-production.public-review-approval` | guarded | public review action | invite `approve` | `approval_step` | approval history |
| `post-production.review-approvals` | guarded | asset review | `reviews:approve` | `approval_step` | approval history |
| `post-production.spatial-annotations` | unavailable | none | `reviews:comment` | `annotation` | unavailable |
| `post-production.graphics-titles` | unavailable | none | `postproduction:write` | `planned.graphics_revision` | unavailable |
| `post-production.audio-music` | unavailable | none | `postproduction:write` | `planned.audio_mix_revision` | unavailable |
| `post-production.exports-versions` | guarded | asset review | `media:write` | `version` | attempt and outcome |

### Delivery & Assets

| Capability | Readiness | Route intent | Permission | Primary record | Audit |
| --- | --- | --- | --- | --- | --- |
| `delivery-assets.deliverables` | unavailable | none | `delivery:manage` | `planned.delivery_record` | unavailable |
| `delivery-assets.asset-library` | operational | library | `media:read` | `asset` | read-only |
| `delivery-assets.permissions-sharing` | guarded | asset review action | `reviews:comment` | `review_invite` | after commit |
| `delivery-assets.distribution` | unavailable | none | `delivery:manage` | `planned.distribution_record` | unavailable |
| `delivery-assets.project-archive` | operational | archive | `projects:read` | `project` | read-only |
| `delivery-assets.archive-compliance` | unavailable | none | `delivery:manage` | `planned.compliance_record` | unavailable |

### Human + Agent Loop

| Capability | Readiness | Route intent | Permission | Primary record | Audit |
| --- | --- | --- | --- | --- | --- |
| `human-agent-loop.lifecycle-control` | read-only | project | `projects:read` | `project` | read-only |
| `human-agent-loop.human-checkpoint` | read-only | asset review | `reviews:approve` | `approval_step` | read-only |
| `human-agent-loop.agent-copilot` | unavailable | none | `agents:propose` | `planned.agent_run` | unavailable |
| `human-agent-loop.ai-automations` | unavailable | none | `agents:propose` + `agents:approve` | `planned.agent_run` | unavailable |
| `human-agent-loop.smart-search` | unavailable | none | `projects:read` | `planned.search_index` | unavailable |
| `human-agent-loop.real-time-collaboration` | guarded | asset review | `reviews:read` + `reviews:comment` | `comment` | after commit |
| `human-agent-loop.analytics-insights` | read-only | project | `projects:read` | `project_analytics` | read-only |
| `human-agent-loop.custom-workflows` | unavailable | none | `workspace:manage` | `planned.workflow_template` | unavailable |
| `human-agent-loop.integrations-apis` | unavailable | none | `integrations:manage` | `planned.integration_connection` | unavailable |
| `human-agent-loop.mobile-access` | unavailable | none | `projects:read` | `planned.mobile_certification` | unavailable |
| `human-agent-loop.secure-cloud` | unavailable | none | `storage:manage` | `planned.storage_allocation` | unavailable |

## Explicitly Unsupported Claims

The contract intentionally does not claim these pictured features as live:

- durable briefs, scripts, storyboards, shot lists, schedules, call sheets,
  locations, talent, permits, or production tasks
- live production sessions, on-set logs, production announcements, or daily
  reports
- durable sequences, a full editor, graphics/title revisions, audio mixes, or
  the pictured multi-tool annotation workflow
- final delivery records, distribution receipts, compliance, legal hold, or
  storage allocation management
- semantic search, custom workflow templates, managed integrations, durable
  agent runs, autonomous mutations, or certified mobile production workflows

Current uploads, comments, approvals, exports, webhooks, responsive components,
and in-memory agent demonstrations do not fill those gaps by implication.

## Consumer Rules

1. Render capabilities from `CO_PRODUCE_CAPABILITY_GROUPS`; do not maintain a
   second ad hoc lifecycle list.
2. Call `canAccessCoProduceCapability` before presenting an available command.
3. Resolve navigation only with `resolveCoProduceCapabilityRoute`.
4. Render `unavailable` as unavailable. Do not route it to a demo or generic
   project page.
5. Treat phase progress as a projection. Recompute it from canonical record and
   capability evidence.
6. Emit only the event names and timing owned by the mutating domain command.
7. Run `validateCoProduceLifecycleContract` in contract tests whenever the
   registry changes.

## Compatibility Baseline

This contract preserves the repository's existing project, asset, version,
review, comment, approval, invite, activity, transcript, and edit-decision
ontology. It also preserves the four phase IDs already used by the lifecycle
drawer and the workspace capability IDs used by cockpit navigation.

Known schema/type drift is represented rather than hidden: asset ingest states
extend the older review-oriented asset union, and `approved_with_changes` is
retained because current review logic recognizes it. A later migration may
normalize those declarations, but this contract does not edit existing types or
database schema.
