# Co-Deliver Notification Paths

Date: 2026-06-27
Status: L0 notification map.

## Providers

- Email provider: Resend via `lib/email.ts`.
- In-app notifications: `notifications` table.
- Preferences: `notification_preferences`.
- Webhooks: `webhooks` and `webhook_deliveries`.
- SMS/iMessage/Slack/Discord: absent in current repo.

## Send Paths Found

- `app/api/assets/[id]/share/route.ts` sends review invite email directly through `sendEmail`.
- `app/api/assets/[id]/approvals/route.ts` sends approval email.
- `app/api/approvals/notify/route.ts` sends approval request email and logs activity.
- `app/api/review/[token]/comments/route.ts` sends owner comment notification email.
- `app/api/notifications/send/route.ts` creates in-app notification and optionally sends email.
- `lib/approval-decisions.ts` emits webhooks after approval decisions.
- `app/api/webhooks/route.ts` sends test webhooks.

## P0/P1 Gaps

- Multiple email send paths bypass the central notification endpoint.
- No idempotency key was found for emails.
- `sendEmail` returns `null` on missing provider or failure, but callers often continue as if the product action succeeded.
- Webhook emission is fire-and-forget and does not block state transitions.
- Webhook signatures are currently just the stored secret value, not a proven HMAC signature.
- No retry queue was proven for email or webhooks.

