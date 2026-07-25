# Co-Deliver Deploy Contract

## Canonical Source

- Repo: `/Users/baileyeubanks/Desktop/Projects/contentco-op/cco-videopro-definitive-20260715`
- Branch: `codex/co-videopro-definitive-20260715`
- Framework: Next.js 16
- Default port: `4103`
- Health endpoint: `/api/health` (public response is exactly `{"status":"ok"}`)
- Canonical public host: `https://deliver.contentco-op.com`
- Legacy aliases:
  - `https://co-deliver.contentco-op.com`
  - `https://codeliver.contentco-op.com`
  - both should redirect to the canonical host at the app layer
- The older `.../contentco-op/codeliver` checkout is superseded; this definitive repo is the only live source.

## Live Publishing Rule

- Live branch: `main`
- Live source control: GitHub
- Live deploy plane: Coolify webhook-driven rebuild from `baileyeubanks/codeliver`
- Standard publish path: clean repo -> `git push origin main` -> Coolify auto-deploy -> `/api/health` verify

## Required Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Browser Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Browser Supabase anon key |
| `SUPABASE_URL` | Yes for server routes | Server-side Supabase URL |
| `SUPABASE_SERVICE_KEY` | Yes for server routes | Service-role access for project data |
| `SITE_URL` or `NEXT_PUBLIC_SITE_URL` | Recommended | Canonical base URL for share links and public review/download links |
| `RESEND_API_KEY` | Optional | Review invite / notification email sending |
| `RESEND_FROM_EMAIL` | Optional | From-address for review notifications |
| `ANTHROPIC_API_KEY` | Optional | AI-assisted review routes |
| `NAS_MEDIA_ROOT` | Yes at runtime for uploads, streaming, exports, and transcodes | Absolute CCNAS media path; no directory is created during build |
| `CODELIVER_DEMO_MODE` | Optional; local development only | Explicit server-only demo opt-in. See "Demo Mode Semantics" below |
| `PORT` | Optional | Runtime port; defaults to `4103` |

Never print, copy, or commit secret values. Report key names and presence only.

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
must fail closed if `NAS_MEDIA_ROOT` is unavailable or not writable; they must
not report an upload, export, or delivery as successful. Storage-dependent API
routes return a structured, retryable `503 {"error", "code": "STORAGE_UNAVAILABLE"}`
in that state; missing auth configuration returns `503 BACKEND_UNAVAILABLE`.

## Public Runtime Rule

- Do not serve public Co-Deliver from `next dev`.
- Public review, tus uploads, HLS playback, and signed download flows should run against a production build.
- The canonical runtime path on M2 is:

```bash
./scripts/rebuild-public-runtime.sh
```

  This runs `npm ci`, `npm run build`, validates the port-4103 listener and cwd,
  terminates only the exact repo-owned dev/start runtime, and starts `next start`
  on 4103. It never broadly kills Node processes.

- After the rebuild, verify the running production surface with:

```bash
BASE_URL=http://127.0.0.1:4103 ./scripts/verify-runtime.sh
```

  The verifier checks the demo-query auth boundary, structured session JSON,
  security headers, minimal health, no launch-editor/RSC leak surfaces, absence
  of Stripe server strings in browser chunks, and that served JS source maps are
  404/410. With a valid session cookie supplied out-of-band as `AUTH_COOKIE` it
  additionally proves the authenticated unknown-project 404.

## Docker Contract

- Dockerfile: `/Users/baileyeubanks/Desktop/Projects/contentco-op/cco-videopro-definitive-20260715/Dockerfile`
- Base image: `node:20-slim`
- Exposed port: `4103`
- Health probe: `GET /api/health`

## Coolify Notes

- Set `CODELIVER_PUBLIC_BASE` in `/Users/baileyeubanks/Desktop/Projects/ccnas-stack/.env.template`
- Use the repo root as the build context
- Probe path: `/api/health`
- Rollback owner: Content Co-op / Co-Deliver repo owner
