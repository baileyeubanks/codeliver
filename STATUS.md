# Co-VideoPro Stabilization Status

Updated: 2026-07-26
Machine: M2
Canonical branch: `main`
Full release merge baseline: `61b2a397b880c1805a05498d79e2324f28d38073`
Historical CCO-C2 runtime build: `bad8ef16e8fd041f98095f068d89140f20d74e45`

## Anti-Drift Contract

- Preserve the shared player-first review workspace.
- Keep one compact top bar, one dominant media stage, and one adjacent review rail.
- Source push and landing are approved for this release. Do not alter DNS,
  apply migrations, or replace a public runtime without a verified target and
  a fresh fail-closed preflight.
- Treat missing auth, database, NAS, or provider configuration as an explicit unavailable state.

## Current State

The tracked tree was clean at CCO-C1 entry on `a7eaaab`; the inherited
untracked `audit/` directory is preserved and out of scope for cleanup.
F1–F14 source stabilization, the later P6–P28 commits, and the independently
reviewed CCO-C5A upload/asset/V1 authority packet and its storage/public-review
hardening follow-up are present. CCO-C6B review-admission authority is also
present, and the release-candidate source harness is green.

The operating-system claim is **not complete**. CCO-C2 established a dated
repo-owned M2 `next start` and anonymous fail-closed receipt at `bad8ef1`, but
that process has stopped and the receipt is historical. No process currently
listens on M2 port `4103` or `4115`. A real file has not yet been independently
proved through
upload → asset → V1 → playback → anonymous public review → frame comment →
attributable approval → locked delivery. P10–P28 now have a
source-and-current-evidence classification ledger below; none qualifies as
`REAL` without current route, data, authority, and runtime proof.

CCO-C5A now makes `/api/upload/tus` the only production catalog writer. A
clean committed upload is source-bound through one service-only atomic RPC to
one asset and one exact V1, and authenticated playback resolves that immutable
version through a receipt-bound range route. The legacy multipart/TUS writers,
metadata-only asset writer, and arbitrary V2 `file_url` writer are explicit
`410 Gone` tombstones. The migration is **source-only and unapplied**: live
PostgreSQL syntax, effective privileges, RPC behavior, current data
contamination, configured storage, and real-file runtime behavior remain
unproved. Generic asset editing also refuses `approved` and `final`; those
states must come from the governed approval and delivery workflows.

The follow-up at `2639e89` publishes committed filesystem media through a
separate sealed inode, preflights capacity for the full immutable copy,
requires a single-link immutable receipt, cleans deterministic crash
placements, and fails closed on writable or aliased objects. Anonymous review
payloads now use explicit public allowlists, inactive or protected invites
fail closed, and a public frame comment is source-bound to the invite's exact
version with complete 0–100 percentage pins. The pin constraint migration
aborts before DDL if any legacy pin exists, so ambiguous 0–1 rows cannot be
silently reinterpreted. These are reviewed source contracts—not CCNAS,
database, anonymous-playback, or end-to-end runtime proof.

CCO-C6B now adds a source-only anonymous review admission bridge. A successful
admission binds one opaque-token hash, invite, asset, exact version, and
durable admission for at most eight hours; the browser receives a signed,
host-only 15-minute grant and a token-free media URL. The database contract
allows at most 32 active admissions per invite, 32 new admissions per invite
per hour, and 120 network attempts per ten minutes. Admitted mutations are
separately limited to 20 comments, 10 approval attempts, and 30 edit decisions
per minute. Password-protected and watermark-enabled invites fail closed.
Download permission changes response disposition only; it is not DRM and
cannot prevent a viewer from retaining bytes already delivered for playback.

The CCO-C6B migration is **source-only and unapplied**. Its PostgreSQL
compatibility, effective grants, RPC behavior, concurrency semantics, ingress
header provenance, private signing configuration, storage receipts, and
real-file runtime behavior remain unproved. Approval requests now require a
live exact-version admission and use a compare-and-set against the pending
asset approval step, but the recorded approval packet remains asset/workflow
scoped and accepts caller-supplied reviewer identity. Exact-version approval
attribution and locked delivery therefore remain open.

## Harness Evidence (current source truth)

Command set: `git diff --check && npm run typecheck && npm run lint && npm test && npm run build`

- Reproduced on M2 on 2026-07-26 against the CCO-C6B release-candidate tree.
- `git diff --check`: pass
- `npm run typecheck`: pass, 0 errors
- `npm run lint`: pass, 0 errors, 36 warnings in the tracked release tree
- `npm test`: pass, 1,211 total / 1,208 pass / 0 fail / 3 runtime skips
- `npm run build`: pass without a whole-project NFT trace warning
- Independent exact-diff review: no remaining Critical or Important findings
- Runtime on `:4103`: **down**
- Runtime on `:4115`: **down**
- CCO-C2 anonymous verifier receipt: historical and expired

The phase-level harness counts below are preserved as historical receipts.
Do not cite 664/664, 696/696, 722/722, or 741/741 as current source truth.

## Current Runtime and Configuration Snapshot

Presence-only checks in the inspected M2 shell on 2026-07-26 found these keys
absent: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_DATA_SCHEMA`,
`NEXT_PUBLIC_SUPABASE_DATA_SCHEMA`, `CODELIVER_STORAGE_PROVIDER`,
`CODELIVER_STORAGE_WRITE_ENABLED`, `NAS_MEDIA_ROOT`,
`CODELIVER_LOCAL_STORAGE_ROOT`, `CODELIVER_MALWARE_POLICY`,
`CO_PRODUCTION_REVIEW_ADMISSION_SIGNING_KEY`,
`CO_PRODUCTION_REVIEW_ADMISSION_VERIFICATION_KEYS`, and
`CO_PRODUCTION_REVIEW_ADMISSION_TRUSTED_IP_HEADER`. Rotation verification keys
are optional; the active signing key and trusted ingress header are required
for isolated production. This describes the inspected shell only; it is not
evidence about every private service or configuration store on M2.

Current source requires an explicit storage provider and write-enable flag.
CCNAS additionally requires `NAS_MEDIA_ROOT`. The default malware policy is
`required`, but the current scanner hook is unconfigured and leaves verified
bytes quarantined; the only bypass is explicitly restricted to the local demo
provider. Explicit local or CCNAS storage can ingest bytes when its own write
gate is ready, but scanner readiness separately gates release and derivative
readiness separately gates playable processing. The current gaps therefore
block automatic release, playable media, and locked delivery—not byte
ingestion by itself. Additional absent production origin, encryption,
analytics, and worker-authorization inputs are enumerated in `BLOCKERS.md`;
FFmpeg and FFprobe themselves currently resolve from M2's `PATH`.

## P10–P28 Capability Ledger (CCO-C3 source classification)

Classification is anchored to the CCO-C6B release-candidate tree and current
M2 evidence on 2026-07-26. `REAL` requires current route, UI, data,
authority, and runtime proof; source presence or a unit test alone is
insufficient. A phase can be upgraded only by new evidence.

| Phase | Classification | Current evidence |
| --- | --- | --- |
| P10 | `PARTIAL` | Responsive/accessibility changes exist; no current browser/runtime proof. |
| P11 | `PARTIAL` | Brand tokens exist and are consumed; this is source/UI evidence only. |
| P12 | `CONTRADICTED` | The lime/Manrope reskin was deliberately replaced by brand-canon commit `a573f12`. |
| P13 | `PARTIAL` | Closure is documentation-only; intended elements were deferred or reverted. |
| P14 | `DEMONSTRATION` | Copilot requires demo mode, uses canned browser-local state, and has no AI API. |
| P15 | `PARTIAL` | Monogram is integrated into production-facing UI paths; presentation only. |
| P16 | `PARTIAL` | Player controls plus authenticated and admission-bound anonymous exact-version range playback exist in source; the admission migration, configuration, ingress provenance, and current playable-media runtime proof are absent. |
| P17 | `PARTIAL` | Complete 0–100 frame-pin pairs persist in source; richer drawing/annotation payloads remain incomplete. |
| P18 | `PARTIAL` | Admission-bound exact-version public frame comments and parent replies persist in source with per-admission throttling; reactions, edits, deletes, attachments, mentions, database application, and live proof remain incomplete. |
| P19 | `PARTIAL` | Canonical ingest now creates exact V1 in unapplied source; rich V1–V3 behavior remains demo-seeded and no live database/runtime receipt exists. |
| P20 | `PARTIAL` | Approval requests require a live exact-version admission and compare-and-set the pending asset approval step, but the durable packet is still asset/workflow scoped, reviewer identity is caller-supplied, exact-version attribution is absent, and lock wiring is incomplete. |
| P21 | `PARTIAL` | Summary logic can use loaded comments; its API is demo-only and triage is localStorage. |
| P22 | `PARTIAL` | Source now admits active invites only to their exact asset/version/media receipt with bounded grants, views, sessions, and request rates; password and watermark paths fail closed, while migration/configuration/ingress/runtime proof remains absent. |
| P23 | `DEMONSTRATION` | Client portal is demo-guarded and reads demo workspace state. |
| P24 | `DEMONSTRATION` | New workspace tabs mount only in the demo branch. |
| P25 | `DEMONSTRATION` | The production surface says the board API is still being built. |
| P26 | `PARTIAL` | Production fetches basic assets; the rich library experience is demo-only. |
| P27 | `DEMONSTRATION` | No request API exists; mutations are browser-local and dispatch is simulated. |
| P28 | `DEMONSTRATION` | Production shows a connect-analytics notice; reports/CSV/print use seeded browser data. |

Totals: 12 `PARTIAL`, 6 `DEMONSTRATION`, 1 `CONTRADICTED`, and 0
`REAL`, `DEAD`, or `CONTAMINATED`. A targeted committed-source scan found no
direct ACS contamination in P10–P28. Demonstrations must remain visibly
labeled until they are either wired or removed.

Phase sections below are implementation and test receipts. They do not
establish present runtime availability, production deployment, backend
persistence, or end-to-end business reality.

## P6 — One shared overlay system (2026-07-25)

One overlay primitive (`components/overlay/`: `useOverlay` + `overlay-position`)
now backs every popover/menu: collision-aware flip+shift positioning, a global
dismiss stack (Escape closes topmost, outside pointer-down closes, both
independent of focus location), and focus-into/return on dialogs. Fixed the 7
verified swarm defects:

- D1 cockpit header action cluster off-viewport (Share at x=−111): the demo
  stage chip was a 5th child in a 4-track header grid; grid gained an explicit
  chip track at all three breakpoints (`app/globals.css`).
- D2 public review playback-speed menu never dismissed: adopted `useOverlay`
  in `components/player/PlayerControls.tsx`.
- D3 Escape dead on Notifications/Account when an input held focus: cockpit
  keydown guard skipped inputs; dismissal moved into the overlay stack.
- D4 last-row `...` menu clipped at viewport bottom: `MediaTable` row menu now
  flips up via `useOverlay`.
- D5 Tab landed on offscreen Share/Upload (x=−112): same grid root cause as D1.
- D6 Share dialog never received focus: `DemoShareModal`/`ShareModal` now use
  `useDialogFocus` (focus in on open, return to trigger on close).
- D7 palette input focus raced keystrokes (rAF-deferred): `useDialogFocus`
  focuses synchronously and the palette input is `autoFocus`.

Proof: 7 Playwright regressions in `~/covideopro-visual-audit/regressions/p6/`
(0/7 → 7/7 PASS on :4115, before/after screenshots in `shots/`), plus
`tests/overlay-position.test.ts` (7 positioning-math units). Harness after P6:
`git diff --check` pass · typecheck 0 errors · lint 0 errors (40 pre-existing
warnings) · `npm test` 728/729 — the one failure (`exterior-states.test.ts`
ENOENT on `app/loading.tsx`) comes from a concurrent P9 session's uncommitted
deletion of that file, not from P6 · `npm run build` pass.
Concurrency note: a parallel session committed `components/projects/ProjectCockpit.tsx`
and `app/globals.css` hunks (P6's overlay/grid edits included) inside c65d460;
the remaining P6 files are committed separately.

## P7 — Review player core fixes (2026-07-25)

Player-core defect cluster from the visual swarm, regression-guarded in
`~/covideopro-visual-audit/regressions/p7/` (5 scripts, before/after shots in
`shots/`). Two of the five verified defects no longer reproduced on the current
build and are now pinned by regressions instead of code changes:

- D8 timeline zoom: the canvas already rescales (`width: zoom * 100%`;
  measured scrollWidth 762 → 1524 → 3048 px at 1x/2x/4x on :4115) — the audit
  had measured the non-scrolling container. Guard added: source assertion on
  the zoom-width binding in `tests/cockpit-review-timeline.test.ts` plus the
  d8 Playwright script.
- D9 ended state: the "collapsed orange band" was the demo clip's actual
  baked-in end card (verified by ffmpeg-extracting the last frame of
  `public/demo/ica-ceo-preview.mp4`) — the stage never collapsed. The real gap
  was a dead end: no affordance once playback finished. Added `hasEnded`
  state, a centered Replay overlay button that restarts from 0, ended-aware
  `togglePlayback` (restarts instead of resuming at the end), and ended
  tracking on the simulated-playback path (`components/projects/ProjectCockpit.tsx`).
- D10 overlay click model: `[data-review-overlay]` consumed `pointerdown` over
  the whole stage to arm comment pins, so click-to-play was impossible. New
  model: single click toggles play/pause, double-click arms a pin (cursor +
  title hint updated), frame pins keep pointer events and now surface their
  comment body (seek + toast) on click.
- D11 mute: already wired on the current build (`video.muted` flips and the
  icon/aria-label swap); the d11 Playwright regression pins it.
- D12 timecode/volume: new floor-based SMPTE helper
  `components/player/timecode.ts` (`formatSmpteTimecode`) replaces the local
  `formatClock`; the transport readout now uses the same HH:MM:SS:FF format as
  the stage chip, and a volume slider wired to `video.volume` sits next to
  Mute. New styles live in `components/projects/ProjectCockpit.module.css`
  (globals.css untouched — parallel-session lane).

Proof: d9/d10/d12 failed pre-fix (1/4, 3/6, 1/2), 5/5 PASS post-fix;
`tests/player-timecode.test.ts` (5 SMPTE units); updated the
`ReactPointerEvent → ReactMouseEvent` signature regex in
`tests/cockpit-control-regressions.test.ts`. Harness: `git diff --check` pass ·
typecheck 0 errors · lint 0 errors (40 pre-existing warnings) · `npm test`
741/741 (the earlier `exterior-states.test.ts` failure from the parallel
session's `app/loading.tsx` deletion is resolved — that work has landed) ·
`npm run build` pass.

## P9 — Real dynamic-route statuses + canonical short review links (2026-07-25)

D19 root cause: `app/loading.tsx` wrapped every route in an instant-flush
Suspense boundary, so the HTML shell went out with HTTP 200 before the async
F8 wrappers could call `notFound()` — the not-found UI rendered, but every
missing record was a soft-200 in prod and demo. The root loading boundary is
removed (regression-guarded by a test asserting it never returns); without it
the wrappers block the initial render and `notFound()` sets the real status.

- `app/review/[token]/page.tsx`: expired/exhausted invites (lookup 410) now
  `notFound()` at the page layer too (App Router pages cannot emit 410; the
  API keeps the precise 410 for clients); `>=500` still throws
  `BackendUnavailableError`, and a lookup that throws outright (e.g. missing
  Supabase env) is converted to the same honest unavailable error so a
  misconfigured backend never masquerades as a missing record. Demo requests resolve tokens against the demo
  workspace authority only — an unknown demo token is a 404, never a
  production database lookup (previously a 500).
- D20: `/review/<token>` is canonical in demo. `proxy.ts` rewrites local-demo
  short share URLs (seeded `demo-ica-final`/`demo-ceraweek-cuts` plus the
  `review-<uuid>` local-share pattern from `lib/dynamic-route-authority.ts`)
  to the long query form the public client resolves, re-supplying the seeded
  asset/intent and a `demo-short=1` loop-break flag; the wrapper
  `permanentRedirect`s (308) bare long-form visits to the short URL.
  Production (Supabase) token resolution is unchanged.

Proof: `tests/runtime-route-status.test.ts` (live-status contract against
:4103/:4115, skips when a runtime is down), new authority/proxy-rewrite units
in `tests/dynamic-route-not-found.test.ts` and
`tests/security-demo-auth-s1.test.ts`. Pre-rebuild `npm test` 735/736 — the
single failure was the new prod runtime contract against the stale :4103
build (the bug reproducing); after `./scripts/rebuild-public-runtime.sh` the
full suite is green and the curl matrix is:

| Route | :4103 before | :4103 after | :4115 before | :4115 after |
| --- | --- | --- | --- | --- |
| /review/bogus-token | 200 | 404 | 200 | 404 |
| /review/bogus-token-1234567890 | 200 | 500¹ | 200 | 404 |
| /review/demo-ica-final | 200 | 404 | 200 | 200 (resolves) |
| /review/ica?demo=1 | — | — | 200 | 404 |
| /projects/does-not-exist?demo=1 | — | — | 200 | 404 |
| /review/demo?…&share=demo-ica-final (long form) | — | — | 200 | 308 → short |

¹ Pattern-passing tokens require the database verdict. Supabase env is absent
on M2 (BLOCKERS.md Blocker 1), so :4103 fails closed with the honest
backend-unavailable error (`BackendUnavailableError`, HTTP 500) instead of a
soft-200 or a false 404; with Supabase present the missing row is a real 404.
The runtime contract test encodes both branches.

## P12 — Live-brand visual reskin (2026-07-25)

The app sheds the cream-editorial/sapphire theme for the live co-videopro.com
brand law: cool white canvas `#f7f9fc`, white cards, navy ink `#18223e`,
brand blue `#145bb8` signal, signature lime `#b9ff77` for primary CTAs,
Manrope display + Inter body. `app/brand-tokens.css` (P11 token layer) is now
imported by `app/globals.css` and the root palette maps onto it; the cockpit
`--cockpit-*` set retunes to the same brand.

- Shell (`app/globals.css`, `components/navigation/WorkspaceRail.module.css`):
  thin 4-color gradient-ribbon hairline across the top bar; lime Upload CTA
  (navy-ink text, `#9fe65f` hover, accent-glow shadow — lime never carries
  small text on white); rail active items get a blue tint pill + 3px blue
  indicator bar; selection and `:focus-visible` rings in brand blue.
- Login/signup (`components/auth/AuthShell.module.css`): `--auth-*` tokens
  retuned to the brand; white 12px-radius panel with brand popover shadow and
  gradient-ribbon cap; ribbon hairline on the auth header; lime Demo chip;
  brand-blue input focus rings; alert/success states on red/green tints.
- Dashboard `/projects` (`app/(dashboard)/projects/page.tsx`): lifecycle
  cards gain `data-phase` hooks (structure-only) so Intake/Ingest/Review/
  Delivery icons take the red/amber/blue/green phase coding; status chips are
  soft-tint pills (`badge-in-review` blue tint, `badge-requires-changes` amber
  tint, `badge-approved` green tint — the old dark-theme `#4ade80` text on
  light bg failed contrast).
- Cockpit chrome: `--cockpit-*` tokens retuned; gradient-ribbon hairline on
  the top bar; `.cockpit-action-primary` (Upload only) goes lime. Canonical
  layout (one bar, one stage, one rail), P6 overlay positioning, and P7 player
  fixes untouched — no behavior changes.
- Pipeline strip (`components/projects/PipelineStrip.tsx`): `data-phase` hook
  colors progress bars + state labels with the 4-color phase coding.
- Typography: Manrope added to the Google Fonts link in `app/layout.tsx`;
  `--font-display`/`--font-body` resolve to the brand stacks. Motion stays on
  `var(--cvp-motion-*)` (120–200ms) with `prefers-reduced-motion` zeroing.

Proof: before/after captures at 1440×900 in
`~/covideopro-visual-audit/regressions/p12/{before,after}/` (login, projects,
projects-ica cockpit; signup after). Harness: `git diff --check` pass ·
typecheck 0 errors · lint 0 errors (41 pre-existing warnings) · `npm test`
740/741 — the one failure (`covideopro-copy.test.ts` "canonical bright shell"
copy assertion) comes from a concurrent P8 session's uncommitted dark-mode
wiring (`lib/demo/DemoThemeSync.tsx`, `IdentitySettings.tsx` copy change), not
from P12; P12 files alone leave every test they touch green · `npm run build`
pass.

## P14 — AI Copilot floating panel (2026-07-25)

The signature dark-navy copilot from the inspiration mock, mounted globally
from `app/layout.tsx` via `components/copilot/CopilotMount.tsx` — demo-mode
only (server-derived capability, never a URL flag) and route-gated off
`/login`, `/signup`, and public `/review/*` surfaces so clients never see
internal tooling.

- Panel (`components/copilot/CopilotPanel.tsx`, styles appended to
  `app/globals.css`): `--cvp-copilot-*` tokens, 16px radius, lime status dot,
  suggestion chips, lime focus ring + send button. Collapsed state is a pill
  bottom-right; close/"Hide Copilot" return to it. Header drag repositions
  (pointer capture, clamped to viewport via `clampPanelPosition`); a header
  toggle resizes compact (360×440) ↔ expanded (540×620) with position
  re-clamp on resize and viewport changes.
- Right-click context menu (role=menu): Summarize project status / List
  pending approvals / Draft client update / Hide Copilot — arrow-key
  navigable, Enter activates, Escape/outside-click dismisses.
- Honesty contract: answers are canned mocks only, derived from the live demo
  workspace (project names/stages, open approval stages + waiting reviewers,
  unfinished tasks, open comments) via `components/copilot/copilot-logic.ts`;
  every reply carries the italic footnote "Local preview — Copilot answers
  are illustrative", and the empty state says plainly it is not a real AI.
- A11y: role=dialog panel with focus trap while open, Escape closes (menu
  first, then panel), focus returns to the composer, lime `:focus-visible`
  rings inside the dark panel, motion on `--cvp-motion-*` (zero under
  prefers-reduced-motion).

Proof: `~/covideopro-visual-audit/regressions/p14/` — d25 open/answer/Escape
11/11, d26 drag+clamp+resize 5/5, d27 context menu 10/10, d28 absence on
login/signup/review 4/4 (d25–d27 confirmed failing before the build);
screenshots in `p14/shots/` (collapsed, open, answer, dragged, menu). One
real bug caught by d26: header pointer capture swallowed clicks on the
header's own buttons (SVG targets aren't `HTMLElement`) — fixed in
`onDragStart`. Harness: `git diff --check` pass · typecheck 0 errors ·
lint 0 errors (40 pre-existing warnings) · `npm test` 752/752 (7 new
`tests/copilot-logic.test.ts` tests: clamp geometry, default position,
intent classification, footnote-on-every-reply, workspace-derived content,
empty-workspace degradation, menu-prompt honesty) · `npm run build` pass.

## P10 — Responsive + accessibility pass (2026-07-25)

Re-verified every responsive/a11y finding against the post-P12 UI before
touching anything: D21 (mobile/iPad cockpit overflow) and D24 (dead project
switcher) were already fixed by the P12 reskin — regression proofs now lock
them in (`~/covideopro-visual-audit/regressions/p10/`, 12/12 + 3/3 PASS at
390/768/1440).

- D22 focus-visible (WCAG 2.4.7): one design-system ring token
  (`--cvp-focus-ring`/`--cvp-focus-ring-offset` in `app/brand-tokens.css`)
  backs the global `:focus-visible` rule in `app/globals.css`; the real bug
  was ~11 CSS-module rules that grouped `:focus-visible` with `:hover` and
  zeroed the outline (rail nav, dock tabs, toolbar menus, drawers, command
  palette). Those `outline: 0` declarations are removed so the global token
  applies everywhere instead of per-button hacks. Proof: Tab walk lands on
  rail "Overview" with a 2px brand-blue ring (`d22-focus-visible.mjs`, 2/2).
- D23 touch targets (WCAG 2.5.5): a coarse-pointer/≤900px block in
  `app/globals.css` enforces 44px minimum hit area on the named offenders —
  cockpit project `select` (was 18px), `.cockpit-action-primary` Upload
  (was 20px), all `input[type="range"]` (seek slider was 16px), cockpit
  icon/avatar buttons (were 28–36px) — with the ≤640px/≤390px breakpoint
  rules retuned to match. Proof: `d23-touch-targets.mjs` 4/4 at 390px, and
  D21's 12/12 still passes (no overflow reintroduced).
- Truth minors, each with a live proof in `minors.mjs` (9/9 PASS):
  favicon.ico 308→`icon.svg` (was 404 every load); degraded-storage banner in
  the workspace shell when `/api/health/ready` 503s (sticky, reuses the
  offline-notice slot); failed login clears the password field; demo login no
  longer blocks one-click entry behind required fields (`required={!demoMode}`);
  `/settings?section=bogus` rewrites to `section=account` with an explanatory
  notice; Systems "Health check" probes `/api/health/ready` inline with a
  Ready/Degraded badge instead of navigating to raw JSON; `/reviews` hydration
  mismatch eliminated (public-link origin now SSR-stable, adopted from
  `window.location.origin` only after mount); login trust chips wrap instead
  of truncating at 1440; rail comments clamp to 3 lines with an honest
  "Read full comment"/"Show less" toggle; rail nav labels (workspace rail +
  cockpit rail) carry `title` tooltips for truncated text; mobile toasts dock
  above the 58px bottom bar instead of covering it.
- Deferred with reason: hover edit/delete on rail comments (resolve/reopen
  already exists; edit/delete need real demo-store mutations and confirm
  flows — not a trivial stub). The "1 Issue" pill from the old audit was the
  Next.js dev-overlay indicator, not app UI. Signup confirm-password eye
  toggle and Systems pill filtering were verified already working (one toggle
  governs both password fields; pills filter 16→2 rows live).

Proof: `~/covideopro-visual-audit/regressions/p10/` — d21 12/12, d22 2/2,
d23 4/4, d24 3/3, minors 9/9, all on :4115 with screenshots in `shots/`.
Harness: `git diff --check` pass · typecheck 0 errors · lint 0 errors
(40 pre-existing warnings) · `npm test` 741/741 · `npm run build` pass.

## Audit Finding Dispositions (handoff section 11)

This table preserves the 2026-07-25 stabilization dispositions. Any
runtime-backed `fixed-proven` label refers to that dated receipt and must not be
read as a currently running verifier result.

| ID | Item | Disposition |
| --- | --- | --- |
| C1 | `?demo=1` authentication bypass | fixed-proven (F1; prod 307→login, verifier PASS) |
| C2 | no real server session / forgeable demo identity | implemented (F1/F12); real-session proof blocked on Supabase env |
| H1 | public source maps | fixed-proven (maps 404 in production) |
| H2 | malformed RSC stack/path leak | fixed-proven (verifier PASS) |
| H3 | launch editor endpoint | fixed-proven (verifier PASS; false-positive fixed in 2d57b7b) |
| M1 | prefilled credentials | fixed-proven (F4; DOM inputs empty in prod) |
| M2 | Stripe server code in client bundle | fixed-proven (F5; chunk grep clean) |
| M3 | clickjacking | fixed-proven (F3: `frame-ancestors 'none'`, `X-Frame-Options: DENY`; curl-verified) |
| M4 | missing security headers / powered-by | fixed-proven (F3; curl-verified) |
| M5 | webhook management unauthenticated/crashing | fixed-proven (F7; POST → structured 503) |
| L1 | health topology | fixed-proven (F6; public probes minimal, /ready gated) |
| L2 | route oracle / soft 404 | dynamic server wrappers added (F8); authenticated 404 proof blocked on Supabase env |
| L3 | production hostname references | intentional surface-routing configuration, not secrets; accepted |
| L4 | demo API empty 500s | fixed-proven (F2/F13; down-backend matrix: zero empty 500s) |
| L5 | robots/sitemap redirect | fixed-proven (F9; both 200) |
| L6 | TRACE and Retry-After hygiene | TRACE → generic 500 (framework default, no leak, documented); Retry-After source-verified on 503 paths |

Tested-not-vulnerable audit items (preserve evidence, no speculative changes):
reflected XSS/SSTI, open redirect, CORS reflection, path traversal variants,
image optimizer SSRF, obvious project ID guessing, hardcoded secret values in chunks.

## Stabilization Backlog

| ID | Item | Status | Proof |
| --- | --- | --- | --- |
| F1 | Explicit local-only demo gate | Implemented | Source tests + runtime verifier PASS |
| F2 | Structured API unavailable errors | Implemented | Contract tests + down-backend matrix PASS |
| F3 | Security headers | Implemented | Source tests + curl-verified |
| F4 | Login prefill removal | Implemented | Source tests + prod DOM check PASS |
| F5 | Stripe server-only checkout | Implemented | Source tests + chunk grep clean |
| F6 | Minimal public health | Implemented | Source tests + curl-verified |
| F7 | Webhook hardening | Implemented | Source tests + runtime matrix PASS |
| F8 | Real dynamic-route 404s | Implemented | Source tests pass; authenticated 404 blocked-on-env |
| F9 | Middleware static metadata exclusions | Implemented | Source tests + curl-verified |
| F10 | Production runtime tooling for port 4103 | Implemented | Tooling exists; the `bad8ef1` runtime receipt is historical and both ports are currently down |
| F11 | Fail-closed storage and retry UI | Partial | Source tests pass; provider, write-enable, CCNAS, scanner, and positive media proof remain |
| F12 | Stable auth session JSON | Implemented | Source tests + runtime matrix PASS |
| F13 | Error and response hygiene | Implemented | Source tests + runtime matrix PASS |
| F14 | Contract documentation | Implemented | Four truth documents committed at `bad8ef1`; exact-diff rereview found no Critical or Important issues |
| F15 | Canonical upload → asset → exact V1 authority | Implemented in source | Core `3c8f3f9`, hardening `2639e89`; current harness 1,208/1,211 tests pass, build/typecheck/lint pass; migrations unapplied and runtime unproved |
| F16 | Anonymous exact-version review admission and playback | Implemented in source | Signed short grants, durable exact-version admissions, token-free media URLs, admitted mutation gates, and bounded database rate/session authority are source-tested; migration/configuration/ingress/storage/runtime proof remains open |

## Blocked-on-env

The inspected M2 shell lacks Supabase configuration, an explicit storage
provider, write authorization, and both local/CCNAS storage roots. Current
source also has no production malware-scanner implementation, so the required
policy leaves verified bytes quarantined. These conditions block authenticated
database proof, positive media proof, and locked delivery. Details and
presence-only verification commands are in `BLOCKERS.md`.

## Required Harness

- `npm run build`
- `npm run lint`
- `npx tsc --noEmit`
- `npm test`
- `scripts/verify-runtime.sh`
- Browser proof for upload, reload, playback, login, and protected-route behavior

## Historical runtime proof — 2026-07-26 (CCO-C2, expired)

This receipt expired when the exact repo-owned process stopped. Both `4103`
and `4115` are currently down, and application source has advanced to
`2639e89`, so the receipt is retained only as provenance and is not evidence
for the current tree.

- Runtime build HEAD: `bad8ef16e8fd041f98095f068d89140f20d74e45`
  (documentation-only descendant of the independently tested application
  source at `a7eaaab`).
- `scripts/rebuild-public-runtime.sh`: build pass with the unchanged Turbopack
  NFT trace warning; started `next-server` v16.2.10 on `:4103`.
- Process receipt: PID `83183`; cwd is the canonical M2 repo; `:4115` has no
  listener.
- `scripts/verify-runtime.sh`: pass for demo-query auth boundary, structured
  session JSON, security headers, minimal health, no editor/RSC leak,
  server-only Stripe exclusion, and unavailable source maps across 14 served
  scripts.
- Authenticated unknown-project 404: skipped because `AUTH_COOKIE` is absent.
- Public health: `200 {"status":"ok"}` with `no-store`.
- `/api/auth/session` and `/api/storage/readiness`: structured
  `503 BACKEND_UNAVAILABLE`; `/api/health/ready`: structured
  `503 HEALTH_AUTH_UNAVAILABLE`.

This proved production-mode serving and anonymous fail-closed behavior for the
dated `bad8ef1` build only. It does not prove current serving, a configured
backend, authenticated data, writable storage, scanner release, derivatives,
the unapplied CCO-C5A migration, or the real-file spine.

## Historical runtime proof — 2026-07-25 (post-cutover)

This receipt is retained for provenance. It expired when the process stopped;
on 2026-07-26 no listener was present on `4103` or `4115`.

- Port 4103: `next start` (next-server v16.2.10, parent `npm run start`) — dev runtime replaced.
- `scripts/verify-runtime.sh` ALL PASS (authenticated 404 SKIP — AUTH_COOKIE unset, see BLOCKERS.md):
  demo query blocked, structured session JSON, security headers, minimal health,
  no launch-editor behavior, no malformed-RSC stack/path leak, no Stripe server
  strings in client chunks, source maps unavailable (15 scripts).
- API down-backend matrix (backends absent): /api/auth/session, /api/projects,
  /api/assets, /api/webhooks, /api/folders, /api/teams, /api/notifications,
  /api/analytics/project, /api/storage/readiness, /api/upload/tus,
  /api/assets/[uuid], /api/assets/[uuid]/comments, /api/review/[token],
  /api/projects/[uuid] + POST /api/projects → ALL return structured
  503 {"error","code":"BACKEND_UNAVAILABLE"}, no-store, nosniff, JSON.
  Zero empty-body 500s, zero provider detail, zero framework HTML errors.
- TRACE /projects → 500 generic "Internal Server Error" text/plain (21 bytes,
  Next.js framework method handling; no header reflection, no env/stack leak).
  Accepted: framework-level, leaks nothing; 405 would be nicer but is Next's default.
- Commit 2d57b7b fixed a verifier false positive (login return-path echo).

## P10 — Responsive + accessibility sweep summary

Detailed entry above (before "Audit Finding Dispositions"). Note: commit
9c86f22 also swept in a concurrent P9-session hardening —
`getReviewInviteByToken` throws now map to `BackendUnavailableError` in
`app/review/[token]/page.tsx` so a misconfigured backend never masquerades
as a missing record. P10 regressions:
`~/covideopro-visual-audit/regressions/p10/` — d21 12/12, d22 2/2, d23 4/4,
d24 3/3, minors 9/9. Harness: typecheck 0 errors, lint 0 errors, 741/741,
build green.

## P15 — Logo + brand integration (2026-07-25)

The CVP flowing-ribbon monogram (C `#E8442E`, V `#1E40AF`, green `#16A34A`
upper ribbon + amber `#F59E0B` lower bowl on the P) now ships as a clean
inline SVG — crisp at the 24–32px sizes where the 900px raster artwork
(`public/brand/cvp-mark-muted.png`, retained for large lockups) muddies.

- `components/navigation/CvpMonogram.tsx` (new): stroked-letterform
  simplified mark, all four brand colors, `size`/`title` props, decorative
  by default (`aria-hidden`) unless titled.
- Sidebar brand slot (`components/navigation/WorkspaceRail.tsx` +
  `.module.css`): brand header above the rail groups — monogram +
  "Co‑ProVideo" wordmark + "BY CONTENT CO-OP" microcopy, gradient-ribbon
  hairline, home link. Mobile drawer keeps the existing raster lockup.
- Login/auth (`components/auth/AuthShell.tsx` + `.module.css`): brand hero
  above the access panel — 30px monogram + "CREATE • COLLABORATE • CONQUER"
  tagline with red/amber dots (existing gradient-ribbon header untouched).
  Shared by login, signup, invite, and all AuthShell consumers.
- Icons: `app/icon.svg` replaces the generic purple play button with the
  monogram on the navy rounded square; `app/favicon.ico/route.ts` still
  308-redirects to `/icon.svg` (verified live); `app/manifest.ts`
  `theme_color` aligned from stale purple `#6d5dfc` to brand navy `#0b1020`.
- Tests: `tests/cvp-monogram-p15.test.ts` (4 source tests — monogram colors,
  rail brand slot, auth hero, icon contents).

Proof: before/after captures in `~/covideopro-visual-audit/regressions/p15/`
(login desktop/mobile, rail zoom + brand header, mobile drawer, icon render).
Harness: `git diff --check` pass · typecheck 0 errors · lint 0 errors
(40 pre-existing warnings) · `npm test` 752/752 · `npm run build` pass.
No behavior changes; surfaces outside the brand slots untouched.

## P13 — Component lift (verified mostly-delivered; remainder deferred)

Three agent attempts at a broad component lift stalled/reverted; coordinator
audit (2026-07-25) verified the substance was already delivered by P10/P12:
status chips use the soft-tint pill system (P12), progress bars share the
brand-blue-on-tint treatment, avatar chips are consistent, the archive/trash/
library empty states already follow the icon + headline + action pattern on
the token system (components/demo/DemoAssetCollection.tsx), and surfaces use
the token radius/border/elevation throughout. Deferred honestly: the
unsaved-changes amber bar (needs real dirty-tracking, a feature not polish)
and a component gallery page. Arc III closed: tokens (P11), reskin (P12),
component states (P13), Copilot (P14), monogram (P15).

Note (2026-07-25): `stash@{0}` ("p13-wip", settings-frame/pillar styling) is
stranded WIP from one of the three stalled P13 agent attempts — superseded by
this closure. Left untouched per guardrails (no stash pop/drop); nothing in
it is needed.

## P16 — Frame-accurate review player (2026-07-25)

Regression-guarded in `~/covideopro-visual-audit/regressions/p16/` (5 scripts,
36 checks, shots in `shots/`). Pure logic lives in
`lib/review/frame-review.ts` (7 node:tests in `tests/frame-review.test.ts`);
the browser halves stay in `components/player/*`.

- Frame stepping: `,`/`.` step ±1 frame (pause-first), Shift steps ±10
  (Shift yields `<`/`>`, both keys handled). Steps use `stepFrames` with the
  asset frame rate — default 24fps (store default changed 30 → 24), with a
  per-asset `frame_rate` override: the demo payload carries the honest
  ffprobe-measured 24000/1001 (23.976), which passes through unrounded
  (rounding 23.976 → 24 is the classic drift bug; the Vidstack gotcha).
- Speed + shuttle: the P6 overlay menu offers 0.25–2x (superset of the P16
  0.5–2 preset set); J/K/L shuttle is the honest HTML5 version — true
  reverse playback is impossible on a media element, so J steps the rate
  down the preset ladder, L steps up, K keeps its existing play/pause
  toggle. `[`/`]` keep their P7 rate-stepping behavior (the P16 brief's
  `[`/`]` mention conflicted with both P7 and the loop keys; resolved in
  favor of preserving P7 — loop is button-driven instead).
- Comment pins: `PlayerTimeline` now renders pins from a Vidstack-style
  chapters model (`buildCommentChapters` — sorted cue ranges, 0-based
  integer frames per the Frame.io model). Pin click seeks AND selects/opens
  the thread (`aria-current` on the active pin, Note chip in the stage
  context). Tooltip follows the chapters array.
- A/B loop: Repeat button in the transport cycles in → out → clear
  (inverted presses auto-sort); the wrap is enforced in the player's
  timeupdate path via `loopWrapTarget` semantics; the region is highlighted
  on both the transport progress bar and the review timeline
  (`data-loop-region`).
- Buffered range: the video element's furthest buffered end lands in the
  player store (`bufferedEnd`, updated on `progress`) and renders as a
  `data-buffered-range` layer on the review timeline track.
- Timecode consistency: the transport readout is now the same floor-based
  SMPTE HH:MM:SS:FF as the stage chip (`data-transport-timecode`);
  `TimecodeLink` and the selected-comment chip also render SMPTE at the
  asset frame rate. No MM:SS readouts remain in the review surface.

Proof: d29–d33 failed pre-change (frame step was 1/30s, no Shift-step, no
shuttle, no selection-on-pin-click, no loop control, MM:SS readout, no
buffered layer); 5/5 PASS post-change (36/36 checks). P7 player regressions
re-run 5/5 PASS, P14 copilot 4/4 PASS. Harness: `git diff --check` pass ·
typecheck 0 errors · lint 0 errors (40 pre-existing warnings) · `npm test`
759/759 (752 + 7 new) · `npm run build` pass.

Honest limits: frame stepping seeks the HTML5 element by 1/fps, so landing
is keyframe-coarse on long-GOP media — exact frame decode would need
WebCodecs (out of scope, no new deps). The 23.976fps asset renders
non-drop-frame timecode (drift ≈ 3.6s/hour, irrelevant on the 5s preview;
drop-frame would matter for broadcast-length assets). J cannot play
backwards — it slows to 0.25x at most.

## P17 — Annotation mode (2026-07-25, swarm wave 1)

Draw on the paused frame (arrow / rectangle / freehand) on a pointer canvas
inside the existing `data-review-overlay`; entering draw mode pauses video and
is mutually exclusive with pin mode. Pure normalized stroke math in
`lib/review/annotation.ts` (12 node:tests); strokes stored as normalized 0-1
vectors (the existing `AnnotationData` model) plus a WebP data-URI raster via
`canvas.toDataURL("image/webp", 0.8)`; both ride the extended
`submitReviewComment` payload. Saved drawings replay as vector overlays while
|playhead − timecode| ≤ 0.5s; the selected-comment chip shows an SVG vector
thumbnail. Escape cancels; strokes clear after submit. Image assets share the
same canvas path (typechecked; not live-run — demo surface is video-only).
Regression-guarded in `~/covideopro-visual-audit/regressions/p17/` (5
scripts). Honest limits: demo drawing persistence is session-local (in-lane
`drawingsByCommentId` map; demo-store annotation column is a follow-up);
chip thumbnail is the vector replay, the WebP rides as an attachment.

## P18 — Comments 2.0 (2026-07-25, swarm wave 1)

`CommentThread` rewritten: parent/child indent, collapse/expand with reply
counts, inline ReplyComposer (Enter sends / Shift+Enter newline). @mentions
via pure parser `lib/comments/mentions.ts` (emails, @@, punctuation
boundaries unit-tested) with roster listbox and `MentionText` highlighting.
Reactions rebuilt on `lib/comments/reactions.ts` (👍 ❤️ ✅ 👀, truthful
toggle with aria-pressed). Attachment chips with image popover
(`role="dialog"`, Escape). 3-line clamp with Show more/less. Hover actions
(resolve/edit/delete) with an honest "Demo only — changes are not saved"
note where no backend exists; resolved threads collapse by default; All /
Open / Resolved filter chips in new `CommentList.tsx` over
`lib/comments/threads.ts`. 30 new node:tests; regressions in
`~/covideopro-visual-audit/regressions/p18/` (2 scripts, 16 checks, live).
Honest limits: page wiring (roster prop, onReplySubmit, CommentList) is a
coordinator integration; demo reaction clicks fire the legacy API which may
401 (swallowed; local state stays truthful).

## P20 — Approval state machine (2026-07-25, swarm wave 1)

Pure machine in `lib/approvals/approval-machine.ts`: needs_review →
feedback_submitted → changes_in_progress → approved → locked with guarded
transitions (locked only from approved; never derived — it is an explicit
gate). 22 machine tests + 7 panel + 6 audit API (35 new). `ApprovalPanel`
(new in `components/approvals/`, props-driven for coordinator mounting):
one-click approve with optional name + note; request-changes/reject require
a note; every decision yields a Documenso-style audit entry (actor, note,
decided_at; userAgent only when genuinely supplied). `FinishReviewBar`
gained matching locked/assetState props. New `app/api/approvals/audit`
route: auth-gated, chronological entries from persisted approval_history,
fail-closed 503 without backend. Demo flow verified live (step advance +
reload persistence via the existing publicReviewStates store). Regressions
in `~/covideopro-visual-audit/regressions/p20/` (3 scripts). Honest limits:
ApprovalPanel not yet mounted (coordinator); demo lock state is
session-scoped (one-line store addition is the follow-up).

Coordinator verification (wave 1, commits 857f864 / 1f06526 / ad0fc69 on
abb716a): typecheck 0 errors · `npm test` 836/836 (759 + 77 new) · p17 5/5,
p18 2/2, p20 3/3 regression scripts re-run green independently · lint
0 errors (40 pre-existing warnings) per agent harnesses.

## P21 — Producer review summary (2026-07-25, swarm wave 1.5)

Deterministic classification taxonomy (9 classes, ordered rule heuristics —
no AI; `basis: rule|fallback` reported, fallback flagged low-confidence) in
`lib/summary/classify.ts`; consolidation + Frame.io-style conflict surfacing
(two authors, disagreeing stances, same timecode ±1s) in `consolidate.ts`.
Triage board (`components/summary/TriageBoard.tsx`) with resolved /
duplicate / out-of-scope / needs-clarification, completer + timestamp per the
Frame.io completed/completer model, persisted to namespaced localStorage
(`co-videopro.summary-triage.v1` — honest deviation: the workspace store had
no extension point in-lane). Producer summary panel with truthful "Suggested:
X" badges and a `@media print` one-pager ("Open print dialog to save as PDF"
— no fake binary). `app/api/summary/route.ts` is demo-only (403 otherwise).
8 triage-demo seed comments appended to demoReview.ts (+195/−0) including a
designed two-stakeholder conflict at 0:02. Honest limits: board + panel not
yet mounted (lands in P19b integration wave).

## P22 — Share links 2.0 (2026-07-25, swarm wave 1.5)

Typed settings model `{name, allow_approvals, current_version_only,
enable_downloading, expires_at, has_password}` with pure validation (expiry
strictly future, password required iff has_password, plaintext never stored —
demo-grade FNV-1a fingerprint explicitly labeled NOT security).
`ShareLinkAccessGate` is the single integration point (expiry → password →
exactly-one receipt per admission; renders nothing until the local record
resolves — no content flash). `ShareLinkExpired` (dead at the exact instant,
no grace), `ShareSettingsDialog` (six settings, live countdown, receipts —
localStorage `co-videopro.share-links.v1` with honest "this browser only"
label), `ShareWatermark` (standalone tiled overlay, coordinator mounts).
`current_version_only` stored with "Coming with P19" badge — wired for real
in P19b. No new API surface (production columns don't exist — honest no-op).
Demo password for tests: `cvp-review-2026`. Regressions in
`~/covideopro-visual-audit/regressions/p22/` (2 scripts, 7 checks).

Coordinator verification (wave 1.5, commits a84b5d7 / 3ddb2f5): typecheck
0 errors · `npm test` 878/878 (836 + 42) · lint 0 errors (40 pre-existing
warnings) · agent regression suites green (p21 2/2, p22 2/2).

## P19 — Version system + full review integrations (2026-07-25, wave 2)

**P19a foundation (453adf6):** pure version logic in `lib/versions/versions.ts`
(sortVersions, currentVersion, resolveVersionParam, versionBadgeLabel,
comparePair — null-safe, 22 tests). Demo seeds V1–V3 with ffprobe/stat-measured
metadata on three REAL media files (interview-source, ambient-products,
ica-ceo-preview); comments stay `version_id: null` = applies to all versions
(documented). Workspace store: `locked_asset_ids` (P20 persistence),
`drawing` passthrough on demo comments (P17 persistence). Note: the new
`lib/versions/` directory coexists with legacy `lib/versions.ts` — import
from `@/lib/versions/versions`.

**P19b UI + integrations (1188798):** VersionSwitcher (V-chips, `?v=` param,
honest "viewing older version" note), VersionCompare (two synced VideoPlayers,
shared transport, drift correction, per-pane audio), and ALL wave-1
integrations mounted: ShareLinkAccessGate (demo-only by design — a
browser-local record must never gate a real token), ShareWatermark (stage +
compare, intent-driven), ShareSettingsDialog (header button), ApprovalPanel
(replaces ApprovalStepCard, consumes locked_asset_ids), CommentList (owns
filtering; P18 selectors preserved), Summary rail tab (ProducerSummaryPanel +
TriageBoard with real data). `current_version_only` now real (filters
switcher + compare). The agent deleted its interim local helpers and moved
everything to the canonical lib/versions/versions — no duplicated logic.
Honest limits: `onLock` unwired (nothing writes lock entries — not faked);
compare pins/drawings stay on single view (labeled); two keyboard listeners
in compare (harmless, identical responses).

## Brand re-canonization (a573f12, 2026-07-25)

Bailey's three CVP Enterprise brand guides are the canon: Primary Blue
#156BFF, Deep Blue #0A1D3D, Cool Gray #E6E9EF, Charcoal #0D0F14, White,
Inter / Inter Display. Lime (#b9ff77) and tan/cream tints REMOVED across 24
files (tokens, globals, layout font loading, 66 fallback literals, annotation
stroke, 2 test assertions). Signature action color is now canon Primary Blue
(hover #0052CC from guide 3). ROADMAP_40 design direction updated to match.

Coordinator verification (wave 2, commits 453adf6 / 1188798 / a573f12):
typecheck 0 errors · `npm test` 922/922 · lint 0 errors (40 pre-existing
warnings) · p19a 1/1 + p19b 6/6 regression scripts re-run green (63 checks)
· canon visual pass on both surfaces (no lime, no tan, Inter throughout).

## P23 — Client dashboard (091fba7, 2026-07-25, Arc V wave 1)

New client-facing portal at `/portal` (own `(client)` route group + PortalShell
— deliberately NOT the internal shell). "What we need from you" derives real
pending approvals/feedback from demo state with click-through to review;
plain-language status maps all 9 internal stages onto Planning / Production /
Editing / Awaiting Feedback / Final Delivery (no internal names leak — browser
asserted); latest reviews with real share links; delivered assets with
real-file downloads ("Available on request" otherwise); `clientSafeActivity`
allowlist feed (18 internal event kinds proven excluded). Client identity is
derived (reviewer-email domain → organization), never fake-seeded.

## P25 — Project whiteboard (a45401c, 2026-07-25, Arc V wave 1)

Full-screen canvas at `projects/[id]/whiteboard`: pan (pointer capture) +
wheel zoom with cursor anchoring (pure geometry, tested). Hand-drawn phase
cards (Strategy → Delivery, dashed token borders, deterministic tilt, current
= canon blue + "You are here") derived from the project's real stage. Draggable
grid-snapped stickies (persisted), Brand film / Social campaign templates with
undo, elbow connectors with arrowheads, arrow-key navigation. Two real bugs
caught by its own regressions and fixed (pointer-capture swallowing clicks,
TDZ seed crash). Board overlays the shell notice by design on this surface.

## P26 — Asset library (8df8cc1, 2026-07-25, Arc V wave 1)

`/library` rebuilt: tokenizer + faceted query engine (campaign/platform/
format/orientation/rights/date/fav, AND semantics, unknown keys degrade to
text), rich cards with ffprobe-truthful metadata + rights badges, real
hover-scrub (clamped pointer→time, never plays), 9-format download matrix with
honest availability (only real-file rows downloadable), curated packages with
SHA-256 manifests (re-verified against disk on every test run), persisted
favorites, request-a-cutdown (validated, recorded, "local preview" labeled).
Notable git hygiene: the agent split its workspace-store commit around the
concurrent whiteboard lane via hash-object/update-index — zero cross-lane
bleed, no forbidden git ops.

Coordinator verification (Arc V wave 1): typecheck 0 errors · `npm test`
1003/1003 (922 + 81) · lint clean (chain exit 0) · agents' regression suites
green (p23 5/5, p25 4/4, p26 6/6 — 15 scripts).

## P24 — Project workspace tabs (c34f964, 2026-07-25)

Evidence state: `SOURCE_COMMITTED`; current class: `DEMONSTRATION`.

Brief/version, milestones, deliverables, team, files, communications, and
calendar panels are mounted through `ProjectWorkspaceTabs`, with pure project
date/guardrail/model helpers and source tests. Current evidence is
source-level; real database persistence and authenticated browser behavior
remain unproved, and the tabs mount only in the demo branch.

## P27 — Request center (6978b30, 2026-07-25)

Evidence state: `SOURCE_COMMITTED`; current class: `DEMONSTRATION`.

Portal request intake, client request history, internal request queue, typed
lifecycle logic, threaded updates, and work-order conversion are present in
the source tree and covered by request model/store/DOM tests. Navigation was
wired in follow-up commits `8be839b` and `095dddf`. The current implementation
uses the demo workspace store; production persistence, authenticated runtime,
and cross-tenant behavior have not been end-to-end proved. No request API
exists, browser-local mutations are not durable, and dispatch is simulated.

## P28 — Reporting (a7eaaab, 2026-07-25)

Evidence state: `SOURCE_COMMITTED`; current class: `DEMONSTRATION`.

Project recap, performance, deterministic rule-based insights, CSV export, and
print views are present under `/reports`, with reporting model and DOM tests.
The data is derived from the demo workspace store; it is not production
analytics proof. The production surface instead shows a connect-analytics
notice.

Current exact-SHA source verification for all committed phases is the
2026-07-26 harness at the top of this document. It does not upgrade any phase
to `REAL` without route, data, authority, and runtime evidence.
