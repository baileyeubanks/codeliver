# Proposal Studio to Co-VideoPro handoff

## Authority boundary

CCO Proposal Studio remains the only authority for quotes, totals, deposits, invoices, payments, and client acceptance. Co-VideoPro receives one production-safe project seed only after the exact proposal package and quote version have been approved, viewed, and accepted.

The handoff never accepts proposal render files or commercial values. Permitted artifacts are production manifests, briefs, evidence registers, and source references explicitly classified as `production_safe`. Co-Credit is a separate operational budget and is not client money.

## Proposal Studio import context

Proposal Studio is a separate application and is not merged into this repository as a UI subtree. Co-VideoPro supplies it with a price-free, version-bound CRM context through `GET /api/crm/opportunities/:id/proposal-context`.

`lib/proposals/proposal-studio-contract.ts` is the local adapter contract. It accepts the source inquiry, account, contact, opportunity, and brief revision authority references, then fails closed when a client, opportunity, brief revision, content hash, or authority version no longer matches. The context intentionally excludes rates, totals, deposits, invoices, payment state, and Co-Credit balances.

That gives the two products one lifecycle without creating a second CRM authority: Proposal Studio can compose a governed commercial package, while Co-VideoPro remains the source of project identity and receives only the accepted production handoff.

## Trust chain

1. Proposal Studio builds schema `1.0.0`, derives the package/version/variant idempotency key, and signs the canonical payload with an Ed25519 key.
2. The Co-VideoPro HTTP receiver maps the source tenant and signing key to a server-owned integration binding, verifies the signature and 15-minute attestation window, and performs no write for `validate` intent.
3. Activation requires `PROPOSAL_HANDOFF_WRITES_ENABLED=true` and a 32-byte receiver secret that is independent of the Supabase service key.
4. The database binding must separately have `active=true` and `activation_enabled=true`. The database recomputes the canonical payload hash and receiver HMAC before its security-definer function can create a project.
5. One transaction creates the project, immutable receipt, and audit event. Package, proposal, quote, and idempotency uniqueness guards return the original receipt for an identical retry and reject drift.

The service role cannot read or mutate integration secrets, insert or truncate receipts, or manufacture a project receipt directly. It can read the public verification-key view and execute the receiver function, but the function fails without the receiver-only proof.

## Project operating record

After activation, Co-VideoPro exposes the production-safe handoff context through one project-scoped, read-only operating record:

- `co_production.project_operating_sources` projects only the source receipt, production window, client/opportunity/brief references, scope ids, deliverables, and production modules. It omits proposal totals, payment state, acceptance actors, signatures, receiver secrets, artifact hashes, and Co-Credit balances.
- `GET /api/projects/:projectId/operating-record` joins that source with current project, asset, version, comment, and approval evidence.
- The endpoint uses the caller's canonical project role to limit visible workspaces and lineage. Reviewers receive review and delivery context; owners, admins, and producers receive the full production-safe lineage.
- Workspace statuses are projections, never mutation authority. In particular, approved media can make delivery ready, but delivery cannot become complete until a durable delivery receipt exists.
- Manual projects remain supported. They return an unlinked commercial authority rather than inventing proposal history.

The production launch gate admits only exact signed proposal ingress on the admin host and exact read-only operating-record requests for UUID project ids. Client surfaces, aliases, wrong methods, and malformed ids fail closed.

## Staged rollout

1. Apply the isolated `co_production` authority migration in staging only.
2. Generate separate Ed25519 signing and 32-byte receiver HMAC secrets. Keep private material in server secret storage.
3. Insert one inactive integration binding with the public signing key, target team, project owner, and receiver HMAC bytes.
4. Set `active=true` while leaving `activation_enabled=false`; send signed `validate` envelopes and verify zero database writes.
5. Certify tenant isolation, invalid signatures, stale attestations, commercial-field rejection, retries, concurrent activation, immutable receipts, and recovery.
6. Apply and certify the read-only `project_operating_sources` projection, including role filtering and commercial-field exclusion.
7. Enable the application flag and database activation flag only under a separately authorized production change.

No binding is seeded by the migration. No current local implementation applies the migration or activates production writes.

## Stop conditions

Stop activation on a missing or stale acceptance receipt, mismatched package version, short or changed content hash, unknown field, unsafe artifact, missing production window, cross-tenant binding, invalid receiver proof, duplicate authority with payload drift, or absent durable receipt.

For rollback, turn off the application flag first, then set the database binding `activation_enabled=false`. Existing receipts remain immutable and projects remain recoverable through their audit trail.
