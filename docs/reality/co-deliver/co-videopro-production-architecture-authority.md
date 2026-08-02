# Co-VideoPro Production Architecture Authority

Status: active source-of-truth contract for the architectural consolidation
phase. This document describes the current source tree, not a claim that any
unapplied migration is live.

## Product invariant

Co-VideoPro is one production operating system. A production is the canonical
unit of work. A specialized workspace may change how a person works, but it
must operate on the same production, people, source media, decisions, and
audit history.

No feature earns a new product, rail item, dashboard, route family, or
duplicate data store merely because it has a specialized interaction model.

Before a visible capability is implemented, its owner must declare:

1. its canonical object;
2. its canonical home;
3. its lifecycle role;
4. the actor and permission required to use it;
5. the shared state it reads or mutates; and
6. how a user enters and leaves the workflow without losing production context.

## Current durable object map

The following table distinguishes source-defined authority from the UI that may
currently render it. "Source-defined" means a migration or server contract
exists in this checkout; it does not mean that the migration has been applied
to a live database.

| Domain | Canonical records | Current home | Lifecycle role | Permission boundary |
| --- | --- | --- | --- | --- |
| Organization and people | team membership, project membership, audit records | workspace/account controls | all stages | role/RLS/RPC checks |
| Intake | intake forms, public inquiries, public inquiry receipts | public inquiry form and Sales intake | Inquiry | public form writes through service-owned RPC; staff reads/qualifies |
| Client intelligence | CRM accounts, contacts, opportunities, creative brief revisions | Sales intake today; future project Brief projection | Discovery and Brief | staff qualification and project role gates |
| Production identity | project plus immutable accepted-proposal or manual-origin evidence | Projects and the project workspace | activation through archive | project membership and origin RPC authority |
| Commercial handoff | proposal integration bindings and handoff receipts | Sales/Proposal Studio handoff | Proposal and activation | proposal authority; no duplicate cockpit writer |
| Plan | preproduction authority, plan, script, shot-plan, schedule, and day-specific call-sheet revisions, tasks, dependencies, receipts, events | project Plan projection and operating-record snapshot | pre-production and production | project preproduction role/RPC authority |
| Media | ingest authority, upload session, asset catalog, versions | project Edit and global Library projection | ingest and post-production | project media/ingest authority |
| Review | version, invite, comment, decision, approval, and review evidence | project Review and public review link | review and approval | project/review-link principal scope |
| Delivery | final delivery record is not yet durable | future project Delivery projection | release, completion, archive | planned; share receipts are not delivery authority |
| Communication and automation | linked outbox, notification, webhook, audit records | object context plus future Inbox/Automations projections | every stage | route/RPC policy and human approval |

### Authority constraints

- A project is stable identity, not a replacement for its brief, scope, plan,
  media, or delivery records.
- Cross-project views are projections of shared data. Library, Calendar,
  Inbox, Finance, Analytics, and Clients must not create alternate object
  identities.
- A review asset, an edit sequence, a shared review version, and an archived
  deliverable remain traceable to the same production and source media.
- AI output is always a proposal. Human permissioned commands perform durable
  changes and produce audit evidence.

## Known architectural gaps

These findings drive the consolidation order. They are not permission to hide
the gaps behind a new dashboard.

1. The operating-record read model now reads explicit project origin and a
   validated plan/task snapshot, but it still lacks review-root evidence,
   media-ingest evidence, and durable final-delivery evidence. It must remain a
   derived read model rather than a competing writer.
2. Direct creation under the `co_production` authority now persists an immutable
   manual-origin receipt through an idempotent RPC. The legacy `public` schema
   remains a compatibility path and must not be mistaken for equivalent origin
   authority.
3. Preproduction authority is available to the operating-record snapshot, but
   project activation does not yet guarantee an initial plan revision. The
   existing project Plan workspace now exposes an explicit, producer-capable
   initializer for a first revision; it must remain an intentional command,
   not an inferred or automatically created plan.
4. The declared review root is not the active application authority. Actual
   review work is currently version, invite, comment, approval, and asset
   bound. A future review-root decision must consolidate rather than duplicate.
5. Share and notification receipts prove governed review sharing, not final
   delivery. The product must not show a final-delivery or completion state
   before a delivery authority exists.
6. The navigation capability vocabulary and lifecycle permission vocabulary
   are not yet one contract.
7. Call-sheet authoring is now source-bound to one day in the active approved
   production schedule, but crew/location master records, distribution,
   notifications, recipient acknowledgement, permits, and releases remain
   separate unavailable authorities. An approved call sheet must not imply
   that it was sent or received.

## Information architecture

### Current global destinations

The application currently has working global routes for Projects, Reviews,
Sales and intake, Library, Activity, and Settings. They remain the current
surface authority until backed replacements exist.

The target global model is deliberately limited:

| Target destination | Purpose | Availability rule |
| --- | --- | --- |
| Home | cross-production next actions and operating health | do not add while it merely duplicates Projects |
| Projects | production portfolio and entry point | active |
| Clients | client/account relationship projection | wait for a dedicated backed route |
| Inbox | cross-production linked communication projection | wait for a linked communication read model |
| Calendar | cross-production production schedule projection | wait for durable schedule authority |
| Library | cross-production asset projection | active |
| Finance | cross-production proposal, invoice, payment, and profitability projection | wait for durable finance authority |
| Automations, Templates, Analytics, Settings | secondary system capabilities | show only backed, role-appropriate destinations |

Do not add a dead global link to imitate this target. During transition, Review
inbox and Sales intake remain explicit working projections rather than being
renamed to unavailable destinations.

### Project lifecycle navigation

Every open production converges on this stable local navigation:

| Lifecycle workspace | Current source mapping | Transition rule |
| --- | --- | --- |
| Overview | project operating record plus focused status | active; it must become a derived snapshot, never a second writer |
| Brief | qualified creative-brief revision and project context | read-only/unavailable until project-scoped brief revisions are durable |
| Proposal | Sales/Proposal Studio handoff evidence | read-only bridge until a project-owned proposal projection exists |
| Plan | production-plan, script, shot-plan, production-schedule, and call-sheet revisions plus tasks and dependencies | active; governed authoring stays in local Plan modes and does not create global destinations |
| Edit | media, sequences, versions, transcripts, edit decisions | consolidate current media/sequences/versions under one workspace with local subviews |
| Review | versions, review links, comments, approvals | consolidate current reviews/approvals under one workspace with local subviews |
| Delivery | durable deliverables, release controls, final payment gate | unavailable until delivery authority exists; do not simulate completion from sharing |

Legacy cockpit sections are migration aliases, not long-term peers:

- metadata is an Overview inspector;
- tasks is a Plan local view;
- media, sequences, and versions are Edit local views;
- reviews and approvals are Review local views;
- view=review, edit, and focus are selected-asset or layout state, not
  lifecycle destinations.

Any future /projects/{id}/{workspace} route must mount the same project shell
as /projects/{id}. Legacy asset-review URLs must redirect at the boundary while
preserving the selected asset and public-review links must remain separate
recipient surfaces.

## Spatial and interaction grammar

| Layer | Responsibility |
| --- | --- |
| Global shell | brand, stable cross-production navigation, search, activity, account |
| Project shell | project identity, lifecycle stage, project switcher, project status |
| Lifecycle workspace | the primary work surface for one stage |
| Local subview | a focused representation of the same lifecycle object |
| Context inspector | selected object metadata, comments, approvals, versions, permissions, transcript, or AI evidence |
| Drawer | bounded auxiliary work that should not displace the primary surface |
| Modal | creation, upload, confirmation, or destructive action with a clear end |
| Popover/menu/command | rare actions, filters, layout choices, and shortcuts |

The left rail is never a feature inventory. The center remains the main work
surface. The right inspector always describes the selected object. Time-based
information belongs at the bottom only when the active task needs it.

## Metronic adoption boundary

The local Metronic 9.5.0 bundle is an interaction and implementation inventory,
not a product shell. Direct use of its source, icons, and assets is
license-gated; do not copy them into Co-VideoPro until that use is explicitly
cleared.

Safe patterns to adapt through Co-VideoPro wrappers:

- menus, command surfaces, drawers, dialogs, tooltips, and focus management;
- accessible tabs, filters, tables, bulk actions, empty/loading/error states;
- form, upload, notification, profile, and status-control behaviors; and
- responsive panel and sticky-header behavior.

Do not adopt Metronic demo layouts, headers, rails, theme tokens, sample data,
Keenicons, or dashboard-card composition. Existing Co-VideoPro brand assets,
Lucide icon use, design tokens, and bright cockpit shell remain authoritative.

## Connected lifecycle implementation order

The first completed spine is:

public inquiry -> qualification -> client/account/contact/opportunity/brief
origin -> accepted proposal or explicit manual origin -> explicitly initialized
production plan -> project operating record

Implementation sequence:

1. Keep every `co_production` project creation path bound to exactly one
   immutable origin: accepted proposal, CRM-linked external proposal, or
   explicit manual origin. Replace the legacy public-schema compatibility path
   before treating this invariant as universal.
2. Initialize and version the initial plan state through the existing Plan
   workspace. Do not infer a plan from missing data; preserve the same request
   identity for an explicit retry and render only the reloaded durable snapshot.
3. Expand the project operating-record API into a project-scoped derived
   snapshot whose revision reflects origin, commercial handoff, plan/tasks,
   media/versions, review/approvals, and later delivery.
4. Change the cockpit to consume that single snapshot for orientation while
   keeping each domain-specific command behind its existing authority.
5. Complete public-inquiry attachments as intake evidence only. Attachments
   must remain quarantined, hash-bound, malware-scanned, and linked to the
   inquiry; they must not become project media before qualification and ingest.
6. Add Review and Delivery only after their canonical data authority is
   connected. Delivery remains blocked until a durable deliverable/release
   record exists.

## Acceptance gates

No lifecycle change is complete until all applicable checks pass:

- no new permanent navigation endpoint without a backed canonical object;
- role and public-link permissions reject unauthorized reads and writes;
- project origin is explicit and immutable;
- the operating record reads its facts from canonical domain records;
- the current stage, blocker, owner, and next action are explainable from
  source facts;
- mobile and desktop use the same object model and preserve project context;
- visible controls have loading, error, empty, success, and permission states;
- route and interaction tests cover canonical and legacy compatibility paths;
- visual comparisons are captured in the selected browser at matched desktop
  and mobile states.

Current visual-capture limitation: the selected in-app browser policy has
blocked this localhost automation session. Do not relabel older captures as
fresh proof or bypass the selected-browser restriction with another browser.
