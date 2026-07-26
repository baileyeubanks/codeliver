# Co-Deliver State Machines

Date: 2026-06-27
Status: L0 state-machine map.

## Assets

Schema statuses:

- `draft`
- `in_review`
- `approved`
- `needs_changes`
- `final`
- `processing`
- `ready`
- `failed`

Evidence:

- Base migration creates `draft`, `in_review`, `approved`, `needs_changes`, `final`.
- `013_transcode_jobs.sql` extends assets with `processing`, `ready`, `failed`.
- TUS finalization creates media as `processing`; non-media can become `ready`.
- Approval decisions can update asset to `approved` or `needs_changes`.

Gap: no single documented state transition authority exists.

## Reviews

Schema statuses:

- `open`
- `completed`
- `cancelled`

Gap: `reviews` table appears less central than token review links and is not proven as lifecycle authority.

## Review Invites

Current effective states:

- active implied by row existing and not expired
- expired by `expires_at`
- view-limited by `max_views` and `view_count`
- revoked by DELETE row removal

Gap: no `active` column is present in migration 001/004, but `lib/workers/cleanup.ts` attempts to update `review_invites.active = false`. That is schema drift unless another unapplied migration exists.

## Approvals

Approval statuses:

- `pending`
- `approved`
- `approved_with_changes` in code/types
- `rejected`
- `changes_requested`

Gap: base migration status check lacks `approved_with_changes`; code uses it. Migration proof is required.

Approval workflow statuses:

- `active`
- `completed`
- possibly other app-level states, not fully mapped in L0.

## Notifications

Notification states:

- unread/read via `notifications.read`
- preferences via `notification_preferences`

Gap: email send status is not centralized or idempotent.

## Webhooks

Webhook states:

- `active`
- delivery log via `webhook_deliveries.response_code`

Gap: outbound webhook delivery is fire-and-forget without retry/idempotency proof.
