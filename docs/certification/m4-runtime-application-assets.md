# Co-Deliver M4 Application Runtime Assets

**Status:** Prepared, offline only, not installed or deployed

**Prepared:** 2026-07-15

**Repository base:** `585a703d6bfbee6a2a6c0bd46f93b30a4dd7f298` on `main`

**Authority boundary:** New `infra/runtime/**` assets and `m4-runtime*` certification only

## Purpose

This package defines the application-process layer that can sit behind the two
existing local Cloudflare origin contracts. It does not alter those tunnel
assets. Both public surfaces reach one private Next production process on M4,
and the application still decides surface authority from the exact Host header.

## Fixed M4 contract

| Control | Required value |
| --- | --- |
| Runtime user | `_mxappservice` |
| Application root | `/Users/_mxappservice/Projects/platform/codeliver` |
| Private env | `/Users/_mxappservice/.config/blaze-secrets/codeliver/runtime.env`, owner `_mxappservice`, mode `0600` |
| Node | `/Users/_mxappservice/.nvm/versions/node/v24.14.1/bin/node`, exactly `v24.14.1` |
| Production process | `NODE_ENV=production`, `PORT=4103`, `127.0.0.1` only |
| Canary | `127.0.0.1:4413` by default; alternate non-production port must be explicit |
| Admin Host | `admin.contentco-op.com` |
| Client Host | `client.contentco-op.com` |
| Storage mount | `/Volumes/BLAZE-STORE-2` must be an active mount |
| Media root | `/Volumes/BLAZE-STORE-2/media-vault/co-deliver`, owned by `_mxappservice`, readable and writable |
| Health dependencies | CCNAS writes and remote dependency probes enabled; notifications optional until gated on |
| LaunchAgent | `com.contentcoop.codeliver-runtime` |
| Restart policy | Restart after every exit with a 15-second launchd backoff |

The process launcher uses the package `start` script through the pinned npm CLI
and appends `--hostname 127.0.0.1`. It also replaces runtime port input with the
explicit production or canary port and binds liveness identity to the sealed
release manifest SHA.

## Immutable release model

Each release is built from one explicit full Git SHA in a clean checkout or
worktree. Preparation never checks out, resets, cleans, or edits that source.
It uses `git archive`, performs a production Next build with the pinned Node,
externalizes `.next/cache`, records a release manifest, removes write access
from all release-owned files and directories, then moves the completed staging
directory into a unique release path.

The active pointers are:

```text
current  -> releases/<selected-release>
previous -> releases/<displaced-release>
```

Pointer replacement uses a same-filesystem temporary symlink plus Node
`renameSync`, making the `current` transition atomic. Promotion and rollback
are serialized by a directory lock and compare the observed pointer with an
explicit expected release before changing anything.

No release-pruning operation exists. Existing release, staging, cache, or
receipt paths are never overwritten. A failed build preserves staging output;
canary logs and activation receipts are also retained.

## Promotion and rollback authority

Promotion performs these steps:

1. Validate the sealed target and the explicit expected-current value.
2. Start the target on the configured loopback canary port.
3. Require liveness and dependency-aware readiness for both exact Hosts.
4. Require an untrusted Host to fail with `HOST_FORBIDDEN`.
5. Stop the entire isolated canary process group.
6. Recheck current state under the promotion lock.
7. Atomically update `previous` and `current`, then write a receipt.

Promotion does not restart launchd. The separate `restart-runtime.sh` command
is the explicit live-service boundary. It restarts only the Co-Deliver label
and requires production port `4103` to report the selected release SHA and pass
both Host readiness checks.

Rollback requires explicit `--from` and `--to` IDs. The IDs must match the
current and previous pointers, and the target must pass the same canary gate.
Rollback swaps the pointers without changing or removing either release. It
also stops before the separate launchd restart boundary.

## Fail-closed behavior

Canary and production startup fail before Next begins when any of these are
wrong:

- runtime user, fixed path, or pinned Node version
- private env file path, owner, mode, symlink state, or required values
- exact production origins, port, environment, or loopback binding contract
- active storage mount, media-root existence, ownership, or read/write access
- required database configuration, CCNAS provider/write flags, or remote probes
- sealed release manifest, build output, external cache, or immutability modes

The application readiness endpoint provides a second storage and database gate
after process startup. Optional notifications may make readiness degraded, but
they do not make it false until `CODELIVER_REQUIRE_NOTIFICATIONS=1`.

## Excluded changes

These assets do not modify or operate any of the following:

- `infra/cloudflare/**`
- application, authentication, health-route, or storage implementation
- package manifests or lockfiles
- DNS, tunnels, credentials, M4 files, launchd state, or live services

Installation and future approved operator commands are documented in
`infra/runtime/README.md`.
