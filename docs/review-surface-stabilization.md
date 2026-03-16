# Co-Deliver Review Surface Stabilization

## Root cause

- The review product kept drifting back toward page-shell and dashboard patterns.
- On the public route, a second framing banner was layered above the actual review workspace, which split the product into "banner + page + player" instead of one clear review surface.
- On the internal asset route, sharing and handoff-management panels were allowed back into the main review page, which pushed the player lower and made the route feel like an admin workspace instead of a review tool.
- Comments, approvals, version context, and sharing intent were all valid concerns, but too many of them were surfaced at the same hierarchy level.
- Review state also started getting restated in multiple stacked panels, which made the product feel like a fused prototype explaining itself instead of a clear review tool.

## Correction applied

- The review surface is now anchored around one compact top bar, one dominant media stage, and one adjacent review rail.
- The player remains the primary object on both public and internal routes.
- Comments and approval state stay in the rail where they remain adjacent to the media.
- Version context stays compact and supporting instead of becoming a second major section inside the review rail.
- Sharing and handoff controls stay available, but they do not occupy the main review surface ahead of the player.
- State is expressed once at the right hierarchy level instead of being repeated in stacked summaries.

## Product rule going forward

- Do not add explainer panels, intent catalogs, share-link management, or dashboard summaries above the player on review routes.
- Do not stack multiple summary panels that restate the same review state in different words.
- If a control is about configuring or administering handoff state, keep it in modal or secondary workflow UI.
- If a control is about watching, commenting, approving, or understanding the current cut, it belongs in the review stage or review rail.
