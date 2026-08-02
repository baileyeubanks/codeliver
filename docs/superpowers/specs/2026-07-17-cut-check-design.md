# Cut Check — AI Review Assist (Pass 1) — Design

**Date:** 2026-07-17
**Status:** Approved by user 2026-07-17 (scope + primary-moment + design gates passed)
**Source intelligence:** `~/competitive-analysis-sandcastles-wipster.md` (Sandcastles authenticated walkthrough + API recon; Wipster public surface)
**Repo doctrine this obeys:** One Project Operating Record · D4 cockpit sections · D8 nav honesty · dual runtime one model · Hermes FORM/JUDGMENT/CRAFT (no agent output without approval surface + liability note) · transcript is infrastructure · reasoning with provenance or nothing · slice discipline with named drops

---

## 1. Purpose

Editors currently send cuts to clients with no automated sanity pass. Competitive intel shows neither Wipster nor Frame.io ships any AI review assist, and Sandcastles' pre-production intelligence (hook/structure doctrine) never reaches post-production. **Cut Check** closes that gap inside Co-VideoPro: a deterministic analysis engine that inspects a version before it goes out, and later briefs reviewers. It is the first feature to convert the "level above market leaders" strategy into product.

**Primary moment (user decision):** both, phased — editor pre-flight first (this spec), reviewer-facing briefing second (named drop, §8).

## 2. Scope

**In scope (pass 1):**
- `cut_checks` / `cut_check_findings` entity family on the Project Operating Record
- Deterministic engine `lib/covideopro/cut-check.ts` (framework-free, consumed by demo + Supabase runtimes)
- "Run Cut Check" editor action on a version + `?section=cut-check` cockpit section
- Findings approval surface (accept/dismiss with liability note), `activity_log` provenance
- Demo-store slice + Supabase migration + transition unit tests + Playwright evidence

**Named drops (explicitly NOT built in pass 1):**
1. Reviewer-facing briefing surface on `/review/[token]` (phase 2 surface of the same engine)
2. LLM pass 2 (richer hook scoring, narrative summaries) via vault harness + `ANTHROPIC_API_KEY`
3. Fact-register cross-check (Hermes Researcher claim verification)
4. Script auto-import from cco-coscript (script conformity accepts manual paste / Creative-section reference only)
5. Closed-loop performance analytics (blocked by D8 until real rollup data exists)

## 3. Entities (schema `co_production`, one `project_id` on everything)

### `cut_checks` — one row per run
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| project_id | uuid not null | record invariant |
| asset_id | uuid not null | |
| version_id | uuid not null | the cut inspected |
| script_ref | text null | manual paste text or `creative:<section-id>` reference |
| engine | text not null | `'deterministic-v1'` (future: `'hermes-llm-v1'`) |
| status | text not null | `queued → running → completed | failed` |
| error | text null | failure detail, fail closed |
| created_by | uuid not null | |
| created_at / updated_at | timestamptz | |

### `cut_check_findings` — one row per finding
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| check_id | uuid not null → cut_checks.id | cascade on delete |
| kind | text not null | `hook | pacing | structure | proof | cta` |
| severity | text not null | `info | attention | critical` |
| title | text not null | short label, e.g. "Hook lands late" |
| detail | text not null | human-readable explanation |
| segment_ids | uuid[] not null default '{}' | transcript segment citations (provenance) |
| record_citations | jsonb not null default '[]' | `[{type:'version'|'script'|'decision', id}]` |
| status | text not null | `pending → accepted | dismissed` |
| resolved_by / resolved_at | uuid / timestamptz null | |
| created_at | timestamptz | |

**Transitions (only via `lib/covideopro/` validators, each writing `activity_log` with actor, before/after, source surface):**
- check: `queued→running→completed|failed` (system actor)
- finding: `pending→accepted|dismissed` (editor+ roles; liability note shown at resolution: "AI findings are advisory; the editor decides.")

**RLS/grants per G1 rules:** `FORCE ROW LEVEL SECURITY`, `GRANT ALL TO service_role`, `GRANT SELECT TO authenticated`, writes service-role-only; `proxy.ts` `ADMIN_API_ROUTE_PATTERNS` allowlist updated in the same commit as routes; tenant/IDOR tests in same commit.

## 4. Deterministic engine (`lib/covideopro/cut-check.ts`)

Input: version + its transcript segments + optional `script_ref` text. Output: ordered findings. Pure functions, no I/O — both runtimes call the same module.

| Check | Logic (deterministic) | Severity mapping |
|---|---|---|
| **hook** | Inspect segments overlapping the first 3.0s of record time. Detect hook patterns: question form, leading numeral/statistic, superlative/authority claim, direct-address opener. | no hook pattern in 3s → `critical`; pattern after 3s → `attention` ("hook lands late"); pattern in 3s → `info` (pass) |
| **pacing** | Words-per-second per segment from segment timestamps; gap detection between segments. | gap >1.5s → `attention`; wps >2.5 sustained → `attention`; otherwise `info` |
| **structure** | Curiosity-loop markers ("and it gets better", "but", "so"), paragraph/beat boundaries from segment flow. | no structural pivot detected → `attention` |
| **proof** | Numeric/quantified claims (currency, %, measurements). If `script_ref` present, diff detected proof points vs script's proof tokens. | script proof point missing from cut → `critical`; zero proof points and script has them → `attention`; counts align → `info` |
| **cta** | Final 5s segments scanned for call-to-action forms (imperative + audience reference). | no CTA → `attention` |

Every finding carries `segment_ids` of the evidence and `record_citations` (version always; script when `script_ref` used). No transcript → engine returns one honest `info` finding "Cut Check needs a transcript for this version" and check completes; no fabricated analysis.

## 5. Surfaces

**Editor pre-flight (built now):**
- "Run Cut Check" action on a version within the review workspace, gated on the existing `creative:write` capability (findings readable at `creative:read`, resolvable at `creative:write`, mirroring the G1 minRole convention GET=viewer / writes=editor). If the `WorkspaceCapability` registry is found to lack the `creative` family at implementation time, introduce `assist:read` / `assist:write` following the same registry pattern — decided in the plan, not improvised in code.
- **`?section=cut-check` cockpit section** (D4 — no route-tree rewrite). Contents: run history (version, engine, status chip, time), findings list in existing visual language — severity chips matching lifecycle stage chips, finding cards with detail + segment citations that deep-link the media stage to the cited record time, accept/dismiss controls with liability note, honest empty states ("No Cut Checks yet — run one from a version", "needs transcript").
- Aesthetic: quiet chrome, content center stage; no new nav destination until the section is real end-to-end (D8); light editorial surfaces matching the cockpit; no consumer-viral/dark-gradient marketing styling (per teardown's "what NOT to take").

**Reviewer briefing (named drop):** phase 2 — "what changed / what to watch" panel on `/review/[token]`, Review Theater treatment, sourced from the same engine output.

## 6. API routes (Supabase runtime)

- `POST /api/projects/[id]/assets/[assetId]/versions/[versionId]/cut-checks` — create run (editor+), idempotent per (version_id, engine) while a run is active
- `GET /api/projects/[id]/cut-checks` — list runs for project (viewer+)
- `GET /api/projects/[id]/cut-checks/[checkId]` — run + findings (viewer+)
- `POST /api/projects/[id]/cut-checks/[checkId]/findings/[findingId]/resolve` — `{action: accept|dismiss}` (editor+), validated transition + activity_log
- Routes use service role; never trust client `project_id`; all four patterns added to `proxy.ts` `ADMIN_API_ROUTE_PATTERNS`.

Demo runtime: matching handlers in the demo workspace store under the existing versioned storage key (new slice, migration-safe default), same validators.

## 7. Error handling

- Engine failures fail closed: check → `failed` with `error`; no partial findings persisted.
- Missing transcript: honest `info` finding (§4), check completes.
- LLM absent (no key): pass 1 unaffected; pass 2 (when built) must no-op cleanly per deploy contract.
- Version deleted mid-run: run completes against immutable segment snapshot taken at queue time.

## 8. Testing

- `tests/cut-check-transitions.test.ts` — check + finding state machines, invalid transitions rejected, activity_log events written
- `tests/cut-check-engine.test.ts` — fixture transcripts → expected findings (hook late, dead air, missing proof vs script, no-CTA, no-transcript honesty)
- `tests/cut-check-api.test.ts` — route authorization matrix (viewer/editor/producer, external reviewer tokens get 403), tenant/IDOR isolation, idempotent create
- Demo-store slice tests alongside existing store tests
- Playwright evidence (G4 harness): run a Cut Check in demo, section renders, finding resolve round-trips; screenshots to `docs/design-evidence/`
- Gates before merge: `npm run typecheck`, `npm run lint`, `npm test` green

## 9. Merge strategy

Feature branch off the current tip (working tree has unrelated in-progress modifications — branch carries them, but Cut Check commits contain only Cut Check files). PR-style merge to the product's main line after user confirmation. Update `docs/COVIDEOPRO_UPGRADE_LOG.md` with the drop name ("Cut Check pass 1") and this spec's named drops.
