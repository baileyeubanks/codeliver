# Wistia domain learnings — 2026-09-23

**Seat:** Frame. **Build handoff:** [CVP-PLAYER-REEL-IMPLEMENT](./CVP-PLAYER-REEL-IMPLEMENT.md) for Reel/player.
**SoT:** the public `wistia.com` domain, read 2026-09-23. **Gold centerpiece:** [wistia.com/product/player](https://wistia.com/product/player).
**Also read:** `/`, `/product`, `/product/collaboration`, `/product/embeds`, `/product/interactive-video`, `/product/hosting`, `/product/analytics`, `/product/channels`.

Player stage rules come from the centerpiece. Other pages only lend review and product chrome cues. They do not lend marketing.

## Login fence

**CVP login stays ACS-quiet.** Do not apply the Wistia marketing login, the session page, or any wistia.com promo rail to `AuthShell`.

`app.wistia.com/session/new` and the wistia.com “Log in / Get started / Start a free trial” chrome are not the CVP door. The door reference is the live ACS admin sign-in: centered mark, one card, one primary path, email, password, forgot. No pipeline crumb, no PORTAL / SESSION / RETURN chips, no app header or rail, no right promo. This file does not specify that door. Reel/player does not build it from here.

## Player stage rules (gold: /product/player)

Their line is “Plays as good as it looks.” The picture is the product. Chrome is secondary.

Copy the stage, not the sales page:

1. **Picture fills the frame.** Controls sit on the picture or at its edge, then recede while it plays. A control deck under the black frame is the failure.
2. **Quiet default UI.** Aurora’s own description on that page: a refined play button, updated icons, rounded corners available, gorgeous out of the box. One play shape. Icons on the bar. No sentence on the chrome.
3. **Controls a viewer needs.** Their FAQ names play, pause, rewind, fast-forward, speed, volume, and captions support. The same page says you may add chapters, remove the playbar, and choose which controls show. For CVP review the playbar stays. Speed is inside a menu, not a permanent badge. Rewind and fast-forward stay icon skips.
4. **Responsive.** “From mobile devices to giant screens.” The shell is the same object at 390px and on desktop. No desktop-only white deck.
5. **Playback before paint.** Adaptive streaming and uninterrupted playback are the promise. Keep the HLS path in `VideoPlayer`. Do not restyle a frame that cannot play.
6. **No ads.** Hosting says the same thing in plainer words: “No ads, no distractions.” Never inject a promo, trial, logo wall, or “Start a free trial” into the review player.
7. **Brand is a color, not a billboard.** Player, embeds, hosting, and `/product` all say: color, thumbnail, optional logo, optional rounded corners. CVP uses sapphire `#0057ff` on the played bar and the play shape. No wordmark inside the control bar. Their “stunning gradient” is a marketing sentence. CVP gets a short dark scrim so icons read. Not a rainbow wash.
8. **Accessible without a feature chip.** The player page asks for captions, audio description, and high-contrast, WCAG AA intent. This pass keeps keyboard, focus, and contrast (light icons on the dark scrim). It does not paint the word Captions on the bar. There is no captions control in `components/player` today. Do not invent one to look complete.

## Review and product chrome cues (other wistia.com pages)

Use these as cues for where craft sits. Do not copy the pages.

| Page | Cue for the CVP review player | Leave on the marketing site |
|---|---|---|
| `/product/collaboration` | Pause on a frame, comment, marker on the timeline. “Leave the days of typing out timestamps behind you.” Our comment dots on the scrubber are that cue. | “Anyone can give their 2¢”, email tags, folders, password walls, free-link pitch. |
| `/product` | “Time-stamped comments all in one place.” “Pick the playback controls.” Color and controls, not a second dashboard of words. | Host / Market / Create / Analyze pillars, trial CTAs, webinar Q&A. |
| `/product/embeds` | Inline player, responsive, corners may be rounded, lightweight. The review frame is inline in the well. | Popover embeds, Channels galleries, LLM-embed SEO, webinar embeds. |
| `/product/hosting` | Ad-free, fast load, adaptive streaming, color and shape in seconds. | Collections, carousels, import-from-Zoom, analytics pitch. |
| `/product/interactive-video` | Chapters and captions exist in their world as optional layers, not default chrome. | In-video forms, full-screen CTAs, annotation links, AI chaptering. |
| `/product/analytics` | A heatmap is a study of the timeline, not a coat of paint on the player. Out of scope here. | Plays, conversion, MAP integrations, A/B thumbnails. |
| `/product/channels` | A gallery is a page of films, not chrome on one film. | Grids, subscribe gates, email collectors, channel hero art. |
| `/` | The home page is a marketing HQ. Nothing from that nav, logo wall, or trial banner enters the player. | All of it. |

## Explicitly not for the CVP review player

Lead forms, HubSpot-style CTAs, annotation-link spam, Channels galleries, webinar chrome, analytics dashboards, subscribe gates, and any wistia.com header (“Log in”, “Get started”, “Talk to Sales”). Collaboration’s link-without-an-account idea is a review-door product question, not a control-bar button.
