# Co-ProVideo Stabilization Status

Updated: 2026-07-25
Machine: M2
Branch: `codex/co-videopro-definitive-20260715`

## Anti-Drift Contract

- Preserve the shared player-first review workspace.
- Keep one compact top bar, one dominant media stage, and one adjacent review rail.
- Do not deploy, push, alter DNS, or touch the public Content Co-op site from this loop.
- Treat missing auth, database, NAS, or provider configuration as an explicit unavailable state.

## Current State

The F1–F14 security stabilization is fully implemented, committed atomically
(ca9336b..c71eb04), and the source harness is green. Port 4103 runs `next start`
(post-cutover 2026-07-25) and the runtime verifier passes.

## Harness Evidence (current truth)

Command set: `git diff --check && npm run typecheck && npm run lint && npm test && npm run build`

- `git diff --check`: pass
- `npm run typecheck`: pass, 0 errors
- `npm run lint`: pass, 0 errors, 40 warnings (pre-existing)
- `npm test`: pass, 741/741 (post-P9; includes the live runtime status contract)
- `npm run build`: pass (one pre-existing Turbopack NFT trace warning, unchanged)
- Runtime on `:4103`: `next start` (production) since 2026-07-25 cutover; verifier PASS
  (re-verified after the P9 rebuild)

Do not cite the older 664/664, 696/696, or 722/722 runs as current truth.

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
| F10 | Production runtime on port 4103 | Implemented | Cutover done; verify-runtime.sh PASS |
| F11 | Fail-closed storage and retry UI | Implemented | Source tests pass; NAS proof blocked-on-env |
| F12 | Stable auth session JSON | Implemented | Source tests + runtime matrix PASS |
| F13 | Error and response hygiene | Implemented | Source tests + runtime matrix PASS |
| F14 | Contract documentation | Implemented | This update |

## Blocked-on-env

The absence of Supabase configuration and `NAS_MEDIA_ROOT` in the M2 shell
blocks all authenticated and NAS-backed runtime proof. Details and the exact
commands that would prove the blocked items are in `BLOCKERS.md`.

## Required Harness

- `npm run build`
- `npm run lint`
- `npx tsc --noEmit`
- `npm test`
- `scripts/verify-runtime.sh`
- Browser proof for upload, reload, playback, login, and protected-route behavior

## Runtime proof — 2026-07-25 (post-cutover)

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
