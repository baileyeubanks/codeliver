# Lane 6 — Public Reviewer Surface `/review/[token]` (READ-ONLY audit)

Scope: the no-auth client review surface. App running at `http://localhost:4103`. All evidence is OBSERVED: screenshot paths under `audit/shots/`, file:line citations, or command output. No existing files were modified; no server writes (demo mode persists to browser localStorage only, key `co-videopro.workspace.v2`).

## 0. Token discovery

Seeded demo share links exist in `lib/demo/workspace-store.ts:412-449`:

- `demo-ceraweek-cuts` → `/review/demo?demo=1&asset=denie-mcdonald-v4&intent=client_review&share=demo-ceraweek-cuts` (permission `comment`)
- `demo-ica-final` → `/review/demo?demo=1&asset=ica-roadshow-final&intent=approval_needed&share=demo-ica-final` (permission `approve`, `require_name: true`)

Token resolution: `app/review/[token]/page.tsx:176` — `demoMode = token === "demo" || searchParams.get("demo") === "1"`; demo mode never hits the network (`page.tsx:205-374`), real tokens fetch `/api/review/[token]` (`page.tsx:377`). No UI-created share link was needed; seeded links were used as-is.

Invalid token: `/review/definitely-not-a-token` → branded dead-end "Review unavailable / Invalid or expired review link." (`audit/shots/review-invalid-1440-1440x900.png`). Clean, no stack leak, no redirect to login.

## 1. Identity check — Wipster-class? **YES, structurally**

The page is player-first: large 16:9 stage left/center, comments rail right, numbered on-frame pins, timecode chips on every comment, transport with frame indicator (`audit/shots/review-ceraweek-1440-1440x900.png`). A client opening this link would recognize the Wipster/Frame.io pattern immediately: watch → click a thread to jump the playhead → comment at timestamp → done. Header carries project breadcrumb, asset title, status, "Reviewing as **Client Reviewer**", view count, expiry. Layout is `ReviewWorkspace` (`components/review/PublicReviewWorkspace.tsx`) with stage + rail + composer.

Caveats that keep it from *feeling* fully client-grade: broken brand logo (§7), a Next.js dev-tools "N" badge floating over the player in these shots (dev-server artifact, not product), and demo-only affordances (cut-marker hint "Press Down to propose a version-bound cut at the playhead") that read as editor tooling, not client tooling.

## 2. Player behavior — real video, plays, scrubs

Probe `node audit/scripts/lane6-interact.mjs` output:

- `video.count: 1`, `video.src: /demo/ica-ceo-preview.mp4`, `readyState: 4`, `duration: 5.005`, `videoSize: 1920x1080` — a real 1080p clip loads and plays (`paused: false`, playhead advanced 1.473 after 1.5s).
- **Every seeded asset plays the same 5-second clip** (`lib/review/demoReview.ts:46-47` sets `file_url: /demo/ica-ceo-preview.mp4` unless a local media blob exists). "Denie McDonald_v4" shows CERAWeek footage of a different speaker than the poster suggests.
- Scrubbing: after `currentTime = 4`, transport reads `0:04 / 0:05` — accurate.
- Timecode overlay: `00:00:05:00 | F150` — frame-accurate SMPTE-style display at 30fps, consistent with 5.005s duration (`FrameIndicator`, `components/player/FrameIndicator.tsx`).
- Speed: menu offers rates; after selecting 2x, `playbackRate: 2` (`components/player/PlayerControls.tsx:242-255`). Shot: `audit/shots/lane6-speedmenu.png`.
- Fullscreen: button present, wired to `requestFullscreen()` (`PlayerControls.tsx:95-98`).
- Poster: `/demo/ceraweek-speaker.jpg` (`page.tsx:987`).

## 3. Comments — working, timecode-linked, no @mentions

- Threading UI: `CommentThread` renders root notes with nested replies (seeded "Content Co-op" reply visible indented under note 1, `review-ceraweek-1440-1440x900.png`). Filters Open/All/Resolved with counts (`page.tsx:1133-1142`).
- Timecode-linked: each note shows a `0:01`-style chip; selecting a thread seeks the player (`page.tsx:560-565`). Timeline strip under the player plots note/cut markers (`PlayerTimeline`).
- Adding a comment in demo **works**: filled composer → "Send comment" → note 4 "Audit note at the current playhead." appears in the thread list ("just now", timecode `0:04`) and in localStorage (`comments.containsAuditNote: 2`; `audit/shots/lane6-composer-after.png`). Reviewer-name field is prefilled "Client Reviewer" (placeholder: "How should this feedback be attributed?", `PublicReviewComposer.tsx:133`).
- **No @mention support on the public surface**: typing `@` produced zero suggestions; `components/comments/MentionSuggestions.tsx` has no importers anywhere in `app/` or `components/` (grep). `mentions: []` is hardcoded for demo comments (`page.tsx:310`).
- Clients **cannot reply or resolve**: `canReply={false} canResolve={false}` (`page.tsx:1155-1156`). One-directional feedback only.
- Frame pins: numbered pins render on the frame, shown within ±2s of the playhead (`page.tsx:784-791`); pin mode → click frame → inline composer "Add a precise note…" at the click point (`audit/shots/lane6-pin-placed.png`; `InlineReviewComment`).

## 4. Annotations — **none on this surface (pins only)**

`components/annotations/AnnotationCanvas.tsx` and `AnnotationToolbar.tsx` exist but are not imported by the review route or any component (grep: no importers outside their own directory). `ReviewMediaSurface`'s `annotationEnabled` flag only enables frame-click pinning (`ReviewMediaSurface.tsx:51`). No drawing, arrows, or shapes on frames — a gap vs Wipster/Frame.io.

## 5. Approval ceremony — present, but broken in the seeded link

Two parallel mechanisms exist on the approval link (`audit/shots/review-approve-1440-1440x900.png`):

- **Step cards** (`ApprovalStep` + `ApprovalActions`): 3-button pattern "Approve / Approve with Changes / Request Changes", quick-approve fires `onDecide("approved")` with **no confirmation dialog** (`ApprovalActions.tsx:21-23`). Request-changes requires a note.
- **In the seeded demo link these buttons never render.** The share link's `reviewer_email` is `approvals@ica.example` (`workspace-store.ts:423`) while Step 1's `assignee_email` is `reviewer@client.example` (`lib/review/demoReview.ts:58`); `defaultActiveApprovalIds` matches on email (`page.tsx:136-138`), so no step becomes active and `onDecide` is undefined (`page.tsx:1106-1110`). Probe: `getByRole('button', { name: 'Approve', exact: true })` → count 0. The panel still says "DECISION NEEDED / Client Lead is ready for review / …use the actions below to approve or request changes" — pointing at actions that don't exist.
- **What actually works in demo is `FinishReviewBar`** (demo-only, `page.tsx:1120-1124`): "Approve & finish / Request changes & finish / Notes only". One click, no confirm dialog, immediately shows "Review finished — your approval is on the record." (`audit/shots/lane6-approval-after.png`) and persists via `finishDemoReview` to localStorage.
- **State inconsistency observed**: after "Approve & finish", Step 1 still displays "Pending" while the banner declares the approval on the record — two sources of truth on one screen (`lane6-approval-after.png`).

## 6. Revision rounds / versions / unresolved-comment guard

- **No version switching on the public route**: version is synthesized once (`demo-version-N`, `page.tsx:324-337`); no UI to compare or step between rounds. `components/versions/VersionList.tsx` and `VersionCompare.tsx` are wired only into the internal cockpit (`components/projects/ProjectCockpit.tsx`, `components/cockpit/VersionCompareDock.tsx`), never here.
- **Revision rounds**: no round counter/reset visible to the client; comments are scoped to a `version_id` in the data model (`page.tsx:298`) but nothing on the surface exposes rounds.
- **Unresolved-comment guard: advisory only.** The rail says "2 open notes before sign-off." and `lib/review-state.ts:205` advises "Record approval only when this version is actually ready", but nothing blocks approval with open threads — `FinishReviewBar` approves regardless of open comments (observed: approved with 2 open).

## 7. Branding & client-friendliness

- Brand header: "Content Co-op / Reviewed with Content Co-op" from workspace brand (`workspace-store.ts:369-374`), accent color applied (`PublicReviewWorkspace.tsx:146-147`).
- **L1 defect — the brand logo is broken**: `/_next/image?url=%2Fdemo%2Fcco-spiral.png&w=48&q=75` returns **400** (probe output), so every viewport shows a broken-image icon next to "Content Co-op" (`review-ceraweek-1440-1440x900.png` top-left). The raw file serves fine (`curl /demo/cco-spiral.png` → 200, valid 1204×1128 PNG) — the Next image optimizer is what fails in this environment.
- Instructional prose, verbatim:
  - "1. Watch the cut and pause where feedback is needed."
  - "2. Leave a comment tied to the current timestamp or frame."
  - "3. Use the thread list to track open feedback." (approval intent: "3. Record your approval when the cut is ready.")
  - Composer placeholder: "Share what needs to change, what is working, or where approval is blocked." (`PublicReviewComposer.tsx:70`)
  - "Feedback stays attached to this version and timestamp." (`PublicReviewComposer.tsx:61`)
  - Approval: "Leave any final notes, then use the actions below to approve or request changes." (`page.tsx:1095`)
  - Tone is plain and client-appropriate throughout — this is genuinely good.
- **L2 — badge conflicts**: on the approval link the title badge reads "Approved" (asset status from seed) while the state badge reads "Feedback in progress" and Step 1 is "Pending" (`review-approve-1440-1440x900.png`). Three contradictory status signals on one screen.
- Reviewer identity: "Reviewing as **Client Reviewer**" prefilled; name is editable, required before approval ("Enter your reviewer name before recording an approval.", `page.tsx:694`).

## 8. Responsive

- 768×1024 (`review-ceraweek-768-768x1024.png`): single column, stage first, selected-note card below — clean, no overflow.
- 375×812 (`review-ceraweek-375-375x812.png`): usable. Player, transport, and timeline fit; transport wraps (timecode drops below buttons) but nothing is cut off; stat chips wrap. Minor: the "Press Down to propose…" hint is partially obscured at the left edge, and frame-step/speed dropdowns are cramped but tappable. No horizontal scroll observed.
- Comments rail stacks below the player on small screens — a phone client can watch, tap a note, and comment without zooming.

## 9. Component wiring inventory

Wired into `/review/[token]`: `review/PublicReviewWorkspace`, `review/ReviewMediaSurface`, `review/PublicReviewComposer`, `review/InlineReviewComment`, `review/FinishReviewBar` (demo-only), `comments/CommentThread`, `approvals/ApprovalStep` (+`ApprovalActions`), `player/PlayerTimeline`, `player/FrameIndicator`, `player/PlayerControls`/`VideoPlayer` (via media surface).
Present but **not wired here**: `annotations/AnnotationCanvas`, `annotations/AnnotationToolbar`, `comments/MentionSuggestions`, `versions/VersionList`, `versions/VersionCompare`, `review/ReviewWorkspace.tsx` (a second, unused 295-line workspace component — dead weight or parallel experiment).

## 10. Verdict — **POLISH** (close to the bar; do not rebuild)

This already answers "where is our Wipster": player-first, timecode comments with pins, branded, client-readable prose, works on a phone. Gap list to "Wipster-class":

1. Fix the seeded approval link's email mismatch so step-level Approve/Request-changes buttons actually render (`workspace-store.ts:423` vs `demoReview.ts:58`); today the headline approval flow is unclickable.
2. Reconcile the dual approval paths — `FinishReviewBar` approving while the step card still says "Pending" undermines the ceremony's credibility; one source of truth.
3. Fix the brand-logo 400 (Next image optimizer on `/demo/cco-spiral.png`) — a broken logo is the first thing a client sees.
4. Resolve the "Approved" title badge vs "Feedback in progress" state badge conflict on approval links.
5. Add a confirmation step (or undo window) to one-click Approve.
6. Wire `AnnotationCanvas` (exists, unused) for on-frame drawing; wire `MentionSuggestions` (exists, unused) for @mentions.
7. Expose version/round switching on the public route (components exist in `components/versions/`, currently cockpit-only).
8. Optional: allow client replies within a thread (`canReply` is hardcoded false), and consider gating or at least warning-on-approve while threads are open.
9. Demo-media honesty: every seeded asset plays the same 5s clip — fine for demo, but note it before showing clients.
