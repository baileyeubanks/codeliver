# Token Metering, Production Vault, And Agent Harness Hardening

Date: 2026-07-14

Authority: `docs/strategy/co-produce-goal-extension-2026-07-14.md`, especially
`Vault-Backed Knowledge System`, `Agent Harness`, and
`Co-Credit And Usage Contract`.

This record covers one bounded hardening wave. It does not claim that the
production data plane, payment integration, provider execution plane, or the
enterprise operating horizon is complete.

## Scope And Safety Boundary

The implementation preserves the product accounting distinction:

- model tokens and other provider measures remain native audit dimensions
- native measures are deterministically converted to integer Co-Units (CU)
- `1 Co-Credit = 1,000 CU`
- CU is not currency, stored value, or a payment instruction
- no request in this pillar can charge a card or mutate payment state

The local control plane is unavailable when `NODE_ENV=production`. The agent
harness has no provider executor and defaults to rejecting usage authority when
no verifier is installed. Every stored agent run is `proposal_only` with
network, filesystem, secrets, external writes, and tools denied. Cancellation
and rollback therefore record lifecycle decisions without attempting a live
external reversal.

No deployment, migration, credential access, payment action, notification, or
production write was performed in this wave.

## Metering Invariants

The metering boundary now enforces:

- collision-safe organization/project/idempotency keys
- runtime role and actor-kind validation at privileged boundaries
- integer-only rates, native usage, balances, caps, and provider cost
- overflow-safe estimation, balance arithmetic, alerting, and currency caps
- immutable rate, pricing, budget, quote, reservation, receipt, and request
  provenance through SHA-256 integrity hashes
- immutable budget history so an old quote remains reconcilable after a policy
  replacement
- subscription plan, entitlement status, operation allowlist, and maximum
  reservation checks before expensive work can be reserved
- organization and project budget enforcement in one repository transaction
- overage disabled by default and bounded by matching CU, currency, scope,
  pricing version, and expiration
- append-only, hash-chained ledger events and integrity-bound audit receipts
- integrity-protected, append-only idempotency records with payload-substitution
  rejection and replay target validation
- at-most-once reservation settlement and explicit release/expiration receipts
- zero customer debit for failure, duplicate, unusable output, safety rejection,
  cache hit, and platform retry outcomes
- platform absorption above the customer-confirmed reservation maximum
- deterministic reconciliation across policies, ledger chains, quotes,
  reservations, receipts, events, and idempotency indexes
- `paymentMutation: "none"` on every accounting resource and event

The in-memory repository is a reference adapter. Its global transaction queue
and rollback snapshots prove the required semantics under tests; they are not a
substitute for a durable, multi-process database transaction.

## Vault Invariants

The project vault now enforces:

- collision-safe tenant/project keys and exact project isolation
- explicit actor capabilities in addition to role checks for every read,
  retrieval, write, export, plan, submit, approve, cancel, rollback, and audit
  action
- immutable policy history and integrity verification before policy use
- append-only records with source checksum, captured time, author, provenance,
  confidence, independent review status, revision, and supersession links
- exact citation locators tied to readable, same-project source and evidence
  records
- deny-by-default ACLs, rights, retention, legal-hold, residency, and provider
  policy checks
- prompt-injection and secret-exfiltration quarantine before agent grounding
- retrieval receipts bound to request, policy, source integrity, exact spans,
  denials, processing region, and an explicit context character budget
- fail-closed reads and retrieval when stored content or replay indexes fail
  integrity verification
- redacted audit export that omits retrieved context and hashes external source
  identifiers
- deterministic reconciliation across policy history, records, citations,
  retrieval receipts, audit chains, agent runs, run events, and idempotency
  records

Vault records are the authority. Retrieved context is delimited untrusted input,
and a retrieval receipt never upgrades an inference, hypothesis, or unreviewed
record into an approved fact.

## Agent Harness Invariants

The agent harness now binds each run to:

- one project, execution principal, capability, objective, instruction, source
  set, model lineage, prompt lineage, policy version, deterministic seed, and
  usage reservation
- a capability-specific metering operation
- a deny-all execution permission hash in both the run contract and replay
  manifest
- one integrity-checked retrieval receipt and its exact source hashes
- a bounded reservation-attempt count with no overlapping active run
- a versioned proposal, exact citations, evaluation result, and human decision
- append-only lifecycle events with per-run hash chaining

Usage authority is checked before plan persistence, before output acceptance,
and again before human approval. Only the run's bound agent or service principal
may submit output. Provider events are not recorded after stale usage authority
is detected. Unsupported claims, forged locators, secrets, external
destinations, disallowed rights, restricted data, provider drift, model drift,
or prompt injection block progress before approval.

Cancellation is explicit, authorized, reasoned, idempotent, and terminal for an
active proposal-only run. Rollback is a separate human-authorized append-only
decision available only after approval. Because this harness performs no live
effects, rollback truthfully records `sideEffectsReversed: "none_required"`.

The final contract includes the coordinator-required fields that were missing
during concurrent assembly: cancellation and rollback in `AgentRunView`,
`executionPermissionsHash` in `AgentReplayManifest`, `executionMode` and
permissions in `AgentRunContract`, and context character count and limit in
`VaultRetrievalReceipt`.

## Adversarial Proof

Dedicated hardening tests cover:

- delimiter-based tenant key collisions
- partial-write rollback and concurrent budget serialization
- idempotency overwrite, payload substitution, index corruption, and orphaning
- forged no-debit outcomes and arithmetic overflow
- suspended plans, operation exclusions, and reservation caps
- immutable budget history and receipt-to-ledger tampering
- expiration settlement after a client-visible conflict
- forged actor roles, actor-kind mismatch, duplicate capabilities, and missing
  capabilities
- cross-project retrieval, ACL denial, corrupted records, and context exhaustion
- malformed or elevated execution permission requests
- usage-operation mismatch, stale usage, and executor substitution
- overlapping reservation attempts, cancellation, retry bounds, human approval,
  rollback, and post-rollback reconciliation

At this checkpoint, the two dedicated hardening files contain 17 passing tests.
The combined metering/vault focused suite contains 39 passing tests. Scoped lint
for all owned code and both hardening files exits with zero errors and zero
warnings.

Final repository verification contains 253 passing tests with no failures. Full
TypeScript checking and full repository lint exit successfully. The optimized
Next.js 16.1.6 build compiles, typechecks, generates all 62 static pages, and
includes all metering and vault API routes. Node reports the repository's
existing module-type warnings during direct TypeScript tests; they do not fail
the suite and this pillar did not change package metadata.

## Production Adapter Contract

A production repository must preserve these semantics, not merely implement the
TypeScript method signatures:

1. Authenticate the caller server-side and derive tenant, project, actor,
   capabilities, and entitlements from trusted authority. Request headers or
   payload fields may never grant production authority.
2. Apply tenant RLS and explicit project predicates to every read and write.
   Cross-tenant identifiers must return no resource detail.
3. Execute quote/reservation/receipt/ledger/idempotency changes in one durable
   organization-scoped transaction with row locks or serializable conflict
   handling around shared tenant budgets.
4. Enforce unique constraints for deterministic resource IDs and composite
   idempotency keys. Existing rows are immutable; exact retries return the
   original resource and conflicting retries fail.
5. Store policy versions permanently and prevent update/delete of ledger,
   receipt, policy-history, audit, and agent-event rows except through governed
   retention procedures that leave verifiable tombstones.
6. Use a database clock for transaction time, enforce bounded payloads, and
   verify integrity hashes before replay or authorization decisions.
7. Couple a future provider execution claim to an active usage reservation with
   a fenced lease. Recheck cancellation and reservation status before provider
   start, before output commit, and before usage settlement.
8. Keep payment aggregation in a separate default-off adapter. Only settled,
   undisputed, explicitly enabled overage totals may be exported; product
   requests must never call a payment mutation directly.
9. Encrypt sensitive vault content and backups with managed keys, keep audit
   metadata content-minimal, and prove backup restore plus reconciliation in a
   separate environment.
10. Run reconciliation continuously and block affected tenant writes when a
    chain, receipt, policy, replay, or idempotency invariant fails.

## Residual Risk Map

| Priority | Remaining gap | Required next proof |
| --- | --- | --- |
| P0 | Durable repository and tenant authority | Additive schema, RLS, authenticated actor derivation, immutable constraints, organization budget locking, and multi-process race tests |
| P0 | Provider execution and metering settlement | Fenced execution lease, cancellation race handling, provider receipt verification, atomic output/usage settlement, and zero-side-effect dry-run certification |
| P0 | Payment aggregation boundary | Separate default-off outbox, dispute window, explicit tenant enablement, reconciliation, and finance-owner review; no live payment call in this pillar |
| P1 | Cryptographic audit authority | KMS-backed signatures or MACs and WORM retention so a database administrator cannot rewrite data and recompute public hashes |
| P1 | Lifecycle and privacy operations | Authorized retention worker, legal-hold release, deletion attestations, data-subject workflows, and backup expiry proof |
| P1 | Retrieval scale and evaluation | Durable index, source-version invalidation, million-record tenant tests, prompt-injection corpus, and groundedness calibration |
| P1 | Disaster recovery | Point-in-time restore, ledger/vault reconciliation after restore, regional failover, and recovery-time measurements |
| P2 | Governed policy operations | Approval workflow for rate, entitlement, vault, provider, model, prompt, and permission policy promotion |

## Next Selected Wave

The next highest-risk wave is the production adapter handoff. It crosses the
storage, auth, migration, provider, and finance ownership boundaries that were
explicitly excluded here. Until those owners provide authenticated tenant
authority and durable transaction primitives, production remains fail closed,
the reference repositories remain local proof tools, the agent harness remains
proposal-only, and payment/provider side effects remain unavailable.
