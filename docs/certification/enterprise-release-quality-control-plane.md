# Co-Deliver Enterprise Release and Quality Control Plane

Status: living, release-blocking governance artifact  
Canonical charter: `docs/strategy/co-produce-goal-extension-2026-07-14.md`, especially **Enterprise Operating Horizon** and **Release Gates**  
Machine authority: `scripts/certification/receipts/latest.json`

## Purpose

This control plane turns route certification into a durable quality and governance pillar. It inventories the dirty checkout as the release candidate, maps every page and API to a canonical enterprise pillar, derives proof obligations, evaluates current evidence, records residual risk, and selects the next highest-risk gap.

It does not treat isolated unit tests, demo screenshots, or prose as production certification. Accepted proof is bound to the current commit and complete release-candidate fingerprint, expires by policy, and must cover failure behavior as well as the happy path.

### Immutable execution contract

Certification never runs release commands directly in the dirty shared checkout. It waits for two matching captures, copies the complete tracked and non-ignored untracked candidate, verifies that copy, and runs each command in a fresh disposable clone. Receipt and proof directories are excluded from source hashing to prevent recursive invalidation. The command evidence records the commit, dirty fingerprint, source fingerprint, before/after execution fingerprints, timeout result, and whether the command attempted to mutate candidate source.

The live checkout is observed again after all commands. A later source state does not erase valid historical command output, but it does fail `governance.snapshot-stability` and blocks release because that output no longer certifies the current checkout. Snapshot acquisition is bounded to eight 500 ms settling attempts; lint, typecheck, and test commands are bounded to 180 seconds each, while the production build is bounded to 300 seconds.

Required readiness checks fail closed when remote probing is disabled. Database and local/NAS storage probes have an independent bounded timeout capped at 10 seconds, and only redacted error classes cross the health API boundary.

## Canonical Model

Every enterprise pillar spans all three operating horizons:

| Horizon | Release question | Minimum proof |
| --- | --- | --- |
| H1: coherent production core | Does the real workflow work end to end with durable version data and complete mobile/desktop interaction? | Production authority, persistence, desktop/mobile, keyboard, accessibility, security invariants |
| H2: enterprise scale | Does it remain correct under tenants, delegation, retries, load, queues, provider loss, rollback, and recovery? | Concurrency, idempotency, backpressure, portability, degraded dependencies, synthetics, SLOs, load, DR |
| H3: governed media intelligence | Can policy, data, AI, billing, and delivery decisions be explained, retained, restored, and deterministically replayed? | Immutable audit, residency, legal hold, lineage, calibrated evaluation, budget authority, human gates, replay |

All pillars declare which shared authorities they preserve: identity, tenant, project, version, permission, billing, and audit. No module may create a second authority for those concerns.

## Living Pillar Matrix

The JSON manifests under `scripts/certification/pillars/` are authoritative. The current risk posture is:

| Enterprise pillar | H1 current workflow | H2 enterprise scale | H3 regulated/governed | Highest residual risk |
| --- | --- | --- | --- | --- |
| Identity, organizations, policy, preferences, branding | Failed/unverified | Unverified | Unverified | Production settings and branding still depend on demo-local authority; full auth lifecycle lacks commit-bound proof |
| Project, asset, version, comment, approval, audit | Failed | Unverified | Failed/unverified | Approval status/schema drift and non-transactional version creation can produce contradictory state |
| Upload, storage, processing, derivatives, continuity | Failed | Unverified | Unverified | Active multipart and resumable paths do not consistently prove filename and project authority |
| Sharing manifests, permissions, notifications, delivery | Failed | Failed/unverified | Failed/unverified | Public invite policy, unenforced password/download/watermark controls, recipient selection, and webhook egress remain unsafe |
| Transcript, waveform, captions, candidates, reversible editing | Unverified | Unverified | Unverified | Source/checksum separation, analysis lineage, A/V sync, and deterministic replay lack executable proof |
| Creator workspace, mobile review, desktop cockpit, collaboration | Unverified | Unverified | Unverified | Existing visuals are not current commit-bound desktop/mobile/keyboard/screen-reader proof |
| Co-Credit, budgets, usage receipts, commercial controls | Unverified | Unverified | Unverified | Estimate/reserve/settle/release, at-most-once debit, and permanent client grant continuity are not certified |
| Vault knowledge, provenance, rights, agents, human approval | Unverified | Unverified | Unverified | Cross-project retrieval, source provenance, model/prompt lineage, budget scope, and human approval are not certified |
| Certification, security, accessibility, resilience, release governance | Partial | Unverified | Unverified | Static gates are not all green; build, synthetics, load, rollback, restore, and regulated proof remain absent |

The table is intentionally conservative. A row moves to certified only when all required checks for that horizon pass in the machine receipt.

## Route and Journey Authority

The harness discovers `app/**/page.*` and `app/**/route.*` on every run. Any new route without a matching pillar surface fails `inventory.route-coverage`.

Current page families:

- `/`, `/login`, `/signup`
- `/projects`, `/projects/new`, `/projects/[id]`, `/projects/archive`, `/projects/trash`
- `/projects/[id]/assets/[assetId]`
- `/reviews`, `/library`, `/activity`, `/settings`
- `/review/[token]`

Current API families:

- Identity and policy: `/auth/callback`, `/api/auth/**`, `/api/teams`, `/api/teams/**`
- Workflow: `/api/projects`, `/api/projects/**`, `/api/assets`, `/api/assets/**`, `/api/comments/**`, `/api/approvals/**`, `/api/versions/**`, `/api/activity`, `/api/folders`
- Media: `/api/media/**`, `/api/upload/**`, `/api/storage/**`
- Delivery: `/api/review/**`, `/api/sharing/**`, `/api/notifications`, `/api/notifications/**`, `/api/webhooks`
- Intelligence and accounting boundary: `/api/ai/**`, `/api/analytics/**`
- Operations: `/api/health`, `/api/health/live`, `/api/health/ready`, `/api/health/dependencies`

Exact route files, exported HTTP methods, route counts, and state files are saved in every receipt. The source inventory is authoritative over this summary when concurrent work adds a route.

Nine journey manifests currently cover current workflows, enterprise resilience, and governed operations:

| Journey | Exact start/end authority | Required attack tests |
| --- | --- | --- |
| `auth-lifecycle` | `/signup` and `/login` through `/api/auth/logout` | Invalid/expired sessions, same-origin redirects, provider timeout, cross-tab sign-out, keyboard and mobile |
| `project-ingest-review-approval` | `/projects/new` through version-specific approval | Filename/path escape, cross-tenant project ID, quota, reconnect, parallel chunks, duplicate versions, transcode/database failure |
| `review-annotation-approval` | Internal asset review through comment, cut decision, and approval | Keyboard conflicts, coordinate/time validation, concurrent comments, stale version approval, realtime loss |
| `settings-brand-notifications` | `/settings` through persisted preference and authorized delivery | Role checks, cross-device persistence, opt-out enforcement, provider outage, duplicate send, brand rollback |
| `sharing-public-review` | `/api/assets/[id]/share` through external review, expiry, and revocation | Token enumeration, password, immutable version, atomic view limit, download/watermark enforcement, email failure |
| `enterprise-media-resilience` | Resumable ingest through transcode, readiness withdrawal, reconciliation, and recovery | Backpressure, duplicate workers/chunks, storage loss, provider failover, rollback |
| `co-credit-lifecycle` | Quote through reservation, execution, settlement/release, reconciliation, and audit | Concurrent caps, at-most-once debit, free collaboration, failure outcomes, payment isolation |
| `vault-agent-governance` | Project-scoped retrieval through proposal, validation, human decision, audit, and replay | Cross-project retrieval, injection, stale policy, budget exhaustion, forged citations, model drift |
| `regulated-continuity-release` | Release candidate through dependency loss, restore, audit export, and Continuity Pack | Residency, legal hold, RPO/RTO, chain integrity, client grant independence |

Every journey must include desktop and mobile viewports, accessibility, security, persistence, concurrency, degraded dependency, rollback, and performance budgets. Missing any dimension is a contract failure.

## Release Gates

| Gate | Scope | Blocking conditions |
| --- | --- | --- |
| G0: static integrity | Manifest validity, route classification, journey routes, stable source snapshot, lint, typecheck, product tests, control-plane tests, isolated production build | Any failed, missing, stale, or unexecuted required result |
| G1: coherent core | Every H1 critical/high obligation across all nine pillars | Demo-only authority, missing journey proof, unsafe authorization, schema/API drift, broken persistence, accessibility failure |
| G2: enterprise scale | Every H2 critical/high obligation | Missing tenancy attacks, idempotency, queues/backpressure, portability, load, synthetics, error-budget policy, rollback, DR |
| G3: governed operations | Every H3 critical/high obligation | Missing immutable audit, lifecycle/residency, billing lineage, agent lineage, human gates, client grant continuity, deterministic replay |

The canonical media and commercial gates are explicit check IDs:

- Source checksum unchanged before explicit publication: `media.source-checksum-invariant`
- Draft actions cannot mutate current asset/version/approval authority: `media.draft-publication-boundary`
- Comments and decisions bind exact source version/time: `consistency.version-binding`
- Retry-safe customer usage: `billing.usage-at-most-once`
- A/V sync and EDL duration: `media.av-sync-proof`
- Evidence/confidence/reversible human decision: `vault.human-approval` and `media.analysis-lineage-proof`
- No cross-project vault retrieval: `vault.cross-project-retrieval-proof`
- Client final independent of producer subscription: `billing.client-grant-continuity`
- No paid operation without entitlement/reservation: `billing.budget-enforcement`
- No request directly creates payment activity: `billing.no-direct-payment-mutation`

## Prioritized Residual Risk

The evaluator sorts critical before high, demonstrated failure before missing proof, then earlier horizons before later horizons. The first item becomes `nextHighestRisk` in the receipt.

Current P0 attack surfaces:

1. Storage path and tenant authority in `/api/media/upload`, `/api/media/tus`, `/api/upload/tus`, and final TUS placement.
2. Review link row privacy, server-side password checks, immutable version binding, download enforcement, watermark delivery, and atomic access limits.
3. Approval status contract and transactional version creation, promotion, comment carry-forward, approval reset, and activity audit.
4. Production settings/branding persistence, notification recipient authority, durable outbound delivery, and SSRF-safe signed webhooks.
5. Runtime schema references and literal API consumers that do not match migrations or route handlers.

Current P1 proof gaps:

- Full production auth through sign-out, session expiry, and redirect handling.
- Commit-bound desktop/mobile/keyboard/screen-reader journey evidence.
- Dependency fault injection, concurrency/replay, load/soak, synthetics, rollback, and restore.
- Performance proof for API mutation, media startup, player input, long transcripts, and large projects.

Current P2 governed-system gaps:

- Co-Credit budget and receipt lifecycle, at-most-once debit, dispute replay, and permanent client access.
- Vault object provenance, rights, cross-project isolation, agent source/policy/budget scope, and human acceptance.
- Model, prompt, threshold, provider, source checksum, evaluation, render, and publication lineage.
- Residency, legal hold, retention, deletion, encrypted backup integrity, and deterministic recovery/replay.

## SLO and Error-Budget Contract

The manifests currently establish these minimum targets:

- Public review availability: 99.95% over 30 days, 21.6 minutes of error budget.
- Authenticated dashboard and critical synthetics: 99.9% over 30 days, 43.2 minutes of error budget.
- Acknowledged durable mutation loss, duplicate delivery/debit, cap overrun, unreceipted billable work, unauthorized agent mutation: zero.
- Review metadata p95: 500 ms; synchronous mutation p95: 750 ms; first playable frame p95: 2,000 ms; critical player input p75: 100 ms.
- Metadata/media-manifest RPO: 15 minutes; critical review-service RTO: 240 minutes.

Error-budget consumption is a release input. Exhaustion blocks risky feature rollout until reliability recovers or an explicitly reviewed exception is recorded with owner, expiry, and rollback.

## Proof and Traceability

Journey proof must conform to `scripts/certification/proof.schema.json`. Operational proof must conform to `scripts/certification/operational-proof.schema.json`.

Accepted proof includes:

- current commit and dirty source fingerprint
- candidate file count and a full content/mode fingerprint across tracked and non-ignored untracked release files
- capture time and environment
- explicit pass/fail status
- artifacts such as test output, trace, screenshot comparison, accessibility report, load result, restore log, or audit query
- measured metrics where a budget or SLO applies

Journey proof normally expires after 7 days, visual/accessibility proof after at most 14 days, and restore proof after at most 90 days. Source changes invalidate proof immediately through fingerprint mismatch. Generated proof and receipt writes do not alter the source fingerprint.

Control-plane attack coverage includes same-status content rewrites, continuous concurrent writers, copy-time races, source-mutating commands, non-terminating commands, disabled required probes, stalled database/storage probes, and secret-bearing dependency failures.

## Recursive Enterprise Loop

Run from the repository root:

```bash
node scripts/certification/register.mjs
node scripts/certification/run.mjs --run-commands --write-receipt --summary
```

For a release candidate, add `--include-build --enforce`.

The operating loop is:

1. Discover current route, API, state, test, manifest, and evidence inventory.
2. Evaluate every obligation against current source and proof receipts.
3. Stop release at the first failed gate; retain all residual risks rather than hiding later gaps.
4. Select `nextHighestRisk`.
5. Implement one coherent product improvement in its owning lane.
6. Attack-test behavior, authorization, tenancy, persistence, accessibility, mobile/desktop, concurrency, dependencies, scale, rollback, and recovery as applicable.
7. Save source-bound proof and rerun the entire registry.
8. Recompute the capability map and select the next risk.

No pillar is complete because its isolated tests pass. The integrated receipt, cross-pillar authority contracts, and current release gates are the completion authority.
