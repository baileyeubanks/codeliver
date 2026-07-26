# Auth, Account, and Branding Enterprise Capability Map

Date: 2026-07-14
Status: Horizon 1 coherent demo slice; durable enterprise authority remains open
Canonical charter: [`docs/strategy/co-produce-goal-extension-2026-07-14.md`](strategy/co-produce-goal-extension-2026-07-14.md#enterprise-operating-horizon)

## Scope and authority boundary

This pillar owns identity presentation, account preferences, organization and
workspace policy previews, session/device previews, and versioned white-label
branding. It does not own project resources, uploads, review authority,
sharing, notifications, billing, or data migrations.

The real credential boundary is unchanged: `/api/auth/login` and
`/api/auth/signup` delegate email/password operations to the server-side
Supabase client. Browser state never verifies SSO, grants membership, changes a
role, revokes a real session, or writes a credential. `?demo=1` enables an
explicit local adapter whose state is recoverable and disposable.

## Recursive loop 1

### Inventory

The starting product had real email/password routes and a local demo profile,
but no coherent tenant model, role policy, governed session ledger, or brand
revision history. Auth pages did not share the interior shell's visual rhythm,
and settings controls did not expose their authority boundary.

### Highest-risk gap selected

Browser-restored identity data could easily be mistaken for authorization.
This loop therefore treats local storage as untrusted preferences, seeds all
identity authority from code, and fails closed on forged users, tenant IDs,
roles, provider verification, cross-tenant workspace selection, and foreign
brand revisions.

### Coherent improvement

- Versioned organization, workspace, membership, policy, feature-flag, session,
  profile, audit, and brand-revision models.
- Role plus delegated-capability evaluation without role escalation.
- Organization/workspace scoping for flags, exports, sessions, and brand layers.
- SSO, SCIM, and MFA readiness states with password fallback protected until a
  trusted SSO authority reports verification.
- Local session/device revocation previews that protect the current session.
- Redacted governance export without direct member identifiers or session IDs.
- Platform -> organization -> workspace brand inheritance with immutable draft,
  publish, archive, and rollback revisions.
- Approved local logo assets, constrained style values, color normalization,
  and automatic WCAG AA foreground selection.
- Safe return-path handling, generic authentication failures, normalized email,
  server-aligned signup validation, and demo-only account creation.
- Keyboard-complete settings tabs, visible focus, responsive settings controls,
  reduced-motion support, high contrast preference, locale/time-zone/week-start
  preferences, and a two-step local reset.

## Capability map

| Capability | Horizon 1 state | Durable authority needed for Horizon 2 |
| --- | --- | --- |
| Authentication | Real Supabase email/password boundary preserved; demo adapter explicit | Recovery, verified-email lifecycle, server rate limits, MFA enrollment and step-up |
| Organizations/workspaces | Versioned local model with tenant-scoped selection | Durable tenant IDs, membership tables, resource foreign keys, row policies, server resolver |
| Roles/delegation | Owner/admin/member/viewer model and narrow delegated capabilities | Server-issued policy decisions, approval workflow, expiry, access reviews |
| Sessions/devices | Local ledger, current-session protection, revocation preview | Provider-backed session inventory, token rotation, revocation propagation, anomaly signals |
| SSO/SCIM/MFA | Readiness states; no secret or verification writes | Domain verification, metadata/secrets vault, JIT/SCIM lifecycle, break-glass policy |
| Audit/export | Tenant-scoped redacted local export | Append-only server events, retention, signed exports, SIEM delivery, legal hold |
| Preferences | Demo persistence for appearance, locale, time zone, week start | Account/org defaults, supported message catalogs, regional formatting, sync conflict policy |
| Brand inheritance | Platform/org/workspace resolution with provenance | Durable revisions, author approvals, asset pipeline, CDN invalidation, domain mapping |
| Brand versioning | Draft/publish/archive/rollback and corruption recovery | Optimistic concurrency, scheduled publish, approvals, immutable receipts, deterministic replay |
| Feature flags | Organization/workspace-scoped local evaluation | Server evaluation context, staged rollout, kill switches, exposure audit, cache policy |
| Accessibility | Semantic controls, roving tabs, focus, reduced motion, contrast computation | Automated axe gate, assistive-tech matrix, translated accessible names, VPAT evidence |
| Migration | Schema-versioned local recovery; unknown versions reset safely | Additive server migration, shadow comparison, backfill receipts, rollback rehearsal |

## Authority matrix

| Operation | Current authority | Demo behavior | Production requirement |
| --- | --- | --- | --- |
| Sign in/sign up | Supabase through server routes | Local demo session only | Keep provider errors private and enforce abuse controls server-side |
| Change role or membership | None in this slice | Seeded roles are immutable | Tenant-scoped server command with approval and audit |
| Delegate capability | Local owner policy | Mutates demo ledger | Server authorization, expiry, approval, revocation, event receipt |
| Verify SSO/SCIM | None in this slice | Status cannot become trusted from storage | Verified-domain and provider callback authority |
| Revoke session | None in this slice | Marks a non-current demo session revoked | Auth-provider revocation and token invalidation |
| Publish brand | Local owner/admin capability | Publishes a tenant-scoped local revision | Server transaction, concurrency guard, asset ownership check, cache purge |
| Export governance | Local owner/admin capability | Downloads redacted demo JSON | Authorized asynchronous export with retention and audit receipt |

## Attack and accessibility evidence

Focused tests cover external and auth-loop return paths, control characters,
generic auth errors, forged browser authority, cross-tenant workspace and brand
access, narrow delegation, authentication-path lockout, current-session
protection, unknown-schema recovery, export redaction, unsafe colors, unapproved
logos, inheritance order, publication, and rollback.

Browser checks cover desktop and 375-pixel auth layouts, desktop and mobile
settings, keyboard tab navigation, visible keyboard focus, disabled managed
identity controls, demo signup, safe post-auth routing, session revocation,
brand draft/publish persistence, and local reset. Exact command results and
viewport measurements are reported with the implementation handoff.

## Safe migration path

1. Define canonical organization, workspace, membership, policy, session,
   feature exposure, brand revision, and audit event contracts with immutable
   tenant IDs and explicit schema versions.
2. Add server storage and row-level tenant enforcement additively. Do not infer
   tenant authority from email domain or browser state.
3. Introduce a read-only server adapter behind a default-off flag and compare
   decisions with the demo model using redacted diagnostics.
4. Backfill tenant/resource links in bounded batches with counts, rejection
   reports, restart checkpoints, and no credential migration.
5. Cut reads to the server resolver by tenant cohort. Keep password fallback
   until SSO verification and break-glass access are independently proven.
6. Enable server writes with idempotency keys, optimistic concurrency, append-only
   audit receipts, and a rehearsed rollback to the prior read path.
7. Remove the local governance adapter from managed accounts only after parity,
   isolation, accessibility, recovery, and disaster-recovery gates pass.

## Horizon alignment

**Horizon 1: coherent production core.** This slice delivers complete demo
interactions and explicit external boundaries. It does not claim durable tenant
authorization or production white-label delivery.

**Horizon 2: enterprise scale.** The target is provider-portable identity,
server-enforced tenant policy, delegated administration, auditable lifecycle
automation, brand delivery observability, SLOs, disaster recovery, and
large-tenant performance.

**Horizon 3: governed media intelligence.** Identity and brand decisions must
be replayable inputs to policy-driven agents, residency and legal-hold rules,
global delivery, and deterministic audit reconstruction. Agent actions cannot
self-grant authority or bypass human approval.

## Residual risks

1. Critical: project and API resources do not yet consume a shared server-side
   tenant/policy decision, so this local model is not an authorization layer.
2. Critical: recovery, MFA, SSO, SCIM, device inventory, and revocation lack
   durable provider lifecycle implementations and abuse controls.
3. High: audit records and feature exposure events are local and neither
   append-only nor independently retained.
4. High: brand assets are allowlisted demos; upload ownership, malware checks,
   transformations, CDN invalidation, and custom-domain proof are absent.
5. High: brand publication has no server concurrency guard, approval quorum,
   scheduled release, or cross-region rollback receipt.
6. Medium: localization is preference-ready but only English interface strings
   exist, and assistive-technology certification is not complete.
7. Medium: credential policy still inherits the existing six-character server
   minimum and needs a product-level password and recovery policy decision.

## Explicit next loop

Select the shared server-side tenant authority contract as the next highest-risk
gap. Inventory every authenticated route and resource that currently lacks an
organization/workspace decision; define an additive policy-resolver contract;
attack-test cross-tenant IDs, stale roles, revoked sessions, and confused-deputy
calls; measure decision coverage and latency; then stage a shadow-read adapter
with rollback proof. That work requires conductor coordination because it
crosses this pillar's assigned files and must align project, storage, sharing,
billing, and audit authorities before any migration is written.

Per the canonical Enterprise Operating Horizon, isolated tests are evidence for
this contribution, not a claim that the product pillar is complete. The
conductor still owns cross-pillar integration and the requirement-by-requirement
completion audit.
