# Co-ProVideo Stabilization Blockers

Updated: 2026-07-26
Machine: M2
Branch: `codex/co-videopro-definitive-20260715`

This file records current proof blockers and capability gaps, not a claim that
the whole project is blocked. Everything that is safe and independent of these
conditions continues. The observations below are scoped to the inspected M2
shell and source at `a7eaaab`; they do not describe every private service or
configuration store on M2.

Never print, copy, or commit secret values. Report key names and presence only.
Bailey resolved the prior Kimi ownership conflict for `G-CVP-REAL-SPINE`;
Published Playback remains isolated. Preserve the inherited untracked
`audit/` evidence unchanged.

## Blocker 1 — Supabase configuration absent from the inspected M2 shell

Keys absent from the inspected M2 shell:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `SUPABASE_DATA_SCHEMA`
- `NEXT_PUBLIC_SUPABASE_DATA_SCHEMA`

Verify presence without printing values:

```bash
for key in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY \
  SUPABASE_URL SUPABASE_SERVICE_KEY SUPABASE_DATA_SCHEMA \
  NEXT_PUBLIC_SUPABASE_DATA_SCHEMA; do
  if printenv "$key" >/dev/null 2>&1; then
    printf '%s=present\n' "$key"
  else
    printf '%s=absent\n' "$key"
  fi
done
```

What it blocks:

- This shell cannot currently produce a fresh real-session receipt, so the
  authenticated unknown-project 404 (audit L2 / F8) cannot be runtime-proved
  until an approved private configuration source is located or supplied.
- Real database-backed project/asset/team/webhook API flows cannot be
  end-to-end proved against the production runtime.
- Real-session proof for audit C2 (stable server session with a genuine
  Supabase identity) cannot be completed.
- Production data authority cannot pass unless both schema keys are present,
  equal, and set to `co_production`.

Commands that prove it once resolved (with all six keys privately exported and
both schema keys set to `co_production`):

```bash
# Terminal A: foreground production runtime; this command does not return while
# the runtime is healthy.
./scripts/rebuild-public-runtime.sh
```

In a separate terminal:

```bash
# Terminal B: session returns structured identity for a real login.
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4103/api/auth/session
#   logged out -> 401 {"authenticated":false}; with a valid cookie -> 200 identity JSON

# Authenticated unknown project is a real 404 (cookie supplied out-of-band,
#    never written to chat, docs, tests, or commits):
IFS= read -rs AUTH_COOKIE
export AUTH_COOKIE
BASE_URL=http://127.0.0.1:4103 ./scripts/verify-runtime.sh
unset AUTH_COOKIE
```

## Blocker 2 — Storage provider and write authority absent from the inspected M2 shell

The current storage contract does not infer a provider from
`NAS_MEDIA_ROOT`. It requires `CODELIVER_STORAGE_PROVIDER` to be explicit and
`CODELIVER_STORAGE_WRITE_ENABLED=1` before writes can become ready.
`NAS_MEDIA_ROOT` is additionally required when the provider is `ccnas`;
`CODELIVER_LOCAL_STORAGE_ROOT` is required when the provider is `local`.

All four keys were absent in the inspected M2 shell. Verify presence without
printing values:

```bash
for key in CODELIVER_STORAGE_PROVIDER CODELIVER_STORAGE_WRITE_ENABLED \
  NAS_MEDIA_ROOT CODELIVER_LOCAL_STORAGE_ROOT; do
  if printenv "$key" >/dev/null 2>&1; then
    printf '%s=present\n' "$key"
  else
    printf '%s=absent\n' "$key"
  fi
done
```

What it blocks:

- Real NAS-backed upload, reload, playback, retry, export, and transcode
  behavior (F11) cannot be end-to-end proved.
- The positive side of the storage contract is unproven. Source tests and the
  current CCO-C2 runtime prove fail-closed behavior; the unauthenticated
  readiness route currently returns structured `503 BACKEND_UNAVAILABLE`
  before provider readiness can be evaluated.

Read-only readiness check once an approved provider, write flag, corresponding
root, authenticated session, and foreground production runtime exist:

```bash
# Terminal B only. Re-read the cookie silently; do not assume the value remains
# exported from an earlier verifier shell.
IFS= read -rs AUTH_COOKIE
export AUTH_COOKIE
curl -sS http://127.0.0.1:4103/api/storage/readiness \
  -H "Cookie: $AUTH_COOKIE" | jq .
unset AUTH_COOKIE
```

Do not run a positive or negative TUS mutation against live NAS. CCO-C4 must
first claim an isolated disposable `local` target and publish the exact
failure-first procedure. An approved ingest/quarantine proof must supply the
mandatory base64 `projectId` and `idempotencyKey` metadata, capture the POST
`Location`, PATCH the bytes with the correct offset/content type, then HEAD
the session and assert offset plus quarantine state. It is not a release,
asset, V1, playback, or delivery proof.

## Blocker 3 — Production malware release gate is unimplemented

The default `CODELIVER_MALWARE_POLICY` is `required`. Current source provides
only two scanner hooks:

- `PendingMalwareScanHook`, which reports no scanner configured and leaves
  verified bytes quarantined; and
- `LocalDemoBypassScanHook`, which is restricted to the local provider and
  cannot release external-provider objects.

No environment value can create a production scanner implementation in the
current source. Resolving this requires a bounded implementation/provider
packet, threat review, tests, and Bailey's explicit provider approval.

What it blocks:

- automatic release of uploaded bytes under the production policy;
- an honest `readyForRelease` storage workflow;
- the goal's attributable approval → locked-delivery proof.

## Blocker 4 — Durable derivative enqueue is unconfigured

`app/api/storage/readiness/route.ts` currently calls the release-readiness
contract with `derivativeHooksConfigured: false`. The upload orchestrator
therefore reports committed originals blocked for automatic processing even
if storage and scanning become ready. FFmpeg/FFprobe source support and worker
routes exist, but a durable enqueue-to-derivative receipt is not wired into
this upload path.

What it blocks:

- automatic V1 playable-derivative creation after upload;
- positive workflow readiness;
- a real-file upload → playable-media proof.

## Blocker 5 — Production origin, cryptographic, and worker inputs absent

Presence-only inspection found these source-referenced keys absent in the
current M2 shell:

- `ADMIN_SITE_URL` and `NEXT_PUBLIC_ADMIN_SITE_URL`
- `CLIENT_SITE_URL` and `NEXT_PUBLIC_CLIENT_SITE_URL`
- `CO_PRODUCTION_TOKEN_ENCRYPTION_KEY`
- `CO_PRODUCTION_WEBHOOK_SECRET_ENCRYPTION_KEY`
- `CO_PRODUCTION_ANALYTICS_HASH_KEY`
- `CODELIVER_MEDIA_PIPELINE_WORKER_TOKEN`

This blocks production split-surface origin proof, opaque-token encryption,
webhook-secret encryption, stable private analytics hashing, and worker
authorization. `FFMPEG_PATH` and `FFPROBE_PATH` are not set, but both commands
currently resolve from M2's `PATH`; executable presence alone does not prove
the derivative worker path.

## Known real-spine source gaps

Read-only CCO-C3 inspection identified additional breaks that are not
environment problems:

- completed TUS reconciliation creates an asset but does not create its V1
  row, while review/share/comment authority requires a resolvable version;
- uploaded CCNAS assets point at a staff-authenticated stream route, which an
  anonymous review token cannot use directly;
- approval is not durably exact-version-bound, external actor attribution is
  incomplete in approval history, and P19's lock callback is unwired; and
- signed-delivery readiness and a durable final delivery package are not yet
  implemented as a proved path.

These gaps require bounded source packets with tests and independent review.
They must not be papered over with demo-store state or a false-success UI.

## Current evidence boundary — local runtime proved, private readiness open

CCO-C2 established a repo-owned M2 `next start` listener on port `4103` at
documentation-only HEAD `bad8ef1`; port `4115` remains unused. The anonymous
runtime verifier passed, while the authenticated 404 check skipped because
`AUTH_COOKIE` is absent. The current session and storage-readiness endpoints
fail closed with structured `503 BACKEND_UNAVAILABLE`, and detailed readiness
fails closed with `503 HEALTH_AUTH_UNAVAILABLE`.

This closes the no-listener gap only. It does not establish authenticated
database behavior, positive provider readiness, media ingestion/release,
playable derivatives, or the real-file spine. The receipt expires if PID
`83183` stops, the runtime is rebuilt, or its cwd/listener identity changes.
A runtime-affecting application or build-input change makes the process stale
evidence for the current application tree; documentation-only changes do not
invalidate the exact built-runtime receipt.

Private service configuration, deployed runtime state, M4 state, CCNAS mount
health, database contents, provider readiness, and production DNS/Coolify
provenance remain `UNKNOWN`; absence from this shell must not be generalized.

## Not blockers (do not re-litigate)

- Runtime tooling exists: `scripts/rebuild-public-runtime.sh` and
  `scripts/verify-runtime.sh` remain the required local path. Their 2026-07-25
  success is historical; the current bounded CCO-C2 receipt is in `STATUS.md`.
- Missing optional email/AI provider keys (`RESEND_API_KEY`,
  `ANTHROPIC_API_KEY`): dependent routes fail closed by design.
- Bodyless TUS `HEAD` responses: intentional HTTP/TUS protocol behavior.
- The pre-existing Turbopack NFT trace build warning: unchanged baseline.
- The untracked `audit/` directory: out of stabilization scope; neither staged
  nor deleted.
