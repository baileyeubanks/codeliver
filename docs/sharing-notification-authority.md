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
- A share manifest has a request/manifest identifier, an explicit canonical
  tenant key (`personal:<uuid>` or `team:<uuid>`), one to twenty unique
  asset/version items, recipients, a policy template, controls, and an
  operation (`preview` or `create`). Every item in a manifest must resolve to
  that same tenant authority.
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
- Limited-view links are claimed through one atomic database operation keyed by
  the token hash and a stable client request UUID. Password authorization occurs
  before the claim. A short-lived signed, HttpOnly media grant preserves the
  final permitted playback without incrementing the view count a second time.
  Missing, malformed, revoked, expired, exhausted, or cross-project claims fail
  closed.

Personal projects derive authority from the owner; team projects derive it from
the team. The kind is part of the key, so the same UUID cannot be confused
across personal and team boundaries. This does not complete delegated
administration or tenant-owned policy records.

### Notifications

- Notification requests are explicit `preview` or `send` actions. Previews do
  not write an audit record, create a link, or call a provider.
- A requested live send requires `confirm_live_send: true` and a 16-128
  character idempotency key. A duplicate authority receipt is not re-enqueued.
- Each live-send key is bound to a normalized SHA-256 request fingerprint that
  covers the tenant, recipient, channels, message, action URL, and consent
  evidence. Reusing a key for different content is rejected.
- A share manifest receipt includes a canonical SHA-256 fingerprint. Reusing a
  manifest ID with changed versions, recipients, controls, or notification
  intent is rejected instead of silently returning a prior link.
- Message previews mask recipient identity and accept only relative or
  same-origin action URLs. Generic notifications may only target the current
  authenticated user and that user's verified profile email.
- In `co_production`, external email, SMS, and iMessage requests stop at the
  durable outbox. External delivery is hard-disabled; no provider adapter is
  loaded or called. Legacy/demo behavior remains isolated from this authority.
- SMS and iMessage also require explicit channel consent with source and
  recorded time. Marketing is rejected by the authority parser.
- The outbox uses tenant-and-channel-bound idempotency, monotonic lease fencing,
  bounded retries, dead-letter state, and immutable event and receipt chains.
  Worker claim, renewal, and settlement operations remain scoped to the exact
  personal or team tenant.
- Durable payloads contain reference-only intent data. They reject recipient
  identities, bearer material, review URLs, cookies, secrets, message bodies,
  subjects, and titles. Recipient identity is represented only by a SHA-256
  pseudonym plus a redacted display value. A future authorized worker must
  resolve delivery content from the authoritative source record at send time.
- The existing provider-event endpoint remains a legacy correlation surface and
  is not an enabled `co_production` worker contract. Provider activation,
  webhook normalization, and suppression settlement require a separate,
  explicitly authorized implementation before external delivery can be turned
  on.
- The Share modal can preview a requested live notification without confirmation
  or a provider call. A current preview is required before its live-send action;
  preview clears the confirmation, and changing the recipient, asset version, or
  access controls invalidates it. Consent timestamps remain stable across a
  network retry instead of changing the manifest fingerprint.
- Team invites, asset approval requests, approval reminders, internal comment
  alerts, public-review comment alerts, and the generic notification endpoint
  now enter the same transactional gateway. In `co_production`, their external
  channels enqueue only; application routes do not call a provider directly.
- Transactional comment alerts request in-app and email delivery, enforce the
  recipient's persisted preferences, and fail closed when those preferences
  cannot be resolved. Team and approval endpoints return the actual delivery
  status instead of implying that an email was sent.

## Audit, Limits, And Evidence

Current audit receipts use `activity_log` with these actions:

- `share_manifest_created`, `share_link_created`, `share_link_revoked`, and
  `share_link_rotated`
- `notification_send_authorized`, `notification_send_receipt`,
  `notification_provider_event`, and `notification_recipient_suppressed`

The durable queue adds immutable `notification_outbox_events` and
`notification_outbox_receipts` records. Its migration exists in the repository
and has been validated in a disposable PostgreSQL 15 instance; it has not been
applied to production.

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
| `co_production` external channel selected | Request is durably queued with external delivery disabled; no provider is called. |
| Payload contains a URL, token, recipient, or message text | Request is rejected before persistence. |
| Queue authority fails | Route returns one stable, recipient-safe failure; no provider is called. |
| Provider receipt write fails | Result is indeterminate and automatic retry is blocked. |
| Bounce or complaint | Future matching channel sends are suppressed. |
| Uncorrelated provider event | Event is rejected; no suppression is written. |

## Cross-Pillar Boundary

This slice owns the share API, batch-share API, notification authority APIs,
their UI controls, and the shared transactional gateway used by team invites,
approval requests and reminders, and internal/public-review comment alerts.
All application email paths now enter notification authority before reaching a
provider adapter. Any new sender must use this gateway or remain disabled until
it is migrated.

The current project cockpit mounts `DemoShareModal`, not the production
`components/sharing/ShareModal.tsx` authority surface. This slice leaves that
concurrent shell boundary intact. Browser evidence below therefore covers the
active demo sharing surface and responsive modal shell; the production modal's
authority behavior is verified by its focused lint, parser/service tests, and
the API contract until the project shell explicitly adopts it.

## Residual Risks And Next Gap

The durable queue, tenant-scoped idempotency, retry state, lease fencing, and
immutable delivery history are now implemented but not production-migrated.
The highest-risk remaining gap is atomic coupling between a source mutation and
its outbox insert. An invite, approval request, or comment can persist before an
enqueue failure is returned, so a blind retry can duplicate the source
mutation. Horizon 2 must either move each mutation and enqueue into one database
transaction or return an honest `delivery_pending` result with a reconciliation
job. The current fail-closed `503` must not be described as transactionality.

Horizon 2 completion also needs delegated admins, persisted policy templates,
verified recipient identity, consent lifecycle, an explicitly authorized
provider worker and webhook contract, queue backpressure, distributed rate
limits, delivery dashboards, SLOs, DR exercises, and atomic mutation/outbox
workflows.

Horizon 3 requires residency, legal hold, immutable audit export, retention
execution, provider-independent replay, policy-driven automation, and
auditable decision/model lineage. These remain explicit residual risks rather
than implicit product promises.

## Verification

Checks run against the shared worktree on July 15, 2026:

```sh
npx eslint components/sharing components/notifications 'app/api/assets/[id]/share/route.ts' \
  app/api/assets/batch-share app/api/notifications lib/sharing lib/notifications \
  tests/share-manifest.test.ts tests/notification-authority.test.ts \
  tests/notification-provider-events.test.ts tests/share-notification-authority.test.ts proxy.ts
npm run typecheck
npm test
git diff --check
```

The current combined atomic-sharing and durable-notification regression set
passes `51/51`. The focused ESLint run and TypeScript check pass. A disposable
PostgreSQL 15 proof applied the migration, accepted a reference-only personal
tenant payload, isolated personal and team worker claims, rejected cross-tenant
access, and rejected a payload containing an action URL. Full-suite, production
build, and certification counts are refreshed after the concurrent media-ingest
lane lands; no stale repository-wide count is asserted here.

The focused tests cover explicit version binding, atomic and replay-safe view
claims, final-view media grants, cross-tenant and duplicate manifest rejection,
regulated/approval governance, preview no-send behavior, explicit queue
authority, preference defaults, anti-phishing URLs, reference-only payloads,
tenant-scoped idempotency, lease fencing, bounded retries, immutable events and
receipts, and the absence of direct provider calls in application routes.

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
