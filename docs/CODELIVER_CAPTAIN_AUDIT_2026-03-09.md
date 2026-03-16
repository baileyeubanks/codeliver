# Co-Deliver Captain Audit

Date: 2026-03-09
Scope: integrated convergence status for the standalone review product

## Classification

`partial`

Co-Deliver now reads as one review product on the surface. The captain pass removed the remaining internal dashboard-shell conflict, aligned the public and internal review surfaces behind one shared workspace contract, and retired stale shell residue that was still implying parallel review systems.

The product is still `partial` because sharing durability, approval identity binding, and broader auth/data confidence remain explicit transitional residue rather than hardened contracts.

## Canonical now

- Co-Deliver is one standalone review product.
- Public review at `/review/[token]` and internal review at `/projects/[id]/assets/[assetId]` are two entry modes into the same player-first review workspace.
- The canonical surface is:
  - one compact top bar
  - one dominant media stage
  - one adjacent review rail
- Comments and approvals share the same rail and stay beside the media.
- Sharing stays secondary to the review workspace and is handled in modal/secondary UI rather than above the player.
- `deriveReviewState` is the canonical review-state model for surface copy, counts, and next-step framing.

## Transitional now

- `share_intent` is still derived from invite permissions and delivery controls rather than stored as a first-class durable contract.
- Approval-capable public links still bind authority through reviewer email plus active workflow-step matching.
- Final delivery still reuses the token review surface and is framed as delivery rather than a separate contract.
- Internal collaboration remains owner-scoped.

## Blockers still open

1. Persist and harden `share_intent` if product trust needs to rise beyond UI framing.
2. Bind approval links to an explicit approval-step contract if reviewer-email matching is no longer sufficient.
3. Complete authenticated browser QA on the internal review route with a real local session.
4. Finish the narrower auth/data stabilization work already called out in `docs/auth-data-model.md`.

## Preview QA status

- Public preview URL: `http://localhost:4103/review/demo?demo=1`
- Public route confirmed as one review workspace with one player stage and one adjacent rail.
- Playback advanced during QA and the resolved filter isolated the single resolved thread as expected.
- The remaining browser-visible issue on the public preview is the local `favicon.ico` 404.
- Internal route shell convergence is now implemented in code, but authenticated browser QA still depends on a real session.

## Next stabilization threads

- Sharing:
  harden share-intent durability and decide whether final delivery remains on the same token surface long term.

- Comments + approvals:
  decide whether approval identity remains email-based or graduates to an explicit approval-step binding and stronger recipient identity.

- Auth + data:
  finish authenticated end-to-end QA and confirm production migration alignment.

- Deploy/runtime:
  keep out of the review-surface thread unless runtime issues block preview or route correctness.

## Supporting notes

- `docs/codeliver-re-audit.md`
- `docs/codeliver-canon-freeze.md`
- `docs/auth-data-model.md`
- `docs/review-surface-root-cause.md`
