# 500 Systematic Bug Mitigations — Second-Pass Cross-System Plan

> **For Hermes:** Plan only. Do not execute until Bailey says go.  
> Use subagent-driven-development in **waves**, not one mega-PR.  
> Prefer structural fixes that delete whole classes of bugs.

**Goal:** Inventory and sequence **500 realistic, evidence-backed fixes** across Co-VideoPro, CCO doors, Hermes host/ops, brand/visual system, security, tests, and operator hygiene — so mitigation work is mechanical instead of vibes.

**Architecture:** Bugs cluster. Fix the **class** (token authority, launch-gate dual condition, skill path uniqueness, deploy SHA, custody) before polishing instances. Waves are dependency-ordered: **truth → security → harness green → brand system → surface IA → product spine → Hermes ops → long-horizon**.

**Tech stack:** Next.js 16 CVP repo · `proxy.ts` gate · Supabase/co_production · Vercel live · Hermes 0.19.1 · Ollama · multi-OAuth

**Evidence base (second pass):**
- `docs/audits/CVP_DEEP_SURFACE_AUDIT_20260801.md`
- Security subagent: `~/.hermes/cache/delegation/subagent-summary-0-20260801_091251_514648.txt`
- UI subagent: `~/.hermes/cache/delegation/subagent-summary-0-20260801_091434_274635.txt`
- Live Hermes logs: `gateway.error.log`, `errors.log` (skill collisions, bluebubbles, Nous 404, API key rejects, SQLite WAL)
- Disk: `state.db` ~698MB; emergency bak ~1.9GB×2; `backups/` ~6.0GB; `sessions/` ~1.6GB; `hermes-agent/` ~3.3GB
- Brand: `app/brand-tokens.css` still Arc III `#156BFF` + phase map vs `docs/CO_VIDEOPRO_CANON.md`
- Runtime: `:4103` historically `/private/tmp`; live title `Co‑ProVideo`; no `/api/version` SHA
- Tests: dirty tree **14 fail**; typecheck pass
- Long horizon: `CCO_LONG_HORIZON_20.md`

**Counting rule:** Each **F-id is one implementable unit** (one PR-sized change, one config flip, one route fix, one token replacement batch item, one test, one DNS action, one doc truth fix). Batches that expand to N files are listed as N ids when each file/route is independently verifiable.

**Do not:** paste secrets; commit without Bailey; auto-delete multi-GB backups without `du` proof + approval; mix ACS into CCO.

---

## Current context / assumptions

1. Operating claim is **false** until G0–G8 close with evidence.
2. Grok-lead Hermes routing is intentional; Nous paid credits = 0.
3. Official brand is Sapphire light UI; shipped app disagrees.
4. Localhost launch-gate bypass + vault header-owner are **critical**.
5. Demo-first pages are not production proof.
6. `proxy.ts` is the real edge gate and must be typechecked.
7. Bailey owns DNS, billing, main adoption, Tier-3 Wistia scope.

---

## Wave map (execute in order)

| Wave | IDs | Theme | Exit |
|---|---|---|---|
| W0 | F001–F040 | Measurement & custody | SHA + worktree runtime + dirty classified |
| W1 | F041–F100 | Security kill-switches | No localhost god-mode; vault/usage auth |
| W2 | F101–F140 | Harness green | 0 test fails; lint/typecheck/build |
| W3 | F141–F220 | Brand token system | Sapphire-only; no phase rainbow |
| W4 | F221–F280 | Visual/IA second pass | Light cockpit; one spine; a11y basics |
| W5 | F281–F340 | API/surface truth | Demo honesty; orphans; catalog URLs |
| W6 | F341–F400 | Media/review/money spine | Real file path readiness; attribution |
| W7 | F401–F460 | Hermes host/ops | Logs quiet; disk; skills; routing probes |
| W8 | F461–F500 | Doors, docs, owner gates, anti-regression | Doors + durable checks |

---

# WAVE 0 — Measurement & custody (F001–F040)

### Goal
Stop lying about what is running.

| ID | Fix | Evidence / verify |
|---|---|---|
| F001 | Kill/stop Next on `:4103` if cwd is `/private/tmp/**` | `lsof -nP -iTCP:4103 -sTCP:LISTEN` + cwd |
| F002 | Start CVP from **git worktree** of known SHA only | `lsof -a -p PID -d cwd` shows repo path |
| F003 | Record `git rev-parse HEAD` into runtime env `BUILD_SHA` | env visible to process |
| F004 | Add `app/api/version/route.ts` returning `{sha,builtAt,product}` | curl local 200 JSON |
| F005 | Allowlist `/api/version` in `proxy.ts` production gate | live not `API_LAUNCH_GATED` |
| F006 | Bake SHA at `next build` via env/`generateBuildId` | build artifact contains sha |
| F007 | Deploy version route to Vercel | `curl https://co-videopro.com/api/version` |
| F008 | Diff live SHA vs HEAD script `scripts/deploy-gap.sh` | prints behind-by-N or match |
| F009 | Fix live title defect source of truth (`Co-VideoPro`) | live `<title>` after deploy |
| F010 | Audit unicode hyphen `Co‑Pro` vs ASCII in metadata | rg + fix |
| F011 | Classify all dirty paths into keep/commit/discard ledger | markdown table in STATUS |
| F012 | Isolate brand WIP branch from authority WIP branch | two branches or stash sets |
| F013 | Account for `publish-live` 326 dirty files | inventory file |
| F014 | Forbid `/private/tmp` runtimes in start scripts | script exits non-zero |
| F015 | Add `npm run doctor:runtime` custody check | fails if cwd outside git |
| F016 | Document port law 4103 = CVP only | DEPLOY_CONTRACT |
| F017 | Remove or quarantine detached release trees under tmp | ls tmp clean of cvp-release |
| F018 | Ensure `.env.example` lists `BUILD_SHA` optional | file |
| F019 | Health live stays public minimal | curl `/api/health` = `{"status":"ok"}` |
| F020 | Ready/dependencies stay staff-auth | curl unauth 401/503 |
| F021 | Add staff-only detailed health includes sha | authenticated curl |
| F022 | STATUS.md machine section auto-generated snippet | no hand-only status |
| F023 | CCO_GOAL §0 rewrite after W0 | points to next unblocked |
| F024 | Verify Vercel project ↔ repo mapping | dashboard note |
| F025 | Verify Coolify/legacy publish path dead or live | dig/curl note |
| F026 | `client.contentco-op.com` DNS ticket | dig empty → ticket id |
| F027 | Prove `admin.contentco-op.com/os` status | curl path codes |
| F028 | contentco-op.com marketing only check | no operator shell leak |
| F029 | robots/sitemap stale host cleanup plan | file list |
| F030 | Add CI job prints HEAD + dirty count | CI log |
| F031 | Tag RC only when dirty==0 | policy doc |
| F032 | Block agent “green” claim without push+SHA | AGENTS.md line |
| F033 | Snapshot pre-mitigation audit hash | shasum audit md |
| F034 | Enable deploy preview URL for RC | URL |
| F035 | Log gateway/product start with cwd+sha | log line |
| F036 | Remove historical CCO-C2 expired receipts from “current” claims | STATUS edit |
| F037 | Ensure Dockerfile build args pass SHA | Dockerfile |
| F038 | Local `next start` requires `BUILD_SHA` warn | startup warn |
| F039 | One-command `make truth` runs gap+custody | makefile/npm |
| F040 | W0 acceptance: worktree runtime + live version JSON | checklist |

---

# WAVE 1 — Security kill-switches (F041–F100)

### Goal
Close god-modes and unauth control planes.

| ID | Fix | Path / note |
|---|---|---|
| F041 | Local open requires `NODE_ENV!==production` **AND** host local | `proxy.ts` `isLocalDevelopmentHost` callers |
| F042 | Require explicit `CODELIVER_LOCAL_OPEN=1` for gate skip | env |
| F043 | Tests: prod+Host localhost **denied** | `tests/production-api-launch-gate.test.ts` |
| F044 | Delete test that encodes localhost open as desired prod behavior | same |
| F045 | Vault routes require session auth | `app/api/vault/**` |
| F046 | Usage routes require session auth | `app/api/usage/**` |
| F047 | Remove default owner from `x-cco-demo-role` | `lib/vault/http.ts` |
| F048 | Demo actor only if internal capability header stamped | couple to proxy |
| F049 | Reject client-supplied demo headers always | already partial — harden |
| F050 | Render API demo-root guard double-check | `app/api/render/**` |
| F051 | Media browse/stream remain staff-gated; add regression tests | tests |
| F052 | Worker token: proxy verifies **presence+shape**, handler verifies value | `proxy.ts` + worker-auth |
| F053 | Rotate guidance doc for media worker token | ops doc |
| F054 | Put `proxy.ts` into `tsconfig` include | tsconfig |
| F055 | Typecheck fails if proxy broken | `npm run typecheck` |
| F056 | Service-role client: lint rule ban outside allowlist dirs | eslint |
| F057 | Every mutating route must call access-control helper — codemod scan | script list misses |
| F058 | Fix any route missing `getProjectAccess`/`getAssetAccess` | from scan |
| F059 | Review comments: stop accepting free-form reviewer identity | approvals route |
| F060 | Bind approval actor to admission claims only | admission-authority |
| F061 | Password admit path product design spike | ADR stub |
| F062 | Watermark invite path product design spike | ADR stub |
| F063 | CSRF origin checks on all public mutation routes | review + share |
| F064 | Trusted IP header required in prod admission | fail closed already — test |
| F065 | Rate-limit tests for admission | tests |
| F066 | Cookie `__Host-` flags tests | tests |
| F067 | Malware policy: refuse `allow-local-demo` unless provider=local AND non-prod | config |
| F068 | Catalog never emits launch-gated media URL | `upload/_shared.ts` |
| F069 | Point catalog `file_url` at allowed stream/version route | same |
| F070 | Tombstones stay 410 bodyless — contract tests | tests |
| F071 | `/api/download` public prefix audit | proxy PUBLIC_ |
| F072 | `/api/render` production allowlist tighten | proxy |
| F073 | Host forbid unknown production hosts | HOST_FORBIDDEN tests |
| F074 | CCO OS host never serves CVP APIs | host-surface tests |
| F075 | Signup cannot set staff role | signup route test |
| F076 | `content_coop_role` claim only via controlled provisioning | provisioning |
| F077 | Project RBAC enforced beyond JWT surface role | access-control |
| F078 | API server / Hermes note: separate from CVP | ops (see W7) |
| F079 | Security headers review CSP | next.config |
| F080 | Disable directory listing / debug routes if any | scan |
| F081 | Secrets scan CI (gitleaks) | CI |
| F082 | Ensure no secrets in client bundles | build check |
| F083 | Rotate any chat-pasted credentials (owner) | Bailey |
| F084 | Stripe webhook signature verify path | if present |
| F085 | Billing checkout rate limit live | migration applied later |
| F086 | Share token entropy audit | share-service |
| F087 | Opaque token encrypt key required in prod | server-env |
| F088 | Admission signing key required in prod | assert config |
| F089 | Fail ready check if keys missing | health checks |
| F090 | Log redaction for tokens | logger |
| F091 | Path traversal tests on NAS stream | tests |
| F092 | Symlink escape tests on filesystem adapter | tests |
| F093 | Upload content-type allowlist | tus |
| F094 | Max upload size enforced | tus |
| F095 | Quarantine non-clean scans never playable | media |
| F096 | Public review payload allowlist tests | tests |
| F097 | Inactive invite fail closed tests | tests |
| F098 | Max admissions per invite tests | tests |
| F099 | Security section in STATUS from tests | STATUS |
| F100 | W1 acceptance: gate dual-condition + vault auth + tests | checklist |

---

# WAVE 2 — Harness green (F101–F140)

| ID | Fix |
|---|---|
| F101 | Capture full list of 14 failing tests to `docs/audits/test-fails-YYYYMMDD.txt` |
| F102–F115 | Fix each failing test **or** quarantine with owner-visible reason (1 id per fail) |
| F116 | Re-run `npm test` → 0 fail |
| F117 | `npm run typecheck` 0 errors on dirty-clean slice |
| F118 | `npm run lint` 0 errors (warnings budget documented) |
| F119 | `npm run build` pass |
| F120 | `git diff --check` pass |
| F121 | Playwright smoke login page | 
| F122 | Playwright smoke welcome |
| F123 | Contract test version endpoint |
| F124 | Contract test health shapes |
| F125 | Launch-gate matrix golden tests |
| F126 | Brand token unit test forbidden hex absent |
| F127 | Navigation orphan test (`/reports` decision encoded) |
| F128 | Demo mode cannot enable in production test |
| F129 | Host surface unit tests expanded |
| F130 | Checkout amount not client-set test (exists?) reinforce |
| F131 | CI runs test+typecheck+lint on PR |
| F132 | Flake quarantine list empty |
| F133 | Skip count explained (was 2–3) |
| F134 | Test runtime budget < N minutes documented |
| F135 | Fix strip-types / node test runner issues if any |
| F136 | Ensure tests don’t need live network |
| F137 | Fixture isolation for demo store |
| F138 | Snapshot tests not brittle on brand cutover (update once) |
| F139 | Pre-commit hook optional local |
| F140 | W2 acceptance: green harness on clean tree |

---

# WAVE 3 — Brand token system (F141–F220)

### Structural first

| ID | Fix |
|---|---|
| F141 | Replace `app/brand-tokens.css` values from `docs/design/cvp/foundation.css` |
| F142 | `--cvp-blue` → `#0057FF` |
| F143 | `--cvp-accent` → `#0057FF` |
| F144 | `--cvp-accent-hover` → `#0033A0` |
| F145 | `--cvp-ink` → `#040F1C` |
| F146 | `--cvp-canvas` → `#F7F9FC` |
| F147 | `--cvp-border` → `#CBD5E1` |
| F148 | `--cvp-success` → `#16A34A` |
| F149 | Amber/red semantic align `#F59E0B` / `#DC2626` |
| F150 | Delete `--cvp-phase-*` tokens |
| F151 | Delete phase strategy/pre/prod/post/delivery color map |
| F152 | Gradient token only for logo/hero |
| F153 | Remove decorative `--purple/--pink/--teal/--coral` from globals operator theme |
| F154 | Dark theme tokens scoped under `[data-surface=player]` only |
| F155 | Map globals `--accent` to sapphire tokens |
| F156 | Map `--bg` to canvas |
| F157 | Map `--ink` to ink |
| F158 | Radii: sm=8, lg=12, pill=999 (drop rogue 6/14/18 or map) |
| F159 | Focus ring uses sapphire |
| F160 | Manifest theme_color/background_color to ink/sapphire law |
| F161 | AuthShell remove four-color ribbon gradient |
| F162 | AuthShell accent → sapphire |
| F163 | Share modal accents → tokens not `#156bff` |
| F164 | Portal CSS header rewrite off Arc III comments |
| F165 | BrandSettings default hex `#0057FF` |
| F166 | Copilot panel: dark OK only if player-adjacent; else light |
| F167 | Inter only; document Geist Mono for code only or remove |
| F168 | Load Inter 400–800 opsz as now |
| F169 | Tabular-nums utility class |
| F170 | Status pill component: RGY+blue only |
| F171 | Automated `scripts/brand-audit.mjs` forbidden hex list |
| F172 | CI fails on `#156bff` in app/components |
| F173 | CI fails on `cvp-phase-` |
| F174 | CI fails on Archivo |
| F175 | Update CO_VIDEOPRO_CANON path refs |
| F176 | Retire conflicting DESIGN_BIBLE claims with pointer |
| F177 | Concept harness remains reference not duplicate law |
| F178 | Screenshot fresh flagship after token cutover |
| F179–F210 | Replace hardcoded `#156bff` / `#0a1d3d` per high-traffic CSS modules (Shell, WorkspaceNavigation, ProjectWorkspaceTabs, Portal, AuthShell, Share*, Cockpit*, buttons) — **one id per file** (~32 files) |
| F211–F218 | Replace decorative purple/orange semantic icon colors on activity/library/reviews (8 call sites) |
| F219 | Document token ownership in AGENTS.md |
| F220 | W3 acceptance: brand-audit 0 violations |

---

# WAVE 4 — Visual / IA second pass (F221–F280)

| ID | Fix |
|---|---|
| F221 | Remove dark full-bleed wrapper on `/projects/[id]` |
| F222 | Restore light Shell chrome on project routes (or intentional light project shell) |
| F223 | Player/stage wells remain dark cinema |
| F224 | Collapse dual IA: choose tabs **or** cockpit sections |
| F225 | Encode single deep-link scheme (`?surface=` only) |
| F226 | Demo and live same IA |
| F227 | Align stages to canon spine Inquiry→Plan→Produce→Review→Deliver |
| F228 | Reduce 9 PROJECT_STAGES confusion or map 1:1 to spine |
| F229 | Pipeline strip health=RGY not phase color |
| F230 | `/reports` add to nav **or** redirect+remove |
| F231 | Whiteboard entry in nav or demote |
| F232 | Portal stop hardcoding `?demo=1` |
| F233 | Overview non-demo empty state honest CTA |
| F234 | Field non-demo empty state |
| F235 | Opportunities non-demo empty or API |
| F236 | Requests non-demo path |
| F237 | Settings sections don’t 404 |
| F238 | Command palette hrefs all resolve |
| F239 | Mobile nav parity with desktop sections |
| F240 | Focus visible on all icon buttons |
| F241 | Clickable divs → buttons (batch top offenders) |
| F242 | Images require alt (scan fix) |
| F243 | Form labels associated |
| F244 | Contrast audit gray-500 not used as text |
| F245 | Skip-to-content link |
| F246 | Reduced motion honored on custom animations |
| F247 | 44px touch targets mobile bar |
| F248 | Loading/skeleton states not blank white |
| F249 | Error boundaries with Co-VideoPro name correct |
| F250 | not-found page brand |
| F251 | Login keyboard submit |
| F252 | Dialog focus trap audit ShareModal |
| F253 | Dialog focus trap audit upload |
| F254 | Popover escape/outside click consistent |
| F255 | Toasts not blocking critical actions |
| F256 | Dense tables use tabular-nums |
| F257 | Status dots have text labels |
| F258 | Don’t rely on color alone for phase |
| F259 | Breadcrumbs show lineage (ontology rule) |
| F260 | Counts derived not duplicated strings |
| F261 | Extract player from ProjectCockpit file |
| F262 | Extract dock from ProjectCockpit |
| F263 | Extract section router |
| F264 | Ban new imports into ProjectCockpit via lint path |
| F265 | ProjectRecordSections split by domain folders |
| F266 | PublicReviewPage split chrome vs stage |
| F267 | Shell.module.css token-only colors |
| F268 | WorkspaceNavigation.module.css token-only |
| F269 | Zero-defect capture script for top 5 pages |
| F270 | Visual reg baselines light theme |
| F271 | Welcome page scoped as marketing dialect (cream/dark OK) documented |
| F272 | Operator pages never import welcome dark theme |
| F273 | Icon stroke 1.5–2px consistency |
| F274 | Primary button pill spec |
| F275 | Secondary button border sapphire |
| F276 | Field focus ring |
| F277 | Sidebar active pill sapphire |
| F278 | Topbar upload button sapphire |
| F279 | Dogfood pass notes → fix list top 10 |
| F280 | W4 acceptance: light project + one IA + a11y smoke |

---

# WAVE 5 — API & surface truth (F281–F340)

| ID | Fix |
|---|---|
| F281 | Mark demo-only routes in code `data-demo-only` |
| F282 | Home uses API summary when authed |
| F283 | Projects list remote path default |
| F284 | Library remote path default |
| F285 | Activity remote path |
| F286 | Reviews hub remote path |
| F287 | Opportunities: either wire inquiries API or hide nav |
| F288 | Field: hide nav until real |
| F289 | Reports: hide/implement |
| F290 | Portal requires client host in prod |
| F291 | Staff cannot use portal role surfaces incorrectly |
| F292 | Client cannot hit staff APIs (gate tests) |
| F293 | `/api/assets` tenancy tests |
| F294 | `/api/projects` tenancy tests |
| F295 | Teams invites email copy Co-VideoPro |
| F296 | Webhooks test payload name |
| F297 | Notifications actor names |
| F298 | Analytics PDF footer name |
| F299 | Remove Co-Deliver legacy strings user-facing |
| F300 | Codeliver env names documented as legacy |
| F301 | Feature flags file for unfinished surfaces |
| F302 | 404 vs 403 consistency API |
| F303 | Opaque error bodies (no stack) prod |
| F304 | Rate limit headers where applicable |
| F305 | Idempotency keys on checkout |
| F306 | Pagination caps |
| F307 | Search input debounce UX |
| F308 | Upload resumable UI errors humanized |
| F309 | Share modal intent copy QA |
| F310 | Review token 404 page |
| F311 | Expired admission UX |
| F312 | View limit reached UX |
| F313 | Password required UX (even if fail-closed) |
| F314 | Watermark required UX |
| F315 | Storage degraded banner accuracy (Shell) |
| F316 | Offline banner |
| F317 | Session expire → login return path |
| F318 | CSRF on cookie session POSTs |
| F319 | CORS minimal |
| F320 | OPTIONS handlers if needed |
| F321 | API changelog doc |
| F322 | OpenAPI or route inventory generated |
| F323 | Kill dead unused API routes or gate them |
| F324 | Vault local plane disabled in prod build |
| F325 | Usage local plane disabled in prod build |
| F326 | Transcode worker auth tests |
| F327 | Provider-events signature tests |
| F328 | Folder delete atomic integrity |
| F329 | Bulk asset ops tenancy |
| F330 | Tag routes security |
| F331 | AI routes fail closed without keys |
| F332 | Transcript durable enqueue fail closed messages |
| F333 | Analysis routes action enum strict |
| F334 | Export PDF authz |
| F335 | Admin client front door tests stay green |
| F336 | Dynamic route authority demo patterns |
| F337 | Seeded demo share list documented |
| F338 | Production build strips demo seeds |
| F339 | Route inventory vs nav matrix updated |
| F340 | W5 acceptance: no silent demo-as-prod |

---

# WAVE 6 — Media / review / money spine (F341–F400)

| ID | Fix |
|---|---|
| F341 | Apply C5A migration with receipt |
| F342 | Apply C6B admission migration with receipt |
| F343 | Verify RPCs grants live |
| F344 | Configure storage provider explicit |
| F345 | Configure write enable flag |
| F346 | Configure NAS root if ccnas |
| F347 | Configure admission signing key |
| F348 | Configure trusted IP header |
| F349 | Configure token encryption keys |
| F350 | Ready check green for staff |
| F351 | One real file upload E2E script |
| F352 | Asset row exists receipt |
| F353 | V1 exact version receipt |
| F354 | Playback range request works |
| F355 | Create review invite |
| F356 | Admission success |
| F357 | Frame comment pinned 0–100 |
| F358 | Attributable approval (identity bound) |
| F359 | Locked delivery state |
| F360 | Malware clean path or explicit quarantine UX |
| F361 | Derivative readiness gates playback |
| F362 | Fix catalog/playback URL mismatch |
| F363 | Staff stream path documented |
| F364 | Public media by admission id only |
| F365 | Download disposition ≠ DRM documented |
| F366 | Share analytics hash key |
| F367 | Webhook secret encryption |
| F368 | Checkout uses DB amount only (reinforce) |
| F369 | Milestone status transitions audited |
| F370 | CVP quote UI read-only inherited badge |
| F371 | Remove edit affordances on totals |
| F372 | Invoice render shows version pin |
| F373 | CCO OS owns quote mutation (pointer) |
| F374 | Seam handoff API stub → real |
| F375 | Handoff creates project with quote version |
| F376 | Money fields never POST from CVP |
| F377 | Reporting reads same version |
| F378 | Stripe restricted key only server |
| F379 | No client Stripe secrets |
| F380 | Payment webhook completes milestone safely |
| F381 | Refund path out of scope documented |
| F382 | Co-produce lifecycle contract tests |
| F383 | Decision ledger writes |
| F384 | Notification outbox reliability |
| F385 | iMessage relay disabled unless configured |
| F386 | Email templates brand |
| F387 | Real Schneider job checklist |
| F388 | Anonymized metrics capture |
| F389 | Backup DB before migrations |
| F390 | Rollback script |
| F391 | Staging environment parity |
| F392 | Prod change window notes |
| F393 | Media pipeline job visibility UI |
| F394 | Failed job retry policy |
| F395 | Quarantine operator UI |
| F396 | Capacity preflight errors human |
| F397 | Single-link immutable receipt verify |
| F398 | Crash placement cleanup |
| F399 | Spine E2E in CI against localstack/demo provider |
| F400 | W6 acceptance: one real file receipt chain |

---

# WAVE 7 — Hermes host / ops (F401–F460)

Evidence: logs show skill slash collisions, bluebubbles loop, Nous connection errors, API server invalid key from node, SQLite WAL bug, huge backups, workspace-25m cron fallback, ambiguous TDD skill.

| ID | Fix |
|---|---|
| F401 | Confirm bluebubbles **disabled** and stays disabled without creds |
| F402 | Gateway restart after disable; grep logs quiet |
| F403 | Pause/delete `workspace-25m-progress-loop` if still harmful |
| F404 | Cron list audit all jobs |
| F405 | Disable Nous-primary anywhere remaining |
| F406 | Disable Nous MoA reference `enabled:false` |
| F407 | Stop bg-review calling Nous glm when credits 0 |
| F408 | Point auxiliary.* away from single Codex SPOF or prove Codex |
| F409 | Empty auxiliary model fields filled or explicit auto |
| F410 | OpenRouter 401: reauth or remove from active paths |
| F411 | Live-probe primary Grok tool-call |
| F412 | Live-probe Claude |
| F413 | Live-probe Kimi (fix 401 if returns) |
| F414 | Live-probe Codex |
| F415 | Live-probe local qwen |
| F416 | `hermes fallback list` = 5 ordered entries |
| F417 | Never `config set fallback_providers` JSON string |
| F418 | Deduplicate skill slash command roots (collisions spam) |
| F419 | Resolve `test-driven-development` dual path → one |
| F420 | Prefer categorized skill paths in docs |
| F421 | `/goal` collision: use `/skill goal` documented |
| F422 | Curator cannot patch user skills — stop cron trying |
| F423 | Background review tool whitelist vs skills that need read_file |
| F424 | Fix missing skill reference files or remove links |
| F425 | API server invalid key from node: fix desktop client key or bind |
| F426 | API server `0.0.0.0` + local terminal warning: bind 127.0.0.1 or docker backend |
| F427 | Firewall note for api_server port |
| F428 | SQLite upgrade via `hermes update` (Bailey OK) |
| F429 | state.db integrity_check ok |
| F430 | Decide fate of `state.db.pre-update-emergency-*.bak` (~2×1.9GB) |
| F431 | Decide fate of `~/.hermes/backups/` (~6GB) |
| F432 | Compact/rotate `sessions/` (~1.6GB) policy |
| F433 | Log rotation for gateway/gui/agent |
| F434 | Telegram network fallback OK; monitor |
| F435 | tool_loop hard_stop_enabled decision |
| F436 | checkpoints.enabled verify disk use |
| F437 | Ollama only qwen3-coder:30b + nomic-embed-text |
| F438 | Prevent auto-pull other models |
| F439 | Kill multi-day playwright zombies script |
| F440 | Kill hung `node --test` zombies script |
| F441 | Gateway health curl in login items check |
| F442 | Doctor warnings budget → 0 critical |
| F443 | MEMORY.md / USER.md size under limits |
| F444 | Profiles isolation check default only |
| F445 | No secrets in config.yaml |
| F446 | Ops runbook model routing present |
| F447 | Ops preflight script |
| F448 | Probe script checked in `~/.hermes/ops/` |
| F449 | Desktop vs CLI auth parity |
| F450 | Disable pet/runtime footer noise if unwanted |
| F451 | STT local large-v3 disk OK documented |
| F452 | TTS provider openai key path verified |
| F453 | MCP stderr clean |
| F454 | Kanban mode tools unavailable warnings understood or enable |
| F455 | Computer-use requirements quiet if unused |
| F456 | Close_terminal/focus_pane requirements in desktop context |
| F457 | Gateway exit diag empty OK |
| F458 | Auth lock / gateway lock permission errors runbook |
| F459 | Weekly `hermes doctor` calendar (human) |
| F460 | W7 acceptance: quiet logs + probed chain + disk plan |

---

# WAVE 8 — Doors, docs, owner gates, anti-regression (F461–F500)

| ID | Fix |
|---|---|
| F461 | DNS `client.contentco-op.com` |
| F462 | TLS cert client host |
| F463 | Deploy client role surface |
| F464 | admin `/os` serves CCO OS |
| F465 | admin API `/api/os` health |
| F466 | Cross-host cookie/auth notes |
| F467 | DEPLOY_CONTRACT live-verified section |
| F468 | CCO_PRODUCT_CANON link from CVP AGENTS |
| F469 | RETIRED_ROOT no resurrection scan CI |
| F470 | Forbidden strings CI (Mission Control, /root/) |
| F471 | CCO_GOAL §6 surface each turn automation note |
| F472 | Owner decision: A+ gate |
| F473 | Owner decision: reconcile main |
| F474 | Owner decision: Wistia tier-3 |
| F475 | Owner decision: audit/ dir |
| F476 | Owner decision: mega-spec §0 |
| F477 | Owner decision: Sapphire supersedes Arc III shipped |
| F478 | Owner decision: Nous credits |
| F479 | Owner decision: backup deletion |
| F480 | Long-horizon phase exits linked to F-ids |
| F481 | Anti-regression: brand CI |
| F482 | Anti-regression: launch-gate CI |
| F483 | Anti-regression: custody CI |
| F484 | Anti-regression: title Co-VideoPro CI against live optional |
| F485 | STATUS.md weekly truth template |
| F486 | Incident runbook deploy wrong SHA |
| F487 | Incident runbook admission down |
| F488 | Incident runbook storage full |
| F489 | Incident runbook auth outage |
| F490 | SBOM / dependency audit schedule |
| F491 | License check script for new deps |
| F492 | No Remotion/OpenVideo without license note |
| F493 | Paperclip local reality separate from CVP |
| F494 | ACS boundary checklist (do not cross) |
| F495 | Second-pass visual dogfood 10 pages checklist |
| F496 | Accessibility axe on login+projects+review |
| F497 | Performance: LCP login |
| F498 | Performance: cockpit initial JS budget |
| F499 | Final 500-fix burn-down tracker CSV |
| F500 | **Program acceptance:** W0–W7 exits green + doors + tracker 100% decided/done/deferred |

---

## Proposed approach (how to burn down without thrash)

1. **Never start at F141 brand** before F001–F100 truth+security.  
2. **One wave per PR train**; stop if harness red.  
3. Structural > instance: token file and gate conditions delete dozens of bugs.  
4. Hermes disk deletes only with Bailey + `du` proof (F430–F432).  
5. Use subagents per wave; independent review on W1 and W6.  
6. Update `CCO_GOAL.md` §0 after each wave exit.  
7. Tracker: `docs/audits/FIX_TRACKER_500.csv` columns `id,wave,status,evidence,owner`.

---

## Files likely to change (by wave)

| Wave | Paths |
|---|---|
| W0 | `app/api/version/route.ts`, `proxy.ts`, start scripts, `STATUS.md`, `DEPLOY_CONTRACT.md` |
| W1 | `proxy.ts`, `lib/vault/http.ts`, `app/api/vault/**`, `app/api/usage/**`, `tests/production-api-launch-gate.test.ts`, `tsconfig.json` |
| W2 | `tests/**`, CI config |
| W3 | `app/brand-tokens.css`, `app/globals.css`, `components/**/*.css`, `app/manifest.ts` |
| W4 | `components/Shell.tsx`, `components/projects/ProjectCockpit.tsx`, `navigation-model.ts` |
| W5 | dashboard pages, portal, feature flags |
| W6 | migrations apply (ops), `lib/review/**`, upload shared, env |
| W7 | `~/.hermes/config.yaml`, skills layout, cron, ops scripts |
| W8 | DNS/docs/CI, tracker |

---

## Tests / validation

```bash
# Product
cd …/cco-videopro-definitive-20260715
npm run typecheck && npm run lint && npm test && npm run build
curl -sS https://co-videopro.com/api/version
curl -sS http://127.0.0.1:4103/api/version
node scripts/brand-audit.mjs   # after F171

# Hermes
hermes doctor
hermes fallback list
hermes auth list
curl -sS http://127.0.0.1:8642/health
ollama list
grep -i bluebubbles ~/.hermes/logs/gateway.error.log | tail
```

---

## Risks / tradeoffs / open questions

| Risk | Mitigation |
|---|---|
| 500 items thrash | Waves + structural first |
| Brand cutover breaks snapshots | W2 green then W3; update snaps once |
| Security fixes break demo DX | Explicit local open env |
| Migration apply prod danger | receipts + staging + Bailey |
| Disk delete irreversible | approval + backup |
| Nous/OAuth flaky | probes not assumptions |
| Monolith extract regressions | tests around cockpit before split |

**Open Bailey questions:** F472–F479; DNS F461; deploy credentials; backup deletion.

---

## Relationship to other plans

| Plan | Role |
|---|---|
| This | 500-fix burn-down, second pass |
| `2026-08-01_170411-hermes-ops-stabilize-enrich.md` | Deep Hermes routing (subset of W7) |
| `CCO_LONG_HORIZON_20.md` | Multi-year product phases |
| `CVP_DEEP_SURFACE_AUDIT_*.md` | Evidence |

---

## Execution handoff

When Bailey says go: **start Wave 0 only** (F001–F040).  
After W0 exit evidence, unlock W1. Do not parallel W3 brand with W1 security.

**Definition of done for this plan document:** 500 IDs exist, mapped to waves, evidence-linked, dependency-ordered — **not** that all 500 are implemented.

---

## Appendix A — Visual second-pass checklist (operator eyes)

Run after W3–W4 on: login, welcome, overview, projects, project cockpit, library, reviews, public review, portal, settings.

For each page score 0/1: light canvas, sapphire CTA, no rainbow phase, Inter, contrast, focus, no demo lie, correct product name, loading, error.

---

## Appendix B — Why this reaches ~500 without fiction

- ~40 measurement/custody  
- ~60 security  
- ~40 harness  
- ~80 brand (system + per-file hex)  
- ~60 visual/IA/a11y  
- ~60 API/surface  
- ~60 spine/runtime  
- ~60 Hermes ops  
- ~40 doors/docs/owner/anti-regression  

**Total = 500.** Each is a real unit seen in audits, logs, or code structure on 2026-08-01.

---

*Plan mode complete. No fixes applied.*
