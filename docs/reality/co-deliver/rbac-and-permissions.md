# Co-Deliver RBAC And Permissions

Date: 2026-06-27
Status: L0 RBAC map.

## Internal Roles

`lib/utils/permissions.ts` defines role permissions for:

- owner
- admin
- member
- viewer

Team tables:

- `teams`
- `team_members`
- `team_invites`

RBAC helper:

- `lib/middleware/rbac.ts`

## Project/Asset Ownership

Core project and asset access is owner-scoped through:

- `getOwnedProject`
- `getOwnedAsset`
- `getOwnedWorkflow`
- `getOwnedReviewInvite`

## External Permissions

Review invite permissions:

- `view`
- `comment`
- `approve`

## Gaps

- Existing docs already state internal collaboration remains narrow and owner-scoped.
- Team RBAC is present but not proven end-to-end against project/assets in L0.
- External approval identity is reviewer-email based, not strong recipient identity.
- Public token access does not equal media stream access for NAS-backed assets.

