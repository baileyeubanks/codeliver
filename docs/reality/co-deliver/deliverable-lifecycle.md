# Co-Deliver Deliverable Lifecycle

Date: 2026-06-27
Status: L0 lifecycle map.

## Canonical Lifecycle Expected By Directive

- project_created
- deliverable_uploaded
- internal_ready
- review_link_created
- client_notified
- client_viewed
- feedback_requested
- revision_required
- revision_uploaded
- approval_requested
- approved
- final_delivery_prepared
- final_delivered
- published_or_handoff_complete
- archived

## Current Code Mapping

| Canonical state | Current evidence |
| --- | --- |
| project_created | `/api/projects`, `projects.created_at` |
| deliverable_uploaded | `/api/media/upload`, `/api/media/tus`, `/api/projects/[id]/assets`, `assets.status` |
| internal_ready | Implied by `assets.status = ready` after non-media TUS finalization or transcode completion |
| review_link_created | `/api/assets/[id]/share`, `review_invites` |
| client_notified | `sendEmail` in share and approval routes, no durable send status on invite |
| client_viewed | `/api/review/[token]` increments `review_invites.view_count` and `last_viewed_at` |
| feedback_requested | Implied by comment-enabled review links |
| revision_required | `assets.status = needs_changes`, approval decisions, comments |
| revision_uploaded | `/api/assets/[id]/versions` creates `versions` row |
| approval_requested | `approval_workflows`, `approvals`, `/api/approvals/notify` |
| approved | `approvals.status`, `assets.status = approved` |
| final_delivery_prepared | `share_intent = final_delivery` is derived, not durable |
| final_delivered | Not canonical. Export/download logs `downloaded_asset` but does not prove final package delivery |
| published_or_handoff_complete | Not canonical. Webhooks exist, no publishing handoff model proven |
| archived | Project `status = archived`; no final archive record model proven |

## Lifecycle Gaps

- `share_intent` is derived, not stored as a durable lifecycle contract.
- `final_delivery_prepared` and `final_delivered` are not distinct durable states.
- Download/export does not enforce approved-version selection.
- Archive is not tied to final package proof.
- Payment/contract gates are absent.

