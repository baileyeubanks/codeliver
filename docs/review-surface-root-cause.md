# Review Surface Root-Cause Note

## What overlapping systems were found

- The active review product had already been stabilized into a player-first stage plus adjacent rail, but the repo still carried legacy review-shell residue from earlier directions.
- A separate dev-only sharing preview route (`app/sharing-preview/page.tsx` plus `components/sharing/SharingPreviewPage.tsx`) was still rendering its own review-shell-like surface, which preserved the feeling that another program was living beside the main product.
- An older comment-panel stack (`components/comments/CommentPanel.tsx`, `CommentFilters.tsx`, `CommentInput.tsx`) still existed as an alternate review discussion surface even though the live routes had moved to the new review rail.
- An older external review banner shell (`components/sharing/ExternalReviewBanner.tsx`) still existed as a parallel framing pattern after the public route had already been collapsed into a single top bar.

## What was removed or simplified

- Removed the dev-only sharing preview route and its separate shell.
- Removed the unused legacy comment-panel stack.
- Removed the unused external review banner shell.
- Left the live review product anchored on:
  - one compact top bar
  - one dominant player surface
  - one adjacent comments / approval rail

## What still remains follow-up work

- Comments / approvals:
  Approval-step binding is still reviewer-email based rather than explicitly bound to a single approval-step contract.

- Sharing:
  `share_intent` is still a real product concept but not yet fully hardened as a first-class durable contract everywhere.

- Auth / data:
  Internal auth remains owner-scoped and the authenticated internal route still needs a clean end-to-end browser QA pass.
