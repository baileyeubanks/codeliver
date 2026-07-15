# M4 Enterprise Control-Plane Goal

## Mission

Build a receipt-backed enterprise control-plane foundation for Content Co-op
Co-Produce that complements the active M2 Co-Deliver product build without
changing its runtime behavior by default. The M4 work remains isolated in local
worktrees and non-main branches until an operator explicitly chooses a later
integration or release action.

The end state is six coherent, provider-neutral control-plane pillars with
fail-closed contracts and executable proofs:

1. Enterprise identity and governance under `lib/enterprise/**` and
   `app/api/enterprise/**`.
2. Media catalog intelligence under `lib/catalog/**` and
   `app/api/catalog/**`.
3. Realtime collaboration under `lib/collaboration/**` and
   `app/api/collaboration/**`.
4. Portfolio analytics under `lib/portfolio-analytics/**` and
   `app/api/portfolio-analytics/**`.
5. Provider-neutral integration orchestration under `lib/integrations/**` and
   `app/api/integrations/**`.
6. Enterprise operations, SLOs, diagnostics, support bundles, and recovery
   contracts under `lib/operations/**` and `app/api/operations/**`.

## Non-negotiable system properties

Every accepted slice must prove all applicable properties rather than merely
claim them:

- Multi-tenant isolation: tenant identity is explicit, validated, and included
  in authorization and storage/query keys; cross-tenant requests fail closed.
- Version binding: writes and reads bind to an explicit resource or contract
  version; stale or mismatched versions cannot silently succeed.
- Permission safety: deny-by-default decisions are separated from caller input,
  privilege escalation is attack-tested, and audit data explains denials without
  leaking protected details.
- Idempotency: replayed commands have deterministic outcomes and cannot duplicate
  effects; conflicting reuse of an idempotency key is rejected.
- Observability: responses and internal receipts carry stable correlation,
  decision, and outcome metadata without secrets or cross-tenant data.
- Accessibility: any user-facing contract exposes understandable status and
  recovery guidance that does not depend on color, motion, or provider jargon.
  API-only slices must record why no visual accessibility surface exists yet.
- Reversibility: mutable operations define compensating actions, tombstones,
  policy rollback, or another explicit recovery path. Irreversible operations
  remain unavailable.

## Long-horizon worker loop

Each pillar repeats this loop until it has a defensible foundation:

1. Inventory existing M2 contracts and the pillar's highest-risk gap.
2. Select the highest-risk missing capability that fits one bounded vertical
   slice.
3. Implement the smallest end-to-end contract entirely inside the pillar's
   owned directories.
4. Attack-test tenant crossing, permission escalation, stale versions, replay,
   malformed input, resource bounds, and pillar-specific failure modes.
5. Produce measurable proof: executable test output, typecheck results, stable
   receipts, and a local commit SHA.
6. State residual risk plainly, including missing persistence, integration, UI,
   migration, scale, or operational validation.
7. Choose the next highest-risk slice and repeat.

## Branch and integration contract

The coordination branch is `m4/enterprise-control-plane-integration`. Worker
branches are:

- `m4/enterprise-identity-governance`
- `m4/media-catalog-intelligence`
- `m4/realtime-collaboration`
- `m4/portfolio-analytics`
- `m4/integration-control-plane`
- `m4/enterprise-operations`

Workers commit only to their own local branch and touch only their assigned new
directories. The coordinator reviews receipts and integrates accepted commits
only into the local M4 integration branch. Integration must preserve the active
M2 behavior and pass, at minimum, repository typechecking plus every pillar's
executable attack tests. Conflicts, shared-file edits, ambiguous authorization,
or missing proof fail closed and remain unintegrated.

## Local run ledger

The lane started from the clean checkout at
`/Users/_mxappservice/Projects/content-co-op/cco-codeliver-enterprise`, with
`origin/main` at `585a703d6bfbee6a2a6c0bd46f93b30a4dd7f298` and remote
`git@github.com:baileyeubanks/codeliver.git`. The repository remained local-only.

First-wave worker receipts accepted into this integration branch:

- Enterprise identity/governance: worker commits `0e87d9b` and `0932e1c`;
  integration commits `0fd1052` and `0a0c764`; 16 of 16 attack tests pass.
- Media catalog intelligence: worker commit `af61b6c`; integration commit
  `83b6d19`; 9 of 9 executable tests pass, covering 57 assertions including 18
  explicit attack/rejection checks.
- Realtime collaboration: worker commits `c064b6f` and `c6decd1`; integration
  commits `7ff778f` and `2d91826`; 10 of 10 attack tests pass. The worker and
  integration base commits have identical stable patch ID
  `5df414116f66384cbab38696c016da1aa63b1986`.

Repository typechecking and `git diff --check` pass after all three accepted
pillars. The second wave is active on `m4/portfolio-analytics`,
`m4/integration-control-plane`, and `m4/enterprise-operations`; none is accepted
until its owned-path check, attack suite, and combined typecheck pass.

## Prohibited actions

This lane does not deploy or push. It does not run live migrations, obtain or
write credentials, contact real providers, send notifications, alter production
data, perform destructive operations, merge to `main`, or touch ACS files,
repositories, worktrees, or branches. A future operator decision is required to
broaden any of those boundaries.

## Required receipt for each accepted slice

An accepted slice records its branch and worktree, local commit SHA, exact paths
changed, tests and typecheck commands with outcomes, adversarial cases proved,
observable/idempotent receipts demonstrated, residual risks, and proposed next
slice. The integration branch records the resulting integration SHA and a clean
working-tree state.
