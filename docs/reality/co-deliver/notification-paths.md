# Co-Deliver Notification Paths

Date: 2026-07-15
Status: Transactional gateway checkpoint; durable outbox remains open.

## Providers

- Email provider: Resend via `lib/email.ts`.
- In-app notifications: `notifications` table.
- Preferences: `notification_preferences`.
- Webhooks: `webhooks` and `webhook_deliveries`.
- SMS/iMessage/Slack/Discord: absent in current repo.

## Governed Send Paths

- `app/api/assets/[id]/share/route.ts` and `app/api/assets/batch-share/route.ts` use version-bound sharing notification authority.
- `app/api/teams/invites/route.ts` sends team invitations through `dispatchTransactionalNotification` with a stable invite idempotency key.
- `app/api/assets/[id]/approvals/route.ts` and `app/api/approvals/notify/route.ts` send approval requests through the same gateway and return truthful delivery status.
- `app/api/assets/[id]/comments/route.ts` and `app/api/review/[token]/comments/route.ts` request in-app and email owner alerts through the gateway while honoring recipient preferences.
- `app/api/notifications/send/route.ts` handles explicit generic notification authority.
- `lib/notifications/adapters.ts` is the only application boundary that calls `sendEmail`.
- `lib/approval-decisions.ts` emits webhooks after approval decisions.
- `app/api/webhooks/route.ts` sends test webhooks.

## Remaining P0/P1 Gaps

- Product mutations and notification delivery are not backed by one transactional outbox. An invite, approval request, or comment can persist even when delivery fails.
- Idempotency is enforced by authority receipts, but there is no database-unique outbox key plus worker-owned retry lifecycle.
- Comment mutations do not currently expose delivery status in their response; the gateway receipt remains the audit source.
- Webhook emission is fire-and-forget and does not block state transitions.
- Webhook signatures are currently just the stored secret value, not a proven HMAC signature.
- No retry queue was proven for email or webhooks.

## Verification Snapshot

- Transactional notification and affected route tests: `40/40` pass.
- Complete repository tests: `602/602` pass.
- Repository ESLint: `0` errors and `26` warnings.
- A raw-provider scan finds `sendEmail` only in `lib/notifications/adapters.ts`.
