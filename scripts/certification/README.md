# Enterprise certification harness

This directory is the manifest-driven release and quality control plane for Co-Deliver. It inventories the live checkout on every run, evaluates static and executable proof, writes commit-and-dirty-state-bound receipts, and blocks release when required evidence is failed, stale, or absent.

## Commands

```bash
node scripts/certification/register.mjs
node scripts/certification/run.mjs --summary
node scripts/certification/run.mjs --run-commands --write-receipt --summary
node scripts/certification/run.mjs --run-commands --include-build --write-receipt --enforce
```

`--enforce` is intended for CI and release automation. Receipt generation itself remains successful when the product is blocked so the failure evidence is durable.

For a high-contention shared checkout, require a longer quiet window explicitly:

```bash
node scripts/certification/run.mjs --run-commands --include-build --write-receipt --enforce --stability-window-ms=5000 --stability-attempts=12
```

## Snapshot and command boundary

The harness fingerprints every tracked file and every non-ignored untracked file in the release candidate, including deletions, executable modes, CSS, configuration, documentation, migrations, tests, and authored assets. Generated Next output, TypeScript build information, Playwright output, receipts, and proof files are excluded so tool output and evidence writes cannot recursively invalidate the source they describe.

Before evaluation, the runner requires two identical captures at least 500 ms apart, copies that state, verifies the copy against the captured fingerprint, and retries at most eight times when another worker is writing. Static checks read the verified copy. Every lint, typecheck, test, and build command receives a fresh disposable copy of that same source plus the existing dependency installation. A zero-exit command is rejected if it changes candidate source.

After commands finish, the live checkout must settle again and match the original snapshot. Otherwise `governance.snapshot-stability` fails even though the command outputs remain attached to the exact older source they exercised. Standard commands time out after 180 seconds; the isolated production build times out after 300 seconds.

The bounded attack suite is:

```bash
node --experimental-strip-types --test tests/contracts/*.test.mjs tests/contracts/*.test.ts tests/journeys/*.test.mjs
```

It covers content rewrites that retain the same dirty path set, receipt/proof recursion, continuous writers, copy-time races, source-mutating commands, command timeouts, readiness bypass attempts, stalled dependencies, and secret redaction.

Readiness fails closed when required remote probing is disabled. Database and filesystem/NAS probes are independently bounded by the configured timeout, clamped to 10 seconds, and return redacted failure summaries.

## Automatic registration

Add a valid JSON manifest to `pillars/` or `journeys/`. No central registry edit is needed: the loader discovers every JSON file recursively, rejects duplicate IDs, validates proof dimensions, and fails route coverage when a new route is not classified. Every enterprise pillar spans Horizons 1 through 3 and declares which identity, tenant, project, version, permission, billing, and audit authorities it must preserve.

Each journey proof belongs at `proofs/<journey-id>.json` and must conform to `proof.schema.json`. Proof is accepted only when its commit and source fingerprint match the checkout and its TTL has not expired. Existing screenshots and prose are useful design evidence, but they do not satisfy executable proof by themselves. Proof and receipt files are evidence inputs or outputs, not source-fingerprint inputs.

## Status contract

- `pass`: current evidence satisfies the obligation.
- `fail`: current evidence demonstrates a defect.
- `unverified`: required proof does not exist.
- `expired`: proof exists but exceeded its TTL.
- `blocked`: the check could not execute because a prerequisite failed.

The machine-readable receipt includes every check, release gate, pillar obligation, residual risk, and the next highest-risk item. A release passes only when gates `G0` through `G3` all pass for the intended enterprise tier.
