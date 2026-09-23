# FRAME — CVP player, Wistia stage

**Lock:** [FRAME_CVP_SOT_SPLIT_LOCKED_20260923](./FRAME_CVP_SOT_SPLIT_LOCKED_20260923.md).
**SoT:** [wistia.com/product/player](https://wistia.com/product/player). Stage still 2026-09-23.
**Code:** `ReviewMediaSurface.tsx`, `VideoPlayer.tsx`, `PlayerControls.tsx`, `PlayerControls.module.css`.
**Checklist:** [CVP-PLAYER-REEL-IMPLEMENT](./CVP-PLAYER-REEL-IMPLEMENT.md).
**Land:** M2 Content-Co-op-9 when Reel implements.

Login is ACS. Do not build this player from the admin card, and do not build the door from this page.

## What the stage still shows

The page around the player is marketing. The player itself is the source.

On the still, the picture is a large rounded stage. A large rounded play control sits on the picture. Along the bottom edge of the picture, not under it: a small play icon, a short time, a thin scrubber, then small icons for captions, audio description, volume, a gear, and fullscreen. The chrome is a hairline on the frame.

Also on that still, and **not** the player: the wistia.com header, “ONLINE VIDEO PLAYER”, “Plays as good as it looks”, “Start a free trial”, the floating **Captions / ON** pill, the color-picker inset, the coral poster art, and the “Trusted by” logo wall. Those stay on wistia.com.

The still is the chrome-visible moment. Bailey’s behavior lock is the other half: while the cut plays, the controls recede.

## What Reel builds

Big stage. Black well. Rounded frame. Controls on the picture, on a short dark scrim. Sapphire `#0057ff` on the play shape and the played scrub. No wordmark on the bar.

Visible bar, icons except the clock: skip back, play/pause, skip forward, comment previous/next when the review passes them in, unlabeled SMPTE, scrubber, volume, one gear (speed and seek step live inside it), loop, fullscreen.

Paused: one play shape on the picture, accessible name Play, no visible word. It leaves when playback starts. The bar leaves during playback when the pointer and focus are outside it, and returns on pause, hover, focus, or a transport key.

## What the still must not talk Reel into

- Do not switch SMPTE to the still’s `1:19`. Their clock is a hosting clock. Ours is a finishing clock.
- Do not paint the word Captions, or a Captions ON pill. Their bar uses a CC icon because captions exist. `components/player` has no captions control. Do not add a dead one.
- Do not add their AD icon, their coral ground, or their trial button.
- Do not drop pins, comment dots, A/B loop, or the keyboard map to look more like the still. Those are the review craft. The still is a marketing player and does not have them.

## Kill

The white deck under the frame. The permanent `1s` select. The permanent `1x` badge. The volume slider that never leaves. Any feature word on the shell.

If the frame cannot play, fix playback before this chrome. The “Playback unavailable” / “Retry playback” state stays an error, not a chip.
