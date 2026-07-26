# Visual Polish Issue Ledger - 2026-07-15

Scope: `/projects/bp?asset=bp-rodeo-v2&view=review&demo=1` on localhost `:4103`.

## Resolved

- High: review URL forced focus mode, compacting the cockpit against the canonical bright operational reference. Changed review URLs to render the full review cockpit with expanded rail and open review dock.
- High: demo review poster used Next image optimization and rendered as a broken image while the raw local JPEG was valid. Bypassed optimization for local/demo review, version, and demo share images.
- Medium: mobile review controls were present but hard to discover. Added a compact mobile review tools strip for Comments, Share, and Transcript that opens existing dock/share states.
- Medium: transcript and AI cleanup were absent from the default review system. Added honest dock UI that reports transcript/cleanup as pending/unavailable until backend processing exists.
- Medium: share readiness was only visible after opening the modal. Added permission-aware share readiness summary in the review dock.
- Medium: timeline markers did not activate the player from the cockpit integration. Wired marker activation to seek.
- Medium: browser `Space` key names were not normalized across review players. Added shared shortcut-key normalization with regression coverage.

## Verified

- Desktop screenshot: `07-final-desktop-1440x1000.png`
- Mobile screenshot: `08-final-mobile-390x844.png`
- Reference comparison: `09-reference-vs-final-desktop.png`
- Browser interaction checks passed for frame pin, Enter submit, Space/K playback toggle by UI state, left/right seek, down cut marker, share modal, notifications/account menus, and mobile review dock.

## Remaining Limitations

- Demo BP asset has no real transcript or AI cleanup job output; UI now states this honestly and does not claim processing is complete.
- Demo playback uses the existing simulated playback fallback in this environment, so native `video.paused` can remain true while the UI timecode and play state advance.
- No production backend writes, migrations, deploys, pushes, or public site changes were performed.
