# Co-VideoPro Stabilization Blockers

Updated: 2026-07-26
Machine: M2
Branch: `codex/co-videopro-definitive-20260715`

This file records current proof blockers and capability gaps, not a claim that
the whole project is blocked. Everything that is safe and independent of these
conditions continues. The observations below are scoped to the inspected M2
shell and source at `2639e89`; they do not describe every private service or
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
- The CCO-C5A migration
  `20260726084644_atomic_upload_catalog_v1.sql` is source-only. Live PostgreSQL
  syntax, existing-data compatibility, effective grants/policies, and the
  service-only atomic RPC remain unproved until Bailey approves a database
  preflight and migration application.
- The frame-pin repair migration
  `20260726113000_comment_pin_percentage_contract.sql` is also source-only.
  It deliberately takes an exclusive table lock and aborts if any existing pin
  coordinate is present, preventing silent reinterpretation of ambiguous
  legacy 0–1 values. A read-only legacy-pin inventory and explicit remediation
  decision are therefore required before approved application.
- The anonymous review admission migration
  `20260726120000_review_view_admissions.sql` is also source-only. Live
  PostgreSQL syntax, existing invite/version compatibility, effective
  service-only grants, admission/media/action RPC behavior, and concurrent
  enforcement of view, active-session, invite, network, and action limits
  remain unproved. An approved read-only compatibility preflight and explicit
  migration application are required before any live admission claim.
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
- The positive side of the storage contract is unproven. Source tests prove
  the fail-closed contract, while the older CCO-C2 runtime receipt is
  historical and both local runtime ports are currently down.
- Commit hardening at `2639e89` uses a separate sealed inode, deterministic
  crash-placement cleanup, a one-link receipt, and full-copy capacity
  preflight. CCNAS still must prove its actual chmod, hard-link, directory
  fsync, capacity, and retry semantics in an approved isolated runtime.

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

Do not run a positive or negative TUS mutation against live NAS. A positive
proof must first use an approved isolated disposable `local` target, pass the
read-only database contamination/preflight checks, and apply the CCO-C5A
migration only with Bailey's approval. The canonical `/api/upload/tus` source
contract then requires the mandatory base64 `projectId` and `idempotencyKey`
metadata and atomically attaches clean committed bytes to one asset and exact
V1. Until that sequence is run against a configured production build, it is
source behavior—not release, playback, or delivery proof.

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

- automatic proxy/HLS/thumbnail derivative creation after upload;
- positive workflow readiness;
- resilient derivative-backed playback proof. The exact-version route can
  stream a browser-playable committed original, but that path also lacks a
  configured real-file runtime receipt.

## Blocker 5 — Production origin, cryptographic, and worker inputs absent

Presence-only inspection found these source-referenced keys absent in the
current M2 shell:

- `ADMIN_SITE_URL` and `NEXT_PUBLIC_ADMIN_SITE_URL`
- `CLIENT_SITE_URL` and `NEXT_PUBLIC_CLIENT_SITE_URL`
- `CO_PRODUCTION_TOKEN_ENCRYPTION_KEY`
- `CO_PRODUCTION_WEBHOOK_SECRET_ENCRYPTION_KEY`
- `CO_PRODUCTION_ANALYTICS_HASH_KEY`
- `CO_PRODUCTION_REVIEW_ADMISSION_SIGNING_KEY`
- `CO_PRODUCTION_REVIEW_ADMISSION_VERIFICATION_KEYS`
- `CO_PRODUCTION_REVIEW_ADMISSION_TRUSTED_IP_HEADER`
- `CODELIVER_MEDIA_PIPELINE_WORKER_TOKEN`

This blocks production split-surface origin proof, opaque-token encryption,
webhook-secret encryption, stable private analytics hashing, and worker
authorization. Review admission rotation verification keys are optional; the
active signing key and a trusted ingress header are required. A configured
header is not provenance proof: the trusted ingress must strip or overwrite
client-supplied copies before forwarding the request. `FFMPEG_PATH` and
`FFPROBE_PATH` are not set, but both commands currently resolve from M2's
`PATH`; executable presence alone does not prove the derivative worker path.

## Known real-spine gaps after CCO-C6B

Core commit `3c8f3f9` plus hardening commit `2639e89` close the
duplicate-writer, missing-V1, writable-inode, and public-payload source gaps:
`/api/upload/tus` is the sole production writer, one clean committed upload is
atomically bound to one asset and exact V1, and authenticated playback is
receipt-bound and range-capable. The old multipart/TUS, metadata-only asset,
and arbitrary V2 writers are `410 Gone`. Public frame-comment writes are
exact-version-bound and safely projected, but their database repair remains
unapplied. Review invites must be active and reference an existing asset;
password-protected invites intentionally fail closed until governed password
verification is implemented.

CCO-C6B adds a source-bound anonymous bridge: one signed short grant and one
durable admission authorize one invite, asset, exact version, and token-free
media URL. Admitted comment, approval, and edit-decision requests are
same-origin, bounded, and rate-limited; password and watermark paths fail
closed. This is not live capability until the migration, private signing
configuration, trusted-ingress provenance, database authority, storage
receipt, and production runtime are proved.

Remaining gaps are:

- the CCO-C5A, frame-pin, and CCO-C6B migrations are unapplied and no live
  database/RPC/effective-privilege or real-file playback receipt exists;
- the anonymous exact-version bridge exists in source but lacks approved
  migration, configuration, ingress, storage, and runtime proof;
- approval is not durably exact-version-bound, external actor attribution is
  incomplete in approval history, and P19's lock callback is unwired; and
- signed-delivery readiness and a durable final delivery package are not yet
  implemented as a proved path.

These gaps require bounded source packets with tests and independent review.
They must not be papered over with demo-store state or a false-success UI.

## Current evidence boundary — source proved, runtime and private readiness open

CCO-C2 established a repo-owned M2 `next start` listener on port `4103` at
documentation-only HEAD `bad8ef1`; port `4115` remains unused. The anonymous
runtime verifier passed for that dated build, while the authenticated 404
check skipped because `AUTH_COOKIE` was absent. That process has stopped,
both ports are currently down, and source advanced to `2639e89`; the receipt
is historical.

Current evidence establishes source contracts and a green full harness. It
does not establish authenticated database behavior, positive provider
readiness, migration application, media ingestion/release, playable
derivatives, anonymous exact-version playback, or the real-file spine.

Private service configuration, deployed runtime state, M4 state, CCNAS mount
health, database contents, provider readiness, and production DNS/Coolify
provenance remain `UNKNOWN`; absence from this shell must not be generalized.

## Not blockers (do not re-litigate)

- Runtime tooling exists: `scripts/rebuild-public-runtime.sh` and
  `scripts/verify-runtime.sh` remain the required local path. Their 2026-07-25
  and CCO-C2 success is historical; the expired receipt is in `STATUS.md`.
- Missing optional email/AI provider keys (`RESEND_API_KEY`,
  `ANTHROPIC_API_KEY`): dependent routes fail closed by design.
- Bodyless TUS `HEAD` responses: intentional HTTP/TUS protocol behavior.
- The pre-existing Turbopack NFT trace build warning: unchanged baseline.
- The untracked `audit/` directory: out of stabilization scope; neither staged
  nor deleted.
