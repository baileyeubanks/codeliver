# Co-Deliver Visual Shell Navigation Authority

## Governing architecture rule

The product-level object, route, lifecycle, permission, and Metronic adoption
authority is co-videopro-production-architecture-authority.md in this
directory. This document governs the visual shell and placement of that
authority. Where the two documents overlap, the product architecture document
decides object and route ownership; this document decides composition and
control placement.

Co-VideoPro is one project-centered production system. New requirements must be
integrated into its object model and existing shell before any new route,
permanent rail item, dashboard, or panel is added.

Every capability must answer four questions before implementation:

1. What durable object does it act on?
2. What is that object's one canonical home?
3. Which state follows the object across planning, production, editing, review,
   and delivery?
4. Is the control global, workspace-local, contextual, or progressive
   disclosure?

The machine-readable object and lifecycle authority remains
`lib/co-produce/lifecycle-contract.ts`. This document governs where that
authority appears in the interface. A new visual surface cannot create a second
project, media, version, review, approval, task, identity, or audit authority.

## Canonical homes

| Object or domain | Canonical home | Contextual access |
| --- | --- | --- |
| Projects and productions | `/projects` | Project switcher and command search |
| One project's operating record | `/projects/{projectId}` | Overview, Tasks, Media, Review, lifecycle drawer, and inspector states within the same cockpit |
| Workspace review queue | `/reviews` | Selected asset review inside its owning project cockpit |
| External recipient review | `/review/{token}` or governed demo equivalent | Share links only; never used as the internal operator workspace |
| Cross-project media | `/library` | Project-scoped media inside the project cockpit |
| Sales, intake, briefs, and proposal handoff | `/sales` | Linked project context after qualification; no duplicate project record |
| Workspace history | `/activity` | Filtered activity beside the object that emitted it |
| Workspace and account policy | `/settings` | Account popover links and contextual settings deep links |
| Archive and Trash | Secondary project lifecycle navigation | Never primary mobile navigation |

Tasks, briefs, scripts, schedules, transcripts, edit decisions, approvals, and
delivery evidence belong to their project or version. They do not earn a global
navigation item merely because a feature exists.

## Control hierarchy

- **Global shell:** product wordmark, stable domain navigation, search, activity,
  and account controls. On mobile the shell uses the text-only `co-videopro`
  wordmark; the supplied full lockup remains the desktop authority.
- **Project shell:** project switcher, project status, lifecycle, current asset,
  and workspace mode. These controls preserve project context.
- **Workspace navigation:** current backed routes remain Projects, Reviews,
  Sales, Library, and Activity. The target global navigation is deliberately
  limited and must not gain dead destinations; Archive, Trash, and Settings
  remain secondary.
- **Local navigation:** the persistent project rail names the lifecycle work
  directly: Overview, Plan, Edit, and Review. Secondary project views
  (Sequences, Versions, Approvals, and Details) sit behind the rail's
  `More views` disclosure. This keeps the current object discoverable without
  turning the rail into a catalogue. Local views do not create parallel data
  homes.
- **Contextual inspector or drawer:** metadata, approvals, comments,
  transcription, versions, permissions, and advanced controls for the selected
  object.
- **Popover, menu, or command palette:** rare actions, layout choices, filters,
  and shortcuts.
- **Modal:** bounded creation, upload, confirmation, or destructive decisions
  that require focused completion.

The left rail is not a feature inventory. Controls stay beside the object they
affect, and advanced controls appear only when their object and permission state
make them relevant.

### Project rail implementation checkpoint

`components/cockpit/cockpit-navigation.ts` owns the distinction between:

- `COCKPIT_NAVIGATION`: the complete set of deep-link and command-palette
  sections;
- `COCKPIT_LIFECYCLE_NAVIGATION`: the permanent Overview, Plan, Edit, and
  Review rail; and
- `COCKPIT_MORE_VIEWS_NAVIGATION`: contextual Sequences, Versions, Approvals,
  and Details views disclosed by the rail on demand.

The compact rail, mobile bar, and mobile drawer consume the same lifecycle
vocabulary. Settings, brand controls, team management, and shortcut collections
are not project-rail destinations; they remain available through the global
shell, account controls, contextual commands, and their backed routes.

## Workspace anatomy

Every major workspace follows the same order:

1. Orientation: object identity, status, owner, and current stage.
2. Primary work surface: list, canvas, player, timeline, editor, or form.
3. Context: inspector, comments, approvals, metadata, and linked records.
4. Feedback: loading, processing, empty, permission, error, success, and audit
   state in the surface where the action occurred.
5. Continuation: the next valid lifecycle action without losing project context.

Cards are reserved for repeated records or genuinely bounded tools. Page
sections must not become a wall of unrelated cards, duplicate status panels, or
permanent controls.

## Primary workflow continuity

The canonical journey is:

`Sales/intake -> project -> plan/tasks -> production media -> version/edit -> review/approval -> delivery/archive`

The same project ID, people, assets, versions, dates, tasks, comments,
permissions, and events travel through that sequence. Specialized workspaces
may change the interaction model, but they operate on shared records and return
to the same project operating record.

## Consolidation gate

Before adding a visible element, audit the existing route, rail, tab, panel,
drawer, menu, and command palette. The decision must be one of: retain, merge,
rename, relocate, make contextual, move behind progressive disclosure, convert
to a command, express as a view of an existing object, or remove.

Implementation is not accepted when it creates competing navigation, a second
dashboard for the same object, duplicate status authority, controls detached
from their content, or a module island. Responsive work must preserve the same
object model and workflow; mobile is not a separate product.

## Route authority

- The bright internal cockpit shown by the visual reference at `/Users/baileyeubanks/Downloads/f41e61e5-4998-4cfd-8c58-13dbe6490f58-2026-07-15 (1).png` is the authority for internal demo review.
- Every internal demo media action must remain at `/projects/{projectId}?demo=1&asset={assetId}&view=review` so project navigation, operator controls, and the cockpit shell remain present.
- `/review/demo?...` is the stripped recipient surface. It is valid only for genuine public review links created by the share-link flow.

## Regression checkpoint

`tests/visual-shell-navigation.test.ts` fails when:

- a seeded asset in `lib/demo/workspace.ts` points outside its project cockpit;
- the demo upload constructor in `app/(dashboard)/projects/[id]/page.tsx` stops using the internal route builder or embeds `/review/demo`;
- the dashboard upload constructor in `app/(dashboard)/projects/page.tsx` stops using the internal route builder or embeds `/review/demo`;
- restored current, archived, or trashed demo assets retain stale external review hrefs;
- generated demo recipient links stop using the external `/review/demo` surface.

Persisted demo asset collections are normalized during restore. Persisted `shareLinks` are not normalized because their `public_url` values intentionally belong to the recipient review surface.

Run the checkpoint with:

```sh
node --experimental-strip-types --test tests/visual-shell-navigation.test.ts
```
