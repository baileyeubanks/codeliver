# Co-Deliver M4 Application Runtime

These assets define an M4-only application runtime. They do not deploy a
release, install a launch agent, create credentials, change DNS, start a
Cloudflare tunnel, or contact a live service during repository validation.

## Fixed contract

- Runtime user: `_mxappservice`
- Application root: `/Users/_mxappservice/Projects/platform/codeliver`
- Private environment: `/Users/_mxappservice/.config/blaze-secrets/codeliver/runtime.env`, owner `_mxappservice`, mode `0600`
- Node: `/Users/_mxappservice/.nvm/versions/node/v24.14.1/bin/node`, reporting exactly `v24.14.1`
- Production: `NODE_ENV=production`, port `4103`, bound only to `127.0.0.1`
- Canary: loopback port `4413` by default, configurable with `CODELIVER_CANARY_PORT` or `--canary-port`
- Exact surfaces: `admin.contentco-op.com` and `client.contentco-op.com`
- Storage: mounted `/Volumes/BLAZE-STORE-2`, with `NAS_MEDIA_ROOT=/Volumes/BLAZE-STORE-2/media-vault/co-deliver`
- LaunchAgent: `com.contentcoop.codeliver-runtime`, always restarted with a 15-second backoff
- Logs: `/Users/_mxappservice/Library/Logs/Co-Deliver/runtime.stdout.log` and `runtime.stderr.log`

The launcher uses the package `start` script through the pinned npm CLI and
appends `--hostname 127.0.0.1`. The production and canary listeners therefore
remain private to the M4 even before tunnel routing is considered.

## Release layout

```text
/Users/_mxappservice/Projects/platform/codeliver/
  current -> releases/<release-id>
  previous -> releases/<release-id>
  releases/<release-id>/
  staging/<failed-or-in-progress-release-id>/
  state/cache/<release-id>/
  activation-receipts/
  canary-logs/
  control/
```

`prepare-release.sh` archives one explicit clean Git commit, installs build
dependencies and builds it with Node `v24.14.1`, moves the Next cache outside the release, removes
write permission from release-owned content, and atomically moves the staged
directory into `releases/`. Existing release, staging, or cache paths cause a
hard failure. Failed staging evidence is retained. No pruning or release
deletion command is provided.

The mutable Next cache is release-specific and external. Application media is
also external on CCNAS. Code, package metadata, dependencies, and `.next`
output stay sealed in the release directory.

## Environment gate

Install `runtime.env.example` at the exact private path, then populate the four
required Supabase values there. The checked-in template contains no credential
values. Runtime startup rejects a symlinked env file, wrong owner, mode other
than `0600`, placeholders, wrong surface URLs, disabled remote health probes,
or changed fixed settings.

Storage preflight requires all of the following before either canary or
production can start:

- `/Volumes/BLAZE-STORE-2` appears as an active mount, not merely a directory.
- The mount and Co-Deliver root are real directories, not symlinks.
- `/Volumes/BLAZE-STORE-2/media-vault/co-deliver` exists, is readable and
  writable, and is owned by `_mxappservice`.
- Provider is `ccnas`, writes are enabled, and remote readiness probes are on.

Notifications remain optional with `CODELIVER_REQUIRE_NOTIFICATIONS=0`. Setting
the gate to `1` also makes `RESEND_API_KEY` mandatory.

## Offline validation

```bash
./infra/runtime/validate-static.sh
./infra/runtime/tests/runtime-contract.test.sh
```

The shell suite uses loopback mock servers only. It tests exact admin/client
Host headers, rejects an unknown Host, fails when either surface fails the
unauth health/version contract, tests env permissions and missing mount/root
behavior, and exercises atomic promotion plus explicit rollback without
starting Next or launchd.

## Future M4 installation

These are operator steps for a separately approved M4 change window. They are
not repository-validation commands.

1. Install the control scripts and `lib/` under
   `/Users/_mxappservice/Projects/platform/codeliver/control/` without replacing
   an unknown existing control plane.
2. Create `/Users/_mxappservice/Library/Logs/Co-Deliver/` and install the plist
   as `/Users/_mxappservice/Library/LaunchAgents/com.contentcoop.codeliver-runtime.plist`.
3. Install the private env from the template with owner `_mxappservice` and
   mode `0600`, then populate its required values outside Git.
4. Prepare a release from a clean checkout and an explicit full SHA:

```bash
./prepare-release.sh \
  --source /Users/_mxappservice/Projects/contentco-op/cco-codeliver \
  --release 20260715T120000Z-0123456789ab \
  --git-sha 0123456789abcdef0123456789abcdef01234567
```

5. For the first release, canary and atomically select it without touching the
   service:

```bash
./promote-release.sh \
  --release 20260715T120000Z-0123456789ab \
  --expected-current none
```

6. Bootstrap the LaunchAgent only after `current` exists. For later releases,
   use `restart-runtime.sh` after promotion. That script restarts only
   `com.contentcoop.codeliver-runtime` and requires production health to pass.

Health verification calls unauth `/api/health`, `/api/health/live`, and
`/api/version` with each exact Host header. It requires `status: ok` plus the
expected Git SHA and product `Co-VideoPro` (legacy `co-deliver` accepted) from
`/api/version`. It does **not** call staff-auth `/api/health/ready`. It also
requires `untrusted.invalid` to return `HOST_FORBIDDEN`. It does not follow
redirects.

## Explicit rollback

Promotion records the displaced release in `previous`. Rollback requires both
IDs, verifies that they still match the symlinks, canaries the target, swaps the
links atomically, and writes an immutable receipt:

```bash
./rollback-release.sh \
  --from 20260715T120000Z-0123456789ab \
  --to 20260714T220000Z-fedcba987654
./restart-runtime.sh
```

Rollback never removes, rewrites, or rebuilds either release. It never runs
automatically after a failed production check; the operator retains explicit
authority over the rollback and service restart.

## M2 + CCNAS failover origin

`CODELIVER_RUNTIME_PROFILE=m2-failover` selects a second fixed runtime contract
that does not depend on M4 or `BLAZE-STORE-2`:

- application root: `/Users/baileyeubanks/.local/share/codeliver-failover`
- private environment: `/Users/baileyeubanks/.config/codeliver-failover/runtime.env`
- storage mount: `/Volumes/CC_NAS`
- new managed-media root: `/Volumes/CC_NAS/cvp-runtime/co-videopro`
- verified read cache: `/Users/baileyeubanks/.local/share/codeliver-failover/ccnas-read-cache`
- origin: `127.0.0.1:4103`, with `https://co-videopro.com` for staff/admin
  and `https://client.contentco-op.com` for provisioned clients
- HTML doors: `next.config.ts` sets `compress: false`. Both hostnames share
  this origin, so one Next gzip setting hits both. Next's default (`true`)
  plus Cloudflare `Accept-Encoding: gzip` returns a 0-byte HTML body: the
  browser hangs or downloads the page. Edge compression stays on Cloudflare.
  The check and the curl recipe are in `DEPLOY_CONTRACT.md` under "HTML doors".
- application service: `com.contentcoop.codeliver-failover`
- tunnel service: `com.contentcoop.codeliver-failover-cloudflared`

The managed-media root starts empty. It provides durable storage for uploads
received by the failover origin; it does not recover or claim custody of media
from the unavailable M4 RAID. Existing client/project media remains unavailable
until copied from a verified source with receipt identity preserved.

CCNAS is the durable canonical home. Because the SMB mount cannot enforce the
adapter's local hard-link and mode-bit immutability contract, every committed
object is fully checksum-verified into the M2 APFS read cache before it can be
served. The cache retains at least 100 GiB of editing-disk free space and admits
at most 250 GiB of cached object bytes. There is no automatic eviction in this
release: a fill fails closed at either limit, and a cold fill rechecks the full
CCNAS object against its persisted checksum and size.

Each in-progress cold fill leaves a root-level
`.ccnas-cache-reservation-<bytes>-<uuid>` file. A clean completion removes it.
If M2 loses power, a leftover reservation deliberately keeps capacity checks
failed closed. Recovery requires unloading the CVP application and media-worker
launch agents, confirming no canary or CVP process is using the cache, recording
the reservation names in the activation receipt, and then unlinking only those
root-level reservation files before restarting the exact release. Do not remove
cached objects, manifests, or CCNAS canonical media during that recovery.

The failover uses the existing `cco-videopro` Cloudflare Tunnel. The apex route
already targets that tunnel. `client.contentco-op.com` must be added to the same
tunnel only after confirming it is still unoccupied; `admin.contentco-op.com`
belongs to the separate CCO commercial app and must not be changed. A connector
on M2 is an independent active origin, not automatic dual-origin health
failover: the M4 connector must remain out of service while its local origin is
unhealthy, otherwise Cloudflare can still select it and return 502.

Before activation, install the private environment and tunnel credential files
at mode `0600`/`0400`, install the two checked-in launch agents, and place the
checked-in tunnel template at
`/Users/baileyeubanks/.config/codeliver-failover/cloudflared.yml`. Do not put a
tunnel token in a plist or command line. Validate the source and artifacts:

```bash
/bin/bash infra/runtime/tests/m2-failover-contract.test.sh
/bin/bash infra/runtime/tests/runtime-contract.test.sh
CODELIVER_RUNTIME_PROFILE=m2-failover ./infra/runtime/prepare-release.sh \
  --source /absolute/clean/qualified/source \
  --release YYYYMMDDTHHMMSSZ-<12-char-sha> \
  --git-sha <full-40-char-sha>
CODELIVER_RUNTIME_PROFILE=m2-failover ./infra/runtime/canary-release.sh \
  --release YYYYMMDDTHHMMSSZ-<12-char-sha>
```

Only after the exact release passes canary and the CCNAS/scanner/readiness
checks may it be selected, the application launch agent loaded, and the M2
tunnel connector started. Prove loopback health/version first, then public
health/version and one managed playback path before treating M2 as active.

Rollback is explicit and preserves evidence:

1. unload only `com.contentcoop.codeliver-failover-cloudflared`;
2. unload only `com.contentcoop.codeliver-failover`;
3. if a prior M2 release exists, use `rollback-release.sh` with both exact IDs;
4. leave release directories, activation receipts, and the CCNAS media root in
   place; never delete them as part of traffic rollback;
5. restore M4 traffic only after its own storage, loopback, and public checks
   pass.
