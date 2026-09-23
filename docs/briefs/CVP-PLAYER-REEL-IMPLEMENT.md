# CVP player — Reel implement checklist

**For:** Reel/player. **Grade:** Cut. **Author:** Frame. Frame does not grade.
**Learnings:** [WISTIA_DOMAIN_LEARNINGS_20260923](./WISTIA_DOMAIN_LEARNINGS_20260923.md). Gold page: [wistia.com/product/player](https://wistia.com/product/player).
**Code:** `components/review/ReviewMediaSurface.tsx`, `components/player/VideoPlayer.tsx`, `components/player/PlayerControls.tsx`, `components/player/PlayerControls.module.css`.
**Login:** not this checklist. CVP login stays ACS-quiet. Do not apply a Wistia marketing login.

Pass a row only on a running review player, desktop and 390×844. A fail names the visible string or the node.

## Must copy

| # | Pass when |
|---|---|
| R1 | The picture is the stage. Transport is over the frame on a short dark scrim. No white deck under the black well (`PlayerControls` background is not a solid `#fff` bar). |
| R2 | Paused, one play shape is centered on the picture. Accessible name Play. No visible word. It leaves while playing. |
| R3 | Bar icons, left to right: skip back, play/pause, skip forward, comment previous/next when provided, unlabeled SMPTE current/duration, scrubber, volume, one overflow icon, loop, fullscreen. |
| R4 | Played scrub and play shape use `#0057ff`. No CVP wordmark on the bar. No marketing gradient. |
| R5 | The same shell at 390px. No second row of words. Transport targets stay about 44px. Corners of the frame may stay rounded. The shell does not become a fixed desktop deck. |
| R6 | While playing, pointer outside and focus outside the controls, the bar leaves. Pause, hover, focus, or a transport key brings it back. `prefers-reduced-motion` shows and hides with no fade. |
| R7 | Focus rings and the existing keyboard map still work. Light icons on the dark scrim. No Captions chip added to look accessible. |

## Must kill

| # | Pass when it is gone |
|---|---|
| K1 | White control deck under the frame, including the bottom-only radius that makes two stacked objects. |
| K2 | Permanent seek `<select>` and the painted words `1s`, `2s`, `5s`, `10s`. Seek step lives in the overflow. |
| K3 | Permanent `1x` badge. Other rates may show a numeral. The rate list (`0.25`–`2`) lives in the overflow. |
| K4 | Volume slider always on the bar. It appears from the volume control on hover or focus, then leaves. |
| K5 | Any visible label on the shell: HD, Captions, Theater, Share, Download, Comments, Frame-accurate, Version, Loop, Seek, Speed, Quality, Settings, Start a free trial, Log in, Get started. |
| K6 | Forms, CTAs, annotation-link buttons, chapter lists, heatmaps, subscribe gates, and gallery grids inside the player. |

## Keep craft

| # | Pass when it still works |
|---|---|
| C1 | Frame pin: `annotationEnabled` still calls `onFramePin` with x, y, and time. Pin mode still crosshairs the image path. |
| C2 | Comment dots stay on the scrubber. Open and resolved stay color, not a legend. |
| C3 | A/B loop still cycles in, out, clear. The icon accents while a point is set. The region tint stays on the scrubber. |
| C4 | Keys still do their jobs and are not printed on the chrome: Space/K, J/L, arrows, M, F, comma/period frame step, `[` `]`. |
| C5 | SMPTE stays SMPTE. Do not switch the clock to `m:ss`. |
| C6 | HLS attach stays. If the frame cannot play, the existing “Playback unavailable” / “Retry playback” state remains, undecorated. Do not ship the new chrome on a dead frame. |
| C7 | Comment composer, multitrack timeline, and approval spine are untouched. |

## Order of work

1. Confirm a review video plays. If it does not, fix that path before moving chrome.
2. Move `PlayerControls` onto the frame. Delete the white deck.
3. Add the play shape. Move speed and seek step into one overflow dialog.
4. Recede the bar. Check 390px.
5. Re-hit C1–C7. Then hand Cut the R, K, and C rows.
