# Co-VideoPro / Co-Deliver Spine Deploy Contract

Status: declared release contract, reconciled to M2 source on 2026-07-26.
This document does not prove that any public host, source-control branch,
Coolify project, DNS record, runtime, database, storage provider, or scanner is
currently configured or healthy.

## Canonical Source

- Repo: `/Users/baileyeubanks/Desktop/Projects/contentco-op/cco-videopro-definitive-20260715`
- Branch: `codex/co-videopro-definitive-20260715`
- Application-source baseline: `2639e8973211476649f95029d1a3d33a5fccf57d`
- Framework: Next.js 16
- Default port: `4103`
- Health endpoint: `/api/health` (public response is exactly `{"status":"ok"}`)
- Source-enforced production surfaces:
  - `https://admin.contentco-op.com`
  - `https://client.contentco-op.com`
- Legacy/external host declarations whose live behavior is `UNKNOWN`:
  - `https://deliver.contentco-op.com`
  - `https://co-deliver.contentco-op.com`
  - `https://codeliver.contentco-op.com`
- Current application source does not implement redirects for those legacy
  hosts; unrecognized production hosts fail closed with `HOST_FORBIDDEN`.
- `app/robots.ts` still publishes the legacy `deliver` sitemap hostname. That
  stale source reference requires a bounded follow-up after live host
  provenance is established.
- The older `.../contentco-op/codeliver` checkout is superseded for local
  consolidation. This definitive repo is the canonical M2 source; deployed
  provenance is unverified.

## Legacy Publishing Declaration

- Declared live branch: `main`
- Declared source control: GitHub
- Declared deploy plane: Coolify webhook-driven rebuild from
  `baileyeubanks/codeliver`
- Intended publish path: clean reviewed repo -> `git push origin main` ->
  Coolify auto-deploy -> `/api/health` verify

These competing legacy declarations were not externally verified during
CCO-C1 and are not promoted to the release contract until live provenance
selects the actual source, branch, deploy plane, and hosts. They grant no
authority to push, deploy, change DNS, apply database migrations, select a
provider, or perform destructive work. Each action requires Bailey's explicit
approval and a fresh read-only preflight.

## Source-Referenced Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Browser Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Browser Supabase anon key |
| `SUPABASE_URL` | Yes for server routes | Server-side Supabase URL |
| `SUPABASE_SERVICE_KEY` | Yes for server routes | Service-role access for project data |
| `SUPABASE_DATA_SCHEMA` | Yes in production | Must equal `co_production` |
| `NEXT_PUBLIC_SUPABASE_DATA_SCHEMA` | Yes in production | Must equal the server schema, `co_production` |
| `ADMIN_SITE_URL` / `NEXT_PUBLIC_ADMIN_SITE_URL` | Required for split-host production | Trusted admin origin pair |
| `CLIENT_SITE_URL` / `NEXT_PUBLIC_CLIENT_SITE_URL` | Required for split-host production | Trusted client/review origin pair |
| `CO_PRODUCTION_TOKEN_ENCRYPTION_KEY` | Required for production opaque tokens | Exact 32-byte encoded key; value must never be logged |
| `CO_PRODUCTION_WEBHOOK_SECRET_ENCRYPTION_KEY` | Required for production webhooks | Exact 32-byte encoded key; value must never be logged |
| `CO_PRODUCTION_ANALYTICS_HASH_KEY` | Required for production share analytics | Stable private hash key; value must never be logged |
| `RESEND_API_KEY` | Optional | Review invite / notification email sending |
| `RESEND_FROM_EMAIL` | Optional | From-address for review notifications |
| `ANTHROPIC_API_KEY` | Optional | AI-assisted review routes |
| `CODELIVER_STORAGE_PROVIDER` | Yes for media writes | Explicit provider; only `local` and `ccnas` currently implement writes. `google-drive` and `object-store` are recognized readiness-only values whose transports remain blocked |
| `CODELIVER_STORAGE_WRITE_ENABLED` | Yes for media writes | Must be explicitly enabled before readiness can grant write authority |
| `NAS_MEDIA_ROOT` | Required for `ccnas` | Absolute CCNAS media path; no directory is created during build |
| `CODELIVER_LOCAL_STORAGE_ROOT` | Required for `local` | Explicit local media root |
| `CODELIVER_MALWARE_POLICY` | Optional; defaults to `required` | `allow-local-demo` is restricted to the local provider |
| `CODELIVER_MEDIA_PIPELINE_WORKER_TOKEN` | Required for worker-triggered media processing | Private worker authorization |
| `FFMPEG_PATH` / `FFPROBE_PATH` | Required when commands are not on `PATH` | Media derivative and metadata executables |
| `CODELIVER_DEMO_MODE` | Optional; local development only | Explicit server-only demo opt-in. See "Demo Mode Semantics" below |
| `PORT` | Optional | Runtime port; defaults to `4103` |

Never print, copy, or commit secret values. Report key names and presence only.

Current source has no production malware-scanner implementation. Under the
default required policy, verified bytes remain quarantined and automatic
release is not ready. The local-demo bypass is not production authority and
cannot release external-provider objects.

## Demo Mode Semantics

- Demo mode is enabled only when the server process has `CODELIVER_DEMO_MODE=1` **and** the request is a non-production localhost request.
- `?demo=1` in the URL is a surface selector only; it is never an authority signal.
- The proxy strips any client-supplied `x-codeliver-demo-preview` header and stamps that internal header itself only after the opt-in gate passes.
- In production (`next start` without the flag), `/projects/...?demo=1` behaves exactly like any unauthenticated protected request.

## Build and Runtime

```bash
npm ci
npm run build
npx next start --hostname 0.0.0.0 --port 4103
```

The build must pass without a mounted NAS volume. Storage directories are
created lazily when an authenticated upload begins. Runtime media operations
must fail closed if the explicit writable provider, write authorization, or
provider-applicable root is unavailable; they must not report an upload,
export, or delivery as successful. `google-drive` and `object-store` currently
use readiness-only adapters and cannot receive media writes. Storage-dependent
API routes return a structured, retryable
`503 {"error", "code": "STORAGE_UNAVAILABLE"}` in that state; missing auth
configuration returns `503 BACKEND_UNAVAILABLE`. Ingest/write readiness,
trusted-scan release readiness, and durable derivative-processing readiness are
separate gates. The current source lacks the latter two.

Production catalog authority has one writer: `/api/upload/tus`. The legacy
`/api/media/upload` and `/api/media/tus*` routes are `410 Gone` tombstones,
`POST /api/projects/[id]/assets` no longer creates metadata-only assets, and
`POST /api/assets/[id]/versions` no longer accepts arbitrary V2 `file_url`
references. A clean committed upload is attached to one managed asset and
exact V1 by
`supabase/migrations/20260726084644_atomic_upload_catalog_v1.sql`; authenticated
range playback resolves `/api/media/versions/[versionId]` against the same
provider receipt. That migration is source-only and unapplied.

`supabase/migrations/20260726113000_comment_pin_percentage_contract.sql`
aligns persisted frame pins with the 0–100 percentage contract used by both
cockpits. It takes an exclusive table lock and aborts before DDL if any legacy
pin exists; existing 0–1 values require an explicit, separately approved
remediation decision. It is source-only and unapplied.

Filesystem publication requires capacity for a full immutable copy, places
bytes into a separate sealed inode through a deterministic crash-recovery
path, and issues a receipt only after one read-only link remains. Public review
uses explicit external-safe projections; invites must be active and reference
an existing asset, password-protected invites fail closed, and frame comments
bind to the invite's exact version with complete 0–100 pin pairs. These source
contracts still require approved database, provider, and runtime proof.

## Public Runtime Rule

- Do not serve public Co-Deliver from `next dev`.
- Public review, canonical `/api/upload/tus`, exact-version playback, and
  signed download flows should run against a production build.
- No process listened on M2 port `4103` or `4115` during CCO-C1. CCO-C2 then
  established a repo-owned `next start` listener on `4103` and reran the
  anonymous verifier at documentation-only HEAD `bad8ef1`. That process has
  stopped, both ports are currently down, and source advanced to `2639e89`;
  the CCO-C2 receipt is historical and expired.
- Terminal A owns the foreground runtime:

```bash
./scripts/rebuild-public-runtime.sh
```

  This runs `npm ci`, `npm run build`, validates the port-4103 listener and cwd,
  terminates only the exact repo-owned dev/start runtime, and starts
  `next start` on 4103. It never broadly kills Node processes. Its final
  foreground `exec` does not return while the runtime is healthy.

- Terminal B verifies the running production surface:

```bash
BASE_URL=http://127.0.0.1:4103 ./scripts/verify-runtime.sh
```

  The verifier checks the demo-query auth boundary, structured session JSON,
  security headers, minimal health, no launch-editor/RSC leak surfaces, absence
  of Stripe server strings in browser chunks, and that served JS source maps are
  404/410. With a valid session cookie supplied out-of-band as `AUTH_COOKIE` it
  additionally proves the authenticated unknown-project 404.

## Declared Docker Contract

- Dockerfile: `/Users/baileyeubanks/Desktop/Projects/contentco-op/cco-videopro-definitive-20260715/Dockerfile`
- Base image: `node:20-slim`
- Exposed port: `4103`
- Health probe: `GET /api/health`

## Declared Coolify Notes

- Set `CODELIVER_PUBLIC_BASE` in `/Users/baileyeubanks/Desktop/Projects/ccnas-stack/.env.template`
- Use the repo root as the build context
- Probe path: `/api/health`
- Rollback owner: Content Co-op / Co-Deliver repo owner

## Release Gate

This contract authorizes no push, deploy, DNS, database, provider, M4/NAS
production, or destructive mutation. Release remains blocked until the
applicable Bailey approval and fresh live provenance/runtime evidence exist.
In particular, CCO-C5A requires a Bailey-approved read-only duplicate/data
preflight, database migration applications, effective-privilege/RPC proof,
and a fresh configured real-file runtime receipt before its source contracts
can be called operational. The same database gate applies to the frame-pin
migration, including a read-only inventory of legacy pin rows before its
exclusive lock or constraint changes are allowed.
