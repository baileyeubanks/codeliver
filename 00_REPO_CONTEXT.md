# CO-DELIVER Repo Context

## Role
Standalone review and delivery product under the Content Co-op umbrella.

## Current Condition
`partial`, but no longer drifted

## Canonical Scope
- review UI
- comments and approvals
- sharing
- auth and data
- product shell

## Canonical Product Truth
- Co-Deliver is one standalone review product.
- Public review happens at `/review/[token]`.
- Internal review happens at `/projects/[id]/assets/[assetId]`.
- Both routes now converge on one shared player-first review workspace contract.
- The canonical review surface is:
  - one compact top bar
  - one dominant media stage
  - one adjacent review rail

## Key Source Files
- `/Users/baileyeubanks/Desktop/Projects/contentco-op/codeliver/docs/CODELIVER_CAPTAIN_AUDIT_2026-03-09.md`
- `/Users/baileyeubanks/Desktop/Projects/contentco-op/codeliver/components/review/ReviewWorkspace.tsx`
- `/Users/baileyeubanks/Desktop/Projects/contentco-op/codeliver/components/review/ReviewMediaSurface.tsx`
- `/Users/baileyeubanks/Desktop/Projects/contentco-op/codeliver/app/review/[token]/page.tsx`
- `/Users/baileyeubanks/Desktop/Projects/contentco-op/codeliver/app/(review)/projects/[id]/assets/[assetId]/page.tsx`

## Current Risks
- remaining instability is now mostly under the product model, not the visible shell
- `share_intent` is still derived rather than hardened as a durable contract
- approval authority is still reviewer-email based rather than explicitly bound to an approval-step contract
- internal auth/data remains owner-scoped
- internal route still needs authenticated end-to-end browser QA

## Next Focus
- keep the shared player-first review workspace canonical
- harden sharing, approval, and auth/data contracts without reintroducing dashboard-shell drift
- keep captain-thread convergence inside this repo only

## Update Rule
Every future CO-DELIVER thread should read this file first and update it when repo truth materially changes.
