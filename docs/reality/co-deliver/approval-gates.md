# Co-Deliver Approval Gates

Date: 2026-06-27
Status: L0 approval authority map.

## Current Approval Model

Tables:

- `approval_workflows`
- `approvals`
- `approval_history`

Routes:

- `/api/approvals/workflow`
- `/api/approvals/notify`
- `/api/assets/[id]/approvals`
- `/api/review/[token]/approvals`

Helpers:

- `lib/review-invites.ts`
- `lib/approval-decisions.ts`

## Current Decision Rules

- Public approve links require `permissions = approve`.
- Public approval access is derived from reviewer email plus active pending approval step.
- Sequential workflows allow only the first pending step.
- `recordApprovalDecision` writes decision status and `approval_history`.
- If all steps are approved, asset status becomes `approved` and workflow can become `completed`.
- Change/reject decisions set asset status to `needs_changes`.

## P0/P1 Gaps

- Approval links are not explicitly bound to an approval-step foreign key.
- Code uses `approved_with_changes`, but base schema status check in migration 001 does not include it.
- New version upload resets `approval_steps`, not `approvals`.
- Export/download does not enforce an approval gate.
- Approval does not bind to a specific version in the current code path.
- Final delivery can be framed by share intent without a durable approval-package contract.

