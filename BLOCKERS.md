# Co-ProVideo Stabilization Blockers

Updated: 2026-07-25
Machine: M2
Branch: `codex/co-videopro-definitive-20260715`

Two environment blockers remain. Both have now been encountered repeatedly
across stabilization loop iterations; they are recorded precisely here per the
three-repeat blocker rule. Everything not gated on them is proceeding.

Never print, copy, or commit secret values. Report key names and presence only.

## Blocker 1 — Supabase configuration absent

Missing keys in the M2 shell:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`

Verified absent with:

```bash
env | grep -E '^(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_URL|SUPABASE_SERVICE_KEY)=' || echo "supabase env absent"
```

What it blocks:

- A real authenticated production session cannot be created, so the
  authenticated unknown-project 404 (audit L2 / F8) cannot be runtime-proved.
- Real database-backed project/asset/team/webhook API flows cannot be
  end-to-end proved against the production runtime.
- Real-session proof for audit C2 (stable server session with a genuine
  Supabase identity) cannot be completed.

Commands that prove it once resolved (with the four keys exported):

```bash
# 1. Production runtime must be up first:
./scripts/rebuild-public-runtime.sh

# 2. Session returns structured identity for a real login:
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4103/api/auth/session
#   logged out -> 401 {"authenticated":false}; with a valid cookie -> 200 identity JSON

# 3. Authenticated unknown project is a real 404 (cookie supplied out-of-band,
#    never written to chat, docs, tests, or commits):
AUTH_COOKIE='<session cookie>' BASE_URL=http://127.0.0.1:4103 ./scripts/verify-runtime.sh
```

## Blocker 2 — `NAS_MEDIA_ROOT` absent

Verified absent with:

```bash
env | grep -E '^NAS_MEDIA_ROOT=' || echo "NAS_MEDIA_ROOT absent"
```

What it blocks:

- Real NAS-backed upload, reload, playback, retry, export, and transcode
  behavior (F11) cannot be end-to-end proved.
- The positive side of the storage contract is unproven; only the fail-closed
  negative side (retryable `503 STORAGE_UNAVAILABLE` with no false success)
  is provable in the current environment.

Commands that prove it once resolved (with `NAS_MEDIA_ROOT` set to a writable
CCNAS path and the production runtime up):

```bash
# 1. Storage readiness reports ready:
curl -sS http://127.0.0.1:4103/api/storage/readiness | jq .

# 2. Authenticated TUS upload creates and completes against the NAS
#    (requires a valid session, see Blocker 1):
curl -sS -X POST http://127.0.0.1:4103/api/upload/tus \
  -H 'Tus-Resumable: 1.0.0' -H 'Upload-Length: 1' -H 'Cookie: <session>'

# 3. Browser proof: upload -> reload -> playback -> retry state under
#    temporarily removed storage.
```

## Not blockers (do not re-litigate)

- Port 4103 cutover: DONE 2026-07-25 — `next start` via
  `scripts/rebuild-public-runtime.sh`; verifier PASS. No longer pending.
- Missing optional email/AI provider keys (`RESEND_API_KEY`,
  `ANTHROPIC_API_KEY`): dependent routes fail closed by design.
- Bodyless TUS `HEAD` responses: intentional HTTP/TUS protocol behavior.
- The pre-existing Turbopack NFT trace build warning: unchanged baseline.
- The untracked `audit/` directory: out of stabilization scope; neither staged
  nor deleted.
