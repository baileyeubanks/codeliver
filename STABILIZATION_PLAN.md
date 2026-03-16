# Co-Deliver Stabilization Plan

Updated: March 10, 2026

## Verified Current State

- `npm run build` passes.
- Health endpoint exists at `/api/health`.
- Deploy contract exists at
  `/Users/baileyeubanks/Desktop/Projects/contentco-op/codeliver/DEPLOY_CONTRACT.md`.
- Docker runtime contract exists at
  `/Users/baileyeubanks/Desktop/Projects/contentco-op/codeliver/Dockerfile`.
- Public review route and internal project routes compile into one app surface.

## Product Areas

| Area | Current state | Verification |
| --- | --- | --- |
| Review workspace | Partial but coherent | `docs/CODELIVER_CAPTAIN_AUDIT_2026-03-09.md` |
| Public share route | Present | `/review/[token]` builds |
| Internal review route | Present | `/projects/[id]/assets/[assetId]` builds |
| Comments / approvals API | Present | API routes compile |
| Share / invite layer | Partial | Durable share-intent contract still not hardened |
| Deploy/runtime | Now contract-defined | Dockerfile + health route added |

## Primary Remaining Gaps

1. `share_intent` is still UI-derived rather than a fully durable first-class contract.
2. Approval identity still leans on reviewer email + workflow state instead of a stronger approval-step binding.
3. Authenticated browser QA for the internal route still needs a real session.
4. Storage authority for large review media still needs a final canonical decision and validation under real load.

## Hardening Order

1. Lock share-link durability and invite authority into an explicit stored contract.
2. Harden approval-step binding so final approval is tied to the exact asset/version identity.
3. Run one real review loop: share -> comment -> approve -> final delivery.
4. Add smoke coverage for `/api/health`, `/review/[token]`, and one asset review API path.

## Explicit Non-Goals For This Pass

- No redesign of the player-first review workspace.
- No split into separate public and internal apps.
- No vendor/cloud storage pivot without first documenting the storage authority decision.
