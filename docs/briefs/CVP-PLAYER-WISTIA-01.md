# CVP-PLAYER-WISTIA-01 — Player shell tear-down

**Seat:** Frame (research). **Build:** Reel. **Grade:** Cut.
**SoT for chrome geometry:** Wistia Player Controls Framework, [docs.wistia.com/docs/player-controls-framework](https://docs.wistia.com/docs/player-controls-framework) (updated 2025-04-29). Their own words: player controls are “elements over a video” — thumbnail, big play button, playbar, control bar. The bar is middleground on the picture, not a panel under it.
**CVP shell:** `components/review/ReviewMediaSurface.tsx` mounts `components/player/VideoPlayer.tsx`, then `components/player/PlayerControls.tsx` beneath the frame. Public review already paints the well black (`PublicReviewWorkspace.module.css`, `.media .review-video-frame`).

The film is the frame. Chrome is how you touch the frame. A word on the chrome is a feature trying to introduce itself. This ticket moves the shell. It does not restyle the comment column, the multitrack, or the approval spine.

## What Wistia puts on the picture

From their control types, the shell is three layers on the video:

- **Background:** the thumbnail / poster.
- **Above the bar, centered:** `BigPlayButtonControl`. Also the loading mark and subtitles. One shape, not a sentence.
- **The bar itself:** `control-bar-left` holds the small play button. The playbar (scrubber) takes the middle and is as wide as the other regions leave it. `control-bar-right` holds icon buttons, default about 40×34. Speed, quality, and captions live in a dialog opened from a button (`mountDialog`), not as permanent labels.
- **Foreground:** context menu. Rare, and not a toolbar.

`chromeless` exists as a mode that removes video chrome. The default player is the opposite of a labeled deck: controls recede, the picture stays.

Their product nav calls the player “ad-free” and “fast playback without any distractions.” We do not take the ad, the end-screen CTA, the email gate, or the chapters-as-marketing flyout. We take the geometry: controls on the picture, icons on the bar, words inside a menu the operator opened.

## What our shell does now

`PlayerControls` is a white deck under the black frame.

`PlayerControls.module.css` sets the deck to `--cvp-surface` / `#fff`, padding, and a bottom-only radius (`0 0 12px 12px`). The scrubber lives in that deck. The picture in `VideoPlayer` is a separate black box with `rounded-[var(--radius)]`. Two objects, stacked. Wistia is one object.

Always visible in the row, desktop:

- Skip back, play/pause, skip forward. Icons. These are fine.
- Comment previous / next. Two icons each, no word. Fine, until someone adds the word “Comments”.
- SMPTE `current / duration`. This is the decision clock. It stays. It is not a feature name.
- A `<select>` whose options are the words `1s`, `2s`, `5s`, `10s`. That is a setting wearing a label on the bar.
- Volume icon plus a 60px slider that never hides.
- A text button that always reads `1x` (or `1.25x`, `2x`). Rate as a badge.
- Loop icon. Fine. Accent when a region is set. Fine.
- Fullscreen icon. Fine.

There is no big play shape on the poster. Clicking the video toggles playback (`VideoPlayer` `handleVideoClick`), which is the right gesture, with nothing to look at before the first play.

Keyboard craft already exists and must survive the restyle: Space/K, J/L shuttle, arrows, M, F, comma/period frame step, `[` `]`. Those shortcuts are invisible. They are not chrome copy.

## The shell to build

One player. Black well. Controls drawn over the bottom of the picture on a short dark gradient, not on a white card. Sapphire `#0057ff` is the played bar and the play shape. Control ink on the overlay is white at low emphasis. Do not invert this into the admin white bar to “match ACS.” ACS white is for forms. The frame is a screening room.

**Big play.** When paused, one play shape centered in `above-control-bar`. `aria-label="Play"`. No visible word, no “Play cut”, no Hook line. The Hook line belongs on the login door. On play, the shape leaves. The small play/pause in the bar remains.

**Bar, left to right, icons unless named here:**

1. Skip back, play/pause, skip forward.
2. Comment previous / next, still icons, still only when comment navigation is passed in.
3. SMPTE current and duration, ~11px, tabular, no “Timecode” label. Keep SMPTE. Do not swap in Wistia’s `m:ss`. This is a finishing player.
4. The scrubber, the widest control. Comment dots stay on it (open / resolved color is state, not a legend). Loop region tint stays. No caption under the bar explaining the dots.
5. Volume icon. The slider appears on hover or focus of that control, then leaves.
6. One overflow button, icon only (a quiet mark, not the word “Settings”). Inside the dialog, words are allowed, because the operator asked: playback speed (`0.25`–`2`) and keyboard seek step (`1`, `2`, `5`, `10` seconds). When rate is not `1`, a small numeral may sit on the bar as state. At `1x` the bar does not advertise speed.
7. Loop, icon, accent while armed or closed.
8. Fullscreen, icon.

**Recede.** While playing, if the pointer is outside the player and focus is not in a control, the bar fades out (~200ms, no bounce). It returns on pause, pointer enter, focus, or any of the keyboard shortcuts above. `prefers-reduced-motion`: show and hide with no fade. Touch: the bar stays through the gesture, then recedes after a short idle, and the big play returns on pause.

**Hit targets.** Keep the current mobile floor (about 44px on the transport). Quiet is not tiny. The white deck’s mobile wrap — timecode forced to its own centered row, seek `<select>` `display: none` — goes away because those controls left the permanent row.

## Words that do not go on this shell

If a control needs a sentence to be understood, it is in the overflow dialog or in the `aria-label` / `title`. It is not painted on the bar.

Do not add, and remove if they appear: HD, Captions, Theater, Share, Download, Comments, Frame-accurate, Version, A/B Loop, Seek, Speed, Quality, “wordmark as a 120px logo button” (Wistia puts their logo in `control-bar-right`; we do not).

Playback failure copy already on the frame (“Playback unavailable”, “Retry playback”) is an error state, not chrome. Leave the words. Do not decorate that state with feature chips.

## Out of scope

`review-video-timeline` under the player, the comment composer, version compare, pins and drawings, HLS recovery. Cut grades the shell in `PlayerControls` + the frame in `VideoPlayer` / `ReviewMediaSurface`. A loud timeline header is a different ticket.
