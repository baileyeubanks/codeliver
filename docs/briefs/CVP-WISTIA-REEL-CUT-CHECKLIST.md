# Reel / Cut checklist — player shell

**Briefs:** [CVP-PLAYER-REEL-IMPLEMENT](./CVP-PLAYER-REEL-IMPLEMENT.md) · [WISTIA_DOMAIN_LEARNINGS_20260923](./WISTIA_DOMAIN_LEARNINGS_20260923.md) · [CVP-PLAYER-WISTIA-01](./CVP-PLAYER-WISTIA-01.md)
**Author:** Frame. **Builder:** Reel. **Grader:** Cut. Author does not grade. A row passes only if Cut can see it on the running player, at desktop and at 390×844.

**Login fence.** CVP login stays ACS-quiet. Do not apply a Wistia marketing login. The L-rows below are not the login build. Reel/player grades the R, K, and C rows in the implement checklist.

Mark each row `pass` or `fail`. A fail names the visible string or the node. No partial credit for “the component still has the prop.”

## Login — withheld

Do not grade or build login from the L-rows. CVP login stays ACS-quiet. Hook copy for the door is unchanged and is not specified again here.

## Login capture — not a build (CVP-LOGIN-UI-WISTIA-01)

| # | Pass when |
|---|---|
| L1 | One headline, exact: `Open the cut that still needs a decision.` No second heading. |
| L2 | Primary button visible label is `Sign in`. Demo mode uses `Sign in`, not `Open local workspace`. Loading may read `Signing in…`. |
| L3 | No eyebrow, chip, or strip reading Account access, Portal, Session, Return, Private account access, Brief, shoot, delivery, or a `→` pipeline. |
| L4 | The CVP mark appears once. No second monogram stacked over a tagline. |
| L5 | No numbered feature list (`01`, `02`, `03`) and no manifesto paragraph. `product-login-shell` is not the page. |
| L6 | Column is a single centered stack, max width about 464px. No left marketing pane, no clip-path card, no dark cinematic stage. |
| L7 | Google, if shown, is one outline control above a centered `or`, then Email and Password. No Microsoft control. No SSO control. |
| L8 | Forgot password? is a text link on the password row when not in demo. Show/hide is an icon, not the words Show and Hide. |
| L9 | Submit has no logo icon and no `LogIn` glyph beside the label. |
| L10 | Error, expired-link, surface-mismatch, and password-updated alerts still render. A failed login still clears the password field. |
| L11 | At 390px the column does not scroll sideways and no chip wraps in under the button. |
| L12 | Ground stays light (`#f7f9fc` family). Action blue is `#0057ff`, not a second brand blue. |

## Player — CVP-PLAYER-WISTIA-01

Grade a review surface that mounts `ReviewMediaSurface` with a video. Cockpit and public review use the same shell; both must match.

| # | Pass when |
|---|---|
| P1 | Transport sits on the picture, over a dark gradient. There is no white control deck under the frame. |
| P2 | Paused, a single play shape is centered on the frame. Its accessible name is Play. The shape has no visible word. |
| P3 | The Hook line and `Sign in` do not appear on the player. |
| P4 | The permanent bar has no `<select>` and no painted `1s` / `5s` / `10s`. Seek step is inside the overflow dialog. |
| P5 | At rate `1`, the bar does not show a speed badge. Other rates may show a numeral. The rate list lives in the overflow dialog. |
| P6 | Volume slider is not always on the bar. It appears from the volume control (hover or focus) and leaves. |
| P7 | SMPTE current and duration are on the bar, unlabeled, tabular. Format is still SMPTE, not `m:ss`. |
| P8 | Comment markers are dots on the scrubber. No legend chip naming Open, Resolved, or Comments. |
| P9 | Comment previous / next, loop, skip, and fullscreen are icons. No visible labels Comments, Loop, Seek, Speed, HD, Captions, Theater, Share, Download, Frame-accurate, Version. |
| P10 | During playback, with the pointer outside the player and focus outside the controls, the bar leaves. Pause, hover, focus, or a transport key brings it back. |
| P11 | `prefers-reduced-motion` does not fade the bar. It shows or hides. |
| P12 | Space/K, J/L, arrows, M, F, comma/period, and `[` `]` still do what they did. Shortcuts are not printed on the chrome. |
| P13 | Played scrub and play shape use `#0057ff`. The well stays black. |
| P14 | Playback-unavailable still says the video could not be loaded and still offers Retry playback. No feature chips on that state. |
| P15 | At 390px, transport targets stay thumb-sized and the bar does not add a second row of words. |

## Grade rule

Reel/player is graded on the R, K, and C rows in [CVP-PLAYER-REEL-IMPLEMENT](./CVP-PLAYER-REEL-IMPLEMENT.md). P-rows are the earlier shell pass and still apply. L-rows do not. Reel does not self-grade. Frame does not patch the UI from this document.
