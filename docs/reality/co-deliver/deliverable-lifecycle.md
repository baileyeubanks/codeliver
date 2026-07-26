# Co-VideoPro Deliverable Lifecycle

Date: 2026-07-26
Status: CCO-C5A source map plus hardening at M2 application-source baseline
`2639e8973211476649f95029d1a3d33a5fccf57d`

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
| deliverable_uploaded | Source contract only: canonical `/api/upload/tus` commits bytes and atomically attaches one asset plus exact V1 after a clean scan |
| internal_ready | Not proved. Managed asset/V1 source exists, but the migration is unapplied and production scanner/derivative readiness is open |
| review_link_created | `/api/assets/[id]/share`, `review_invites` |
| client_notified | `sendEmail` in share and approval routes, no durable send status on invite |
| client_viewed | `/api/review/[token]` increments `review_invites.view_count` and `last_viewed_at` |
| feedback_requested | An active valid invite can create an exact-version, safely projected public frame comment with a complete 0–100 pin pair in source; database and runtime proof remain absent |
| revision_required | `assets.status = needs_changes`, approval decisions, comments |
| revision_uploaded | Not implemented as a governed writer. Arbitrary `POST /api/assets/[id]/versions` is intentionally `410 Gone` |
| approval_requested | `approval_workflows`, `approvals`, `/api/approvals/notify` |
| approved | Generic asset PATCH cannot set this state; approval source exists, but attributable exact-version approval is not end-to-end proved |
| final_delivery_prepared | `share_intent = final_delivery` is derived, not durable |
| final_delivered | Not canonical. Export/download logs `downloaded_asset` but does not prove final package delivery |
| published_or_handoff_complete | Not canonical. Webhooks exist, no publishing handoff model proven |
| archived | Project `status = archived`; no final archive record model proven |

## Lifecycle Gaps

- The CCO-C5A catalog migration is unapplied; no live database, RPC, privilege,
  provider, or real-file runtime receipt exists.
- The frame-pin migration is unapplied and deliberately aborts if any legacy
  pin exists; legacy coordinate remediation requires a separate approved
  decision.
- Anonymous review-token playback has not been bridged to and proved against
  the managed exact-version route.
- Legacy multipart/TUS, metadata-only asset, and arbitrary V2 writers are
  retired. They cannot be cited as lifecycle evidence.
- `share_intent` is derived, not stored as a durable lifecycle contract.
- `final_delivery_prepared` and `final_delivered` are not distinct durable states.
- Download/export does not enforce approved-version selection.
- Archive is not tied to final package proof.
- Payment/contract gates are absent.
- No current receipt proves the complete sequence: real upload → asset → V1 →
  playback → anonymous frame comment → attributable approval → lock → final
  delivery.
