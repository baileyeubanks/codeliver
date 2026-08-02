# Co-VideoPro — Deep Surface Audit

**Date:** 2026-08-01  
**Auditor:** Hermes (M2)  
**Repo:** `/Users/baileyeubanks/Desktop/Projects/contentco-op/cco-videopro-definitive-20260715`  
**Branch / HEAD:** `codex/co-videopro-definitive-20260715` @ `3e0934e`  
**Dirty tree:** 117 paths (106 modified, 11 untracked)  
**Scope:** Co-VideoPro + related CCO doors. ACS out of scope.

---

## Verdict

**DEGRADED — rich source, unproven / stale runtime, brand split-brain, custody broken.**

This is not a cosmetic problem. The system has a strong reviewed source spine (upload authority, review admission, host law, fail-closed patterns) sitting in front of:

1. a **stale public deploy** that cannot report its SHA,
2. a **local runtime living in `/private/tmp`** outside git,
3. a **new official brand law** that the shipped app does not implement,
4. **migrations and storage/admission config that are still source-only**,
5. a **test harness that is no longer green** on the dirty tree (14 failures).

**Operating claim is not true.** One real job end-to-end is not proved.

---

## Executive scorecard

| Area | Grade | One-line truth |
|---|---|---|
| Product architecture canon | A- | Two products + seam is clear and enforced in host law source |
| Deploy / version truth (G2) | F | No build SHA endpoint; live title still `Co‑ProVideo` |
| Runtime custody (G0) | F | `:4103` cwd = `/private/tmp/cvp-release-20260726.LZL0gS/tree` (not a git repo) |
| Public site availability | C+ | `co-videopro.com` HTTP 200 on Vercel, but stale and login-walled for app |
| Client door (G3) | F | `client.contentco-op.com` has **no DNS** |
| CCO OS door (G3) | D | `admin.contentco-op.com` HTTP 200; `/os` historically 404 — not re-proved this pass beyond host up |
| Auth / host gate source | B- | Serious design; **localhost opens the gate** (C7) |
| Public review admission source | B | Designed fail-closed; **unapplied migration + missing keys = not runtime-proved** |
| Upload / V1 catalog source | B | Canonical TUS path + legacy 410 tombstones; storage/scanner still unproved |
| Commercial total mutation | B+ | Checkout amount from DB only (source); status writes still in CVP |
| Brand system | D | Official Sapphire canon written; shipped tokens still Arc III `#156BFF` + four-color phases |
| UI surface coverage | B- | Broad route map exists; many pages are demo-store-first |
| Monolith health | D | `ProjectCockpit.tsx` 109KB still absorbs the product |
| Automated harness | C- | `typecheck` pass; `test` **1208 pass / 14 fail / 2 skip** on dirty tree |
| Docs honesty | A- | `STATUS.md` / `CCO_GOAL.md` correctly refuse to overclaim runtime |

---

## What I actually measured (not inferred)

### Live hosts

| Host | DNS | HTTP | Notes |
|---|---|---|---|
| `co-videopro.com` | yes → 216.198.79.1 / 64.29.17.1 | **200** | Vercel (`server: Vercel`) |
| `www.co-videopro.com` | yes → vercel-dns | n/a this pass | |
| `contentco-op.com` | yes → CF | **200** | public marketing |
| `admin.contentco-op.com` | yes → CF | **200** | CCO OS commercial host |
| `client.contentco-op.com` | **empty** | fail | G3 door missing |

### Live Co-VideoPro endpoints

| Path | Status | Body / signal |
|---|---|---|
| `/` | 200 | `<title>Co‑ProVideo \| Content Co-op</title>` |
| `/login` | 200 | same title family |
| `/api/health` | 200 | `{"status":"ok"}` only |
| `/api/health/live` | 200 | `{"status":"ok"}` |
| `/api/health/ready` | **401** | `AUTH_REQUIRED` |
| `/api/health/dependencies` | **401** | `AUTH_REQUIRED` |
| `/api/version` | **403** | `API_LAUNCH_GATED` — **not a version endpoint** |

### Local `:4103` runtime

| Check | Result |
|---|---|
| Listening | yes — `node` PID 65427, `next-server (v16.2.12)` |
| Uptime | ~5d 23h at audit time |
| **cwd** | **`/private/tmp/cvp-release-20260726.LZL0gS/tree`** |
| git | **not a git repo** |
| `/api/health` | 200 `{"status":"ok"}` |
| `/api/health/ready` | 503 `HEALTH_AUTH_UNAVAILABLE` |
| `/api/version` | 503 `BACKEND_UNAVAILABLE` |
| `/login` title | also **`Co‑ProVideo`** (tmp tree ≠ current source metadata) |
| App routes `/`, `/projects`, … | 307 (auth redirect) |

### Source tree harness (dirty working copy)

| Command | Result |
|---|---|
| `npm run typecheck` | **pass** (0 errors) |
| `npm test` | **1208 pass / 14 fail / 2 skip** (1224 tests) — **red** |
| `npm run lint` / `build` | not re-run this pass (prior STATUS: green on 2026-07-26 clean RC) |

### Brand hex census (app + components)

| Token / hex | Hits (approx) | Canon 2026-08-01? |
|---|---|---|
| `#156bff` (old Primary Blue) | **104** | **No** — should be `#0057FF` |
| `#0a1d3d` (old Deep Blue ink) | **32** | **No** — ink is `#040F1C` |
| `#f7f9fc` (new canvas) | **4** | Yes, barely present |
| `#0057ff` (new Sapphire) | ~0 in shipped UI | **Missing from shipped tokens** |
| Four-color phase vars | present in `brand-tokens.css` | **Forbidden** by new canon |
| Decorative purple/pink/teal/coral/orange | present in `globals.css` | **Forbidden** as brand/decorative |

---

## Gate status (CCO_GOAL ladder) — live refresh

| Gate | State | Evidence |
|---|---|---|
| **G0 Custody** | 🔴 OPEN | `:4103` in `/private/tmp/...`; repo dirty 117; `publish-live` dirty 326 |
| **G1 One canonical line** | 🔴 OPEN | Owner decision §6 still open; multiple trees/runtimes |
| **G2 Deployment truth** | 🔴 OPEN | No SHA endpoint; live title defect still present |
| **G3 Doors** | 🔴 OPEN | `client.` no DNS; CCO OS `/os` not proved healthy this pass |
| **G4 Database reality** | 🔴 OPEN | C5A/C6B migrations source-only (`STATUS.md` + migration files present, unapplied claim unchanged) |
| **G5 One real file** | 🔴 OPEN | No independent E2E proof |
| **G6 One real quote** | 🔴 OPEN | Commercial path not runtime-proved |
| **G7 Seam** | 🔴 OPEN | Package handoff not proved |
| **G8 Operating** | 🔴 OPEN | No real Schneider job |

---

## Critical findings (fix now / block claims)

### C1 — Local runtime custody is illegal
- **Evidence:** `lsof` cwd = `/private/tmp/cvp-release-20260726.LZL0gS/tree`; not a git repo.
- **Why it matters:** macOS can reap tmp; divergence is untrackable; every local demo/test against this process is not proof about the repo.
- **Fix shape:** kill PID 65427; start `next` from a **repo worktree** of known SHA; never tmp.

### C2 — Deployment truth does not exist
- **Evidence:** live `/api/version` → `API_LAUNCH_GATED`; there is **no** dedicated build-SHA route in `app/api/`.
- **Evidence:** live `<title>Co‑ProVideo | Content Co-op</title>` vs source `app/layout.tsx` `Co-VideoPro | Content Co-op`.
- **Why it matters:** you cannot tell whether any test hit the deployed artifact (§2 #4 / #5).
- **Fix shape:** add public or staff-readable `/api/version` returning `{ sha, builtAt, brand: "Co-VideoPro" }` baked at build; measure live vs `git rev-parse HEAD`.

### C3 — Brand split-brain (official law ≠ shipped product)
- **Official law:** `docs/CO_VIDEOPRO_CANON.md` (untracked) — Sapphire `#0057FF`, Inter, light UI, RGY-only semantics, no four-color phase mapping.
- **Shipped law:** `app/brand-tokens.css` still documents Arc III `#156BFF` and **explicit four-color phase coding**.
- **Concept harness** at `docs/design/cvp/` implements the new law and is **not wired into the Next app**.
- **Why it matters:** every surface restyle without token cutover will thrash; QA will fight two canons.
- **Fix shape:** one token file wins. Port `docs/design/cvp/foundation.css` values into `app/brand-tokens.css` + kill phase-color mapping; only then restyle shells.

### C4 — Client door missing
- **Evidence:** `dig client.contentco-op.com` empty; curl cannot resolve.
- **Canon requires** that host for CVP client role (`CCO_PRODUCT_CANON.md`, `host-surface.ts`).
- **Fix shape:** DNS + deploy surface; until then client role is unreachable in production topology.

### C5 — Test harness regressed on dirty tree
- **Evidence:** `npm test` → **14 failures** (was 0 fail / 3 skip on 2026-07-26 STATUS snapshot).
- **Why it matters:** dirty brand/auth/review work is not merge-safe; “green” cannot be claimed.
- **Fix shape:** isolate failure list, split brand-dirty vs authority-dirty, restore green before any publish talk.

### C6 — Real media path still unproved
- **Evidence:** `STATUS.md` still honest: migrations unapplied; storage/admission keys absent in inspected shells; malware default required but scanner unconfigured; no independent real-file receipt.
- **Fix shape:** G4 then G5 only — apply migrations with receipts, configure storage + admission signing, run one real file.

### C7 — `Host: localhost` skips the production API launch gate
- **Evidence (source):** `proxy.ts` treats local development hosts as fully open — host deny + API allowlist disabled. Unit tests intentionally encode this bypass (`tests/production-api-launch-gate.test.ts`).
- **Blast radius:** retired-but-still-implemented **unauthenticated** control planes become reachable on any process that accepts `Host: localhost` (including `next start` with `NODE_ENV=production` if the edge forwards client Host):
  - `/api/vault/*` — **no `requireAuth`**
  - `/api/usage/*` — **no session**
  - `/api/media/*` (except handlers with their own auth)
  - `/api/render/*`
- **Why critical:** the launch gate is the primary production kill-switch for unsafe legacy surfaces. Localhost short-circuit makes “production build on a box” unsafe by default.
- **Fix shape:** require `NODE_ENV !== "production"` **and** explicit opt-in for local open mode; never open vault/usage on Host alone. Add handler-level `requireAuth` even for local.

### C8 — Vault/usage actor is header-only (default owner)
- **Evidence:** `lib/vault/http.ts` builds actor/role from `x-cco-demo-role` (default **`owner`**) + `x-cco-demo-actor-id` — no session.
- **Coupled to C7:** if launch gate is skipped, anyone who can hit the port can write vault records / run usage estimates as owner.
- **Fix shape:** kill header-actor authority outside proven local demo capability; require real auth or bind to stamped internal demo capability only.

---

## High findings

### H1 — Monolith gravity still wins
| Metric | Value |
|---|---|
| `ProjectCockpit.tsx` | **~2583 lines / ~110KB** |
| `ProjectRecordSections.tsx` | **~1419 lines / ~70KB** |
| `PublicReviewPage.tsx` | ~68KB |
| `lib/media-pipeline/service.ts` | ~209KB (backend gravity) |

**Cockpit still owns:** header, stage chip, search, nav rails, overview player, timeline, pipeline strip, operator dock, media/reviews/approvals/tasks/versions/metadata, share modals, upload overlay, live API normalizers.

**Partial extraction only:** record sections moved out; player/dock/section router remain god-component.

**Additional IA risk:** demo wraps cockpit in `ProjectWorkspaceTabs`; live skips tabs → feature parity gap and two deep-link schemes (`?tab=` vs `?surface=`).

P1 exit criterion in `CCO_GOAL.md` requires decomposing the cockpit. **Stop adding sections inline.**

### H1b — Project route is a dark product shell (canon break)
- Live project page wraps in `bg-[var(--cvp-ink-deep)]` and bypasses workspace rail/topbar.
- Official law: dark = **player chrome only**, not the product.
- Concept harness is light; shipped cockpit fights it.
- **Fix shape:** light operator chrome; dark only on review stage/player wells.

### H2 — Demo-mode is the primary UX path for many pages
Dashboard surfaces extensively branch on `demo=1` / `useDemoWorkspace`:
- Overview, projects, library, field, reviews, activity, opportunities, settings, portal, share modal.
- Demo is gated (`CODELIVER_DEMO_MODE` + non-production + proxy header stamping) — good.
- Risk: operators judge “the product” from demo store richness while production APIs are empty/unready.

### H3 — Commercial surfaces live inside Co-VideoPro
Present in CVP:
- `app/api/billing/checkout/route.ts` + Stripe session creation
- `lib/covideopro/documents.ts` quote cover + invoice HTML
- `ProjectRecordSections` quote/invoice viewer + `createMilestoneCheckout`

**Good news (source):** checkout body is `{ milestone_id }` only — **`amount_cents` is loaded from DB**, not client-set (`lib/covideopro/checkout.server.ts`). No non-demo API writer of quote/milestone totals found in this pass. CVP can still flip milestone status to `checkout_created` and store `checkout_url` (status write, not total write).

**Still:** money UX and checkout live in the creative app. Seam purity depends on API discipline + future CCO OS ownership, not hard product split.

### H4 — Public review approval attribution still weak (source honesty)
`STATUS.md`: approval packet remains asset/workflow scoped and accepts **caller-supplied reviewer identity**; exact-version attributable approval open.  
Admission bridge is strong on paper; attribution/delivery lock is not closed.

### H5 — API launch gate hides operational truth
Production `proxy.ts` returns `API_LAUNCH_GATED` for many routes including whatever hits `/api/version`.  
Good for reducing attack surface. Bad for deploy observability unless a deliberate tiny allowlist includes version/health detail for staff.

### H6 — `publish-live` (CCO public/OS runtime) is extremely dirty
Symlink → Codex worktree `cco-home-runtime-static-repair` with **326** dirty files.  
CCO OS claims cannot be trusted from that tree without its own custody pass.

---

## Medium findings

### M1 — Navigation vs routes mismatches
**In nav model** (`components/navigation/navigation-model.ts`):
- Workspace: Overview, Projects, Opportunities, Requests, Reviews, Activity
- Production: Field
- Library: Media library
- Admin: Archive, Trash, Settings

**Routes that exist but are not first-class nav items:**
- `/reports` — page exists, not in nav
- `/projects/[id]/whiteboard` — exists, cockpit-adjacent only
- `/portal/*` — separate client shell (correct), but `client.` DNS missing so prod topology broken
- `/welcome`, `/signup`, auth variants — public doors OK

Nav section labels already match new canon groups (Workspace / Production / Library / Admin) — good alignment opportunity.

### M2 — Dual review entrypoints
- Public token review: `app/review/[token]`
- Authenticated asset review: `app/(review)/projects/[id]/assets/[assetId]`
- Plus cockpit embedded review sections  

Risk of three review UX dialects + three authority paths. Admission work hardened the public path; internal path must stay receipt-bound the same way.

### M3 — Title defect may be unicode / build-cache nuanced
Source string is ASCII hyphen `Co-VideoPro`.  
Live/local rendered title observed as `Co‑ProVideo` (unicode hyphen family / old build).  
Tmp runtime predates current dirty source. **Do not “fix the title” in source and call deploy fixed** without SHA proof.

### M4 — Concept flagship is rescued but unfinished as product
Durable paths:
- Canon: `docs/CO_VIDEOPRO_CANON.md`
- Harness: `docs/design/cvp/`
- Screenshot: `docs/design-evidence/flagship-orchestration-light-20260801/cvp-orchestration-cockpit.png`
- Handoff: `/Users/baileyeubanks/Desktop/Projects/contentco-op/HERMES_HANDOFF_CVP_FLAGSHIP.md`

Final brand-conformance zero on the concept was **not closed** when the Claude thread moved.

### M5 — Forbidden product names
Scan of `app/`, `components/`, `lib/` for user-facing `ROOT` / `Mission Control` / `/root/` resurrection: **no hits** in this pass. Good.

### M6 — Env surface
Only `.env.example` present in repo (no `.env.local` in tree listing).  
Example lists required Supabase, schema `co_production`, admission signing key, trusted IP header, token encryption keys, admin/client site URLs.  
Local ready=503 `HEALTH_AUTH_UNAVAILABLE` is consistent with missing auth backend config in the tmp process environment.

---

## Surface matrix (product UI)

Legend: **Shell** = layout chrome · **Data** = primary authority the page actually uses · **Brand** = conformance risk vs official Sapphire law

| Surface | Route | Shell | Primary data | Brand | Notes |
|---|---|---|---|---|---|
| Welcome | `/welcome` | full-bleed dark editorial | static | High vs operator light UI | exterior OK if scoped |
| Login / forgot | `/login`, `/login/forgot`, `/forgot-password` | AuthShell | Supabase / demo | High | AuthShell four-color ribbon still present |
| Signup | `/signup` | Auth form | API | Med | |
| Overview | `/` | Shell + rail | **Demo-only**; non-demo empty | Med | |
| Projects list | `/projects` | Shell | demo **or** `/api/projects` | High | 4-step lifecycle narrative |
| Project cockpit | `/projects/[id]` | **bypasses Shell**; dark `cvp-ink-deep` wrapper | demo tabs+cockpit **or** live cockpit+API | **Critical** | monolith + dual IA |
| New project | `/projects/new` | Shell | demo/API | Low–med | CTA/command, not nav item |
| Archive / Trash | `/projects/archive`, `/trash` | Shell | demo-leaning collections | Low–med | |
| Whiteboard | `/projects/[id]/whiteboard` | dashboard path | whiteboard client | Med | **nav orphan** (tab only) |
| Opportunities | `/opportunities` | Shell | **Demo store only** | Med | commercial-adjacent |
| Requests | `/requests` | Shell | **Demo** `RequestQueue` | Med | |
| Reviews hub | `/reviews` | Shell | demo links **or** remote | Med | purple/orange on related surfaces |
| Activity | `/activity` | Shell | demo **or** `/api/activity` | Med | decorative purple/orange icons |
| Field | `/field` | Shell | **Demo-only**; non-demo empty | Med | |
| Library | `/library` | Shell | demo **or** assets API | Med | |
| Reports | `/reports` | Shell | **Demo-only** | Med | **nav orphan — dead to IA** |
| Settings | `/settings` | Shell | demo + brand governance | Med | BrandSettings defaults `#156bff` |
| Client portal | `/portal`, `/requests`, `/new` | PortalShell | demo projections | Med | hard-coded `?demo=1` links |
| Public review | `/review/[token]` | bare | admission API / demo share | Low–med | player dark OK |
| Internal asset review | `/projects/[id]/assets/[assetId]` | `(review)` passthrough | demo authority **or** asset API | Low–med | player dark OK |
| Invite | `/invite/[token]` | component | Supabase invites | Low | |
| Concept orchestration | `docs/design/cvp/*.html` | concept only | ontology seed | **Aligned** | not shipped |

### Shell map (verified)
- Dashboard: `DemoSessionGuard` + `Shell`
- Client: `DemoSessionGuard` + `PortalShell` (no WorkspaceRail)
- Review group: bare passthrough
- **Project cockpit:** `Shell` short-circuits to **dark full-bleed** — no rail/topbar (violates “dark = player only”)

### Navigation completeness
**In nav:** `/`, `/projects`, `/opportunities`, `/requests`, `/reviews`, `/activity`, `/field`, `/library`, archive, trash, settings  

**Orphans / secondary only:** `/reports` (direct URL only), whiteboard (workspace tab only), portal/*, review/*, welcome/auth  

**Dual project IA (high confusion risk):**
- Demo: `ProjectWorkspaceTabs` — `overview|brief|milestones|deliverables|team|files|comms|calendar`
- Cockpit: `COCKPIT_NAVIGATION` — 12 sections (creative→metadata)
- Live path **skips tabs** → cockpit only → **demo/live parity gap**
- Canon spine is `Inquiry → Plan → Produce → Review → Deliver`; shipped has 9 stages + 4 pipeline cards + 12 sections + 8 tabs

### UI deep-dive appendix
Full UI matrix pass:  
`/Users/baileyeubanks/.hermes/cache/delegation/subagent-summary-0-20260801_091434_274635.txt`

---

## API / authority map (condensed)

### Strong patterns (keep)
- **Host law** in `lib/auth/host-surface.ts` — admin.contentco-op.com is *not* CVP; internal surface name `"admin"` means staff on `co-videopro.com` (easy to misread — document harder in UI copy).
- **Proxy launch gate** (`proxy.ts`) — production API allowlists; legacy media/usage/vault patterns treated unsafe.
- **Legacy upload tombstones** → 410 with canonical `/api/upload/tus`.
- **Review admission** — opaque token, signed short-lived `__Host-` cookie grant, rate limits, media by admission id not raw token.
- **Public health minimalism** — `/api/health` is only `{"status":"ok"}`; detail is staff-auth’d.

### Weak / open patterns
- Build SHA not exposed.
- Detailed health useless without staff session + working Supabase.
- **Localhost Host short-circuit opens vault/usage/media/render** (C7/C8).
- Billing checkout inside CVP (amount safe from client; ownership wrong long-term).
- Vault/usage local control-plane routes: header actor, no session.
- Malware policy default `required` with unconfigured scanner → quarantine dead-end (STATUS).
- C6B migration unapplied → admission RPCs may not exist in real DB.
- Password-protected + watermarked review invites fail closed with **no password admit path** (product gap, not bypass).
- `proxy.ts` is the real gate but outside normal typecheck include — drift risk.
- Service-role Supabase client everywhere — RLS is not a backstop; every route must re-check tenancy.
- Media worker = shared-secret bearer with broad pipeline ops (proxy checks header presence; handler checks value).

### Authority deep-dive appendix
Full static security pass (subagent, read-only):  
`/Users/baileyeubanks/.hermes/cache/delegation/subagent-summary-0-20260801_091251_514648.txt`

Top findings from that pass absorbed as **C7, C8, H3 update, and the weak-pattern bullets above**.

---

## Brand conformance audit (shipped app vs official law)

| Rule (official) | Shipped status |
|---|---|
| Light UI working surfaces | Partial tokens; **project cockpit is dark full-bleed** (critical) |
| Inter only | Mostly — Inter loaded; Geist Mono also loaded |
| Primary `#0057FF` | **Fail** — `#156BFF` dominates (~104 hits) |
| Ink `#040F1C` | **Fail** — `#0A1D3D` / `#18223e` family |
| Canvas `#F7F9FC` | **Fail** — `#f2f4f7` / other grays |
| RGY semantic only | **Fail** — purple/pink/teal/coral/orange variables live |
| No four-color phase mapping | **Fail** — explicit phase tokens in `brand-tokens.css` |
| Gradient only logo/hero | **Fail** — AuthShell four-color ribbon gradient |
| Dark = player only | **Fail on cockpit** — product shell uses `cvp-ink-deep`; welcome full dark (exterior); copilot dark |
| Radii 12 / 8 / pill | Partial — sm=6px + extra radii |
| Concept foundation wired into app | **Structural fail** — app imports `brand-tokens.css` only |
| CvpMonogram no four-color mark | **Pass (local)** — blue + ink only |

**Brand-conformance check (shipped product): FAIL (many violations).**  
**Brand-conformance check (concept harness): likely near-pass; final zero not re-closed this audit.**

UI brand matrix appendix:  
`/Users/baileyeubanks/.hermes/cache/delegation/subagent-summary-0-20260801_091434_274635.txt`

---

## What is source-only vs runtime-proved

| Claim | Class |
|---|---|
| Next app builds/typechecks on dirty tree | **typecheck proved**; full build not re-run |
| Unit/contract tests green | **Disproved** on dirty tree (14 fail) |
| Public site up | **Proved** |
| Public site = current HEAD | **Disproved / unmeasurable** |
| Local :4103 = repo | **Disproved** |
| Upload→V1 atomic saga | **Source reviewed**; runtime unproved |
| Anonymous review admission | **Source reviewed**; migration/keys unproved |
| CCO OS commercial operating | **Not proved** here; admin host up only |
| Client host | **Disproved** (no DNS) |
| Official brand in product | **Disproved** |
| Concept light cockpit exists | **Proved** on disk + local static server earlier |

---

## Priority repair sequence (recommended)

Do **not** restyle the whole app first. Order is structural:

1. **G0 — Custody**
   - Stop tmp `:4103`.
   - Run from repo worktree at known SHA.
   - Account for 117 dirty files (brand WIP vs authority WIP vs noise).

2. **G2 — Deploy truth**
   - Ship `/api/version` (sha, build time, product name).
   - Allow it through launch gate (public or staff).
   - Diff live SHA vs HEAD; quantify staleness.

3. **Restore harness green on a clean slice**
   - Identify the 14 failing tests; fix or quarantine with owner-visible reasons.
   - No publish narrative while red.

4. **Brand token cutover (one PR, mechanical)**
   - Replace `app/brand-tokens.css` with official Sapphire system from `docs/design/cvp/foundation.css`.
   - Delete four-color phase tokens; map status → RGY+blue.
   - Remove AuthShell rainbow gradient.
   - **Un-dark the project cockpit wrapper** (light operator chrome; dark only on player).
   - Leave layout refactors for later.

5. **G3 doors**
   - DNS for `client.contentco-op.com`.
   - Prove `admin.contentco-op.com/os` serves CCO OS (not 404).

6. **G4 → G5**
   - Apply C5A/C6B with receipts.
   - Configure storage + admission signing + trusted IP header.
   - One real file through the spine.

7. **P1 decomposition + IA collapse**
   - No new features into `ProjectCockpit.tsx`.
   - Extract player / dock / section router.
   - Collapse dual project nav (tabs vs 12 cockpit sections) onto canon spine.
   - Put `/reports` (and whiteboard) in nav or demote routes.
   - Mark demo-only empty states honestly.

---

## Owner decisions still open (do not infer)

From `CCO_GOAL.md` §6:
1. Architecture A+ gate retired or binding?
2. Adopt `integration/cco-reconcile-20260731` as main?
3. Tier-3 Wistia-competitor scope?
4. Keep/delete untracked `audit/` (~38MB)?
5. Ratify mega-spec §0 canonical repo/branch?

Plus brand: **confirm official Sapphire law supersedes Arc III everywhere** (canon file says yes; shipped code disagrees).

---

## Inventory counts (this pass)

| Item | Count |
|---|---|
| `page.tsx` surfaces (app router groups) | ~25 pages |
| `app/api/**/route.ts` | ~90+ endpoints |
| Component top-level domains | ~25 |
| Lib domains | ~30 |
| Tests files | 199 |
| Tests run | 1224 (1208 pass / 14 fail / 2 skip) |
| Dirty paths | 117 |
| Largest UI monolith | ProjectCockpit ~110KB |
| Official canon file | present, untracked |
| Concept harness files | foundation/ontology/render/audit/html |

---

## Appendix A — Absolute paths

| Artifact | Path |
|---|---|
| This report | `…/cco-videopro-definitive-20260715/docs/audits/CVP_DEEP_SURFACE_AUDIT_20260801.md` |
| Product canon | `…/contentco-op/CCO_PRODUCT_CANON.md` |
| Goal loop | `…/contentco-op/CCO_GOAL.md` |
| CVP brand canon | `…/docs/CO_VIDEOPRO_CANON.md` |
| STATUS | `…/STATUS.md` |
| Deploy contract | `…/DEPLOY_CONTRACT.md` |
| Host law | `…/lib/auth/host-surface.ts` |
| Proxy / launch gate | `…/proxy.ts` |
| Brand tokens (shipped) | `…/app/brand-tokens.css` |
| Concept tokens | `…/docs/design/cvp/foundation.css` |
| Flagship screenshot | `…/docs/design-evidence/flagship-orchestration-light-20260801/cvp-orchestration-cockpit.png` |
| Hermes handoff | `…/contentco-op/HERMES_HANDOFF_CVP_FLAGSHIP.md` |
| Illegal runtime | `/private/tmp/cvp-release-20260726.LZL0gS/tree` |

---

## Appendix B — Confidence

| Section | Confidence |
|---|---|
| Live HTTP/DNS/title/custody | **High** (direct probe) |
| Brand hex census | **High** |
| Test regression exists | **High** (runner summary); **medium** on exact failing names (full fail list not captured after timeout) |
| Security design quality | **Medium-high** (source read; not penetration-tested live) |
| DB/migration applied state | **Medium** (STATUS + absence of runtime ready; no direct DB login this pass) |
| CCO OS `/os` content | **Low this pass** (host up only) |

---

*End of audit. Evidence over narrative. Next action should be G0/G2, not another restyle.*
