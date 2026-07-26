# Webster — Truth Map (one authority per domain)

**Date:** 2026-07-17 · Blueprint §12.1: exactly one authority per domain, documented. Current-as-built vs target.

| Domain | Authority today | Target (per blueprint, adjusted to repo reality) | Notes |
|---|---|---|---|
| Identity / membership | Supabase Auth (prod) · demo session (local) | unchanged | proxy.ts enforces surface/role |
| Transactional entities | `co_production` schema (Supabase Postgres) | unchanged | migrations 001–015; record entities 014/015/016(pending apply) |
| Entity behavior / state machines | `lib/covideopro/transitions.ts` (pure, shared by both runtimes) | unchanged | the one behavioral authority — demo + prod + tests consume the same validators |
| Local/dev runtime | demo workspace store (`co-videopro.workspace.v2`, localStorage) | unchanged (dev only) | D5: demo is a truthful local runtime, never a prod authority |
| Media originals | NAS (`NAS_MEDIA_ROOT`, fail-closed) | + BYO-storage registration (gap T7) | originals immutable |
| Proxies / derivatives | media-pipeline outputs (worker-authorized) | unchanged | parent/derivative lineage via object keys |
| Job state | `co_production.transcode_jobs` | unchanged | worker routes; never in request/response |
| Review presence / comments | Supabase tables (comments, annotations, versions) | unchanged | Socket.io presence: not adopted (polling/realtime hooks exist) |
| Search / vector | none yet (lexical via SQL/tsvector later; pgvector target) | pgvector when Brain lands | embeddings are not an authz layer (blueprint §7.1) |
| Audit ledger | `co_production.activity_log` + vault agent_runs | unchanged | every transition writes activity (demo parity proven) |
| Finance truth | `payment_milestones` (integer cents) | + rate cards (T3) | money never floats |
| Timecode | rational fps + seconds (validated clips) | add frame/PTS representation where frame-critical (blueprint §11) | EDL uses fps-exact timecode already |
| External calendar/email | none yet | adapters (post-P0) | no fake integrations |
| Secrets | env vars only, server-side | Secret Manager on deploy | nothing in client bundle/repo |

**Anti-split-brain rule (binding):** no Firestore + Supabase + JSON authorities for the same objects. Firebase may be introduced ONLY for bounded collaboration/presence later, and never as an entity authority.
