# Lane 4 — Data Reality: demo vs real

Audit date: 2026-07-25. App under test: Next.js dev server at `http://localhost:4103`, repo `cco-videopro-definitive-20260715`.
Method: code inspection + live runtime probing (curl, Playwright). No files modified; no credentials typed. Claims in `docs/COVIDEOPRO_OPEN_RISKS.md` were treated as unverified until observed.

## Verdict summary

| Risk | Doc claim | Verdict | One-line evidence |
|---|---|---|---|
| R1 | "Supabase migration 014 never executed" | **CONFIRMED (and unenforceable)** | Migration file exists (`supabase/migrations/20260716120000_project_operating_record.sql`) but nothing in the repo can run it: no `supabase/config.toml`, no migration-apply script in `infra/` or `scripts/`, no `.env.local`, and every Supabase-backed API route 503s in this environment. |
| R2 | "Remote record APIs unwritten" | **STALE → partially fixed; still WORSE than doc implies for most entities** | `inquiries`, `organizations`, `contacts` routes now exist (`app/api/inquiries/route.ts:1-60`), but 15 of the ~18 record-entity families have **no** API route at all (see table below). The running app's remote mode is 100 % dead: every `/api/*` probed returns `503 AUTH_NOT_CONFIGURED`. |
| R3 | "Demo persistence is browser-local" | **CONFIRMED** | Runtime test: rename survives hard reload in the same browser profile, is absent in a fresh incognito context (`audit/scripts/lane4-r3.mjs` output below). |

---

## R1 — Migration "014" (project_operating_record) — CONFIRMED

- The doc says "migration 014"; the actual file is timestamped: `supabase/migrations/20260716120000_project_operating_record.sql`. It exists and is substantial: adds `stage`/`organization_id`/`primary_contact_id` to `co_production.projects` and creates the CRM/record tables (`co_production.organizations`, `co_production.contacts`, …) with RLS and service-role-only writes (file header, lines 1–40).
- **Nothing applies it.** `supabase/` contains only `migrations/` (no `config.toml` for the Supabase CLI). Grep for `supabase db|supabase link|migration` across `infra/`, `scripts/`, `package.json`, `Dockerfile` finds no apply/reset tooling — only certification receipt JSONs mentioning migration *tests*. `infra/runtime/*` is release/health tooling only.
- **No credentials exist.** Repo root has only `.env.example`; `.env.local` is MISSING (`ls -a | grep '^\.env'` → `.env.example` only). Secret values were not read or printed anywhere.
- **The running app does not talk to Supabase.** Demo mode is *forced on* in dev when env is absent: `lib/demo/mode.ts:5-7` (`LOCAL_DEMO_DEFAULT = NODE_ENV === "development" && (!NEXT_PUBLIC_SUPABASE_URL || !NEXT_PUBLIC_SUPABASE_ANON_KEY)`). Live probe:
  - `curl /api/projects` → `503 {"error":"Authentication is not configured for this environment","code":"AUTH_NOT_CONFIGURED"}`
  - `curl /api/inquiries` → same 503.
- **What breaks without 014:** even with credentials, the three record routes that *do* exist (`/api/inquiries`, `/api/organizations`, `/api/contacts`) query tables (`organizations`, `contacts`, `inquiries` — e.g. `app/api/inquiries/route.ts:33-47`) that only this migration creates; without it they would 500 against a live DB. The remaining record entities have no routes at all (R2), so nothing remote touches their tables. Demo runtime is genuinely unaffected (localStorage), so the risk is deploy-time-only, as documented.
- Certification receipts add a caveat worth flagging: `scripts/certification/receipts/latest.json` reports "Missing migration declarations: approval_steps, profiles" — i.e., even the *old* remote runtime's tables are not fully covered by repo migrations. (Receipts reference the predecessor `cco-codeliver` checkout; treat as secondary evidence.)

## R2 — Remote record APIs — STALE in framing, still the dominant gap

The doc's core claim ("the Supabase API routes for the new entities do not exist yet") is **partly stale**: `app/api/` now contains `inquiries/`, `inquiries/[id]/convert/`, `organizations/`, `contacts/` alongside the legacy codeliver routes (`projects`, `assets`, `folders`, `sharing`, `review`, `comments`, `versions`, `auth`, `health`, …). Checked for one directory per record entity (`test -d app/api/<entity>`):

- **EXIST:** `inquiries`, `organizations`, `contacts` (+ legacy media/review routes).
- **MISSING (no route at all):** `proposals`, `briefs`, `plan-items`, `sequences`, `selects`, `decisions`, `deliverables`, `payments`, `rate-cards`, `discovery`, `shots`, `production-days`, `releases`, `revision-requests`, `milestones`.

### Definitive surface → data-source table

| Surface | Demo mode source | Remote mode source | Evidence |
|---|---|---|---|
| Home `/` | `useDemoWorkspace()` (localStorage) | **Nothing** — hard empty-state "Home works with the local workspace" | `app/(dashboard)/page.tsx:27-29, 68-82` |
| Opportunities `/opportunities` | demo workspace (inquiries/orgs/contacts/proposals) | **Nothing** — empty-state; never calls the existing `/api/inquiries` | `app/(dashboard)/opportunities/page.tsx:39-55, 96-103` |
| Projects `/projects` | demo workspace | `fetch /api/projects, /api/folders, /api/assets` | `app/(dashboard)/projects/page.tsx:105-117` |
| Project detail `/projects/[id]` | demo workspace + `ProjectRecordSections` | `fetch /api/projects/[id], …/assets, /api/auth/session`; record sections render `SectionEmpty` | `app/(dashboard)/projects/[id]/page.tsx:99-110, 352-383`; `components/projects/ProjectRecordSections.tsx:83, 219, 410, 508, 670` |
| Library `/library` | demo workspace | `fetch /api/assets` | `app/(dashboard)/library/page.tsx:53-84` |
| Reviews `/reviews` | demo workspace | `fetch /api/sharing` | `app/(dashboard)/reviews/page.tsx:70-82` |
| Activity `/activity` | demo workspace | `fetch /api/activity` | `app/(dashboard)/activity/page.tsx:70-111` |
| Field `/field` | demo workspace (productionDays/shots/releases) | **Nothing** — empty-state | `app/(dashboard)/field/page.tsx:59-76` |
| Settings `/settings` | demo workspace | partial (Supabase browser client via `IdentitySettings`) | `app/(dashboard)/settings/page.tsx:105-106`; `components/auth/IdentitySettings.tsx:141,278,299` |
| Public review `/review/[token]` | demo token via store | `fetch /api/review/[token]` (+ comments/approvals/edit-decisions) | `app/review/[token]/page.tsx:377,646,741` |
| Notifications | demo | `fetch /api/notifications` | `lib/stores/notificationStore.ts:48-72` |

Net: the "dual runtime" is real, but asymmetric — media/review surfaces have remote fetches; the entire Project Operating Record (CRM, briefs, proposals, plan, sequences, decisions, delivery, payments, field ops) exists **only** in the demo store. The existing `/api/inquiries` etc. are orphaned: no UI surface calls them. So R2 is best restated as: remote record APIs ~85 % unwritten, and the 15 % that exist are unwired.

## R3 — Demo persistence is browser-local — CONFIRMED at runtime

Script: `audit/scripts/lane4-r3.mjs` (Playwright, demo login via the pre-filled "Open local workspace" button — no credentials). Output:

- **Fresh context after demo login:** localStorage key `co-videopro.workspace.v2` present, schemaVersion 2, projects `[ICA, Schneider + EPC, bp, Conexon, Physical Edge — El Paso]`, 8 assets, 2 inquiries, 2 share links (36 722 bytes). Matches `lib/demo/workspace.ts:18-25` and `lib/demo/record-seed.ts`. Screenshot: `audit/shots/lane4-home-fresh.png`.
- **Edit → hard reload, same context:** renamed project `ICA` → `AUDIT-RENAMED ICA` in localStorage; after `page.reload()` the rename is live (`sameContext_afterHardReload`). Screenshot: `audit/shots/lane4-home-after-rename-reload.png`. Persistence works as claimed within a profile.
- **Fresh incognito context:** seed reappears pristine; the rename is gone. Cross-browser/cross-device sharing of demo state is impossible — confirmed browser-local.
- **IndexedDB:** `indexedDB.databases()` → `[]` in a fresh session; `lib/demo/media-blob-store.ts:21-26` creates the blob DB lazily on upload, so uploaded media is even more fragile than the workspace JSON (per-profile IndexedDB, evictable under storage pressure — session-memory/IndexedDB as the doc says).
- Note: persistence code is at `lib/demo/workspace-store.ts:115` (key), `:799-851` (load/save), with legacy migration from `co-deliver.demo-workspace.v1` (`:116, 802`).

## Fragility map — what breaks when real (empty) data replaces the seed

1. **Seed resurrection on restore.** `mergeSeededRecords` (`lib/demo/workspace-store.ts:706-710`) unconditionally re-appends any seeded record whose id is missing from saved state. Deleting a seeded inquiry/proposal/deliverable in demo therefore does **not** survive reload — the seed is an immortal floor. A demo user can never see an empty state for those collections, and "real empty data" is unreachable in demo mode by construction.
2. **Hardcoded project id.** `app/(dashboard)/projects/page.tsx:97` initializes `activeProject` to `"ica"`. Remote mode corrects it after fetch (`:126-131`), but any workspace without an `ica` project starts pointed at a non-existent id until the fetch lands.
3. **Orphaned foreign keys inside the seed itself.** Deliverables reference `source_version_id: "ver-ica-final-v5"` (`lib/demo/record-seed.ts:215, 223`), but **no version entity exists anywhere** — the demo workspace state has no `versions` collection (state shape, `workspace-store.ts` interface: projects, assets, … no versions) and grep for `ver-ica-final-v5` outside the seed returns nothing. Version is a cosmetic counter (`MediaAsset.version_count`). Any UI that later tries to resolve `source_version_id` → version will dereference a ghost.
4. **Demo-only UI paths silently render "honest fallbacks" that could mask wiring bugs.** Home/Opportunities/Field return static empty-states in remote mode (`app/(dashboard)/page.tsx:68`, `opportunities/page.tsx:96`, `field/page.tsx:66`) — they never even attempt the existing `/api/inquiries` route, so the day remote record routes are switched on, these pages still show empty until someone rewrites them. The fallback copy ("Connect this environment…") will look like a product bug, not a missing feature.
5. **Remote mode without env is a hard 503 wall, not a graceful degradation.** All Supabase-backed routes throw `AUTH_NOT_CONFIGURED` (observed). `lib/public-env.ts:1-8` throws on missing env; any component that touches `createBrowserClient` outside demo guards would crash the render rather than degrade.
6. **Seed-assuming selectors.** Field page falls back to `workspace.projects[0]` (`app/(dashboard)/field/page.tsx:85`) — guarded by an empty-state, OK; but review/demo and cockpit components key off literal asset ids (`ica-roadshow-final`, `denie-mcdonald-v4`, `mclaren-podcast-v3`) baked into seeded share links (`workspace-store.ts:413-450`). With real data these ids don't exist; the demo review URLs become dead links rather than resolving dynamically.

## End-to-end record trace: inquiry → … → delivery (demo store)

Followed through `lib/demo/workspace-store.ts` mutations + UI callers:

1. **Inquiry** — seeded `inq-hlsr-2027`, `inq-wendys-finalfour` (`record-seed.ts:62-85`). UI: Opportunities list (`opportunities/page.tsx:181-189`). ✅ renders.
2. **Inquiry → Project** — `convertInquiryToProject` (`workspace-store.ts:1732`), wired to UI (`opportunities/page.tsx:86`). Optional detour: `startDiscovery` → `answerDiscoveryQuestion` → `completeDiscovery` (`:2935-3005`), wired (`opportunities/page.tsx:353`). ✅ transition exists and is guarded.
3. **Project → Brief → Proposal** — `saveBrief`/`setBriefStatus` (`:1760-1825`), `saveProposal`/`setProposalStatus` (`:1825-1927`), `compileBidToProposal` (`:3058`) — all wired in `ProjectRecordSections.tsx:97, 283` and `opportunities/page.tsx:295-314`. ✅
4. **Project → Asset → Version** — assets exist (8 seeded), but **the chain breaks here conceptually**: there is no version record. `version_count` is a display integer; upload of a new version (`uploaded_new_version` activity, `workspace-store.ts:477-486`) does not create a version entity. Selects/sequences/deliverables all carry `version_id: null` or ghost ids (`record-seed.ts:172-185, 215`). ⚠️ version stage is cosmetic.
5. **Asset → Review** — `createDemoShareLinks` (`:1139`) → public URL `/review/demo?demo=1&asset=…`; review comments via `addDemoReviewComment` (`:1263`); transcript→select→sequence via `addSelect`/`createSequenceFromSelects` (`:1978-2043`, wired `ProjectRecordSections.tsx:683-753`). ✅
6. **Review → Approval** — two parallel, *disconnected* mechanisms: (a) external `recordDemoPublicReviewApproval` (`:1380-1511`) — sets `asset.status = "approved"` only when **all** approval steps approve (`:1440-1447`); (b) internal `finishDemoReview` (`:2865-2912`, wired `FinishReviewBar.tsx:23`) — creates a **Decision** record but does **not** touch `asset.status`. An internal "Approved" finish therefore does not satisfy the delivery gate (`hasFinalApproval` requires `asset.status === "approved"`, `:2267`). ⚠️ two sources of approval truth can diverge.
7. **Approval → Delivery** — `saveDeliverable`/`setDeliverableStatus`/QC gates (`:2165-2242`, wired `ProjectRecordSections.tsx:522-616`). Deliverable creation is manual; nothing auto-creates one from an approved asset. ✅ but manual link.
8. **Stage spine** — `advanceProjectStage` (`:2245-2281`) enforces the full gate chain from `lib/covideopro/transitions.ts:346-395` (intake needs org+contact, development needs brief, preproduction needs approved proposal, production needs production day, post needs sequence, review needs active share link, delivery needs final approval + specced deliverable, archived needs all deliverables closed). Wired once in `ProjectCockpit.tsx:1011`. ✅ the guarded lifecycle is real and observable.

**Where the chain breaks / orphans:**
- Version entity: non-existent (ghost FKs on deliverables/selects/clips).
- Internal finish-review approval → asset status: not propagated (Decision only).
- Deliverables: never auto-spawned from approval; seed deliverable `del-ica-social` sits in `qc` with a ghost `source_version_id`.
- Seed comments `comment-charles-1/2` referenced by revision request `rr-charles-r2` do exist (`workspace-store.ts:526-546`) ✅; decision `dec-ica-logo` → `comment-denie-3` ✅ exists.
- Call sheets: `seedCallSheets` is empty; `generateCallSheet` (`:2809`) is wired (`ProjectRecordSections.tsx:1179`) ✅.

## Evidence index

- Runtime probe outputs: `curl` 503s (this session); `node audit/scripts/lane4-r3.mjs` JSON (quoted above).
- Screenshots: `audit/shots/lane4-home-fresh.png`, `lane4-home-after-rename-reload.png`, `lane4-home-incognito.png`, `lane4-opportunities-1440x900.png`, `lane4-project-ica-1440x900.png`.
- Scripts (new, audit-only): `audit/scripts/lane4-r3.mjs`.
