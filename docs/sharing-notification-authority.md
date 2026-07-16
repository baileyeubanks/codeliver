# Sharing And Notification Authority

Status: Horizon 1 implementation slice. This is not a production-readiness
certification.

This pillar follows the Enterprise Operating Horizon in
`docs/strategy/co-produce-goal-extension-2026-07-14.md`. The current work
implements explicit version-bound sharing and fail-closed delivery authority;
the Horizon 2 and Horizon 3 work below remains required before an enterprise
claim is appropriate.

## Current Authority Contract

### Sharing

- Every create, preview, batch, and rotation request carries an explicit
  `asset_id` and `version_id`. The server resolves it with
  `resolveAssetVersion` and returns the resolved version identity.
- A share manifest has a request/manifest identifier, an owner-scoped tenant
  boundary, one to twenty unique asset/version items, recipients, a policy
  template, controls, and an operation (`preview` or `create`).
- Supported templates are `standard-review`, `approval-route`,
  `final-delivery`, and `regulated-review`. Regulated review requires a named
  email recipient and watermark, prohibits downloads, caps expiry at seven
  days, and carries a 2,555-day audit-retention target.
- Permissions, expiry, download, watermark, and maximum-view controls are
  validated before any link is created. Approval routes require a matching
  pending approval recipient and can only grant approval access.
- Revocation is a soft expiry, preserving the link record. Rotation creates a
  new version-bound link before revoking the previous one. Both actions emit
  audit events.
- Batch requests create an atomic set of `review_invites` where the current
  database supports it. The API returns the source version for every created
  link and groups recipient notifications without exposing a token in previews.
- Replaying a completed manifest recovers the exact version-bound links and
  re-enters notification authority. Existing delivery receipts deduplicate,
  untouched sends can resume, and an authority receipt without a delivery
  receipt remains blocked as indeterminate.

The owner ID is the tenant boundary in the current schema. It is not a
substitute for future organization membership, delegated administration, or
tenant-owned policy records.

### Notifications

- Notification requests are explicit `preview` or `send` actions. Previews do
  not write an audit record, create a link, or call a provider.
- A live send requires `confirm_live_send: true` and a 16-128 character
  idempotency key. A duplicate authority receipt is not resent.
- Each live-send key is bound to a normalized SHA-256 request fingerprint that
  covers the tenant, recipient, channels, message, action URL, and consent
  evidence. Reusing a key for different content is rejected.
- A share manifest receipt includes a canonical SHA-256 fingerprint. Reusing a
  manifest ID with changed versions, recipients, controls, or notification
  intent is rejected instead of silently returning a prior link.
- Message previews mask recipient identity and accept only relative or
  same-origin action URLs. Generic notifications may only target the current
  authenticated user and that user's verified profile email.
- Email uses the Resend adapter only when `RESEND_API_KEY` is configured.
  SMS and iMessage intentionally have no live provider adapter; they return
  `not_configured` and cannot send.
- SMS and iMessage also require explicit channel consent with source and
  recorded time. Marketing is rejected by the authority parser.
- Provider failover is available only for explicitly configured adapters and
  only after a retryable failure. Unconfigured channels are never treated as a
  fallback.
- Bounces and complaints received through the signed normalized provider event
  endpoint suppress the tenant-scoped pseudonymous channel-recipient key before
  a later send. A callback must match a recorded sent-provider message and the
  authorized recipient hash; uncorrelated events cannot create suppressions.
  The endpoint rejects all events when `NOTIFICATION_WEBHOOK_SECRET` is absent
  or invalid. The global login proxy exempts only this exact webhook path so a
  provider can reach the signature gate without an interactive user session.
- The Share modal can preview a requested live notification without confirmation
  or a provider call. A current preview is required before its live-send action;
  preview clears the confirmation, and changing the recipient, asset version, or
  access controls invalidates it. Consent timestamps remain stable across a
  network retry instead of changing the manifest fingerprint.

## Audit, Limits, And Evidence

Current audit receipts use `activity_log` with these actions:

- `share_manifest_created`, `share_link_created`, `share_link_revoked`, and
  `share_link_rotated`
- `notification_send_authorized`, `notification_send_receipt`,
  `notification_provider_event`, and `notification_recipient_suppressed`

Recipient values are SHA-256 pseudonyms in notification audit details. This
reduces routine exposure but is not anonymous data and is not a replacement for
keyed hashing, encryption, or an approved retention system.

The current advisory limits are 20 manifest items, 100 links per ten minutes,
and 20 notification channel attempts per minute. They are database-query based,
not a distributed rate-limit service; they must not be treated as a completed
abuse-control boundary. `Server-Timing` exposes request duration for the share
and notification authority routes, but durable dashboards and SLO error-budget
measurement do not yet exist.

Retention metadata records a seven-year target (2,555 days) for regulated
delivery receipts. The current schema has no retention executor, legal-hold
model, residency control, immutable export, or WORM store, so no deletion or
hold guarantee is made.

## Deliberate Fail-Closed Behavior

| Situation | Result |
| --- | --- |
| Missing asset version | Request is rejected; no unbound link is created. |
| Preview request | Validated response only; no link, audit receipt, or provider call. |
| Live send without explicit confirmation or idempotency key | Request is rejected. |
| Email credentials absent | Adapter reports `not_configured`; no email is sent. |
| SMS or iMessage selected | Adapter reports `not_configured`; no message is sent. |
| Provider receipt write fails | Result is indeterminate and automatic retry is blocked. |
| Bounce or complaint | Future matching channel sends are suppressed. |
| Uncorrelated provider event | Event is rejected; no suppression is written. |

## Cross-Pillar Boundary

This slice owns the share API, batch-share API, notification authority APIs,
and their UI controls. Existing approval/comment email paths outside this lane
are not yet routed through this authority. Consequently, the repository does
not yet have a single global notification gateway. Any new sender must use the
authority contract or remain disabled until it is migrated.

The current project cockpit mounts `DemoShareModal`, not the production
`components/sharing/ShareModal.tsx` authority surface. This slice leaves that
concurrent shell boundary intact. Browser evidence below therefore covers the
active demo sharing surface and responsive modal shell; the production modal's
authority behavior is verified by its focused lint, parser/service tests, and
the API contract until the project shell explicitly adopts it.

## Residual Risks And Next Gap

The highest-risk remaining capability is durable cross-request delivery state:
a tenant-scoped policy/consent/suppression schema plus transactional outbox,
unique idempotency constraints, worker retries, and a distributed rate limiter.
That work requires database migrations and provider decisions, which are
outside this slice's write boundary.

Horizon 2 completion also needs organization tenancy and delegated admins,
persisted policy templates, verified recipient identity, consent lifecycle,
provider adapters and webhook mapping, queue backpressure, real failover,
delivery dashboards, SLOs, DR exercises, and migration of every sender through
the gateway.

Horizon 3 requires residency, legal hold, immutable audit export, retention
execution, provider-independent replay, policy-driven automation, and
auditable decision/model lineage. These remain explicit residual risks rather
than implicit product promises.

## Verification

Checks run against the shared worktree on July 14, 2026:

```sh
npx eslint components/sharing components/notifications 'app/api/assets/[id]/share/route.ts' \
  app/api/assets/batch-share app/api/notifications lib/sharing lib/notifications \
  tests/share-manifest.test.ts tests/notification-authority.test.ts \
  tests/notification-provider-events.test.ts tests/share-notification-authority.test.ts proxy.ts
npm run typecheck
npm test
git diff --check
```

The focused ESLint run, repository-wide typecheck, and `git diff --check` are
clean. The full test suite passes 168 tests with zero failures. Repository-wide
`npm run lint` remains blocked outside this slice by four
`react-hooks/set-state-in-effect` errors in `app/login/page.tsx` and
`components/projects/ProjectCockpit.tsx`; its remaining findings are 54
warnings. The focused sharing/notification lint has no findings.

The focused tests cover explicit version binding, cross-tenant and duplicate
manifest rejection, regulated/approval governance, preview no-send behavior,
explicit live authority, consent, anti-phishing URLs, unconfigured adapter
fail-closed behavior, retryable failover, rate evaluation, signed provider
events, and bounce/complaint suppression.

Read-only proof used the already-running server on port 4103. `/login` and the
demo project cockpit rendered at desktop and 390 by 844 mobile dimensions, and
the existing Share project media modal opened without overlap. The only browser
console error was the pre-existing missing favicon request. Protected sharing,
batch-sharing, and notification-send GET probes returned `503
AUTH_NOT_CONFIGURED`, which prevents authenticated data-backed API proof in this
local environment. A GET probe to the exact provider-event path returned `405`,
showing that it bypasses interactive login and reaches its route-level
signature gate. No POST request, provider call, credential change, live message,
deployment, or push was performed.
