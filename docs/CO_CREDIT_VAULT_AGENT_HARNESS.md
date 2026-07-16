# Co-Credit Metering And Vault Agent Harness

Status: Contract-first local/demo implementation. Not a production billing,
identity, storage, or provider-execution claim.

Canonical enterprise horizon:
`docs/strategy/co-produce-goal-extension-2026-07-14.md#enterprise-operating-horizon`

## Current Contract

This pillar keeps Co-Deliver as the organization, project, permission, billing,
and audit authority. It does not create payment activity, checkout, invoices,
customer charges, or Stripe mutations. Every metering resource has
`paymentMutation: "none"`.

`1 Co-Credit = 1,000 Co-Units`. Co-Units are non-negative safe integers. The
versioned catalog distinguishes these boundaries:

| Boundary | Examples | Co-Credit behavior |
| --- | --- | --- |
| Free collaboration | comments, approvals, manual edits, sharing, existing-proxy playback, review history, approved final downloads | zero CU, receipt may record the collaboration event |
| Paid compute | AI research/generation, transcription, translation, media analysis, generated media, new transcodes, preview/export renders | estimate -> reserve maximum -> commit actual or release -> receipt |
| Separate meter | storage byte-hours, egress bytes | never drains AI Co-Credits |

Paid operations use a deterministic rate catalog with a rate version and catalog
hash. Quotes carry min/likely/max CU, assumptions, expiration, remaining tenant
and project budgets, pricing version, and a possible-overage result. A customer
can never be charged above the reservation maximum; provider overruns are stored
as absorbed platform cost.

Tenant and project budgets are both enforced. Overage is disabled unless an
owner/admin records a time-bounded consent with CU and currency caps tied to the
same pricing version. The local/demo catalog has a non-billing pricing fixture
only. No route configures a budget or overage consent.

Every lifecycle step produces an immutable receipt and append-only hash-chained
ledger event. Idempotency records bind a request hash to each action. The
reconciliation report validates resource hashes, event chain, contiguous
sequence, idempotency uniqueness, reservation balance, at-most-once commit, and
receipt-to-ledger debit totals. Audit export is JSONL and contains no payment
action.

## Vault And Harness Contract

Vault records are immutable, project-scoped graph nodes for source artifacts,
evidence, claims, patterns, brand rules, observations, decisions, agent runs,
and usage receipts. Each record includes:

- organization/project scope, schema version, stable ID, revision, and hash
- source URI or artifact ID, captured time, source checksum, author, provenance,
  confidence, independent review status, rights, ACL, residency, and retention
- exact source spans for citations where applicable
- an immutable supersedes link; reverse supersession is derived rather than
  mutating the previous record

Claim and evidence creation verifies exact citation spans. Non-hypothesis claims
cannot be stored without evidence. Retrieval is deny-by-default and independently
checks scope, ACL action, supersession, retention, storage/processing residency,
AI-use rights, review status, source rights expiry, and injection quarantine.
Retrieved text is framed as untrusted data with record and project markers; it is
never treated as executable instructions.

Prompt-injection guards quarantine high/critical instruction override, secret
extraction, role-reassignment, encoded-instruction, and external-tool
exfiltration attempts. Agent output guards block private keys, bearer tokens,
API-key-like material, password assignments, and domains outside the project
allowlist. Audit artifacts redact vault text, agent objectives/instructions, and
proposal contents by default.

An agent run is a contract, not a model invocation. It records project scope,
capability, model/deployment/parameter lineage, prompt lineage, active usage
reservation, retrieval receipt, policy gates, deterministic seed, replay
manifest, provider timing, output hash, evaluation, and human decision. It fails
closed before provider work on missing reservation, scope, capability, provider,
model, residency, injection, source authority, rights, or confidentiality gates.
After output, exact-retrieved-span citations, schema, secrets, and external
destinations are evaluated. A passing proposal remains `awaiting_human_approval`
until an authorized human decision is appended. Replay verifies the immutable
input and output hashes; it does not claim model determinism across providers.

## Local And API Boundary

`lib/vault/local-control-plane.ts` creates an in-memory demo repository only
when `NODE_ENV !== "production"` and `CCO_CONTROL_PLANE_DEMO !== "0"`. In
production it returns `503 control_plane_unavailable`; it does not use a demo
header, anonymous project ID, or browser-provided role as a production authority.

The local route surfaces are:

- `POST /api/usage/estimate`
- `POST /api/usage/reservations`
- `POST /api/usage/reservations/:id/commit`
- `POST /api/usage/reservations/:id/release`
- `POST /api/usage/collaboration`
- `GET /api/usage/policy`, `GET /api/usage/summary`, `POST /api/usage/reconciliation`, `GET /api/usage/audit`
- `GET|POST /api/vault/records`, `POST /api/vault/retrieve`
- `GET|POST /api/vault/agent-runs`
- `POST /api/vault/agent-runs/:id/output`
- `POST /api/vault/agent-runs/:id/decision`
- `GET /api/vault/agent-runs/:id/replay`, `GET /api/vault/audit`

Development requests use `x-cco-demo-role` and `x-cco-demo-actor-id` only to
exercise local contracts. Those headers are not an authentication design.

## Recursive Loop Evidence

### Loop 1: debit correctness

Inventory found no existing metering authority, receipt lifecycle, pricing
provenance, or idempotency contract. The highest-risk gap was duplicate or
over-limit customer debits.

Implemented: deterministic estimates, dual budgets, capped/default-off overage,
per-scope serialization, hash-chained events, lifecycle receipts, provider-cost
attribution, and reconciliation.

Attack tests: concurrent reservation race, payload substitution under one
idempotency key, reserve/commit retry, over-reservation, provider overrun,
nonbillable outcomes, receipt tamper, and audit export inspection.

Measure: `tests/metering.test.ts` currently runs 16 assertions. The focused suite
passes. It caught and retained the intended boundary that a 180-second
transcription over a 60-second maximum commits only the confirmed maximum and
records the remainder as absorbed CU.

### Loop 2: knowledge and agent containment

Inventory found no vault authority, immutable evidence model, cross-project
retrieval guard, injection isolation, grounded-citation check, or human approval
contract. The highest-risk gap was data exfiltration through untrusted retrieval
or agent output.

Implemented: immutable records, exact citations, ACL/residency/retention/rights
checks, injection quarantine, untrusted retrieval framing, provider/model
allowlists, agent policy gates, evaluations, human decision events, replay, and
redacted audit export.

Attack tests: cross-project source reference, ACL denial, expired retention,
quarantined content, injected query, missing reservation, injection request,
provider drift, forged citation, secret-bearing output, external destination,
approval, replay, and export redaction.

Measure: `tests/vault-harness.test.ts` currently runs six end-to-end contract
scenarios. The focused suite passes. It found a same-tick ID collision in
retrieval receipts and agent runs; IDs now include the idempotency key.

## Three-Horizon Evolution

### Horizon 1: coherent production core

- Replace in-memory repositories with append-only durable tables and object
  manifests, preserving current hashes and IDs.
- Bind route scope and actor resolution to authenticated Co-Deliver project and
  organization authority; remove all demo-header behavior from production paths.
- Add a server-side provider adapter that accepts only planned runs and commits
  actual native usage through the metering lifecycle.
- Integrate estimate, budget, receipt, and approval components into a project
  workspace only after the production authority path is tested.
- Add end-to-end authenticated browser proof for estimate -> reserve -> governed
  proposal -> human decision -> committed/released receipt.

### Horizon 2: enterprise scale

- Add durable tenant-wide ledger transactions, unique idempotency constraints,
  transactional reservation locks, expiry sweeps, outbox events, queue
  backpressure, rate limits, and quota alert delivery.
- Reconcile provider invoices/native usage against internal receipts, preserve
  disputes and adjustment lineage, and export only settled undisputed overage
  totals to a future billing integration.
- Add delegated policy administration, provider portability, configurable rate
  cards, regional failover, audit retention, searchable exports, SLOs, traces,
  metrics, and recovery drills.
- Scale retrieval with project-partitioned indexes, bounded context budgets,
  cursor pagination, and load tests for large projects.

### Horizon 3: governed media intelligence

- Enforce customer residency, legal hold, deletion proof, regional provider
  routing, CMK/KMS controls, and policy-reviewed data transfers.
- Calibrate groundedness and safety evaluations against labeled corpora; add
  evaluator version rollouts, regression thresholds, and human-review queues.
- Make replay artifacts durable and reproducible against retained source
  snapshots, provider/model manifests, prompts, tools, policies, and native
  usage receipts.
- Enable policy-driven automation only for approved low-risk capabilities with
  automatic demotion on evaluation, budget, rights, or provider-health failure.

## Current Residual Risks And Next Gap

This is not production durable. The local adapter has no database transaction,
RLS binding, background expiration worker, encrypted object store, provider
contract, queue, alert transport, legal-hold operation, or enterprise key
management. The current next highest-risk gap is a durable repository and
authenticated organization/project authorization adapter that can preserve the
same idempotency, ledger, provenance, and audit contracts under concurrent
production traffic.
