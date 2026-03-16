# Co-Deliver Deploy Contract

## Canonical Source

- Repo: `/Users/baileyeubanks/Desktop/Projects/contentco-op/codeliver`
- Framework: Next.js 16
- Default port: `4103`
- Health endpoint: `/api/health`
- Canonical public host: `https://deliver.contentco-op.com`
- Legacy aliases:
  - `https://co-deliver.contentco-op.com`
  - `https://codeliver.contentco-op.com`
  - both should redirect to the canonical host at the app layer

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
| `PORT` | Optional | Runtime port; defaults to `4103` |

## Build and Runtime

```bash
npm ci
npm run build
npx next start --hostname 0.0.0.0 --port 4103
```

## Public Runtime Rule

- Do not serve public Co-Deliver from `next dev`.
- Public review, tus uploads, HLS playback, and signed download flows should run against a production build.
- Safe local public rebuild entrypoint:

```bash
./scripts/rebuild-public-runtime.sh
```

## Docker Contract

- Dockerfile: `/Users/baileyeubanks/Desktop/Projects/contentco-op/codeliver/Dockerfile`
- Base image: `node:20-slim`
- Exposed port: `4103`
- Health probe: `GET /api/health`

## Coolify Notes

- Set `CODELIVER_PUBLIC_BASE` in `/Users/baileyeubanks/Desktop/Projects/ccnas-stack/.env.template`
- Use the repo root as the build context
- Probe path: `/api/health`
- Rollback owner: Content Co-op / Co-Deliver repo owner
