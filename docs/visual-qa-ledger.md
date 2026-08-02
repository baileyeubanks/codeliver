# Co-VideoPro Visual QA Ledger

Canonical checkout: `/Users/baileyeubanks/Desktop/Projects/contentco-op/cco-codeliver`

Selective source lane: `/Users/baileyeubanks/Desktop/Projects/contentco-op/cco-codeliver-visual-lane-20260715-4105`

Local preview: `http://localhost:4103/projects?demo=1`

Last verified: 2026-07-15

## Current Integration

- The existing bright Content Co-op shell remains the only application shell.
- `/projects?demo=1` now opens a workspace overview; choosing a project returns to the existing media library and its current upload, sharing, archive, trash, and review behavior.
- The shell, governed brand preview, auth surface, cockpit, and public review now crop directly from the exact supplied Co-VideoPro color raster at `public/brand/co-videopro-color-supplied.png`. Its SHA-256 is `9abeece51f42867ed3888e9ebda7c223378f54ff0709a8e195c2e1087ba9d7f7`.
- The exact supplied color and blue source rasters remain preserved with SHA-256 values `9abeece51f42867ed3888e9ebda7c223378f54ff0709a8e195c2e1087ba9d7f7` and `17d129841f6c2b78ad1afac402fa5c389e4c6657278ecd133eecf6948218f788`.
- The exact shell lockup is `public/brand/co-videopro-shell-lockup.png`, SHA-256 `27c1b2e5d72b8c57d4016220bfb88305a1e349dfff9330c94c923367006e35ba`.
- The opening media is responsive by source rather than crop: desktop uses the supplied landscape composition at `public/brand/co-videopro-opening-desktop.mp4` (SHA-256 `38c22d646c15daad8691c097c5b6891c484c1c17ef47d0905119bc4c916214a1`), while viewports at or below `640px` use the vertical mobile composition at `public/brand/co-videopro-opening-motion.mp4` (SHA-256 `eb7ce0facb752944537c52714a8e18e578e3e592be4c34a3102220f0dbd09677`). Each source has its own same-composition poster.
- The color source is used directly for horizontal, stacked, and compact product-brand slots. Customer-supplied workspace rasters remain direct, unmodified inputs rather than being substituted with a product asset.
- The first recent-project image is eager and high priority; later project images remain lazy.
- Inter and Manrope now use Next font self-hosting with only the required weights, `display: swap`, and explicit system/generic fallbacks. The page no longer needs runtime Google Fonts requests.
- The analytics PDF export now uses the repository-owned Inter WOFF2 at `public/fonts/inter-latin.woff2`; it no longer imports Google Fonts at report-open time.
- Fake batch, cloud-import, and split-upload controls were removed from the project toolbar. Visible commands now map to implemented actions or routes.
- Project and folder identity are separate throughout the library. Folder selection filters by `folder_id`, uploads remain bound to the folder's owning project, and the server verifies that relationship before persisting the destination folder.
- Overview, project, and folder selection are URL-owned, so refresh and browser Back preserve the selected surface. Recent-project media links now target the exact asset rather than relying on cockpit fallback selection.
- The mobile folder rail overlays the workspace instead of shrinking it, remains closed during the server-to-client handoff, and keeps its scrollable tree separate from the Archive and Trash footer.
- The persistent shell now crops the exact supplied Co-VideoPro raster instead of rebuilding the mark and wordmark from an older icon plus HTML text. The server-rendered document starts in the light theme, eliminating the dark first-paint flash.
- Production frame pins now convert the cockpit's `0..100` display coordinates to the API's `0..1` storage contract and convert persisted values back for exact placement. Demo coordinates remain unchanged.
- The project cockpit receives an explicit membership-derived role in production and an explicit owner role only in demo mode. Missing identity authority now fails closed to viewer, and upload/share controls guard their handlers as well as their disabled state.
- Cockpit sign-out redirects only after the server confirms logout. Remote, user-provided thumbnails bypass the Next image host allowlist and retain their existing error fallback.
- Review-link loading and unverified-session states share one responsive surface. Password readiness comes from a safe backend boolean; no hash or password value crosses the API boundary.
- Brand draft preview now replaces the published revision at its actual scope, matching post-publication precedence. The exact canonical raster remains byte-identical while Next serves responsive derivatives.
- Managed share creation now has a single transaction-owned source path for
  invite persistence, immutable audit receipts, and redacted email outbox
  intents. Webhook deliveries persist their expected team, support fenced lease
  renewal, and record replay-safe settlement receipts.
- Production batch sharing uses the guarded batch-share authority, project and
  folder uploads share the resumable ingest dialog, failed list refreshes keep
  the last valid workspace plus Retry, and asset/folder authority failures no
  longer masquerade as successful empty libraries.
- Queued managed shares render as accepted and pending. Upload cancellation
  waits for server termination and remains retryable when cancellation fails.
- Cockpit notifications use the project-scoped notification authority with
  realtime INSERT/UPDATE events and a bounded visibility-aware polling
  fallback. Failed read persistence rolls back instead of falsely clearing the
  unread state.
- The overview keeps all five production-status signals on mobile, applies the
  same project filters to desktop and mobile, exposes complete tab semantics
  and keyboard navigation, and leaves one open action per project row.
- Cockpit operational copy is no smaller than `11px`; primary review and
  timeline targets are `36-40px`; the full lockup remains visible at laptop
  widths; and the mobile review rail is a bounded overlay drawer.

## Findings

| Priority | Finding | Evidence | Status |
| --- | --- | --- | --- |
| High | The final source audit found production-only frame-pin scaling, fail-open role defaulting, logout redirect, and remote-thumbnail host failures. | Boundary helpers, explicit role propagation, guarded handlers, server-confirmed logout, focused regressions, and the full gate. | Fixed and verified |
| High | Product branding had drifted to derived blue defaults while the latest supplied color raster was only preserved on disk. | `CoProductionBrand` now crops the exact 7296x4096 supplied raster directly; platform governance and demo defaults resolve to that source. The canonical Browser DOM confirms the full lockup is rendered. | Fixed and verified |
| High | Production batch sharing, folder upload, and list failures could expose demo links, bypass the guarded ingest path, or look like valid empty data. | Guarded batch-share, authoritative upload dialog, snapshot-preserving Retry, bounded `503` failures, and focused authority tests. | Fixed and verified |
| High | Notification read state and upload/share progress could claim success before durable authority confirmed it. | Read rollback/refetch, realtime plus polling fallback, queued-share state, and server-confirmed cancellation. | Fixed and verified |
| Medium | Canonical desktop and mobile geometry needed a fresh Browser check after integration. | The in-app Browser selected the desktop and mobile opening sources at their respective media queries, measured zero document overflow, and returned ready/playing media. Its scaled screenshot transport tiled the image, so that output is not accepted as pixel-comparison evidence. | Geometry and source selection verified; matched recapture remains open |
| Clear | The isolated visual lane now shows the definitive Co-VideoPro raster in the bright shell across overview, cockpit, login, reviews, library, settings, and public review. | `docs/design-evidence/co-videopro-locked-20260715/` contains the inspected desktop/mobile states and reference comparison. | Verified in isolated lane |
| Clear | Canonical project-card, folder, detail, overview, review, collapse/reopen, upload-destination, and timeline flows required an integrated click-through. | The in-app Browser completed each flow in the canonical preview and reached the expected URL/state. | Verified |
| Medium | Timeline Arrow keys advanced by one second even when the player selected a two-second shuffle interval. | The cockpit now passes its selected interval into `CockpitReviewTimeline`; a live Browser check moved `2.5s` to `4.5s`. | Fixed and verified |
| Medium | Hidden mobile thumbnail wrappers left Next `fill` images under a statically positioned parent on desktop. | The shared thumbnail selector now establishes a positioned parent at every breakpoint; a post-fix DOM scan returned no invalid fill parents. | Fixed and verified |
| Clear | Desktop and mobile opening media needed distinct compositions. | Desktop selected the supplied 16:9 file; the `390x844` media query selected the existing 9:16 file. Both reached media ready state `4` and played. | Verified |
| Medium | Repeat visits could still mount opening media, and the pre-hydration path could briefly expose an opening curtain. | A root bootstrap checks session state before hydration. A repeat Browser reload showed no splash and `videoCount: 0`. | Fixed and verified |
| Medium | Mobile initially inherited the desktop poster, while resizing across the `640px` boundary could leave the wrong source active. | A mobile poster was extracted from the exact vertical file. Media-query listeners now switch both source and poster; a live `390x844` to desktop resize selected the exact landscape pair while playback continued. | Fixed and verified |
| Medium | The covered application remained reachable by keyboard while the opening was visible. | The application root is inert and `aria-hidden` during the opening, Skip receives focus, Escape exits, and both attributes are restored on completion. | Fixed and verified |
| Medium | Managed pending, provider-error, and wrong-portal login notices were not recaptured during this opening/cockpit pass. | Query-state policies and callback/password route tests pass; no fresh screenshot is claimed. | Open visual verification item |
| Medium | The new client `/reviews` inbox has source, responsive CSS, contract, and runtime evidence but no fresh canonical desktop/mobile capture. | The Browser was used for the requested opening and cockpit flows; client-inbox pixel comparison remains a separate pass. | Open visual verification item |
| Low | The in-app Browser cannot inject a local file into the native file chooser. | The product opens the chooser; transfer states remain covered separately. | Tool limitation |

## Visual Evidence

- Supplied dashboard reference: `docs/design-evidence/co-videopro-overview-20260715/reference-dashboard.png`.
- Verified isolated overview at 1440x1000: `docs/design-evidence/co-videopro-overview-20260715/visual-lane-overview-1440x1000.jpg`.
- Side-by-side hierarchy comparison: `docs/design-evidence/co-videopro-overview-20260715/reference-vs-implementation.jpg`.
- Locked reference comparison: `docs/design-evidence/co-videopro-locked-20260715/projects-reference-comparison-final.png`.
- Locked overview: `projects-desktop-final-1440x1000.png` and `projects-mobile-final-390x844.png` in the same directory.
- Locked review cockpit: `review-cockpit-desktop-final-1440x1000.png` and `review-cockpit-mobile-final-390x844.png`.
- Locked supporting surfaces: matched desktop/mobile evidence for login, reviews, library, brand settings, and public review in the same directory.
- Responsive opening sources: `public/brand/co-videopro-opening-desktop.mp4` for desktop and `public/brand/co-videopro-opening-motion.mp4` for mobile. The desktop poster is `public/brand/co-videopro-opening-desktop-poster.jpg` (SHA-256 `9041f10c31ee93b7a75695567a0437443f19b986b11d0629c90d8dce72139d11`); the mobile poster is `public/brand/co-videopro-opening-mobile-poster.jpg` (SHA-256 `34895744decd5432d7267f1f4d49e59b986fd90fa42e0ebfc232a23171676f13`).

The implementation intentionally translates the reference into the existing product: it preserves the restrained bright shell, direct actions, real media, production lifecycle, activity rail, and compact operational density without adding a second dashboard shell.

## Runtime And Build Proof

- `http://localhost:4103/projects?demo=1` returns `200 OK` from the canonical app.
- The response uses locally generated Next font files and emits the definitive Co-VideoPro raster as eager/high priority. The hydrated overview assigns eager/high priority only to its first desktop project thumbnail and leaves later project thumbnails lazy.
- The merged visual regression set covering overview, reviews, cockpit, public review, library, settings, and brand passes. The post-LCP overview gate passes `6/6`.
- The password-login, callback, auth-policy, managed-host, and production API
  gate set passes `41/41`. Wrong-portal remediation points to the exact admin or
  client host, and a canonical client role cannot inherit admin APIs.
- The pre-opening integration snapshot passed `887/887`; current post-change status is stated below rather than relabeling that older snapshot.
- TypeScript passed at the opening/build checkpoint. A later current-checkout rerun now fails in the unrelated untracked `lib/co-produce/lifecycle-contract.ts`: concurrent `sales:read` and `sales:qualify` permission IDs do not yet have matching permission-map entries.
- Full ESLint exits successfully with `0` errors and `24` non-blocking warnings. The remaining warnings are existing unused-symbol and intentional media-element advisories outside this integration.
- Focused shortcut, navigation, drawer, toolbar, and edit-decision checks pass `20/20` after the interaction hardening.
- The responsive opening contract passes `7/7`; the demo-auth hydration contract passes `2/2`; the broader focused UI set passes `52/52`; and the timeline/control set passes `29/29`.
- Scoped ESLint and TypeScript pass after the opening and timeline changes.
- The opening checkpoint's `next build` compiled, type-checked, generated all 68 static pages, and completed successfully. A fresh build was not relabeled after the later concurrent lifecycle-contract type drift.
- The current full source suite passes `953/953` (`934` subtests). Its only output is the repository's existing module-type warning.
- Demo hydration now defers managed-session loading until query-derived demo mode settles. A fresh Browser reload produced only the project-page `200`; the auth route also converts missing managed-auth configuration into a bounded generic `503` instead of exposing an environment stack.
- The latest preserved source-bound enterprise receipt passes `29/66` checks, certifies `1/32` obligations, and passes `G0`. Lint, TypeScript, all product tests, all certification tests, and the production build passed for that exact snapshot. `G1-G3` remain fail-closed; the next critical risk is immutable commercial rate and usage lineage.
- Projects overview, BP cockpit, ICA cockpit, reviews, library, brand settings, public review, login, and liveness each return `200` from the running canonical preview.
- No deploy, push, DNS change, migration, or public Content Co-op site change was made in this integration.

## Identity And Settings Reconciliation

- Team-list role projection now accepts only validated membership roles and
  omits unresolved rows instead of synthesizing viewer authority.
- The settings route now selects an explicit managed or demo surface. The
  managed module owns the authenticated identity context and server preference
  adapter and contains no demo or local-storage authority; SMS and iMessage
  relay controls remain explicit demo-only behavior.
- Managed notification loading fails closed with a visible retry instead of
  presenting editable defaults after an authority failure. Saves require a
  successful, authoritative RPC result and exact expected versions for all
  nine event preferences; stale writes return a conflict instead of silently
  overwriting another session.
- Identity mutations require the server to confirm the same actor in a fresh
  authoritative context before the UI can report success. Error, information,
  and success notices now use distinct semantics and accessible live regions.
- The managed navigation logout contract now asserts the server logout route,
  while demo logout remains local. Focused access, identity, and journey tests
  pass `28/28`.
- The versioned notification migration is authored at
  `supabase/migrations/20260715222311_versioned_notification_preferences.sql`
  but is not applied. Local Supabase was unavailable at `127.0.0.1:54322`, so
  real SQL execution, RLS, rollback, and concurrent-writer evidence remain
  required.
- Current full regression proof is `777/777`; TypeScript passes, full ESLint
  exits with `0` errors and `26` non-blocking warnings, and the 64-page webpack
  production build passes.
- A historical source-bound receipt passed `26/66` checks, certified `1/32`
  obligations, and cleared `G0` for its exact snapshot. Later shared-checkout
  edits changed cockpit/test source during certification, so
  `scripts/certification/receipts/latest.json` correctly fails snapshot
  stability and must not be treated as current release proof. The live product
  suite reruns `777/777`; all release gates remain fail-closed until one quiet
  snapshot completes the entire receipt.

## Atomic Version Transition

- Production version creation now uses the signed-in user's RLS client and the
  exact `co_production.create_asset_version` RPC. One database transaction owns
  version numbering, current-version promotion, source-asset advancement,
  unresolved-comment carry-forward, approval reset, and activity history.
- The legacy direct-write sequence remains available only when the development
  `public` schema is selected. Production configuration already requires the
  isolated `co_production` schema and therefore cannot enter that fallback.
- Conflicts, insufficient authority, invalid RPC input, missing authentication,
  and unconfirmed return rows fail closed with bounded responses. Focused route
  and migration contracts pass `11/11`; TypeScript, scoped ESLint, the complete
  `777/777` suite, and the 64-page webpack build pass.
- The authority migration remains unapplied. Row locks, RLS behavior,
  concurrent version creation, rollback, and exact activity/comment/approval
  effects still require an isolated Postgres execution receipt.

## Front-Door Authority Boundary

- Canonical, admin, and client hosts continue to render one shared Co-VideoPro
  login shell.
- Password and callback flows accept only exact server-controlled role claims.
  Pending and mismatched sessions are cleared locally before the UI reports the
  outcome; cleanup failure returns a generic error.
- The canonical API gate waits for the authenticated role on protected routes.
  Staff receives the admin allowlist; client receives the minimal client list.
- Client identities now land on `/reviews`, see only review navigation, and
  receive a bounded assignment DTO tied to the confirmed authenticated
  reviewer. Root and project-index requests redirect to the inbox; all other
  protected producer pages remain denied.
- The restrictive staff-surface/client-principal migration is authored but not
  applied. Real Postgres/RLS tests must prove that a client JWT cannot bypass
  the DTO through the Data API before this becomes a production certification.

## Sites Compatibility Gate

- The Sites existing-app validation path was run without deployment or DNS changes.
- This repository is a native Next.js Node application and does not contain the Sites-required `.openai/hosting.json` or Worker output at `dist/server/index.js`; the Sites package gate therefore fails closed before publish.
- A mechanical conversion would break current runtime assumptions: mounted/NAS filesystem access, local FFmpeg child processes, and the explicit production-host allowlist all require an architecture decision rather than a packaging edit.
- The native production build gate passes cleanly. The approved current runtime remains the Node/Vercel plane documented in `DEPLOY_CONTRACT.md`. Sites is suitable only after media storage/transcoding are moved behind Worker-compatible services and the host policy is deliberately extended.

## Durable Delivery Checkpoint

- Managed webhook tests, approval events, and share notifications are now
  queue-first. The request path records durable authority before any external
  provider can run.
- Webhook delivery carries a versioned HMAC bound to delivery ID and attempt.
  Its additive outbox migration freezes the expected team on each delivery,
  provides active-endpoint claims, fenced lease renewal, exact-replay
  settlement receipts, retries, dead-letter state, append-only events, and
  audit-preserving delete behavior.
- Managed share fanout uses one authenticated RPC for invite persistence,
  immutable manifest/audit receipts, and redacted email outbox intent. Exact
  retries recover the original encrypted token; changed retries fail closed.
- Focused delivery contracts pass `54/54`; the full suite passes `816/816`;
  TypeScript, scoped ESLint, and the 64-page webpack build pass. Static
  certification now passes `24/66`, including both recipient-authorization and
  webhook-egress checks.
- This is source/build evidence only. Both new migrations are unapplied and
  were not executed against PostgreSQL. No worker or external provider is
  enabled. Approval mutation plus webhook enqueue remain separate
  transactions. No visual finding was closed by this backend checkpoint.

## Co-Credit Independent Review

- The additive settlement migration and its source-contract tests remain untracked and unapplied.
- Rate and pricing snapshots are immutable and hash-bound; execution IDs enforce at-most-once debit lineage; worker evidence is bound to a pre-registered lease, source, job, key, and detached HMAC; replay checks precede mutable-state rejection; wall-clock decisions are rechecked after locks; and every lifecycle mutation uses one tenant-project-operation lock order.
- Private ledger and idempotency mutators now perform their own operation-time owner, `SECURITY DEFINER`, FORCE-RLS, and exact routine-ACL checks before writing. The ACL check enumerates `pg_proc.proacl`, rejects PUBLIC, unexpected roles, unexpected grantors, and grant options, and permits only the routine class's intended direct role.
- Anthropic and transcode paid-compute handlers now fail closed inside each production route as well as at the proxy. This is a temporary production deny boundary until live Co-Credit reservation and settlement authority is integrated.
- Focused Co-Credit source contracts pass `40/40`, and the complete source suite passes `953/953`; however, the final independent review did not clear the plaintext-payment heuristic. Mixed alphanumeric fragments can still reconstruct a PAN, supplementary-plane decimal digits are not normalized, and the broad recursive projection can falsely reject ordinary numeric media metadata. The migration is not release-ready and remains unapplied.
- Local certification remains fail-closed at `29/66` checks and `1/32` certified obligations: `G0` passes while `G1-G3` fail. No PostgreSQL migration apply, representative-corpus false-positive run, catalog ACL/RLS inspection, two-session race/deadlock run, rollback, signer interoperability, or production key-custody receipt exists. No visual finding is closed by this backend checkpoint.

## Next Visual Loop

Capture transport-normalized canonical 1440x1000 and 390x844 images, compose each against its matching reference, and inspect them at original detail. The overview, project, folder, review, collapse/reopen, upload-destination, timeline, and return flows are already click-verified. Remaining visual proof is the matched pixel comparison plus managed auth notices and the client inbox; native local-file chooser injection remains a tool limitation.

## Sales And Intake Workspace Checkpoint - 2026-07-16

- The first pre-project operator surface now lives at `/sales` inside the existing bright Co-VideoPro shell. It reuses the compact workspace header, 8px surface discipline, segmented filters, fixed desktop table, separate mobile list, and focus-trapped right drawer; it does not add a second shell or marketing dashboard.
- Owner, admin, and producer roles receive `sales:read` and `sales:qualify`. Editor, member, reviewer, viewer, and client navigation remains unchanged. The mobile bar still exposes Projects, Reviews, and Library; Sales remains available through More to preserve the three-item mobile limit.
- Production reads use the active identity team and the authenticated `/api/crm/pipeline` authority. A new staff-only inquiry detail adapter binds both inquiry and team UUIDs before returning the narrow discovery fields required for qualification.
- Qualification sends one expected-version and request-ID-bound mutation to the existing atomic CRM function. The surface explains that account, contact, opportunity, and first creative-brief revision are created together; demo mode mirrors the transition locally without managed requests.
- Qualified opportunities can load verified proposal context. Pricing, activation, acceptance, and arbitrary stage mutation remain outside this surface; Proposal Studio keeps commercial authority.
- Authorized staff can list and create intake forms. The public front door and usable link controls were completed in the subsequent checkpoint below.
- Focused navigation, inquiry, and Sales contracts pass `15/15`; TypeScript passes; scoped ESLint has zero errors; the complete repository test command exits cleanly after `959` tests; and the native Next production build compiles and generates `69` routes, including `/sales` and `/api/crm/inquiries/[id]`.
- The Sites existing-app validation boundary remains unchanged: `.openai/hosting.json` is absent, so validation stops at the successful native build and no Sites publish is attempted.
- `http://localhost:4103/sales?demo=1` returns `200` from the retained preview. The selected in-app Browser backend was unavailable during this checkpoint, so no screenshot, console, overflow, or click-through claim is made and no alternate browser was substituted.
- No deploy, push, migration, DNS, tunnel, or public Content Co-op site change was made.

sales workspace result: connected pre-project authority and local gates pass; live visual and operational database proof remain open

## Public Inquiry Front Door Checkpoint - 2026-07-16

- `/inquire/[formKey]` is now the branded public entry into the existing immutable inquiry authority. It uses the exact shared Co-VideoPro lockup and bright Content Co-op visual language without importing the authenticated workspace shell or inventing a second dashboard.
- The mobile-first flow has three explicit steps: contact and company, production brief, then timing and permissions. Required contact, email, project goal, date order, HTTPS references, E.164 phone, privacy consent, and phone-dependent SMS/iMessage choices are validated before submission.
- Production submits the existing `cco.public-inquiry.v1` contract to `/api/intake/inquiries`. Idempotency identity is reused only for an identical payload, and success renders the durable request identifier plus the active form's configured receipt message.
- The new public form metadata adapter accepts only `ifm_` plus 64 hexadecimal characters, reads only active forms from `co_production`, and exposes only the form name and success message. Invalid or inactive forms share a generic `404`; authority failures use a bounded `503`; every response is `no-store` and `nosniff`.
- The canonical launch gate permits only `GET /api/intake/forms/<exact-form-key>` and the existing `POST /api/intake/inquiries`. Local development exposes the matching public page without weakening admin or client API allowlists.
- Sales now exposes `Open form` and `Copy inquiry link` for active forms. Copied links use the current origin, demo links preserve `?demo=1`, disabled forms cannot present a usable intake action, and raw opaque keys are no longer the operator-facing handoff.
- Focused public-intake, CRM, launch-gate, and front-door contracts pass `35/35`; TypeScript, scoped ESLint, the complete repository test command, and the native `69`-route production build pass. One stale cockpit assertion was updated to reflect its current authoritative production-task source before the full rerun.
- `http://localhost:4103/inquire/ifm_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa?demo=1` and `http://localhost:4103/sales?demo=1` both return `200` from the retained preview.
- The selected in-app Browser reports no available backend, so no new desktop/mobile screenshot, overflow, console, keyboard, or end-to-end click claim is made. The public form remains visually unclosed until matched `1440x1000` and `390x844` evidence can be captured in that selected browser.
- Sites was used only as the existing-app validation contract. `.openai/hosting.json` is absent, the native build passes, and no Sites publish, deployment, push, migration, DNS, tunnel, or public Content Co-op site change occurred.

public inquiry result: client discovery now enters the connected CRM without re-entry; source, authority, full-suite, build, and runtime probes pass; selected-browser and live database proof remain open

## Mobile Wordmark And UI Architecture Checkpoint - 2026-07-16

- The authenticated workspace header now replaces the supplied icon lockup with
  a text-only `co-videopro` wordmark below `760px`. The live computed size is
  `17.28px`; the hidden raster occupies `0x0`, and page overflow is `0`.
- The supplied desktop lockup remains unchanged and visible at desktop width.
  This is a responsive shell treatment, not a global asset replacement.
- The user reference and live implementation were composed and inspected
  together at original detail in
  `docs/design-evidence/co-videopro-mobile-wordmark-comparison-20260716.png`.
  The live mobile capture is
  `docs/design-evidence/co-videopro-mobile-wordmark-390x844-20260716.png`.
- `docs/reality/co-deliver/visual-shell-navigation-authority.md` now governs
  canonical object homes, global/project/contextual control placement,
  progressive disclosure, page anatomy, workflow continuity, and the
  consolidation gate. New features cannot earn a rail item or parallel
  dashboard merely because they exist.
- The first recent-media thumbnail is now eager/high priority and later items
  are lazy. A fresh in-app Browser reload produced no new warning or error and
  retained zero overflow.
- The focused overview, shell-navigation, production-plan, and authority set
  passes `34/34`; the complete repository suite passes `991/991`; TypeScript
  passes; repository ESLint exits with `0` errors and `24` non-blocking
  warnings; and the native production build compiles and generates all `69`
  static pages. Earlier transient failures from concurrently written intake and
  TUS files cleared before this final gate and are not attributed to this UI
  checkpoint.
- No deployment, push, migration apply, DNS, tunnel, or public-site change was
  made.

mobile wordmark result: compact brand corrected in the existing shell; architecture now requires canonical homes and progressive disclosure

## Production Architecture Consolidation - 2026-07-16

- The product now has a source-defined architectural contract at
  docs/reality/co-deliver/co-videopro-production-architecture-authority.md.
  It separates current durable authorities from planned workspaces, establishes
  the one-production record as the core model, and prevents new rails,
  dashboards, or routes from being added without a canonical object, home,
  lifecycle, and permission boundary.
- The route audit found eight competing cockpit sections and duplicated project
  navigation. The target local lifecycle is Overview, Brief, Proposal, Plan,
  Edit, Review, and Delivery. Current cockpit sections are explicitly treated
  as migration aliases rather than permanent parallel products.
- The data audit found that the operating-record snapshot is too narrow, direct
  project creation can bypass explicit origin evidence, plan authority is
  detached from activation, and delivery remains intentionally unimplemented.
  The next implementation spine is origin -> activation -> plan -> derived
  operating record, not another overview surface.
- Metronic is now documented as a local interaction inventory only. Its direct
  source, icons, demo shell, and assets remain outside the application pending
  license confirmation; the bright Co-VideoPro shell remains authoritative.
- No fresh visual capture is claimed for this checkpoint. The selected in-app
  browser security policy blocked localhost automation, and no alternate
  browser was used. Matched desktop and mobile capture remains an open
  acceptance gate.

## Public Inquiry Attachment Authority - 2026-07-16

- The existing three-step public inquiry now accepts up to eight reference
  files without creating a second intake flow. The control is embedded in the
  Production step, uses the current bright form language, reports checksum and
  resumable-upload progress, and blocks Continue or Submit until every selected
  file is either claimable, retried, or removed.
- Each file is SHA-256 hashed in bounded browser slices before upload. The
  public TUS path accepts only exact canonical routes and methods, same-origin
  requests, an `iatb_` capability, the isolated `co_production` schema, bounded
  sizes and chunks, declared allowlisted MIME types, matching first-chunk magic
  bytes, and complete-object checksum evidence.
- Public bytes use the dedicated opaque
  `intake-quarantine/forms/.../uploads/...` namespace. Original delivery and
  derivatives remain blocked. Pending or unavailable scanning keeps verified
  bytes quarantined; infected evidence is rejected; no asset catalog record,
  project, tenant, download URL, or share link is synthesized.
- The v2 inquiry envelope preserves the existing v1 discovery payload and adds
  one capability-bound attachment manifest. The additive database migration
  binds the inquiry and manifest in one transaction, freezes consumed batches,
  prevents destructive table operations, enforces team-scoped RLS for staff
  reads, and stores hashes rather than capability secrets.
- The existing Sales inquiry drawer now lists only safe bound metadata:
  filename, detected type, size, content hash, upload state, scan verdict,
  ordinal, and bind time. It intentionally exposes no object key, capability,
  fingerprint, storage receipt, or download action before release authority.
- Focused intake, launch-gate, CRM, and UI contracts pass `40/40`; the complete
  repository suite passes `1011/1011`; TypeScript and scoped ESLint pass with
  no findings; and the native Next production build compiles, type-checks, and
  generates all `69` pages. Both the public inquiry and Sales demo URLs return
  `200` from the retained `4103` preview.
- Sites was used through its existing-app validation path. The native build is
  the applicable gate because this Next/Node application has no
  `.openai/hosting.json`; no Sites project, version, or deployment was created.
- The selected in-app Browser currently reports no available backend. No
  desktop/mobile screenshot, matched reference comparison, DOM overflow,
  console, keyboard traversal, or native file-chooser claim is made. Browser
  capture remains an open visual acceptance gate.
- `20260716034500_public_inquiry_upload_authority.sql` is authored but unapplied.
  Local Supabase has no running database container, so PostgreSQL parsing,
  RLS, rollback, scanner-worker, retained-object cleanup, and concurrent replay
  still require controlled operational receipts. No deployment, push,
  migration, DNS, tunnel, or public-site change occurred.

public attachment result: quarantine-first upload and staff handoff are connected in source; live database and selected-browser proof remain open

## Lifecycle-First Cockpit Navigation - 2026-07-16

- The project cockpit rail now exposes only its stable production lifecycle:
  Overview, Plan, Edit, and Review. The full section vocabulary still exists
  for deep links and the command palette, but Sequences, Versions, Approvals,
  and Details now live behind an accessible `More views` disclosure.
- Project-rail Settings, Brand settings, Assets, Team, and shortcut blocks were
  removed. Account and workspace settings stay reachable through the global
  shell, backed settings route, and contextual commands rather than becoming
  permanent project navigation.
- The compact desktop rail, mobile bar, and mobile drawer use the same four
  lifecycle labels and accessible `aria-expanded`/`aria-controls` behavior.
  Mobile retains its bounded fifth `More` entry instead of trying to show the
  complete project map at once.
- The audit found that approved media was being represented as a clickable
  delivery phase with Library and demo Archive destinations. The phase now
  remains unavailable with `Not configured` status until a canonical release
  record exists. Approved media is shown only as evidence, and Asset Library
  remains an explicit projection. No final-delivery, archive, or payment claim
  is made from review/share state.
- Static cockpit navigation, control, overview, visual-shell, and
  delivery-boundary contracts pass `43/43`. TypeScript passes on the current
  checkout. Node emits the existing
  `MODULE_TYPELESS_PACKAGE_JSON` warning only.
- The selected in-app Browser remains unavailable for a fresh local visual
  capture. No pixel-comparison, console, overflow, or click-through claim is
  made for this new rail state; the next visual loop is a matched `1440x1000`
  and `390x844` capture in the selected browser.

lifecycle cockpit result: navigation now reflects the production model; final delivery remains fail-closed until durable release authority exists

## Governed Plan Initialization - 2026-07-16

- The lifecycle rail's existing Plan destination now closes a real workflow
  gap: when the authoritative snapshot has no plan and grants
  `canInitialize`, the producer sees one bounded in-place initializer rather
  than a generic empty state or a new route.
- The form collects only a plan title, first task, and optional scope note. It
  creates the first revision through the existing authenticated
  `/api/projects/{id}/production-plan` POST contract and never fabricates a
  local task list. Non-producers receive an honest unavailable state; demo
  mode remains non-mutating.
- A stable request UUID and task key are retained for an identical retry. The
  hook validates the receipt's project and request identities, reloads the
  authoritative snapshot after success or conflict, and keeps the action
  pending while the command is in flight.
- Focused cockpit, delivery-boundary, navigation, overview, and plan-contract
  tests pass `52/52`; TypeScript and scoped whitespace checks pass. The local
  development server remains running on port `4103`.
- The selected in-app Browser backend remains unavailable, so this checkpoint
  does not claim a new visual capture, DOM overflow measurement, console
  audit, or clicked POST interaction. No alternate browser, deployment, push,
  migration apply, DNS, tunnel, or public-site action occurred.

governed plan result: the first durable pre-production command now lives in its canonical lifecycle workspace; visual and live-database proof remain open

## Intake-to-Production Semantic Handoff - 2026-07-16

- The Sales workspace no longer treats the client's requested production due
  date as the opportunity's expected sales close date. Those fields now remain
  separate authorities: expected close is an explicit sales forecast, while
  requested production timing remains client-reported planning context.
- Proposal Studio import context is now versioned as
  `cco.proposal-studio.import-context.v2` and carries desired start, due date,
  and timing flexibility together with explicit `client_reported` and
  `non_authoritative` labels. Date order and real calendar dates are validated
  before the context can cross the boundary.
- The existing Sales drawer displays the requested production window and
  flexibility without adding a route, shell, dashboard, or second proposal
  workflow. Demo context follows the same v2 contract.
- Manual project creation now sends the required stable request identifier,
  same-origin credentials, and receipt validation. It exposes pending and
  bounded error states rather than silently swallowing a failed create.
- Proposal handoff activation now classifies stale or version-conflicted CRM
  origins as terminal `409 stale_preproject_origin` responses. These business
  conflicts are no longer mislabeled as retryable infrastructure failures.
- A broad navigation check also found one stale assertion: Archive and Trash
  project routes correctly retain Projects as their active global section.
  The test now matches the already-coherent production navigation model.
- Focused cross-boundary contracts pass `35/35`; navigation contracts pass
  `4/4`; the complete repository suite passes `1015/1015`; TypeScript and
  scoped ESLint pass; and the native production build compiles, type-checks,
  and generates all `69` pages. The retained local server reports healthy and
  both `/sales?demo=1` and `/projects?demo=1` return `200` on port `4103`.
- The selected in-app Browser reports no available backend, so this checkpoint
  does not claim a clicked Sales-to-Proposal handoff, console audit, overflow
  measurement, keyboard traversal, or matched desktop/mobile visual capture.
  No alternate browser was used.
- No deployment, Sites publish, push, migration, DNS, tunnel, public-site, or
  concurrent-worktree change occurred.

semantic handoff result: client production timing now reaches Proposal Studio without becoming a sales forecast; selected-browser visual proof remains open

## Governed Proposal Readiness - 2026-07-16

- The existing Sales drawer now owns one explicit `Request proposal` command
  before Proposal Studio context can be loaded. The command is available only
  from an eligible sales stage with the exact current draft brief revision and
  hash; a successful request advances the opportunity to
  `proposal_requested` and creates one immutable `ready_for_proposal` brief
  revision without creating a project or proposal.
- Identical retries retain one client request UUID. The database routine checks
  an exact prior receipt before mutable stage and version gates, then locks and
  advances the opportunity with optimistic concurrency. Success and error
  announcements are separate, and the request button remains pending while the
  command is in flight.
- Proposal Studio now receives `cco.proposal-studio.import-context.v3` from one
  receipt-backed security-invoker read model. The context binds the opportunity,
  account, contact, inquiry, source brief, ready brief, and proposal-request
  receipt while retaining the v2 price-free and client-reported production
  timing semantics.
- Accepted proposal handoffs must reference that same readiness receipt and
  ready brief. A signed handoff can no longer activate a draft-origin project
  or bypass the Sales-to-Proposal transition.
- Demo fixtures now use real readiness states and complete SHA-256 evidence;
  they no longer model impossible `approved` brief revisions or reuse requested
  production dates as sales-close authority.
- Focused readiness and adjacent cross-boundary contracts pass `61/61`; the
  complete repository suite passes `1039/1039`; TypeScript and scoped ESLint
  pass with no errors; and the native Next production build compiles,
  type-checks, and generates all `69` pages. The retained local server reports
  healthy and `/sales?demo=1` returns `200` on port `4103`.
- The full-suite audit also repaired one direct-Node import boundary in the
  public review DTO and aligned one stale cockpit regression assertion with the
  stronger concurrent asset-and-version guard. Concurrent cockpit source was
  preserved rather than overwritten.
- `20260716100000_opportunity_proposal_readiness_authority.sql` is authored but
  unapplied. Local Supabase has no running database container, so PostgreSQL
  parsing, RLS behavior, transaction rollback, and concurrent replay still
  require controlled database receipts before launch.
- The selected in-app Browser reports no available backend. No clicked
  request, console audit, overflow measurement, keyboard traversal, or matched
  desktop/mobile visual capture is claimed, and no alternate browser was used.
- No deployment, Sites publish, push, migration apply, DNS, tunnel,
  public-site, or concurrent-worktree change occurred.

proposal readiness result: Sales now issues one durable, replay-safe readiness authority before Proposal Studio or project activation; database and selected-browser proof remain open

## Authorized Proposal Activation - 2026-07-16

- Accepted proposal state is no longer sufficient to create an active project.
  The v2 proposal handoff contract now requires one exact, independently
  issued production-authorization receipt that binds the proposal request,
  ready brief, package, proposal, quote, decision, opportunity, and all five
  commercial gates.
- Acceptance must be satisfied. Contract, invoice, deposit, and payment must
  each be either satisfied or explicitly not required, with evidence
  receipts. Missing or malformed authority fails before database access;
  stale readiness and binding conflicts remain terminal `409` responses.
- The service-only activation wrapper validates that authority atomically,
  revokes direct service execution of the legacy activation routine, and
  records one immutable FORCE-RLS authorization receipt. The redacted pipeline
  projection exposes only activation status, authorization receipt identity,
  and activated project identity.
- The existing Sales drawer remains a compact status surface. It links to a
  project only when receipt-backed activation evidence is complete, warns on
  inconsistent won state, and offers no local override, payment, or activation
  control.
- Exact lifecycle contracts pass `88/88`; the complete repository suite passes
  `1066/1066`; TypeScript and scoped ESLint pass; and the native Next
  production build compiles, type-checks, and generates all `69` pages.
  `/api/health` and `/sales?demo=1` both return `200` from port `4103`.
- The migration compiled and its activation, replay, drift rejection, grants,
  RLS, and FORCE-RLS behavior executed successfully in disposable PostgreSQL
  15. It remains unapplied to live Supabase, so no production database receipt
  is claimed.
- Sites validation used the existing-application path. This repository has no
  `.openai/hosting.json`, so the native production build is the applicable
  local gate; no Sites project, version, or deployment was created.
- The selected in-app Browser still exposes no backend. No new screenshot,
  matched reference comparison, overflow measurement, console audit, keyboard
  traversal, or clicked activation flow is claimed, and no alternate browser
  was substituted.
- No deployment, push, migration apply, DNS, tunnel, public-site, or isolated
  visual-lane integration occurred.

authorized activation result: accepted work cannot become an active production without exact commercial and readiness authority; live-database and selected-browser proof remain open

## Review Interaction Rebuild - 2026-07-16

- The review interaction model was re-evaluated from public Wipster guidance,
  not from an authenticated account or private endpoint. The applicable model
  is: create a point-in-time comment from media, submit with Enter or the send
  action, navigate between player pins/timeline/thread, keep replies in their
  parent thread, and treat comment completion, reviewer completion, and
  approval as separate state changes. Sources: [How to comment](https://intercom.help/wipster-support/en/articles/3580280-how-to-comment),
  [reviewer guide](https://intercom.help/wipster-support/en/articles/12694164-reviewer-s-guide),
  [comment completion](https://intercom.help/wipster-support/en/articles/3350715-marking-comments-as-complete-the-to-do-list),
  and [versioned review guidance](https://www.wipster.io/blog/video-review-approval-faq-llm-first-answers-for-buyers).
- The bright Co-VideoPro shell remains the review surface. No Wipster visual
  clone, dark player, new route, or second comment workspace was added.
- Client review now gives every timeline marker a stable identity. Same-time
  comments are offset inward from the timeline edge, so two `00:00` notes do
  not overlap. Selecting one marker selects its exact thread and frame pin;
  the live Browser check preserved `scrollY: 0`.
- Internal review now groups same-time root comments into one count marker.
  The grouped marker selects one real root thread, its frame pin, and the
  matching rail item. Replies never create duplicate timeline or frame pins.
  A direct pointer click on the visible marker preserved `scrollY: 0`.
- The review selection path is one shared state: frame pin, timeline marker,
  timestamp, reply timestamp, and rail thread all resolve to the same root
  comment and timecode. The public review keeps one anchored composer rather
  than competing player and rail composers.
- The cockpit no longer offers Reply on externally authored review comments:
  that authenticated action is not supported by the corresponding API.
- The mobile operator dock was measured at an explicit `390x844` browser
  viewport. Its four tabs now use stable icon controls with accessible names;
  labels are hidden below `640px`, all four tab rectangles are distinct, and
  document width equals viewport width. The comments panel remains the default
  Review tab instead of becoming a competing navigation surface.
- Internal approval decisions now require the selected `version_id` and pass
  it into the existing version guard. A stale selected version therefore
  receives the bounded `409` before an approval step can change.

### Browser Evidence

- Public demo review, selected second `00:00` comment:
  `http://localhost:4103/review/demo?demo=1&asset=charles-drummond-v5&intent=client_review&qa=review-rebuild`.
  The second same-time marker rendered at `calc(0% + 24px)`, received
  `aria-current=true`, selected the corresponding Client Reviewer thread, and
  did not scroll the document.
- Internal review, grouped `00:00` root comments:
  `http://localhost:4103/projects/ica?demo=1&asset=charles-drummond-v5&view=review&qa=review-rebuild`.
  The visible marker reports `2 comments at 00:00`, selects the first root pin
  and matching rail thread, and stays at `scrollY: 0` when activated by a real
  pointer.
- Browser console history contains earlier Fast Refresh errors from transient
  intermediate source states (`normalizedComments` and `pinMode`). Both routes
  were reloaded after the repair and rendered their player, comments, pins,
  and timelines without a new error entry. The history itself is retained as
  diagnostic evidence, not relabeled as a clean buffer.

### Current Limits

- Reviewer-level `Finish review` is not yet a durable, version-scoped
  recipient completion record. It must remain separate from resolve/reopen and
  approval until that contract exists.
- Production realtime comment invalidation is incomplete. The current local
  demo supplies state updates; multi-reviewer production refresh needs a
  version-scoped event/snapshot contract.
- External comment visibility needs a deliberate product decision: the current
  public read path can be shared per version while writes record the invite.
  Do not imply invite-private comment threads until the durable query contract
  is changed and tested.
- Carrying comments into a new version currently cannot preserve complete
  root/reply/provenance semantics. It needs an atomic version-transition
  contract before the UI can claim threaded carry-forward.
- Native file selection cannot be injected by the in-app Browser. That is a
  tool limitation; it is not used to infer product upload behavior.

### Verification

- Focused review, comment, approval, policy, and demo-journey contracts pass
  `75/75`; TypeScript passes on the current shared checkout.
- No deploy, push, migration, DNS, Cloudflare, tunnel, or public-site action
  occurred.

review interaction rebuild result: player, timeline, pins, and threads now use one exact selection model; remaining realtime, completion, visibility, and version-carry-forward work stays explicitly open

## Authorized Project Brief And Plan Binding - 2026-07-16

- A successful proposal activation now projects the exact ready creative brief
  into one immutable project-scoped `project_brief_revisions` revision. The
  projection is bound to the project, source creative brief, proposal request,
  handoff receipt, and activation-authorization receipt; direct mutation and
  legacy backfill remain prohibited.
- Base brief reads require an internal-contributor project rank. The existing
  operating-record projection remains available to lower project ranks but
  returns all brief columns as `NULL`, and the TypeScript read model strips the
  entire brief for reviewer, viewer, and client roles.
- New accepted-proposal production plans derive an exact project-brief revision
  and content-hash binding in a private database trigger. Manual plans and true
  legacy accepted plans remain unbound; any related project or handoff drift
  fails closed.
- The current bright project cockpit reuses its single operating-record request
  and adds one compact `Approved brief` disclosure at the top of the existing
  Plan surface. It exposes bounded semantic groups only, adds no route, rail,
  modal, shell, raw brief payload, or receipt identifier, and does not fabricate
  demo data or auto-create tasks.
- Lifecycle ownership now names `project_brief_revision` as a canonical,
  immutable shared record. The Project brief capability is read-only, requires
  `projects:read`, and resolves to the existing project Plan action; writable
  follow-up revisions remain explicitly unavailable.
- The complete repository suite passes `1120/1120`; TypeScript passes; scoped
  ESLint reports no errors (the two existing type-only assertion warnings in
  `lifecycle-contract.ts` remain); and the native Next production build
  compiles, type-checks, and generates all `69` pages. `/api/health`,
  `/projects?demo=1`, and `/projects/ica?demo=1&surface=tasks` each return `200`
  from the retained port `4103` preview.
- During the full gate, the public-review brand contract still expected older
  `176px` and `154px` lockup widths while current source used `188px` and
  `180px`. The contract now matches current geometry, and all three platform
  state image-size hints match the `188px` state lockup.
- Both additive migrations passed focused static and disposable PostgreSQL 15
  compile/behavior checks, but neither was applied to live Supabase. The
  selected in-app Browser still has no available backend, so no new matched
  screenshot, overflow measurement, console audit, focus traversal, or clicked
  production-data flow is claimed and no alternate browser was substituted.
- Sites remains local validation only because `.openai/hosting.json` is absent.
  No Sites project, publish, deployment, push, migration apply, DNS, tunnel,
  public Content Co-op site, or isolated visual-lane change occurred.

project brief result: authorized sales context now reaches planning as one immutable, role-filtered project record without creating a second workflow or shell

## Reply-Thread Authority And Shell Correction - 2026-07-16

- The review thread is now one version-bound object across the player, timeline,
  rail, and API. Replies preserve the root comment's parent, visibility, and
  review-invite binding instead of becoming separate internal top-level notes.
- A public client can use `Reply` on a visible thread. The existing anchored
  player composer opens at the root thread's time/frame; no rail composer or
  duplicate draft surface was added. Cancel leaves no persisted demo state.
- An editor, producer, admin, or owner can now respond to an external client
  thread through the authenticated cockpit. A normal reviewer is rejected by
  the API. Every reply remains constrained to the selected asset and exact
  version.
- The player still pauses before a frame-pin draft opens and resumes after a
  successful comment submission. Space, left/right seek, Down cut marker, and
  the configured one-to-ten-second seek intervals remain governed by the same
  player policy.
- The comment rail no longer exposes each whole card as a button containing
  timecode and Reply buttons. A thread is a labelled group, timecode and Reply
  are the explicit interactive controls, and the timecode control does not
  bubble into a competing card click.
- The supplied text-only `co-videopro` wordmark now replaces the old icon
  lockup in public review and the canonical desktop workspace shells. Customer
  brand sources still use their own supplied image.

### Browser Evidence

- Fresh public client review:
  `http://localhost:4103/review/demo?demo=1&asset=charles-drummond-v5&intent=client_review`.
  At `1280x720`, the review loaded with no warning/error logs. The client Reply
  action opened one anchored composer and Cancel restored the empty draft
  state. At `390x844`, document width was `384` against a `390` viewport and
  no horizontal overflow was reported; the composer stayed within the video
  bounds.
- Fresh producer review:
  `http://localhost:4103/projects/ica?asset=charles-drummond-v5&view=review&demo=1`.
  At `1280x720`, the cockpit loaded with no warning/error logs, displayed the
  text-only wordmark, and opened the external-client response composer from
  the operator dock. At `390x844`, the compact mobile cockpit displayed the
  same supplied text wordmark in its widened header slot; document width was
  `384` against a `390` viewport with no horizontal overflow.
- Older tab histories retain transient Turbopack Fast Refresh errors from a
  CSS module update. New tabs after the final source state contain no
  warning/error entries, so those historic dev-only messages are not treated
  as a live product failure.

### Verification

- Focused review, authority, player-policy, accessibility, pin, and branding
  contracts pass `50/50`. TypeScript, scoped ESLint, and the native Next
  production build (all `69` routes) pass.
- The following backend work remains deliberately open: review completion,
  invite-private visibility/query semantics, realtime version-scoped refresh,
  reply-preserving version carry-forward, and version/workflow-bound approval
  authority. No migration, deploy, push, DNS, tunnel, or public-site change
  occurred.

reply-thread correction result: client and producer responses now stay in the same exact review thread without duplicating UI or leaking across visibility/version boundaries

## Co-Script Authority And Plan Provenance - 2026-07-16

- Co-Script now lives inside the existing bright project cockpit under the Plan
  workspace's `Script` and `Tasks` segmented control. It adds no route, shell,
  rail, dashboard, modal, or marketing surface.
- The script workspace supports bounded sections and script blocks, immutable
  revision history, explicit save/submit/approve/changes-requested states,
  deterministic first-render draft identities, pending and error feedback, and
  a clearly labelled local-only demo authority. The final block cannot be
  removed, so the editor cannot create an invalid empty document.
- Durable production authority is append-only and project-scoped. Authenticated
  owner, admin, producer, editor, and member roles can receive a bounded script
  summary in the operating record; reviewer and viewer projections receive no
  script payload. Raw IDs, hashes, and script content are not exposed through
  that summary.
- Every newly inserted production-plan revision now records the exact latest
  approved script revision and content hash when one exists. The binding is
  derived server-side under the shared project lock and rejects supplied drift.
  Plans remain valid with a null pair when no approved script exists. This is
  provenance only: it does not claim that script sections generate tasks,
  dependencies, schedules, edits, or plan text.
- The normal repository run reports `1185` tests: `1183` passed, `0` failed,
  and `2` optional PostgreSQL proofs skipped. The script authority proof passes
  `14/14` against PostgreSQL 15, and the plan-script binding proof passes `9/9`.
  TypeScript, scoped ESLint, and the native Next production build pass; all
  `69` pages generate. `/api/health` and
  `/projects/ica?demo=1&surface=tasks&plan=script` both return `200` from the
  retained port `4103` preview.
- The selected in-app Browser currently exposes no backend, so this checkpoint
  claims no new matched screenshot, reference comparison, console audit,
  overflow measurement, focus traversal, or clicked project-card/folder/detail
  flow. No alternate browser was substituted. Native file selection also
  remains an automation-tool limitation, not evidence about product upload
  behavior.
- Sites was applied through its existing-application validation path. The
  native build is clean, but `.openai/hosting.json` remains absent, so no Sites
  publish was attempted. The two additive SQL migrations remain unapplied; no
  deploy, push, migration apply, DNS, Cloudflare, tunnel, isolated-lane, or
  public Content Co-op site change occurred.

Co-Script result: approved writing is now a durable, role-filtered project authority and every future plan can prove which approved script it followed without inventing automatic planning behavior

## Review Round Authority And Composer Consolidation - 2026-07-16

- Public Wipster material was used to confirm the interaction model only: a
  point-in-time comment, parent-thread reply, reviewer completion separate from
  approval, and immutable version history. No authenticated Wipster account,
  private endpoint, credential, or intrusive scan was used. Sources:
  [product](https://www.wipster.io/product),
  [version comparison](https://www.wipster.io/blog/version-comparison), and
  [commenting guidance](https://www.wipster.io/blog/commenting-with-wipster-10-pro-tips).
- The bright Co-VideoPro cockpit now has one anchored comment composer. The
  player action, operator-dock action, frame/pin action, and Reply all open the
  same pause-on-open composer at one exact time and frame. The prior persistent
  below-player draft surface is removed.
- A new media version no longer silently copies unresolved root comments or
  rewrites old approval rows to pending. Comments remain evidence on their
  source version. An upload creates a distinct approval workflow for the new
  version, clones only role and assignee setup into new pending rows, and marks
  an active prior workflow superseded without changing its historic decisions.
- Approval-needed share creation now resolves its pending approval step against
  the already-authorized exact media version. A share for a new cut can no
  longer attach to a matching pending approver on an older cut of the asset.
- `20260716170000_version_scoped_approval_rounds.sql` adds exact
  asset/version/workflow relationships, immutable version keys, one active
  approval round per version, and matching public/co_production transaction
  behavior. It is additive and remains unapplied.

### Browser Evidence

- Producer review:
  `http://localhost:4103/projects/ica?asset=charles-drummond-v5&view=review&demo=1`.
  The player `Add a comment at 00:00:00:00` action opened exactly one dialog
  with one Comment field. Cancel closed it without creating a record.
- The dock `Reply to Alex Rivera` action moved the review to `00:00:01:00` and
  opened exactly one `Reply to Alex Rivera` dialog. Cancel again left zero open
  dialogs. No browser test submitted a comment or changed an approval.
- The fresh producer preview reported no warning or error log entries after the
  interaction checks. The text-only Co-VideoPro shell remained intact.

### Verification And Limits

- Version authority, RLS boundary, webhook isolation, workflow, cockpit, public
  review, transaction, tenant, lifecycle, and approval-share contracts pass
  `102/102` across the two focused gates. TypeScript and the native `69`-route
  Next production build pass. Scoped ESLint has no errors; two existing
  type-only lifecycle assertion warnings remain.
- There is no live Supabase migration receipt, real multi-reviewer realtime
  proof, or production approval-round data exercise. Thread carry-forward is
  intentionally unavailable until it can preserve replies, invite visibility,
  and provenance atomically. No deploy, push, migration apply, DNS, tunnel, or
  public-site change occurred.

review round result: comments, replies, approvals, and versions now have separate canonical roles; durable live database proof remains open

## Comment Source Integrity And Public Invite Isolation - 2026-07-16

- Public review now carries one explicit draft source from open through cancel or
  submit. A root draft keeps its exact media time and optional frame pin; a
  reply keeps the parent thread's exact time but persists no second frame pin.
  Selecting a different pin, marker, rail thread, or Reply while a draft is
  open cannot silently retarget it.
- The client sees a concise source-lock notice instead of losing typed work:
  `Finish or cancel the open comment before starting another.` The existing
  bright Co-VideoPro review shell and one anchored composer remain unchanged.
- The public API now derives reply time from the parent and discards reply pin
  coordinates. The thread rail suppresses legacy reply `Pin` labels so the UI
  cannot imply a second visual annotation where none exists.
- Internal cockpit selection no longer discards or retargets an active review
  draft. Switching the actual asset or media version clears stale draft text;
  navigating within the current thread retains the draft and its source.
- Public edit-decision reads are now scoped to the authorized review invite.
  An external reviewer can no longer receive accepted or applied decisions
  created through another share link for the same media version.

### Browser Evidence

- Public client review:
  `http://localhost:4103/review/demo?demo=1&asset=charles-drummond-v5&intent=client_review`.
  Playback was started, Reply opened one `Reply to Client Reviewer at 0:00`
  dialog and paused the player. After text was entered, selecting a second
  Reply left one dialog attached to the original source and displayed the
  source-lock notice. Cancel returned to zero dialogs, restored the Play
  control, and produced no warning or error logs. No comment, approval, or
  completion action was submitted during this test.

### Verification And Remaining Limits

- Review, comment, invite-isolation, demo journey, policy, edit-decision, and
  version-threading contracts pass `50/50`. TypeScript, scoped ESLint, and the
  native Next production build with all `69` routes pass on the current local
  checkout.
- Public approval authority still lacks an explicit schema-backed approval-step
  binding on `review_invites`. Until an invite stores and enforces one exact
  `approval_id`, a same-email reviewer can match more than one active step on
  that version. This remains a P0 data-authority issue and is not represented
  as fixed by the UI repair.
- The additive version-round migration remains unapplied, and the database has
  no composite foreign key that proves an invite, comment, or edit decision
  all belong to the same exact version. Runtime paths enforce the current
  contract; production database, multi-reviewer realtime, and carry-forward
  proof remain open. No deploy, push, migration apply, DNS, tunnel, or
  public-site action occurred.

comment source integrity result: one draft stays attached to one frame, time,
thread, audience, and version until the reviewer intentionally submits or
cancels it

## Approved Script To Governed Production Plan - 2026-07-16

- The existing Co-Script workspace now carries one compact `Production plan
  handoff` band. It previews the deterministic task projection, generates an
  immutable draft, requires a producer approval note, and activates the plan
  before opening the existing Tasks surface. No route, shell, dashboard, rail,
  modal family, or parallel planning interface was added.
- The database contract now separates immutable script-derived drafts from
  immutable plan bindings. A binding proves the exact project, approved script
  revision and hash, generated draft and hash, producer, approval note,
  production-plan revision, and receipt. The former automatic latest-script
  binding is removed.
- Plan materialization is atomic and replay-safe. It creates one bounded task
  per approved script section, carries every script block as a production cue,
  and deliberately leaves assignee, due date, and dependency fields empty
  rather than inventing operational facts. An existing active plan remains
  active until the producer approves the new draft.
- The manual plan endpoint now returns an actionable `409` when an approved
  script requires the governed handoff. The three new script-plan routes are
  staff-only, producer-gated, schema-bound, bounded, exact-shape, RPC-only, and
  method-aware in the production launch gate.
- Executable API and middleware checks pass `48/48`. PostgreSQL 15 proves draft
  generation, conflict/replay behavior, explicit approval, exact task
  projection, and atomic binding `1/1`. TypeScript and scoped ESLint pass. The
  complete repository run reports `1215` tests: `1213` passed, `0` failed, and
  `2` optional PostgreSQL suites skipped. The native Next production build
  passes with all `69` routes.
- The full run also exposed one stale public-review source assertion after a
  concurrent composer rename from `commentPin` to `commentDraft`; the test now
  follows the current one-draft implementation and passes `6/6` without
  altering that review surface.
- `http://localhost:4103/api/health` and
  `http://localhost:4103/projects/ica?demo=1&surface=tasks&plan=script` return
  `200`; the retained Next server remains on port `4103`. The selected in-app
  Browser backend remains unavailable, so this checkpoint claims no fresh
  screenshot, matched comparison, console inspection, overflow measurement,
  keyboard traversal, file-chooser automation, or clicked handoff flow. No
  alternate browser was substituted.
- Sites was used only as the existing-application production build gate.
  `.openai/hosting.json` is absent, so no Sites version or publish was created.
  The additive script and script-plan SQL remains unapplied. No deploy, push,
  migration apply, DNS, Cloudflare, tunnel, isolated-lane, or public Content
  Co-op site change occurred.
- The next lifecycle authority is storyboard and shot-list structure derived
  from this approved plan, followed by governed edit structure. Those stages
  remain open and are not implied by this milestone.

script-to-plan result: an approved script can now become a producer-approved,
receipt-bound production task plan without bypassing the existing bright
cockpit or fabricating schedules and ownership

## Governed Shot Plan Authority - 2026-07-16

- The existing Plan workspace now uses one compact `Script | Shots | Tasks`
  switcher. Shots stays inside the bright Co-VideoPro cockpit and contains two
  views of the same durable record: `Storyboard` for ordered text visual briefs
  and `Shot list` for production detail. No second shell, dashboard, route
  family, or decorative media wall was added.
- A shot-plan revision is bound to the exact approved script revision and hash
  plus its active producer-approved production-plan binding. The conservative
  server derivation maps eligible script content into scenes, shots, and text
  storyboard panels without inventing locations, talent, schedules, ownership,
  attached media, or version IDs.
- Editors can add, remove, and reorder shots and storyboard panels; revise
  purpose, description, coverage, framing, movement, subject, audio, and
  duration; save a new immutable revision; and inspect revision history.
  Submit, request-changes, and approve-and-activate actions keep producer
  decisions explicit. Source changes mark older revisions stale rather than
  silently presenting them as current.
- The four API routes are exact, method-aware, staff-only, producer-gated,
  schema-bound, bounded, and RPC-only. PostgreSQL 15 proves derivation,
  replay, conflict handling, stale-source behavior, role boundaries,
  immutability, approval binding, and non-mutation of production tasks.
- The focused authority, API, launch-gate, lifecycle, script, and workspace run
  passes `63/63`, including the real PostgreSQL proof. The complete repository
  run reports `1253` tests: `1250` passed, `0` failed, and `3` intentional
  skips. TypeScript, scoped ESLint, whitespace checks, and the native Next
  production build pass; the build prerenders `69` static pages and includes
  all four governed Shot Plan API routes. Scoped ESLint retains only two
  existing type-only lifecycle assertion warnings.
- `http://localhost:4103/api/health`,
  `http://localhost:4103/projects/ica?demo=1&surface=tasks&plan=shots`, and
  `http://localhost:4103/projects/ica?demo=1&surface=tasks&plan=script` return
  `200`; the retained local server remains on port `4103`. The selected in-app
  Browser backend is unavailable, so this checkpoint makes no fresh screenshot,
  matched-comparison, console, overflow, keyboard, or clicked-flow claim. No
  alternate browser was substituted.
- Sites was used only as the existing-application production build gate.
  `.openai/hosting.json` remains absent, so no Sites version or publish was
  created. The additive Shot Plan migration remains unapplied. Scheduling,
  call sheets, locations, talent, releases, production logs, captured-media
  attachment writes, and timeline editing remain outside this authority. No
  deploy, push, migration apply, DNS, Cloudflare, tunnel, isolated-lane, or
  public Content Co-op site action occurred.

shot-plan result: one source-bound production record now powers both storyboard
and shot-list work, with immutable revisions and explicit producer activation
inside the existing cockpit

## Governed Production Schedule Authority - 2026-07-16

- The existing Plan switcher now reads `Script | Shots | Tasks | Schedule`.
  Schedule is a fourth query-backed mode inside the supplied bright
  Co-VideoPro cockpit; it adds no rail item, route shell, dashboard, calendar
  wall, inspector drawer, marketing surface, or duplicate planning system.
- The schedule workspace uses a compact `190px` shoot-day rail and one agenda.
  Contributors can create and reorder shoot days, assign every source shot,
  reorder agenda items, enter dates, unit calls, start times, production
  durations, notes, and arbitrary valid IANA timezones, and add explicit setup,
  meal, company-move, break, and note banners. Mobile collapses the rail to a
  horizontally scrollable day strip with `40-42px` action targets.
- Generated schedules contain one deterministic unscheduled item for every
  shot in the exact active approved Shot Plan. Generation never copies screen
  runtime into production duration and never invents timezone, shoot dates,
  call times, start times, ownership, locations, talent, crew, permits,
  releases, equipment, weather, or call-sheet readiness.
- Each authored schedule is an immutable revision bound to the exact Shot Plan
  revision, content hash, and approval binding. Editors can read, revise, and
  submit; producers retain generation and decision authority. Submission
  requires a valid timezone, unique complete shoot days, no unscheduled items,
  and explicit start and duration for every agenda item. Source changes mark
  prior schedules stale rather than rewriting them.
- The five database commands are replay-safe, conflict-aware, RPC-only, and
  share the existing project authority/event head. The four HTTP route files
  are exact, method-aware, staff-only, schema-bound, bounded, and fail closed.
  Call sheets remain a separate planned authority; an approved schedule does
  not imply that one exists or can be sent.
- The earlier Shot Plan pass also received two convergence repairs: storyboard
  and shot-list selection now use keyboard-focusable controls with explicit
  labels, and HTTP read/revise/submit access now matches the database's editor
  role while generation and producer decisions remain producer-only.

### Verification And Limits

- The Schedule contract, API, static authority, workspace, and real disposable
  PostgreSQL 15 proof pass `31/31` with no skips. The database proof exercises
  exact derivation, replay, conflict handling, stale sources, role boundaries,
  immutable history, approval binding, globally unique source shots, and
  non-mutation of production tasks.
- The complete repository run reports `1288` tests: `1284` passed, `0` failed,
  and `4` intentional optional suites skipped in the normal run. TypeScript,
  scoped ESLint, whitespace checks, and the Sites existing-application
  production build pass. The Next build prerenders `69` static pages and
  includes all four governed Production Schedule API routes.
- The existing Next font path remains deliberate and unchanged: Inter requests
  only weights `400-700`, Manrope only `600-800`, both use `display: swap`, and
  both declare explicit system/generic fallbacks. Schedule inherits those
  variables and introduces no new runtime font request.
- `http://localhost:4103/api/health`,
  `http://localhost:4103/projects/ica?demo=1&surface=tasks&plan=script`,
  `http://localhost:4103/projects/ica?demo=1&surface=tasks&plan=shots`, and
  `http://localhost:4103/projects/ica?demo=1&surface=tasks&plan=schedule`
  return `200` from the retained preview. The selected in-app Browser currently
  exposes no controllable backend, so this checkpoint makes no fresh
  screenshot, matched-reference comparison, console, overflow, keyboard, or
  clicked-flow claim. No alternate browser was substituted.
- `.openai/hosting.json` remains absent, so Sites was used only as the local
  production build gate and no Sites version or publish was created. The
  additive Schedule migration remains unapplied. No deploy, push, migration
  apply, DNS, Cloudflare, tunnel, isolated-lane, or public Content Co-op site
  action occurred.

production-schedule result: the approved shot plan can now become a complete,
source-bound shoot schedule with explicit human timing and producer activation,
without pretending that crew, locations, weather, or call sheets already exist

## Review Thread And Version Scope Reconciliation - 2026-07-16

- Public Wipster material was used as a behavioral reference only: a reviewer
  creates a point-in-time note from the media, replies stay in that parent
  conversation, reviewer completion remains distinct from approval, and every
  version retains its own review history. The research used public pages only;
  no authenticated Wipster account, private endpoint, credential, intrusive
  scan, or attack tooling was used. Sources: [product](https://www.wipster.io/product),
  [frame-accurate review](https://www.wipster.io/blog/frame-accurate-video-review-what-it-is-and-why-editors-love-it),
  and the [reviewer guide](https://intercom.help/wipster-support/en/articles/12694164-reviewer-s-guide).
- The public review and producer cockpit now read the same canonical demo
  thread. A root note, its frame pin, timeline marker, rail entry, and replies
  share one parent identity; replies do not invent a second pin. Public notes
  retain the exact review invitation that authorized them.
- Comments and cut markers are now queried by the full project, asset, and
  media-version key. A cut at the same time on two versions is two distinct
  records, never a leaked or overwritten decision. Legacy local cut markers
  missing a version are restored only onto that asset's known current version;
  markers for an unknown asset are discarded rather than shown on arbitrary
  media.
- Current in-app Browser evidence: clicking the public player pauses it and
  opens one timestamped comment dialog; cancelling leaves no submitted change.
  Space toggles the player, ArrowRight advances the current review by the
  configured interval, and both the public review and the producer cockpit
  show no fresh browser warnings or errors. The producer surface exposes the
  matching review player, comments, and cut decisions.
- Focused authority and journey tests pass `35/35`; TypeScript, scoped ESLint,
  and whitespace checks pass. ArrowDown was deliberately not pressed in the
  browser because it would persist a marker into the user's local demo state;
  exact version behavior is covered by the focused contract instead.
- Native file chooser automation remains an in-app Browser limitation, not a
  product claim. Durable database composite foreign keys, multi-reviewer
  realtime refresh, reply-preserving carry-forward, and explicit approval-step
  binding on each public invite remain open. No migration was applied and no
  deploy, push, DNS, Cloudflare, tunnel, or public-site action occurred.

review reconciliation result: a review note now has one unambiguous home - its
thread, frame, audience, project asset, and exact version - across client and
producer surfaces

## Governed Call Sheet Authority - 2026-07-16

- The existing Plan switcher now reads
  `Script | Shots | Tasks | Schedule | Call sheet`. Call Sheet is a fifth
  query-backed mode inside the supplied bright Co-VideoPro cockpit; it adds no
  route shell, dashboard, rail destination, drawer family, marketing surface,
  or duplicate scheduling system.
- The workspace keeps one compact day rail beside one operational sheet. The
  day rail remains available before a draft exists so contributors can select
  the correct approved shoot day before generation. On mobile it becomes a
  horizontally scrollable day strip rather than compressing the form or
  creating page overflow.
- Each immutable revision is bound to one exact approved Production Schedule
  revision, content hash, approval binding, and schedule day. Unit call,
  timezone, shoot date, and agenda order/timing are derived from that source;
  contributors author location and access details, crew contact snapshots,
  call times, safety instructions, transport, meal, equipment, and general
  notes without changing the approved schedule.
- Editors can read, revise, and submit. Producers generate and decide.
  Submission requires a named and addressed location, at least one reachable
  contact with a call time, a safety section, and complete agenda timing.
  Source changes make prior revisions stale rather than silently rewriting
  production-day instructions.
- The interface is explicit about its current boundary: contacts and location
  are revision snapshots, not canonical crew or location masters. Approval
  does not send, notify, acknowledge, distribute, or prove receipt. Weather,
  maps, transport vendors, releases, live production logs, and delivery remain
  separate future authorities.
- The complete Call Sheet contract, API, launch gate, lifecycle, workspace,
  static authority, and disposable PostgreSQL 15 proof pass `61/61` with no
  failures or skips. The full repository run reports `1328` tests: `1323`
  passed, `0` failed, and `5` intentional optional suites skipped. TypeScript,
  scoped whitespace checks, and scoped ESLint pass; ESLint retains only two
  existing type-only lifecycle assertion warnings.
- The Sites existing-application production gate passes through the native
  Next build. It compiles all four Call Sheet API routes and prerenders `69`
  static pages. `.openai/hosting.json` remains absent, so no Sites version or
  publish was created.
- `http://localhost:4103/api/health`,
  `http://localhost:4103/projects/ica?demo=1&surface=tasks&plan=call-sheet`,
  `http://localhost:4103/projects/ica?demo=1&surface=tasks&plan=schedule`, and
  `http://localhost:4103/projects/ica?demo=1&surface=tasks&plan=script` return
  `200` from the retained preview. The selected in-app Browser currently
  reports no available browser backend, so this checkpoint makes no fresh
  screenshot, matched-reference comparison, console, overflow, keyboard, or
  clicked-flow claim. No alternate browser was substituted.
- The existing Inter and Manrope `next/font` path remains unchanged, bounded to
  its deliberate weights, `display: swap`, and explicit system/generic
  fallbacks. No network-dependent runtime font or licensed Metronic asset,
  Keenicon, token set, or demo shell was introduced; the local Metronic bundle
  remains pattern-only until Co-VideoPro-specific license authority exists.
- The additive Call Sheet migration remains unapplied. No deploy, push,
  migration apply, DNS, Cloudflare, tunnel, isolated-lane, or public Content
  Co-op site action occurred.

call-sheet result: one approved shoot day can now become a source-bound,
producer-governed operational sheet inside the existing cockpit without
pretending that approval also delivered it to the crew
