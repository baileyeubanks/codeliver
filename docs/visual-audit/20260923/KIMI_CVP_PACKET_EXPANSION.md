# KIMI × CVP — Visual-swarm packet expansion (2026-09-23)

**Seat:** Kimi K3 visual-swarm analyst, Co-VideoPro (codeliver).
**Order (Bailey):** burn Kimi credits on useful audit→fix packets. This file is
analysis/spec volume only — no UI implementation lands here.
**Model note:** produced on Kimi; every current-state claim below was read from
source in this repo and is cited `file:symbol`. Anything that could only come
from the running stage host is marked **[stage-verify]**.

---

## 0. Locks in force (read first, do not cross)

| Seat | Source of truth | Governs |
|---|---|---|
| LOGIN | ACS quiet — [admin.astrocleanings.com/login](https://admin.astrocleanings.com/login) | Centered mark, one card, one primary path. No header, chips, crumbs, or promo rail. |
| PLAYER | [wistia.com/product/player](https://wistia.com/product/player) | The stage. Big picture, quiet chrome, controls recede while playing. |
| REVIEW | Wipster review workflow | Tap-frame comments, Share Review / Approve / Preview, version control on the stage, guest film+comments. |
| BRAND | Blue brand only | Sapphire `#0057ff` is the only brand color. Green/amber/red are semantic status only — "never phase identity" (`app/brand-tokens.css:38`). |

Lock sources, in repo / PR context:

- `docs/briefs/FRAME_CVP_SOT_SPLIT_LOCKED_20260923.md`,
  `FRAME_CVP_LOGIN_ACS_SOT_20260923.md` (grade A1–A8),
  `FRAME_CVP_PLAYER_WISTIA_01.md`, `CVP-PLAYER-REEL-IMPLEMENT.md` (R1–R7 /
  K1–K6 / C1–C7), `WISTIA_DOMAIN_LEARNINGS_20260923.md` — all on branch
  `cursor/frame-wistia-briefs-ec8e` (PR #14). **Not yet on `main`** — fetch
  that branch to read them.
- PR #21 / PR #22 (drafts): ACS-quiet login cuts, live-door before shots.
- PR #16 (merged): quiet Wistia login column; `next.config` compression off.
- `design-qa.md` — accepted point-annotation, public-review, and auth-shell
  checkpoints with the Wipster comparison captures.
- `docs/review-surface-stabilization.md` — the standing product rule: one
  compact top bar, one dominant media stage, one adjacent review rail; no
  explainer panels above the player.
- `00_REPO_CONTEXT.md` — canonical routes: public review `/review/[token]`,
  internal review `/projects/[id]/assets/[assetId]` (redirects into the
  cockpit at `/projects/[id]?asset=…&view=review`).

## 0.1 VA ID map (assumed keying)

The swarm ledger lists eight Wipster review topics against six IDs
VA-020…VA-025. Keying used here — re-key in place if the ledger differs:

| ID | Topic(s) | Priority |
|---|---|---|
| VA-010 | P0 soft-fail on the stage | **P0** — before any chrome work (Wistia: playback before paint) |
| VA-020 | Tap-frame comments | P1 |
| VA-021 | Share Review / Approve / Preview action trio | P1 |
| VA-022 | Copilot off the stage | P1 |
| VA-023 | Version control on the stage | P2 |
| VA-024 | Status-only green + no top blue stripe | P1 (color discipline, both locks) |
| VA-025 | Download ladder + guest review film+comments | P2 |

Landing constraint carried from the frame briefs: implementation of these
packets lands on M2 Content-Co-op-9. This PR carries the packets only.

---

## VA-010 — P0: the stage soft-fails instead of failing honest

**Surface URL pattern**

- Public guest stage: `/review/[token]` → `app/review/[token]/page.tsx` →
  `components/review/PublicReviewPage.tsx` →
  `components/review/ReviewMediaSurface.tsx`.
- Internal stage: `/projects/[id]/assets/[assetId]` →
  `app/(review)/projects/[id]/assets/[assetId]/page.tsx` → redirect shim
  `components/review/InternalAssetReviewPage.tsx` → cockpit
  `/projects/[id]?asset=…&view=review` (`components/projects/ProjectCockpit.tsx`).

**SoT rule**

Wistia player lock (`FRAME_CVP_PLAYER_WISTIA_01.md`, kill list): *"If the
frame cannot play, fix playback before this chrome. The 'Playback unavailable'
/ 'Retry playback' state stays an error, not a chip."* And learnings #5:
playback before paint — never restyle or re-message a dead frame. The stage is
the primary object on both review routes (`review-surface-stabilization.md`);
a stage that quietly misreports itself is a P0, ahead of every chrome packet.

**Current state — three verified soft-fail modes**

1. **Wrong-state copy for a missing video source.**
   `ReviewMediaSurface.tsx:76` gates the honest error on
   `playbackFailed = assetType === "video" && failedSource === assetUrl`.
   But when a video asset has **no URL at all** (`assetUrl === null` — media
   still processing, derivative not ready, unsigned/expired URL), the
   component falls through every branch to the generic
   `Preview not available — "This file type does not have an in-browser review
   surface yet."` (`ReviewMediaSurface.tsx:170-179`, `Layers3` icon). A video
   with a missing source is told its *file type* is unsupported. The reviewer
   is misinformed at the exact moment trust matters. Reachable from
   `PublicReviewPage.tsx:1759-1763` where `assetUrl` resolves to
   `activeVersion?.file_url ?? asset?.file_url ?? null`.
2. **Gesture-initiated play failures are swallowed.**
   `VideoPlayer.tsx:60-66` `playWithMutedFallback` retries muted, then only
   `setPlaying(false)`. `PlayerControls.tsx:90-101` `handleTogglePlayback`
   ends in `catch(() => undefined)`. The honest path
   (`VideoPlayer.tsx:68-85` `reportPlaybackFailure` → `onPlaybackError`)
   fires only on the media `error` event or HLS `data.fatal`
   (`VideoPlayer.tsx:109-111`). A source that rejects `play()` without an
   `error` event (and non-fatal HLS network stalls) leaves a black well that
   simply never plays — no state, no retry, no message.
3. **Internal stage failure renders as a chip-line.**
   `ProjectCockpit.tsx` renders `{playbackError}` as an inline
   `<p role="alert">` with an inline `Retry playback` button directly under
   the frame (stage block ~`ProjectCockpit.tsx:2658-2662`) — a caption-height
   line, not the locked stage error. The same failure on the public route gets
   the full `review-video-frame` error treatment. One failure, two voices.

**Before → after acceptance**

| # | Before (today) | After (pass when) |
|---|---|---|
| B1 | Video asset, `assetUrl === null` → "This file type does not have an in-browser review surface yet." | A video with no playable source gets its own state: "This cut isn't playable yet" (processing/missing), with Retry and the existing `fallbackAction` download when the link allows. The unsupported-*type* copy only ever renders for genuinely unsupported types. |
| B2 | Dead source + user presses play → nothing visible happens. | A rejected-then-failed play gesture escalates to the same `onPlaybackError` path as a media `error` event; non-fatal HLS stall > N seconds surfaces the same state. |
| B3 | Internal stage failure = one text line under the frame. | Internal and public stages share one stage-error component (same copy, same Retry, same download fallback), rendered *in* the frame well, `role="alert"`. |
| B4 | Error state could be restyled as a chip during chrome work. | The state stays an undecorated error per the Wistia kill line — regression-pinned so the Wistia chrome pass (R1–R7) cannot land on a dead frame (C6). |

**Exact files / symbols to touch**

- [ ] `components/review/ReviewMediaSurface.tsx` — split the fallthrough:
      add an explicit `assetType === "video" && !assetUrl` branch (and the
      symmetric `image && !assetUrl` branch) *before* the generic
      not-supported state; keep `playbackFailed` branch as-is.
- [ ] `components/player/VideoPlayer.tsx` — `playWithMutedFallback`: route the
      final rejection to `onPlaybackError`; inside the HLS error handler,
      escalate repeated non-fatal `networkError` (e.g. ≥3 consecutive or a
      stall timer) to `reportPlaybackFailure`.
- [ ] `components/player/PlayerControls.tsx` — `handleTogglePlayback`: replace
      the terminal `catch(() => undefined)` with a failure callback prop (or
      reuse `onPlaybackError` via the surface) instead of swallowing.
- [ ] `components/projects/ProjectCockpit.tsx` — replace the inline
      `{playbackError}` line with the shared stage-error component used by
      `ReviewMediaSurface` (extract it; do not fork copy).
- [ ] `components/review/PublicReviewPage.tsx` — no logic change expected;
      confirm `fallbackAction` still threads into the new missing-source
      branch.
- [ ] Tests: extend `tests/frame-review.test.ts`-adjacent coverage with a
      pure state-classifier (`lib/review/playback-state.ts`, proposed:
      `classifyStageState({ assetType, assetUrl, failed })`) so the branch
      logic is node-testable without a browser.

**Proposed diff notes**

- New tiny module `lib/review/playback-state.ts` exporting
  `classifyStageState()` → `"playable" | "missing-source" | "unsupported-type"
  | "playback-failed"`. `ReviewMediaSurface` becomes a switch over it. This
  keeps the P0 honest-state logic out of JSX ternaries and unit-testable.
- `VideoPlayer` gains `onPlaybackStall?` — do **not** add UI for it in this
  packet; the surface decides.
- Copy keys stay literal strings (this repo has no i18n layer); match the
  existing sentence style ("Playback unavailable", "Retry playback").

**OUT of scope**

- The Wistia chrome reskin itself (R1–R7 / K1–K6) — that is
  `CVP-PLAYER-REEL-IMPLEMENT`, and it must not start until VA-010 lands
  (order-of-work rule 1: confirm the video plays first).
- HLS rendition/ABR policy, CDN, signed-URL minting, derivative pipeline
  readiness (`lib/tus/*`, `app/api/storage/readiness/route.ts`).
- Any retry/backoff against the media *catalog* APIs.

---

## VA-020 — Tap-frame comments (Wipster one-tap)

**Surface URL pattern**

Both review stages: public `/review/[token]` (video and image assets) and
internal cockpit stage `/projects/[id]?asset=…&view=review`.

**SoT rule**

Wipster point-comment reference (accepted in `design-qa.md` Point Annotation
Checkpoint): one spatial point, one compact dark composer, one explicit
submit. The tap *is* the gesture — pause on the tapped frame, pin at the tap,
composer focused, timestamp captured at tap time (not at submit). Letterbox
taps are ignored; the composer flips at edges and never leaves the media
rectangle; below 900px the composer takes a stable 12px bottom inset.

**Current state (verified)**

- Public **video**: one-tap already works.
  `ReviewMediaSurface.tsx:113` passes `onFrameClick` whenever
  `annotationEnabled` (`PublicReviewPage.tsx:1771` =
  `canComment && asset?.file_type === "video"`); the overlay
  (`VideoPlayer.tsx:371-376`) intercepts the click,
  `handleOverlayClick` (`VideoPlayer.tsx:227-249`) rejects letterbox taps via
  `projectPointIntoMedia` (`lib/review/player-policy.ts`), pauses, and reports
  `(x, y, currentTime)`; `PublicReviewPage.handleFramePin:1099` sets
  `commentPin`; the anchored `InlineReviewComment` opens
  (`PublicReviewPage.tsx:1478+`). Click-to-play on the video element is
  intentionally displaced by pin capture on this surface.
- Public **image**: two-step, fails one-tap. `handleImagePin`
  (`PublicReviewPage.tsx:1146`) returns unless `pinMode` is armed from the
  composer first; the cursor only goes crosshair when armed
  (`ReviewMediaSurface.tsx:153-156`).
- Pin-mode pill: when armed, a "Click the frame to place your pin." pill
  floats over the stage (`PublicReviewPage.tsx:1430-1436`). On video, where
  every tap already pins, the pill describes the default behavior — noise on
  the stage.
- Internal cockpit: one-tap verified —
  `ProjectCockpit.handleReviewFrameClick:1721` pauses, reads the media clock
  at click time, sets `pendingPin`; `InlineReviewComment` opens anchored
  (`ProjectCockpit.tsx:2725-2746`). Metadata-not-ready taps get a toast.
- Server contract (keep): coordinates 0–100, finite, paired, bound to the
  invite's exact version (`lib/review/submit-review-comment.ts`;
  `00_REPO_CONTEXT.md` projection rules).

**Before → after acceptance**

| # | Before | After (pass when) |
|---|---|---|
| B1 | Image review: tap does nothing unless pin mode was armed. | One tap on the image pauses nothing (static) but drops the pin and opens the composer focused. Pin mode becomes an *option* (drag-to-draw / multi-pin), not a gate. |
| B2 | "Click the frame to place your pin." pill appears on the video stage. | Pill renders only while an explicit multi-pin mode is armed; default video stage shows no instructional chrome. |
| B3 | Behavior differs per surface without a stated rule. | One tap contract documented and identical on both stages: tap → pin → focused composer → submit → focus returns to the player; playback resumes only if it was playing (cockpit already tracks `resumeAfterComment`; match it on public). |
| B4 | — (guard) | Letterbox rejection, edge flip, 900px inset, and the 0–100 server contract keep passing — re-run the accepted point-annotation checks from `design-qa.md`. |

**Exact files / symbols to touch**

- [ ] `components/review/PublicReviewPage.tsx` — `handleImagePin`: drop the
      `!pinMode` early-return; `togglePinMode`: retarget to explicit multi-pin
      arming; remove the default pill (`pinMode` JSX at ~1430) or re-key it to
      the new armed state.
- [ ] `components/review/ReviewMediaSurface.tsx` — image branch: crosshair
      cursor whenever `onImagePin` is provided (not only in `pinMode`).
- [ ] `components/review/PublicReviewComposer.tsx` — pin toggle copy: from
      "place a pin" affordance to "pin mode" (multi) semantics.
- [ ] `components/review/InlineReviewComment.tsx` — no visual change; verify
      focus-on-open and edge-flip still hold when opened from an image tap.
- [ ] `components/player/VideoPlayer.tsx` — untouched (contract already
      correct); regression-guard `handleOverlayClick` letterbox path.
- [ ] Tests: `tests/frame-review.test.ts` (pure geometry already covered) +
      a DOM-level note that image taps no longer require arming (Playwright
      regression per the P6–P22 convention, evidence under
      `docs/design-evidence/`).

**Proposed diff notes**

- Smallest honest cut: delete the `!pinMode` guard in `handleImagePin` and the
  pill; keep `pinMode` state only if multi-pin/draw flows still reference it —
  otherwise remove the state entirely rather than leaving a dead toggle.
- Do not add a mode switch to the video path "for symmetry"; the video path is
  the reference behavior.

**OUT of scope**

- Draw/annotate (`AnnotationCanvas`, `AnnotationToolbar`, stroke replay) —
  working craft, untouched.
- Comment threading/resolve/filter UI (`components/comments/*`).
- Server pin-migration or re-interpretation of legacy pins (explicitly frozen
  in `00_REPO_CONTEXT.md`).

---

## VA-021 — Share Review / Approve / Preview (the Wipster action trio)

**Surface URL pattern**

Internal stage header: `/projects/[id]?asset=…&view=review` (cockpit review
mode). The trio's effects land on the public door `/review/[token]`.

**SoT rule**

Wipster's asset view keeps three actions at the top of the review: **Share
review** (make/send the guest link), **Preview** (see exactly what the guest
sees), **Approve** (the decider's action on the current cut). They are actions
on *this cut*, visible from the stage — not buried in a dock tab, not
admin-page furniture. Hierarchy guard from `review-surface-stabilization.md`:
these three belong to the review; link *administration* (lists, revocation,
expiry management) stays in modal/secondary UI.

**Current state (verified)**

- Share exists but partial: `ProjectCockpit.tsx:584` `shareOpen`,
  `contextualShareAllowed` (:766, suppressed on version-scoped reviews),
  mobile strip Share (:2944-2949), modals `DemoShareModal` / `ShareModal`
  (:3441-3460). `ShareModal` already carries the four intents
  (`lib/sharing/share-intent.ts`: internal_review / client_review /
  approval_needed / final_delivery) and the download toggle.
- Approve is not a stage action: internal approval lives in the dock
  (`approveDemoStage` demo buttons :3111/:3304, "Advance stage" lifecycle
  :3010+); the real decision UI (`ApprovalPanel`) and `FinishReviewBar`
  ("Approve & finish", `FinishReviewBar.tsx:101`) exist only on the *public*
  route. An internal decider on the stage has no Approve.
- Preview does not exist: nothing on the internal stage opens
  `/review/[token]` as the guest sees it. `ShareModal` mints links
  (demo: `/review/demo?demo=1&intent=…`, :377) but offers no "open as guest".
- `components/projects/ProjectToolbar.tsx` carries none of the three
  (verified: no Share/Approve/Preview symbols).

**Before → after acceptance**

| # | Before | After (pass when) |
|---|---|---|
| B1 | Share is a header/dock button; Approve and Preview absent from the stage. | Stage header (desktop) and mobile strip carry exactly three quiet actions: Share review, Preview, Approve. Approve renders only when the viewer has decision rights on the current version; Preview opens the live guest URL in a new tab. |
| B2 | No way to see the guest door without sending the link. | Preview uses the most recent active link for the current version (or the intent default when none exists) and lands on `/review/[token]` — the *real* gate (password/expiry included), not a mock. |
| B3 | Approve requires the public route even for internal deciders. | Approve opens the same decision contract as `ApprovalPanel`/`FinishReviewBar` (approve / changes / note), bound to the current version id; on success the stage status chip and dock progress update without reload. |
| B4 | — (guard) | Version-scoped (historical) reviews keep the existing suppression: no Share, no Approve on an old cut; Preview still allowed for that cut's bound link. Link admin stays in `ShareModal`/dock. |

**Exact files / symbols to touch**

- [ ] `components/projects/ProjectCockpit.tsx` — stage header action cluster
      (desktop, near the existing share affordance) and
      `cockpit-mobile-review-strip` (:2933-2950): add Preview + Approve;
      wire `shareOpen` unchanged; gate Approve on
      `!versionScopedReview && approvalWorkflowReady` (:909) and role
      (`roleCan(workspaceRole, …)` pattern at :865).
- [ ] `components/sharing/ShareModal.tsx` — add a secondary "Open guest
      preview" affordance on success/existing-link state (reuses the minted
      URL; no new backend).
- [ ] New thin client for the internal decision: reuse
      `components/review/ApprovalPanel` inside a dialog shell, or extract its
      decision form — do not fork the decision copy.
- [ ] `lib/sharing/share-intent.ts` — read-only here; intent defaults already
      correct.
- [ ] API: internal approve posts to the existing approval route used by
      `loadLiveApprovalWorkflow`/`handleLifecycleOpenChange` neighbors
      (`ProjectCockpit.tsx:1311`, :1982); no new endpoint in this packet.
- [ ] Tests: extend `tests/demo-share-approval-round.test.ts` and
      `tests/approval-version-binding.test.ts` patterns; Playwright:
      trio visible at 1440 and 390, suppression on historical cuts.

**Proposed diff notes**

- Keep the trio text-light: icons + one-word labels, `44px` targets on coarse
  pointers (globals.css touch rule). No filled blue trio — sapphire is for the
  one primary action per the brand lock; Share is primary, Preview ghost,
  Approve outline-until-decidable.
- Preview URL resolution order: active link bound to current version → most
  recent active link → disabled with tooltip "Share this cut first".

**OUT of scope**

- Approval authority remodel (reviewer-email → approval-step binding) — a
  known risk in `00_REPO_CONTEXT.md`, separate workstream.
- Batch share, expiry/revocation admin, watermark config (P22 surface).
- Notification/email send pipeline for share links.

---

## VA-022 — Copilot off the stage

**Surface URL pattern**

Internal stage: `/projects/[id]?asset=…&view=review`. (Public `/review/*` is
already excluded.)

**SoT rule**

Wipster review discipline: the stage is for watching and deciding. An
assistant dock is cockpit furniture; it must not ride the review stage, steal
the rail's width, or overlap the media on small screens. Login/ACS and
public-review exclusions already exist — this packet closes the internal
hole.

**Current state (verified)**

- `app/layout.tsx:30` mounts `CopilotMount` globally.
- `components/copilot/CopilotMount.tsx` gates on **pathname only**:
  `EXCLUDED_PATHS` = `/login`, `/signup`; `EXCLUDED_PREFIXES` = `/review`;
  non-demo allowed only under `/projects`. The review stage is a *query* state
  (`?view=review`, set by `buildCanonicalInternalReviewHref`,
  `InternalAssetReviewPage.tsx:44-53`; read at `ProjectCockpit.tsx:542`
  `reviewViewRequested`), so the Copilot panel mounts on the stage today.
- Precedent for absence-regressions: P14 d28 ("absence on login/signup/
  review", `STATUS.md` P14).

**Before → after acceptance**

| # | Before | After (pass when) |
|---|---|---|
| B1 | Copilot dock visible on `/projects/[id]?asset=…&view=review`. | No Copilot markup in the DOM on the review stage (not a CSS hide — unmounted), desktop and 390px. |
| B2 | — | Copilot still mounts on `/projects`, `/projects/[id]` default view, and other allowed paths; existing panel behavior unchanged. |
| B3 | — | Direct load, client nav into review mode, and back-nav out all respect the gate (query changes re-evaluate without reload). |

**Exact files / symbols to touch**

- [ ] `components/copilot/CopilotMount.tsx` — extend `copilotAllowedOnPath`
      to accept the search string (`copilotAllowedOnPath(pathname, search)`)
      and deny when `view=review`; in `CopilotMount`, read
      `useSearchParams()`.
- [ ] `app/layout.tsx` — wrap the `<CopilotMount />` in a `<Suspense>`
      boundary (required once `useSearchParams` is used at the root).
- [ ] `tests/copilot-client.test.ts` — add path+query matrix rows
      (`/projects/p1?view=review` → false; `/projects/p1` → true;
      `/review/t` stays false).
- [ ] Playwright absence regression in the P14 d28 style; evidence under
      `docs/design-evidence/`.

**Proposed diff notes**

- Keep the pure function signature synchronous and exported for node tests;
  the hook work stays inside the component.
- Alternative considered and rejected: hiding via CSS in
  `ProjectCockpit.module.css` — leaves the panel mounted, focusable, and in
  the a11y tree.

**OUT of scope**

- Copilot panel content, model routing, `copilot-logic.ts` behavior.
- Any Copilot presence on the *public* review door (already excluded — keep).

---

## VA-023 — Version control on the stage

**Surface URL pattern**

Public `/review/[token]` stage bar; internal cockpit stage
(`/projects/[id]?asset=…&view=review`, incl. `&version=` historical cuts).

**SoT rule**

Wipster: versions are a compact control *on the stage*, defaulting to the
current cut; an older cut is unmistakably labeled; notes and approvals stay
bound to the cut they were made on. Wistia chrome lock still applies — the
version UI sits above the frame well, never inside the player chrome, and
carries no marketing words.

**Current state (verified)**

- Public: black bar above the frame holds `VersionSwitcher` chips,
  an amber "Viewing an older version…" note, and a "Compare A/B" toggle
  (`PublicReviewPage.tsx:1700-1736`). `VersionSwitcher.tsx` handles
  newest-first ordering, `current_version_only` links, and the pinned
  "Shared cut" label; `VersionCompare.tsx` runs linked A/B playback.
  Authority: `lib/versions/versions.ts` (`sortVersions`, `currentVersion`,
  `versionBadgeLabel`); approvals are version-bound
  (`tests/approval-version-binding.test.ts`).
- Active chip paints `bg-[var(--accent)] text-[#18223e]`
  (`VersionSwitcher.tsx:66`) — a filled sapphire pill on the stage bar.
- Internal: historical cuts enter via `?version=`;
  `versionScopedReview` (`ProjectCockpit.tsx:755`) flips the dock to
  "Review context" with honest copy (:2982-2988) and suppresses
  share/approval on old cuts. Version *switching* UI on the internal stage is
  thinner than public — the dock carries counts, not a switcher.

**Before → after acceptance**

| # | Before | After (pass when) |
|---|---|---|
| B1 | Active version = filled sapphire pill on the black bar. | Quiet selected state (hairline accent border, white label); sapphire fill is reserved for the one primary action per surface (brand lock). Contrast ≥ AA on the black bar. |
| B2 | Internal stage has no cut switcher; changing cuts means editing the URL or re-entering. | The same `VersionSwitcher` (or its headless core) is available on the internal stage bar, driving `?version=` navigation through `buildCanonicalInternalReviewHref`. |
| B3 | "Viewing an older version" is amber text mid-bar. | Older-cut banner is one compact, non-amber-decoration notice pinned to the stage corner or bar start, with a "Back to current (Vn)" action. |
| B4 | — (guard) | `current_version_only` and pinned shared-cut behavior unchanged; A/B compare still linked-playback with pins/drawings disabled; notes/approvals remain version-bound (tests stay green). |

**Exact files / symbols to touch**

- [ ] `components/review/VersionSwitcher.tsx` — restyle active chip; export
      the ordering/label helpers if the cockpit needs them headless.
- [ ] `components/review/PublicReviewPage.tsx` — move/compact the
      older-version notice (:1713-1718); keep `handleCompareToggle` and the
      compare gating (:1720-1732) intact.
- [ ] `components/projects/ProjectCockpit.tsx` — mount the switcher on the
      stage bar in review mode; route selection through
      `buildCanonicalInternalReviewHref` (`InternalAssetReviewPage.tsx:44`)
      with the existing `versionScopedReview` suppression rules.
- [ ] `lib/versions/versions.ts` — read-only; authority stays here.
- [ ] Tests: `tests/demo-media-version-authority.test.ts`,
      `tests/cockpit-review-version-threading.test.ts` patterns; Playwright
      switcher at 1440/390 on both stages.

**Proposed diff notes**

- Do not duplicate chip styles — the public bar and cockpit bar should share
  one class hook (e.g. move chip classes into a small CSS module imported by
  both) rather than copy-pasting Tailwind strings.
- Keep "Shared cut" pinning text exactly as-is; it is a contract surfaced to
  guests.

**OUT of scope**

- Version upload/retirement mechanics (`lib/versions/retirement.ts`,
  revision-upload flow in `ProjectWorkspaceClient.tsx`).
- Compare rendering internals (`VersionCompare.tsx` sync logic).
- Storage/derivative provenance of older cuts.

---

## VA-024 — Status-only green, no top blue stripe (color discipline)

**Surface URL pattern**

All review chrome: public `/review/[token]` header + rail; internal cockpit
header and review dock; by inheritance every surface using
`.client-review-status-badge`, `.cockpit-header`, `.workspace-header`.

**SoT rule**

Two locks bind at once:

1. **Blue brand only** — sapphire `#0057ff` is the sole brand color; status
   hues are semantic-only (`app/brand-tokens.css:38`: "Status — semantic only
   (health), never phase identity"; :56-58: accent/ribbon is "never large UI
   chrome fills").
2. **Status-only green** — green appears *only* when it reports a true
   approved/locked state. A green chip that also means "in review" teaches
   guests to ignore green.

**Current state (verified)**

- `.client-review-status-badge` is hard-coded green for **every** state —
  border `rgba(38,145,91,.24)`, bg `rgba(38,145,91,.09)`, ink `#1f7a4c`
  (`app/globals.css:2207-2212`). It renders `reviewState.label`
  (`PublicReviewPage.tsx:1553-1555`, from `deriveReviewState` :865), so
  "In review", "Needs changes", etc. all wear approval green. Duplicated in
  the module CSS (`PublicReviewWorkspace.module.css:265`).
- The top blue stripe exists and is in-repo: a 3px solid-sapphire `::before`
  hairline on `.cockpit-header` (`app/globals.css:3150-3157`) and
  `.workspace-header` (`app/globals.css:4727-4734`), painted from
  `--cvp-gradient-ribbon` (now `var(--cvp-blue)`,
  `app/brand-tokens.css:58`). The comments still say "multicolor
  gradient-ribbon" — stale. The public review header
  (`PublicReviewWorkspace.module.css:129-132`) has **no** stripe (correct —
  keep it).
- Note: the only other 2px accent border on the review shell is the
  focus-only skip link (`PublicReviewWorkspace.module.css:62-82`) — not a
  stripe; leave it.

**Before → after acceptance**

| # | Before | After (pass when) |
|---|---|---|
| B1 | Every review state chip is green. | Chip tone maps from state: green only for approved/locked-final; neutral (border + muted ink) for in-review/open; amber for needs-changes; red reserved for failed/blocked. Mapping is data-driven from `deriveReviewState`, not string-sniffed CSS. |
| B2 | 3px sapphire hairline caps the cockpit and workspace headers. | No top stripe on any review or workspace header; `--cvp-gradient-ribbon` loses its `::before` consumers (keep or retire the token per token-file guidance). Stale "multicolor" comments corrected. |
| B3 | — (guard) | Sapphire still appears as the action color (primary buttons, links, played scrub, focus rings); green/amber/red appear nowhere else decorative. Public review header remains stripe-free. |

**Exact files / symbols to touch**

- [ ] `app/globals.css` — `.client-review-status-badge` (:2207): split into a
      base + tone modifiers (e.g. `[data-tone="approved|open|changes|blocked"]`);
      delete `.cockpit-header::before` (:3150-3157) and
      `.workspace-header::before` (:4727-4734).
- [ ] `components/review/PublicReviewWorkspace.module.css` — mirror the badge
      tone split (:265 block).
- [ ] `components/review/PublicReviewPage.tsx` — emit `data-tone` from
      `reviewState`/`delivery.locked` at :1553-1555.
- [ ] `lib/review/*` — extend `deriveReviewState` (or add
      `reviewStateTone(state)`) so tone is computed once and unit-tested.
- [ ] `app/brand-tokens.css` — update the `--cvp-gradient-ribbon` comment or
      retire the token; do not leave a token whose only consumers were
      deleted.
- [ ] Cockpit status line (`ProjectCockpit.tsx:2991`
      `.cockpit-review-status`) — verify it inherits the same tone rule.
- [ ] Tests: node test for the tone mapping; visual regression shots of the
      header/badge states (demo review, approval-needed, final delivery).

**Proposed diff notes**

- Smallest cut: `data-tone` attribute + CSS attribute selectors — no class
  soup, no JS color logic.
- Sweep for other hard-coded status greens before closing:
  `git grep -n "38, 145, 91\|#1f7a4c\|--cvp-green" app components` — each hit
  must be semantic status or it joins this packet.

**OUT of scope**

- The ACS login door (separate lock, separate briefs/PRs #21/#22) — no login
  edits here.
- Dark-stage media contrast choices (the dark player well stays).
- Any re-introduction of a phase-color ribbon, anywhere ("There is no
  rainbow" — `app/brand-tokens.css:47-48`).

---

## VA-025 — Download ladder + guest review (film + comments)

**Surface URL pattern**

Guest door: `/review/[token]` (all four intents; `final_delivery` is the
download-first intent). Internal sponsor side: cockpit Share modal.

**SoT rule**

Wipster guest contract: a guest opens the link and immediately gets **the
film and its comments** — no account, no maze. When downloads are allowed,
the download is a **ladder** (original + available renditions), presented at
the stage on delivery links — not a single raw-file link buried inside a
"Review details" disclosure. Permission gating stays server-side
(`download_enabled` per link).

**Current state (verified)**

- Guest film+comments fundamentally works: opaque-token route
  (`app/review/[token]/page.tsx`, `noindex`/`no-referrer`), demo-only
  `ShareLinkAccessGate` (`PublicReviewPage.tsx:2003-2011`), password gate
  component exists (`components/sharing/SharePasswordGate.tsx`), comments +
  approval render by permission (`canComment` :749, `ApprovalPanel` :1855),
  guest name captured inline (`PublicReviewComposer.tsx`).
- Download today = one link: `invite?.download_enabled && downloadUrl` inside
  the collapsed "Review details" `<details>` (`PublicReviewPage.tsx:1602-1611`)
  plus the stage-error `fallbackAction` "Download file" (:1821-1831).
  `downloadUrl` is the raw `file_url` (:574-575, :634). No rendition ladder;
  derivatives exist only as pipeline readiness
  (`lib/tus/session.ts` `UploadDerivativeReadiness`,
  `app/api/storage/readiness/route.ts`) with no guest-facing projection.
- `final_delivery` intent already removes feedback UI and exposes download
  (accepted in `design-qa.md` Public Review Checkpoint).

**Before → after acceptance**

| # | Before | After (pass when) |
|---|---|---|
| B1 | Download is one raw link inside a collapsed disclosure. | When `download_enabled`, a quiet Download control sits on the stage bar (next to versions), opening a ladder: Original (exact bytes, size labeled) + any ready renditions (label, resolution, size). Ladder entries come from a server projection — never synthesized client-side. |
| B2 | Renditions have no guest surface. | Links with no ready renditions show Original only; links with downloads off show nothing (no disabled teaser). `final_delivery` links default the ladder open-adjacent (visible without expanding Review details). |
| B3 | Guest identity/comment flow works but is unverified as one journey. | One Playwright journey passes end-to-end on the demo door: open link → film plays → tap-frame comment as named guest → reply → (approval intent) decide → (delivery intent) download ladder. Evidence under `docs/design-evidence/`. |
| B4 | — (guard) | Password/expiry/max-view gates still fail closed before any media or ladder renders; no-store JSON error contract (`lib/api/responses.ts`) unchanged. |

**Exact files / symbols to touch**

- [ ] `components/review/PublicReviewPage.tsx` — lift download out of the
      Review-details disclosure (:1602-1611) into a stage-bar
      `DownloadMenu`; keep `fallbackAction` for error states.
- [ ] New `components/review/DownloadMenu.tsx` (proposed) — props:
      `{ items: Array<{ label, url, bytes?, resolution? }> }`; renders nothing
      when empty.
- [ ] API: extend the review payload (`app/api/review/[token]/` +
      `lib/review/responses.ts` / external-safe projection) with a
      `downloads[]` projection gated by `download_enabled`; original only
      until derivative renditions are queryable.
- [ ] `components/sharing/ShareModal.tsx` — no change to the toggle; confirm
      `download_enabled` copy mentions the ladder ("Guests can download the
      original and ready renditions").
- [ ] `lib/sharing/share-intent.ts` — `final_delivery` defaults stay
      download-on; read-only.
- [ ] Tests: projection unit tests (guest payload never leaks non-allowed
      URLs); Playwright guest journey above.

**Proposed diff notes**

- Server projection shape first, UI second; the UI must render correctly with
  a one-item ladder on day one.
- Label honesty: if bytes/resolution are unknown, omit the label — do not
  estimate.

**OUT of scope**

- Derivative/transcode *generation* (pipeline readiness is a separate,
  blocked workstream — `BLOCKERS.md`).
- Watermark rendering, review-report print view (`openReport`),
  batch-share admin.
- Authenticated internal download auditing.

---

## Harness & landing (all packets)

- Commands: `npm run typecheck` · `npm run lint` · `npm test` ·
  `npm run build`; Playwright evidence per the P6–P22 convention
  (before/after shots, 1440×900 and 390×844).
- Public runtime contract: `next start` on 4103 via
  `scripts/rebuild-public-runtime.sh` + `scripts/verify-runtime.sh` — never
  grade from `next dev` (`00_REPO_CONTEXT.md`).
- Docs-only PR: this file is the deliverable. Implementation lands on M2
  Content-Co-op-9 per the frame briefs; each packet above is sized to land as
  its own cut with its own evidence.
- Order note: VA-010 precedes the Wistia chrome pass
  (`CVP-PLAYER-REEL-IMPLEMENT` rule 1). VA-022/VA-024 are low-risk cuts that
  can land any time. VA-021/VA-025 touch share/approval surfaces — coordinate
  with the approval-authority risk list in `00_REPO_CONTEXT.md` before
  widening scope.
