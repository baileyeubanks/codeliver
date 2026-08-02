# Co-Deliver M4 Runtime Validation

**Result:** PASS for repository-static and offline shell behavior

**Validated:** 2026-07-15

**Repository base:** `585a703d6bfbee6a2a6c0bd46f93b30a4dd7f298` on `main`

**Checkout condition:** Dirty shared tree; HEAD is the base commit, not a release fingerprint

## Commands

```bash
./infra/runtime/validate-static.sh
./infra/runtime/tests/runtime-contract.test.sh
```

Results:

```text
PASS: M4 runtime static contract, launchd plist, loopback binding, private env template, and preservation guards.
PASS: runtime shell tests cover env permissions, mounted storage, immutable links, explicit rollback, exact Hosts, and fail-closed readiness.
```

## Static coverage

- Bash syntax for every runtime shell file
- Valid launchd property list
- LaunchAgent label, entrypoint, always-on restart, 15-second backoff, exit
  timeout, restrictive umask, production environment, and log paths
- Exact Node `v24.14.1` binary and npm CLI paths
- Production port `4103` and configurable canary default `4413`
- Package-script launch with appended loopback hostname
- Exact admin/client Host constants and liveness/readiness paths
- Secret-free env template with the required BLAZE-STORE-2 CCNAS settings
- Atomic rename-based symlink replacement
- Absence of all-interface binding, non-atomic force-link replacement, release
  removal, Git reset, Git clean, and Git checkout behavior in operational scripts

## Shell behavior coverage

The test suite uses unique temporary directories and loopback-only mock HTTP
servers. It does not invoke the real Next runtime, launchd, M4, Supabase,
Cloudflare, or DNS.

Positive checks:

- owner-only env file is accepted with all fixed production values
- active-mount test seam plus readable/writable media root passes preflight
- initial promotion creates `current` atomically
- second promotion records the displaced release in `previous`
- explicit rollback swaps `current` and `previous`
- both sealed release directories survive every transition
- immutable activation receipts are created
- admin and client liveness/readiness pass with the expected release SHA
- the canary supervisor terminates its complete isolated process group

Negative checks:

- a directory that exists but is not mounted is rejected
- a missing `NAS_MEDIA_ROOT` is rejected
- env mode `0644` is rejected
- production paths and test-mode state cannot be overridden after contract load
- stale `--expected-current` promotion is rejected
- client Host readiness failure blocks the health gate
- untrusted Host must return HTTP `403` with `HOST_FORBIDDEN`

## Live boundary

No deployment or live connection was attempted. Specifically:

- no M4 path was created or inspected
- no runtime env or credential file was read or written
- no release was built or selected
- no launch agent was installed, loaded, restarted, or queried
- no production/canary application process was started
- no Cloudflare, DNS, Supabase, NAS, or public-host request was made

Live certification remains intentionally pending an approved M4 change window.
That later certification must verify the installed Node path, private env owner
and mode, actual mount/root state, prepared release manifest, launchd state,
both exact Host health checks on port `4103`, and an explicit rollback drill.
