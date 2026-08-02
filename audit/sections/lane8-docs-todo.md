# Lane 8 — Doc Archaeology & The True Remaining TODO

**Repo:** `cco-videopro-definitive-20260715` · **Method:** read-only static audit; every claim carries a file:line or command anchor. Runtime behavior (live DB, running app at :4103) is other lanes' territory — where a verdict depends on runtime, that is stated explicitly.
**Naming truth:** code says the product is **co-videopro, styled Co-VideoPro** (`package.json:2` `"name": "co-videopro"`, `app/layout.tsx:5` `"Co-VideoPro | Content Co-op"`, `components/brand/CoProductionBrand.tsx:17,48`). "Co-VideoPro" (docs) vs "Co-VideoPro" (code) is itself an unresolved drift — `COVIDEOPRO_*` doc filenames use a name the code never renders.

---

## 1. Document classification (every doc, one verdict, one line of evidence)

### Top-level

| Doc | Verdict | Evidence |
|---|---|---|
| `00_REPO_CONTEXT.md` | **DESCRIBES A DEAD PRODUCT** | Header line 1: "# CO-DELIVER Repo Context"; calls repo "standalone review and delivery product"; key files point at `.../codeliver/` paths. Current product per `app/layout.tsx:5` is Co-VideoPro. |
| `DEPLOY_CONTRACT.md` | **CONTRADICTED BY CODE** | Title line 1 "Co-Deliver Deploy Contract", repo path `.../codeliver` (line 5), host `deliver.contentco-op.com` (line 9); `package.json:2` says `co-videopro`. Port 4103 + health contract still match (`app/api/health/`, `Dockerfile` EXPOSE 4103). See §4. |
| `STABILIZATION_PLAN.md` | **DESCRIBES A DEAD PRODUCT** | Line 1 "Co-Deliver Stabilization Plan", dated March 10 2026; gaps listed (share_intent, approval binding) predate the Co-VideoPro record build (`lib/covideopro/record.ts`, migration `20260716120000`). |
| `design-qa.md` | **SUPERSEDED** | QA checkpoints dated 2026-07-14/15 against the co-deliver light cockpit ("white, cool-gray, navy" line 60) — design bible (`COPROVIDEO_DESIGN_BIBLE.md:3`) adopted graphite/ivory Co-VideoPro tokens on 2026-07-17, now live in `app/globals.css`. References paths outside this worktree (`cco-codeliver/docs/...`). |

### docs/ — COVIDEOPRO / COPROVIDEO generation (2026-07-16/17, this product)

| Doc | Verdict | Evidence |
|---|---|---|
| `COVIDEOPRO_TARGET_ARCHITECTURE.md` | **LIVE (governing)** | §4.3 schema matches migration `supabase/migrations/20260716120000_project_operating_record.sql` (14 `CREATE TABLE co_production.*`, lines 24–224); §2.1 nav rows match `components/navigation/navigation-model.ts:105–220` except `/deliveries` and `/insights` still absent (no `app/(dashboard)/deliveries`). Detail drift flagged in §3. |
| `COVIDEOPRO_CURRENT_STATE.md` | **SUPERSEDED (the dangerous one)** | Dated 2026-07-16 pre-mission audit. Its claims are now false: "package.json name is still co-deliver" (§0) vs `package.json:2` = co-videopro; "Home … Redirect shell" (§2) vs real home `app/(dashboard)/page.tsx:24` (attention queue via `lib/covideopro/exceptions.ts`); "no inquiry/brief/proposal entities" (§3 rows 1–4) vs `app/api/inquiries/route.ts`, `lib/covideopro/record.ts`, migration 20260716120000; "no sequence model" vs `components/projects/SequenceTimeline.tsx`. **This is the stale-doc class that caused the five-day stall — treat as historical baseline only.** |
| `COVIDEOPRO_OPEN_RISKS.md` | **PARTIALLY STALE** | R2/R4 now stale in code (see §2); R1/R3/R7 still stand. Also lags code: 12 migrations exist after the one it tracks (`20260716130000` … `20260717130000`). |
| `COVIDEOPRO_PRODUCT_MODEL.md` | **LIVE** | Entity/state spec matches `lib/covideopro/record.ts` and `lib/covideopro/transitions.ts` (self-described "implemented now (Slices 1–4)"). |
| `COVIDEOPRO_DECISIONS.md` | **LIVE** | D3/D5 verifiable in code: storage key `co-videopro.workspace.v2` (`lib/demo/workspace-store.ts:115`) with v1 shim (`:116,802`). |
| `COVIDEOPRO_UPGRADE_LOG.md` | **LIVE (historical ledger)** | Append-only log of the 07-16 mission; consistent with present tree. |
| `COVIDEOPRO_FINAL_REPORT_2026-07-16.md` | **SUPERSEDED in part** | End-of-07-16-mission snapshot; later 07-17 work (shots, deliverable QC migrations `20260717120000/130000`, field page) post-dates it. |
| `COVIDEOPRO_WORKFLOWS.md` | **LIVE but demo-scoped** | Claims verified "against the demo runtime" — accurate: record surfaces are demo-store-backed (`components/projects/ProjectRecordSections.tsx:83,219,410,508,670` all `if (!demoMode) return <SectionEmpty …/>`). |
| `COVIDEOPRO_MEDIA_ARCHITECTURE.md` | **LIVE** | Matches `app/api/upload/tus/*`, `lib/media-pipeline/`, `lib/storage/*` as described. |
| `COVIDEOPRO_G1_PROD_PARITY_PLAN.md` | **LIVE — and it is the real TODO map** | Route list (briefs, proposals, plan-items, selects, sequences, revision-requests, decisions, deliverables, payment-milestones) is **not built**: `find app/api -name route.ts` shows none of these. Status header says "M1 in execution". |
| `COVIDEOPRO_MEGA_BUILD_PROMPT.md` | **LIVE (build prompt)** | Self-described as grounded in this repo's code 2026-07-17 with file:line anchors; its gap list matches what is actually missing (production-truthful remote runtime). |
| `COPROVIDEO_DESIGN_BIBLE.md` | **LIVE (binding tokens — verified)** | All 13 tokens exist in `app/globals.css` (`grep -c -- "--graphite|--charcoal|--ivory-dim|--stone|--midnight|--cobalt|--sage|--amber-cp|--crimson|--hairline-cp|--chrome-edge"` → 1,2,4,1,4,6,2,2,1,3,6). Brand lockup matches `components/brand/CoProductionBrand.tsx`. Its tranche list (Studio Home, client world) is aspirational, not claim-of-built. |
| `COPROVIDEO_NORTHSTAR_UI_PLAN.md` | **LIVE (plan)** | 2026-07-17 plan; honestly marks gaps (no AI copilot, right rail uncomposed). |
| `COVIDEOPRO_CCO_UNIVERSE_ADOPTION.md` | **LIVE (doctrine)** | Dialect law consistent with current surfaces; "future" items labeled future. Note: says it governs with `WEBSTER_MISSION_STATE.md` — a retired-name doc. |
| `CCO_DESIGN_UNIVERSE_MEGA_AUDIT.md` | **LIVE (research/reference)** | Cross-repo design audit; not a status claim about this repo's code. |
| `COVIDEOPRO_COMPETITIVE_TEARDOWN.md` | **LIVE (research)** | Competitive analysis, no code-status claims. |
| `COVIDEOPRO_ENTERPRISE_BENCHMARK.md` | **LIVE (research, anchored)** | Claims anchored to commit `720a175` "as-built … verified features only" — internally honest. |
| `COVIDEOPRO_CAPABILITY_ARCHITECTURE.md` | **CONTRADICTED BY CODE (aspirational map)** | Presents a full "operating world" (Pre-Production Studio, Production Hub, …) with no build/gap markers; most of those surfaces have no routes (no `/api/briefs`, no schedule/crew pages). Reads as a product map, not a spec — flag it. |
| `COVIDEOPRO_INTENTIONALITY.md` | **LIVE (doctrine source)** | Owner-intent extraction; no code claims to contradict. |
| `COVIDEOPRO_IMPROVEMENT_LOOP.md` | **LIVE (process)** | Loop register aligned to INTENTIONALITY. |
| `COVIDEOPRO_SCRIPTING_REFERENCES.md` | **LIVE (reference)** | Screenshot pattern notes; explicitly "Not a build order". |
| `COVIDEOPRO_SECURITY_BUILD_PLAN.md` | **LIVE (plan)** | Defensive security plan; no status claims contradicted. |
| `COVIDEOPRO_METRONIC_PORT_PLAN.md` | **SUPERSEDED / moot** | Metronic-as-token-source plan; the adopted identity went bespoke (design bible + `app/globals.css` 5,997 lines hand-maintained); no Metronic imports found in `components/`. |
| `COVIDEOPRO_CCO_UNIVERSE_ADOPTION.md` | (above) | — |

### docs/ — Co-Deliver generation (retired product, but historically true)

| Doc | Verdict | Evidence |
|---|---|---|
| `CODELIVER_CAPTAIN_AUDIT_2026-03-09.md` | **DESCRIBES A DEAD PRODUCT** | "Co-Deliver Captain Audit" for the standalone review product; product renamed per D3 (`COVIDEOPRO_DECISIONS.md`). |
| `codeliver-canon-freeze.md` | **DESCRIBES A DEAD PRODUCT** | "Co-Deliver is a standalone review product" — superseded by the Co-VideoPro record model. |
| `codeliver-re-audit.md` | **DESCRIBES A DEAD PRODUCT** | Same scope; Wipster-style review product classification. |
| `auth-data-model.md` | **DESCRIBES A DEAD PRODUCT** | "Co-Deliver is a standalone product" (line 3); superseded by `certification/auth-provisioning-launch.md` + current auth code. |
| `auth-account-branding-enterprise-map.md` | **SUPERSEDED** | 2026-07-14 "Horizon 1 demo slice"; enterprise-model code has since moved (`components/auth/enterprise-model.ts`). |
| `review-surface-root-cause.md` | **SUPERSEDED (historical)** | Describes residue (SharingPreviewPage, CommentPanel stack) since removed — none of those files exist in `components/` now. |
| `review-surface-stabilization.md` | **SUPERSEDED (historical)** | Co-Deliver review-shell stabilization note; review surface is now `components/review/ReviewWorkspace.tsx` on Co-VideoPro tokens. |
| `sharing-followups.md` | **SUPERSEDED / partially live** | `share_intent` gap: still derived, not a stored column (no `share_intent` in `supabase/migrations/*`) — the *gap* is real, but the doc predates the record build; authority now `sharing-notification-authority.md`. |
| `sharing-notification-authority.md` | **LIVE (implementation note)** | Matches version-bound sharing code under `app/api/assets/[id]/share`, `app/api/sharing/*`. |
| `storage-upload-enterprise-map.md` | **LIVE (implementation note)** | Matches `lib/storage/*` + tus routes; "pillar remains open" still true (NAS fail-closed contract, `DEPLOY_CONTRACT.md:34`). |
| `CO_CREDIT_VAULT_AGENT_HARNESS.md` | **LIVE (implementation note)** | Matches `app/api/vault/*`, `app/api/usage/*` routes; self-labeled "Not a production billing claim" — honest. |

### docs/ — Webster generation (retired name, 2026-07-17)

| Doc | Verdict | Evidence |
|---|---|---|
| `WEBSTER_MASTER_BLUEPRINT.md` | **DESCRIBES A DEAD PRODUCT (name retired)** | Line 3 of `COPROVIDEO_DESIGN_BIBLE.md`: "supersedes the Webster board system (that name is retired)". The doc itself (line 5) admits "Naming … is an open user decision" — that decision was made: Co-VideoPro. |
| `WEBSTER_MISSION_STATE.md` | **DESCRIBES A DEAD PRODUCT (name retired)** | Same; requirement→artifact table may still be useful, but the frame is a dead name. |
| `WEBSTER_TRUTH_MAP.md` | **DESCRIBES A DEAD PRODUCT + stale** | Names "Webster" as the product; also says "record entities 014/015/016(pending apply)" while migrations through `20260717130000` exist. |
| `WEBSTER_x_PRODUCTION_MACHINE_SYNTHESIS.md` | **DESCRIBES A DEAD PRODUCT (name retired)** | Synthesis doc on the "Webster" frame. |

### docs/ subdirectories

| Path | Verdict | Evidence |
|---|---|---|
| `docs/strategy/co-produce-*` (3 files) | **SUPERSEDED (name)** | "Co-Produce" was D3-retired; content (lifecycle contract, vault harness, transcript pillar) is implemented and load-bearing (`lib/co-produce/lifecycle-contract.ts`, kept per D3). |
| `docs/strategy/token-metering-…` | **SUPERSEDED (name)** | Implemented by `app/api/usage/*`. |
| `docs/certification/*` (6 files) | **SUPERSEDED (historical certs)** | All certify co-deliver-era HEADs (`585a703`, "cco-codeliver" repo, 2026-07-14/15); predate the Co-VideoPro build. Valid as history, not as current certification. |
| `docs/design-evidence/*` | **MIXED** | `co-deliver/` + `reality/co-deliver` are retired-era screenshots; `co-videopro-definitive-20260715`, `cpv-cinematic-20260717`, `shell-law-20260717` are current-era. |
| `docs/superpowers/plans|specs` (3 files) | **LIVE (working notes)** | 2026-07-17 cut-check / sequence-review-render specs — match built `SequenceTimeline` + render route. |

---

## 2. COVIDEOPRO_OPEN_RISKS.md — verdict per risk (doc-vs-code cross-check only)

- **R1 (migration 014 never run) — CONFIRMED (doc-verifiable half), STALE in scope.** File exists with the promised 14 tables (`supabase/migrations/20260716120000_project_operating_record.sql:24–224`: organizations, contacts, inquiries, briefs, brief_versions, proposals, proposal_versions, plan_items, selects, sequences, sequence_clips, revision_requests, decisions, deliverables). "Never executed against a live DB" cannot be proven or refuted from the repo — that is the runtime lane's call. But the doc's horizon is stale: **12 further migrations now exist** (`20260716130000_payments_notifications` through `20260717130000_deliverable_qc`), all equally unapplied-verified. Risk should read "migrations 014–024 unverified against a live database".
- **R2 (remote record APIs unwritten) — PARTIALLY STALE.** "Supabase API routes for the new entities do not exist yet" is now false for the CRM spine: `app/api/organizations/route.ts`, `app/api/contacts/route.ts`, `app/api/inquiries/route.ts` (+ `[id]`, `/convert`) exist and are Supabase-backed (`app/api/inquiries/route.ts:4,36–45` uses `getSupabase()` with owner scoping). Still true for: briefs, proposals, plan-items, selects, sequences(+clips), revision-requests, decisions, deliverables, payment-milestones — **no routes exist** (`find app/api -name route.ts`), and the UI confirms it: `ProjectRecordSections.tsx:83,219,410,508,670` render `SectionEmpty` ("available in the local workspace") when `!demoMode`. So R2 is half-fixed, half-confirmed.
- **R3 (demo persistence browser-local) — CONFIRMED.** `lib/demo/workspace-store.ts:115` key `co-videopro.workspace.v2`, localStorage writes at `:816,832,851`; media blobs in IndexedDB `co-deliver-demo-media` (`lib/demo/media-blob-store.ts:5` — note stale key name).
- **R4 (sequence playback not built) — ALREADY FIXED (stale).** `components/projects/SequenceTimeline.tsx` (267 lines) exists with real playback: header comment lines 33–34 "real playback (source seeked clip-to-clip), playhead sync, trim/split/ripple-delete through validated store mutations"; `<video>` ref at `:42`, sequence→source time mapping at `:58–67`. Plus EDL export (`lib/covideopro/edl.ts`) and demo render-to-asset via ffmpeg (`lib/demo/workspace-store.ts:2463 renderSequenceToAsset` → `POST /api/render/sequence`, traversal-guarded to `public/demo`, `app/api/render/sequence/route.ts:26–35`). It is demo-runtime-only (`ProjectRecordSections.tsx:670`), but "no playback engine or visual timeline yet" is simply false now.
- **R7 (deploy contract still co-deliver) — CONFIRMED, and WORSE than stated.** `DEPLOY_CONTRACT.md:1` title "Co-Deliver Deploy Contract"; `:5` canonical repo `.../contentco-op/codeliver`; `:9` host `deliver.contentco-op.com`; `:19` Coolify rebuild from `baileyeubanks/codeliver`; `:69` `CODELIVER_PUBLIC_BASE`. Plus: `scripts/rebuild-public-runtime.sh:4` hardcodes `APP_DIR=".../contentco-op/codeliver"` (would target the wrong directory if run from this worktree), `app/api/health/_lib/identity.ts:1` `HEALTH_SERVICE_ID = "co-deliver"` (kept deliberately per R7 mitigation, but a monitoring/dashboard consumer will see the dead name), worker auth header `x-codeliver-media-worker-token` (`app/api/transcode/_lib/worker-auth.ts:7`), env prefix `CODELIVER_*` (`app/api/health/_lib/checks.ts:127,187–188,264,269`).
- (R5/R6/R8 — outside the asked set; R5/R6 plausibly still open, not re-verified here.)

## 3. COVIDEOPRO_TARGET_ARCHITECTURE.md — does the code match?

Mostly yes, with measurable gaps:

- **Matches:** dual runtime with shared model in `lib/` (`lib/covideopro/record.ts`, `transitions.ts`; consumed by demo store and `app/api/inquiries/*`); storage key v2 + shim; nav model rows (`navigation-model.ts:105–220` = Overview, Projects, Opportunities, Reviews, Activity, Field, Media library, Archive, Trash, Settings — D8 honesty rule held: no Schedule/Resources/Finance/Insights entries); project record sections exist as cockpit sections (`ProjectRecordSections.tsx` exports Creative/Proposal/Plan/Delivery/Sequences/ReviewConsolidation); migrations match §4.3.
- **Gaps / contradictions:** `/deliveries` global route **not built** (no `app/(dashboard)/deliveries/page.tsx`; nav has no entry either — doc §2.1 said "build (Slice C)", code wins: absent). `/insights` correctly absent per doc. "Project context bar" (§3.2) — need runtime lane to confirm visually; not verifiable statically with confidence. Remote runtime for record entities absent (§2 R2 above) — doc §4.3's "schema-and-test complete" is true only for schema. Hermes (§6): no Hermes surface exists (no routes/components) — consistent with doc's scoping but worth noting nothing landed.

## 4. DEPLOY_CONTRACT.md — R7 detail: what's stale

Name "Co-Deliver" throughout (lines 1, 52, 72); canonical repo path `.../codeliver` (5, 62); host `deliver.contentco-op.com` + legacy aliases (9–13); Coolify repo `baileyeubanks/codeliver` (19); `CODELIVER_PUBLIC_BASE` (69). **Still accurate:** port 4103 (`package.json` scripts, `Dockerfile`), health endpoints (`app/api/health/{route,live,ready,dependencies}`), env var table (`NEXT_PUBLIC_SUPABASE_*`, `NAS_MEDIA_ROOT`, etc.), build/run commands, Docker base image/port/probe. So: ops mechanics live, identity dead. Also stale-by-omission: no mention of the record-entity migrations (014+) that a production deploy must now apply.

## 5. WEBSTER_* docs — retired name, and code is clean

- Retired by `COPROVIDEO_DESIGN_BIBLE.md:3` ("that name is retired"). All four `WEBSTER_*` docs + 4 others referencing Webster (`COPROVIDEO_DESIGN_BIBLE`, `CCO_DESIGN_UNIVERSE_MEGA_AUDIT`, `COVIDEOPRO_CCO_UNIVERSE_ADOPTION`, `COVIDEOPRO_UPGRADE_LOG`) are doc-only occurrences.
- **Live-code occurrences of `webster`: ZERO.** `grep -rin webster app components lib packages scripts infra public package.json next.config.ts proxy.ts Dockerfile` → no hits.

## 6. Naming drift sweep (`webster` / `co-deliver` / `codeliver`, case-insensitive)

- **Docs estate:** 52 files contain `co-?deliver` (incl. 16 with literal `codeliver`); 8 contain `webster` (lists above). No code action implied; these are historical docs.
- **Live code — full list** (`grep -rin` over app/components/lib/packages/scripts/infra/public/configs, excluding node_modules; `@/lib/types/codeliver` import lines counted once via their module):

  | Where | Occurrences | Character |
  |---|---|---|
  | `lib/types/codeliver.ts` + ~30 importers across `app/api/*`, `components/*`, `lib/demo/workspace-store.ts:22`, `lib/middleware/rbac.ts:3`, `lib/co-produce/lifecycle-contract.ts:3` | module + import sites | Internal type-module name; user-invisible; renaming touches ~30 files (mechanical). |
  | `app/api/health/_lib/identity.ts:1` | `HEALTH_SERVICE_ID = "co-deliver"` | **Externally visible** in health payload; deliberately kept (R7) but is the dead name at the monitoring edge. |
  | `app/api/health/_lib/checks.ts:127,187,188,191,264,269` | `CODELIVER_*` env vars | Deploy contract surface. |
  | `app/api/transcode/_lib/worker-auth.ts:6–7`, `app/api/media/{tus,transcode,upload}/route.ts` | `CODELIVER_MEDIA_PIPELINE_WORKER_TOKEN`, `x-codeliver-media-worker-token` | Worker auth contract; rename must be coordinated with the worker. |
  | `app/api/ai/{summarize,brand-check}/route.ts` (53, 90) | `CODELIVER_AI_EXTERNAL_PROCESSING_ENABLED` | Env surface. |
  | `components/auth/auth-policy.ts:96,150` | `https://co-deliver.local` base URL | Placeholder origin for URL parsing; harmless but stale. |
  | `components/auth/enterprise-model.ts:2,217,238,241,298,310,347,357,391` | storage key `co-deliver.identity-governance.v2`, workspace ids/slugs, back-compat rename check (line 391 accepts both names — good) | Storage-key compat; intentional. |
  | `components/projects/ProjectCockpit.tsx:151`, `components/review/ReviewWorkspace.tsx:43` | `co-deliver-review-seek-step` legacy key | Labeled LEGACY; shimmed. |
  | `components/cockpit/cockpit-layout.ts:96`, `useCockpitLayout.ts:14` | `co-deliver.cockpit-layout.v…`, event name | Storage keys. |
  | `components/player/PlayerControls.tsx:21` | `codeliver.review.seek-interval` | Storage key (unshimmed stale name). |
  | `lib/demo/media-blob-store.ts:5` | IndexedDB `co-deliver-demo-media` | Storage key. |
  | `lib/demo/workspace-store.ts:116` | legacy key list `co-deliver.demo-workspace.v1` | Intentional migration shim (D3). |
  | `lib/co-produce/lifecycle-contract.ts:193,204,218,232,246` | `authority: "co-deliver"` literal in union type + contract rows | **Load-bearing contract value** consumed by tests; rename needs contract+test coordination. |
  | `scripts/rebuild-public-runtime.sh:4,12,17` | hardcoded `APP_DIR=.../codeliver`, log prefix | **Actively wrong path** — running it from this worktree rebuilds the wrong directory. Highest-risk stale reference. |
  | `scripts/auth/bootstrap-roles.ts:37` | help text "Co-Deliver Auth role bootstrap" | Cosmetic. |
  | `scripts/certification/receipts/*.json` | historical receipts referencing `cco-codeliver` | Historical artifacts; leave alone. |
  | `Dockerfile` | none | Clean. |
  | `packages/*`, `infra/` | none found | Clean. |

## 7. THE TRUE REMAINING TODO (derived from code, not docs)

Ranked by impact on the owner's stated wants (Wipster-class review space; mini-NLE with bin; real project folders on NAS; clients list; brief authoring; real calendar grid). Evidence inline; effort S/M/L/XL.

1. **[XL] Remote (Supabase) record APIs for the operating-record entities — the single biggest gap.** Briefs, proposals, plan-items, selects, sequences+clips, revision-requests, decisions, deliverables, payment-milestones have **no routes** (`find app/api -name route.ts`); UI renders `SectionEmpty` off-demo (`components/projects/ProjectRecordSections.tsx:83,219,410,508,670`). Route list + role conventions already specified in `docs/COVIDEOPRO_G1_PROD_PARITY_PLAN.md`. Blocks: brief authoring, clients, delivery in production. Schema exists (migration 20260716120000) so it's route-handler + validator-reuse work.
2. **[L] Real calendar/schedule grid.** No calendar component exists anywhere (`grep -ri calendar components app` → only incidental mentions); plan items are a demo list (`ProjectRecordSections.tsx:400` PlanSection). Owner wants a real grid. Needs plan_items API (item 1) + grid UI.
3. **[L] Apply + verify migrations 014–024 against a live database** (`supabase/migrations/20260716120000` … `20260717130000` — 12 migrations never proven on real Postgres, R1). Blocks everything in item 1 in production. Runtime-lane dependent.
4. **[M] Transcription beyond safe-demo.** `app/api/assets/[id]/transcript/route.ts:135–142` → 501 "Only the network-free safe-demo provider is installed"; batch planning 501 (`transcript/batch/route.ts:44`). Real provider wiring (Anthropic/Whisper) is env-gated but unbuilt/unverified. Blocks transcript→selects→sequence thesis in production.
5. **[M] Payments/checkout real provider.** Milestones schema exists (`supabase/migrations/20260716130000_payments_notifications.sql:21–24` checkout fields) but UI is labeled "offline checkout (mock)" (`ProjectRecordSections.tsx:1021`); no Stripe/provider route exists.
6. **[M] Deploy/ops rename (R7).** `scripts/rebuild-public-runtime.sh:4` points at the old `codeliver` directory (actively wrong); `DEPLOY_CONTRACT.md` identity block; `HEALTH_SERVICE_ID`, `CODELIVER_*` envs, worker token header. Coordinate with monitoring/worker before renaming; at minimum fix the script path.
7. **[M] Sequence/mini-NLE on the remote runtime + bin polish.** Timeline exists demo-only (`SequenceTimeline.tsx`, render via `/api/render/sequence` guarded to `public/demo`, `app/api/render/sequence/route.ts:26–35`); production path needs sequences API + NAS-file concat rendering instead of demo-root guard.
8. **[S] Clients list in production.** Clients UI exists but is demo-store-backed (`app/(dashboard)/opportunities/page.tsx:239–254` reads `workspace.organizations`); org/contact APIs exist (`app/api/organizations`, `app/api/contacts`) — wire the surface to the remote runtime.
9. **[S] Home in remote mode.** `app/(dashboard)/page.tsx` is demo-workspace-driven; verify/implement honest remote fallback (other lanes confirm what renders at :4103 non-demo).
10. **[S] Typecheck blind spots.** `tsconfig.json` include covers only `app/ lib/ components/ .next/types` — `proxy.ts`, `tests/`, `packages/*`, `scripts/` unchecked (flagged by Current State §1.8, still true by inspection of tsconfig include).
11. **[S] Test/type debt:** no skipped tests of consequence (`grep -n '\.skip' tests/` → only conditional `t.skip("ffmpeg is unavailable")` at `tests/media-pipeline.test.ts:5220`); only two "not implemented" markers in code, both intentional contract guards (`lib/co-produce/lifecycle-contract.ts:1410,2273`). No stub routes returning blanket 501s besides transcript (item 4).
12. **[S] Doc hygiene (this audit's direct fix list).** Retire/quarantine: `00_REPO_CONTEXT.md`, `STABILIZATION_PLAN.md`, `CODELIVER_*`, `codeliver-*`, `auth-data-model.md`, `WEBSTER_*` (move to `docs/archive/` or mark DEAD PRODUCT headers); update `COVIDEOPRO_CURRENT_STATE.md` with a "historical baseline, superseded" banner; refresh `COVIDEOPRO_OPEN_RISKS.md` R2/R4; rename reconciled identity in `DEPLOY_CONTRACT.md`.

**Explicit non-findings (so no one re-hunts them):** no webster in code; no Metronic imports; no stub/fake API routes beyond transcript safe-demo; no `.skip/.todo` test debt; Dockerfile name-clean.
