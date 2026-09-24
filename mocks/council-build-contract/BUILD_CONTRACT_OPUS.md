# BUILD CONTRACT — seat Opus 5.5 (one-shot, 2026-09-24)

| Field | Value |
|---|---|
| Status | One-shot build contract for Blaze to forge by diff against the Fable and Grok contracts, section by section. Not a Land. |
| Governs | CVP Lands **after** spine rows 1–6 close. Rows 1–6 are not reopened, re-ordered, or stalled. |
| Bailey | GO full speed 2026-09-23. Zero questions. Gates G1 (migration apply) and G2 (DNS) are named where they fall, not re-asked. |
| Inputs | Bailey locks (below) · Opus spine rev 5.1 · Fable spine rev 4 · Grok spine draft · nav mocks [#30](https://github.com/baileyeubanks/codeliver/pull/30) / [#31](https://github.com/baileyeubanks/codeliver/pull/31) / [#32](https://github.com/baileyeubanks/codeliver/pull/32) · repo `main` @ `5da6aed` |
| Disk | `CCO/clients/schneider-electric/2026-03-13_el-paso-customer-story` and `.../2026-09-25_weftec` live on M2. This seat did not read them. Fill rows name record targets and known live UUIDs only, and never invent contents. |
| Legend | **EXISTS** = in a named migration or file · **NEW** = new column, table, or function, applied only at gate G1 · **DERIVED** = computed and never typed · **Lnn** = Land number in §6 |

| Lock | Text | Enforced by |
|---|---|---|
| K1 | Client door `{client}.co-videopro.com` plus a Content Co-op Master over many accounts | §2a tenancy, L8–L10 |
| K2 | No crew: no crew product, crew states, or van app | §7 kill, L16 |
| K3 | Delivery is AI-fluid: the lock record is fixed and the how is swappable. No sacred wizard. | §1 invariants, L17, L19 |
| K4 | Film route has no nav rail | §2b film row, L11 |
| K5 | Login → Projects | §2b login row, L12 |
| K6 | Seats: Projects · Brief · Shoot · Cut · Delivery, plus a Library drawer | §2b, L11 |
| K7 | Golden path is El Paso Water × Schneider. WEFTEC is the event pressure test. | §3, §4, L20 |
| K8 | Keep the Fable/Grok nav drawing. No redraw. | L11, §7b |

---

## 1 Record contract

### 1a Objects

| Object | Table today | State | Tenancy key | Writer | Client sees | Change |
|---|---|---|---|---|---|---|
| Master workspace | `co_production.teams` (one row: Content Co-op) + `team_members` | EXISTS `20260715093300` | `projects.team_id` | Bailey (staff) | never | None. Every job's `team_id` is the Content Co-op team. |
| Client account | `co_production.organizations` | EXISTS `20260716120000` | `organizations.id` | Master only | own name + mark | **NEW** `slug` (door label, unique, `^[a-z0-9-]{2,40}$`) · `brand jsonb` (mark, accent) · `disk_key` (e.g. `schneider-electric`) · `door_status` (`off` / `preview` / `live`) |
| Account membership (long-running) | none | **NEW** `co_production.organization_members(organization_id, user_id, role client_admin/client_member, expires_at, invited_by)` | `organization_id` | Master | own row | NEW |
| Job grant (scoped) | `co_production.project_members` | EXISTS (`role`, `expires_at`) | `project_id` | Master | own row | **NEW** `seats text[]` ⊆ {brief, shoot, cut, delivery}, default all four |
| Job | `co_production.projects` | EXISTS; `stage`, `organization_id`, and `cco_estimate_*` already present | `organization_id` (door queries require non-null) | Master | name, DERIVED seat word, granted seats | **NEW** `disk_key` (e.g. `2026-03-13_el-paso-customer-story`, unique per account) |
| Brief | `briefs` + `brief_versions` | EXISTS, but `UNIQUE(project_id, version)` allows only one lineage | `project_id` | Master drafts; client approves a version | `in_review` / `approved` versions | **NEW** `lineage_key text DEFAULT 'main'` and `title`; unique becomes `(project_id, lineage_key, version)`, allowing many open briefs on one job |
| Shoot | `plan_items(kind=production_day)`, `production_days`, `locations`, `call_sheets`, `shots` | EXISTS `20260716140000`, `20260717120000` | `project_id` | Master | date, place, call time, shot list (read-only) | None. `crew_members` gets no UI (K2). |
| Asset / Version | `assets`, `versions` (+ `previous_version_id`) | EXISTS; the only writer is `/api/upload/tus` | `project_id` | Master via tus | versions shared to them | none |
| Share | `review_invites` + `review_view_admissions` | EXISTS; recipient-bound `20260922052640` | asset → project → org | Master | the film | Stored Review / Approve / Preview posture is **owned by row 6**. This contract adds nothing. |
| Note | `comments` (version-bound, 0–100 pins) | EXISTS `20260726113000` | version | guest, client, Master | shared thread | none |
| Approval round | `approval_workflows`, `approvals`, `approval_history` | EXISTS, version-bound `20260922073000` | version | client approver, as a deliberate act | own pending step | none |
| Revision request | `revision_requests` | EXISTS | `project_id` | Master | "changes requested" only | none |
| Deliverable | `deliverables` (+ `qc_checks`, `locked_at`, `locked_by`, `approval_id`) | EXISTS `20260716120000`, `20260717130000`, `20260812120000` | `project_id` | Master | name, due, DERIVED state, download when locked | **NEW** `brief_id` (which open brief it answers) · `due_at timestamptz` |
| Delivered set | `deliverable_items` (`sha256`; immutable once locked) | EXISTS `20260812120000` | `deliverable_id` | lock command only | download list | none |
| Assist artifact (AI draft) | none | **NEW** `assist_artifacts(project_id, seat, kind, input_refs jsonb, body jsonb, status proposed/accepted/rejected, decided_by, decided_at)` | `project_id` | model proposes; Master decides | never | NEW |
| Commercial ref | `projects.cco_estimate_id`, `cco_estimate_version_id`, `commercial_total_cents`, `commercial_ref` | EXISTS `20260812000000`; CCO OS is the authority | `project_id` | CCO OS only | never | none |
| Door resolution | none | **NEW** RPC `co_production.resolve_door(slug)`, SECURITY DEFINER, returns `{organization_id, name, brand}` only when `door_status` is `preview` or `live` | — | — | brand only | NEW |
| Org role check | `co_production_private.has_project_role` / `has_team_role` | EXISTS | — | — | — | **NEW** `co_production_private.has_org_role(org_id, rank)`; `projects_select` also admits it |

### 1b Derived values (never typed)

| Value | Computed from | Shown on | Replaces |
|---|---|---|---|
| Seat word per job | First match wins: brief version `in_review` → Brief; next `production_day` ≥ today → Shoot; open approval round → Cut; deliverable not locked with an approved source → Delivery; else Done | Projects rows (both sides) | Showing the typed `projects.stage` on doors. `stage` stays as the master's lifecycle field. |
| Waiting on whom | pending `approvals` assignee (client) · open `revision_requests` (Content Co-op) · brief versions `in_review` (client approver) · deliverables past `due_at` (Content Co-op) | Master Projects; client "Needs you" | Madeline's sheet columns (row 5 maps onto these) |
| Deliverable status | versions + rounds + `locked_at` | Cut status strip, Delivery | typed status cells |
| Seat visibility | active `organization_members` in the door org ∪ `project_members.seats`, intersected with the door org | nav bar, route guard | — |
| Needs-you count | the viewer's pending approval steps + brief versions awaiting their approval | Projects badge | — |

### 1c Invariants

| Invariant | Held by |
|---|---|
| Nothing is sent (mail, SMS, notify) without Bailey's yes. Invites return a copyable link. | L9; `notification_outbox` is never drained by these Lands |
| `delivered` is reachable only through the lock | EXISTS constraint `deliverables_delivered_requires_lock` |
| One catalog writer | `/api/upload/tus`; legacy writers stay `410 Gone` |
| Notes, approvals, and deliveries bind to an exact version | EXISTS version-bound contracts |
| Every door read is filtered by the door org **and** RLS membership | §2a |
| Clients never see money, assist drafts, other accounts, or the master home | §2b projections |
| Delivery "how" lives in `deliverables.spec`, `qc_checks`, and `assist_artifacts`, never in a step machine | K3 |

---

## 2 Two-side surface map

### 2a Tenancy mechanism

| Concern | Mechanism | Where | Fails closed as |
|---|---|---|---|
| Host → door | `proxy.ts` parses Host with `^(?<slug>[a-z0-9-]{2,40})\.co-videopro\.com$`. Reserved labels are rejected: `www admin app api client review master mail status staging dev cdn assets auth`. | `lib/auth/host-surface.ts` (new `resolveDoorSlug`), `proxy.ts` | unknown, reserved, or `door_status=off` → one generic 404 body |
| Slug → account | `resolve_door(slug)` called server-side. Result cached 60 s per slug; brand fields only. | NEW RPC | backend down → structured 503; never falls through to another door |
| Surfaces | Door host = `client` surface bound to **one** org. `co-videopro.com` and `admin.contentco-op.com` = master surface. `client.contentco-op.com` = generic door, bound to no org. | `host-surface.ts`, `surface-origins.ts` | host not listed → existing rejection |
| Request binding | Proxy strips any inbound `x-cvp-door-org` and stamps it after resolution (same pattern as the demo capability header). Every client API handler on a door host requires it and filters `organization_id = door org`. | `proxy.ts`, `lib/api/*` | header missing on a door host → 403 `DOOR_UNBOUND` |
| Session scope | Supabase SSR cookies stay **host-only** (no `Domain=`), so a Schneider door login is never sent to another door or the apex. Same quiet single Sign in path on every door; Google is off on doors because Google OAuth has no wildcard redirect. Auth callback and reset links are minted on the requesting door host. | Supabase SSR cookie config, `app/api/auth/*` | a `Domain=.co-videopro.com` cookie fails the test |
| Membership gate | After the session: `has_org_role(door org)`, or an active `project_members` row on a job in the door org. Otherwise sign out of that host and show "No access on this door". | NEW `has_org_role` | no project list is rendered |
| RLS | `projects_select` also admits `has_org_role(organization_id, rank)`. The project-grant path is unchanged. Seats are enforced in the API projection: an ungranted seat's routes and data return 404. | migration at G1 | 0 rows |
| Master sees | Staff (`content_coop_role=staff`) + Content Co-op `team_members` → every job with `team_id` = Content Co-op, across all accounts. "All accounts / {account}" is a view filter only. | EXISTS `has_team_role` | staff without a team row → empty list, not an error |
| Staff on a door | Allowed as a read-only **"View as {account}"** preview: client projection plus a banner, so Bailey sees exactly what Madeline sees | `roleCanAccessSurface` | any write → 403 `PREVIEW_READ_ONLY` |
| Client on the master host | Redirect to their door (one account) or the generic-door chooser (several) | EXISTS surface redirect | `SURFACE_FORBIDDEN` |
| Person in two accounts | Separate session per door. `client.contentco-op.com` lists their doors. No client surface ever lists two accounts together. | chooser | — |
| Guest review links | Links already sent on `co-videopro.com/review/{token}` serve forever. New links mint on `{slug}.co-videopro.com/review/{token}`. A token whose job org ≠ door org → 404 on that door. | `getReviewSiteUrl` becomes door-aware; `app/review/[token]` | 404, never a cross-door render |
| Client A ≠ B | Enforced three times: host-only cookie, door-org request binding, RLS membership | L7, L8, L10 negatives | — |
| DNS / TLS | Wildcard `*.co-videopro.com` on the existing Cloudflare tunnel with a one-level wildcard cert; Supabase redirect allowlist `https://*.co-videopro.com/**` | `infra/runtime/cloudflare` | Bailey gate **G2** |
| Headers | CSP and `frame-ancestors 'none'` unchanged on every host | `next.config.ts` | — |
| Brand | Account mark + name beside the sapphire CVP lockup (no redraw). No mark on file → name only. | `organizations.brand` | — |

### 2b Seats × sides

| Surface | Route | Side | Scope | Reads | Writes | Phone | Desktop | AI draft (Master accepts; never sends, spends, approves, or locks) |
|---|---|---|---|---|---|---|---|---|
| Login | `/login` | door | one account | `resolve_door` brand | session | quiet door, account mark over the form, Login → Projects | same | — |
| Login | `/login` | master | all | — | session | quiet door, Login → Projects | same | — |
| Projects | `/projects` | door | one account | jobs in the door org the viewer can see; seat word; needs-you | none (opens a job) | bottom pipeline with Projects active; rows show seat word + needs-you dot | thin left | — |
| Projects | `/projects` | master | all accounts | all team jobs grouped by account; waiting on whom; `due_at` ordering | account filter (view only); create job | bottom pipeline; account chip | thin left + account filter | — |
| Projects home, seat tap | `/projects?seat=` | both | as above | same | none | Brief / Shoot / Cut / Delivery filter jobs by seat word | same | — |
| Brief | `/projects/[id]/brief` | door | one job | lineages; `in_review` / `approved` versions | approve a version (deliberate confirm, ACS quiet-confirm idiom) | one card per lineage | two-pane | — |
| Brief | same | master | one job | all versions and drafts | new lineage; new version; mark `in_review` (no mail) | same | same | brief draft from inquiry, call notes, or transcript |
| Shoot | `/projects/[id]/shoot` | door | one job | days, locations, call sheet (client-safe fields), shot list | none | day list | day + map pane | — |
| Shoot | same | master | one job | full production entities | days, locations, call sheets, shots | same | same | shot list draft from the approved brief lineage |
| Cut | `/projects/[id]/cut` | door | one job | versions shared to the viewer; rounds; deliverable status strip | open the film; finish reviewing (row 6) | version list + strip | list + strip | — |
| Cut | same | master | one job | all assets, versions, rounds, shares | upload (tus); share (row 6 modes); start a round | same | same | chase list per open round; QC vs approved brief |
| Film | `/projects/[id]/assets/[assetId]` and `/review/[token]` | both + guest | one exact version | version, notes, round | tap-comment note (row 1); approve when the share allows it | **no nav rail**; film first; back chevron to Cut | **no nav rail**; review rail as in PR #36 | none on door or guest |
| Delivery | `/projects/[id]/delivery` | door | one job | deliverables: name, due, DERIVED state; locked items | download locked items only | list sorted by due | list + item pane | — |
| Delivery | same | master | one job | + `spec`, `qc_checks`, lock evidence | set spec; accept or reject artifacts; **lock** (writes `deliverable_items` + `sha256`) | same | same | platform spec suggestion; QC run; package manifest draft (swappable per job) |
| Library (drawer) | `/library` | door | one account | locked `deliverable_items` + brand kit of the door org | download | drawer item | drawer item | — |
| Library (drawer) | same | master | all accounts | all locked items; account filter | curate and tag | same | same | — |
| Drawer | — | door | — | — | — | Library · Members (client_admin: read-only list) · Notifications (in-app) · Sign out | same | — |
| Drawer | — | master | — | — | — | Library · Accounts · Team · Settings · Audit log · Archive · Trash · Sign out | same | — |
| Accounts | `/settings/accounts` | master | all | organizations, members, grants | account, slug, brand, `door_status`; add member (long-running); grant job seats with expiry; invite = copyable link | drawer → Accounts | settings pane | — |
| Ungranted seat | any seat route | door | — | — | — | seat shows **dimmed, not focusable**, so the bar stays the drawing | same | route returns 404 |

---

## 3 El Paso seat fill (golden path)

| Anchor | Value |
|---|---|
| Account | Schneider Electric · `slug=schneider` · `disk_key=schneider-electric` |
| Job | El Paso Water customer story · `disk_key=2026-03-13_el-paso-customer-story` |
| Live asset | `1ec225a9-e405-453a-9a53-d9dfa7e063a3`, version `bb081d37-ef8f-450f-8006-307f342d148e` (named in PR #27; client paint proved by F1 on `46a256f2`) |
| Fill rule | Link the existing live job; never recreate it. Media enters only through tus. Records are entered by the Master from what is on disk; a missing source is an empty state, never invented. Nothing is sent to Schneider during the fill. |
| Demo seed conflict | `lib/demo/record-seed.ts` names `org-schneider` "Schneider National / Logistics" and `lib/demo/workspace.ts` names the job "Physical Edge — El Paso". Neither is the real record (see §7 kill). |

| Seat | Record rows to fill | Source | Madeline (door) sees | Jennifer (door) sees | Master sees | Write proved in | If disk lacks it |
|---|---|---|---|---|---|---|---|
| Account | `organizations` Schneider (slug, brand, `door_status`) | Blaze supplies mark | mark on door | mark on door | account in filter | L9, L10 | name only, no mark |
| Projects | existing live El Paso `projects` row: `organization_id`=Schneider, `team_id`=Content Co-op, `disk_key` | live row holding asset `1ec225a9…` | El Paso row, DERIVED seat word, needs-you | El Paso row only, word "Shoot" | row under Schneider, with waiting on whom | L13 | — |
| Brief | `briefs` lineage `main` v1..n; approved version | brief documents in the job folder | approved version (read-only), approve control on `in_review` | Brief dimmed (404) | all versions | L15 | "No brief on file" empty state |
| Brief (second open lineage) | `briefs` lineage `cutdowns` on the **same** job | job folder, if short-form was briefed | both lineages | dimmed | both | L15 | lineage not created |
| Shoot | `production_days` from 2026-03-13 · `locations` (El Paso Water site) · `call_sheets` · `shots` | call sheet and shot list files in the job folder | date, place (past) | **the only seat**: date, call time, location, site contacts | full | L16 | day with date only |
| Cut | `assets` / `versions` (live `bb081d37…` + later versions via tus) · rounds · notes | already live; extra versions through tus | film first, notes, finish reviewing | 404 | all versions + chase list | L14 | — |
| Delivery | `deliverables` (hero story + cutdowns), each with `brief_id` · locked sets with `sha256` | final exports in the job folder → tus → version → lock | locked items downloadable, DERIVED state | 404 | spec, QC, lock | L17 | deliverable stays `specced` |
| Library | `deliverable_items` of locked El Paso deliverables | DERIVED | downloads | dimmed | cross-account | L18 | empty library |
| Assist | `assist_artifacts`: QC vs approved brief on the hero cut | DERIVED from brief + version | never | never | card accepted or rejected | L19 | no card |

---

## 4 WEFTEC delta (event pressure test)

| Anchor | Value |
|---|---|
| Job | `disk_key=2026-09-25_weftec` · **same** Schneider account and door; no new account |
| Timing | Pressure-tests the record on paper now. The live replay comes from disk after the event (L20). No Land races the event date. |
| Holds unchanged | record objects · door · nav · lock rule · no-send · tenancy |

| Dimension | El Paso (golden) | WEFTEC (event) | Record delta | Surface delta | Breaks if missing | Covered by |
|---|---|---|---|---|---|---|
| Time shape | one story, past, weeks between rounds | fixed event date, hours matter | `deliverables.due_at` (NEW in L7) | due chip + overdue-first sort on Projects and Delivery | status can't rank urgency | L7, L13, L17 |
| Briefs | 1–2 lineages | several lineages opened during the event (e.g. booth recap, exec interview, social set) | `briefs.lineage_key` (L7) | Brief seat adds a lineage without a new job | a new job per brief splits status and the door | L15 |
| Shoot | one site | several days / halls / booth | many `production_days` + `locations` | Shoot seat grouped by day | single-day UI assumption | L16 |
| Stakeholders | Madeline + one shoot-only person | more shoot-only people; an exec approver on one lineage | `project_members.seats` + `expires_at`; approval assignee per round | grant many seats per job in one sheet | per-person manual grants too slow | L9 |
| Review cadence | days between rounds | same-day rounds, many short versions | none | Cut sorted by due; chase list | — (admission limits unchanged: 32 active per invite, 8 h) | L14 |
| Deliverables | few | many shorts | many rows with `brief_id` | Delivery filters by lineage; dense phone list | long list unusable on a phone | L17 |
| Delivery how | manual encode + QC | AI-assisted fast QC, platform specs | `assist_artifacts`, `spec`, `qc_checks` | artifact cards | a wizard blocks the day a tool changes | L19 |
| Upload volume | few large files | many clips the same day | none (tus) | none | CCNAS/scan throughput (**not** reopened) | §8 |
| Library reuse | one story | clips reused later by Madeline | `deliverable_items` | Library filters by job and lineage | — | L18 |
| Status | slow | urgent | DERIVED waiting on whom + `due_at` | master home ranks WEFTEC first | Madeline's sheet comes back | L13 |
| Tenancy | Schneider door | Schneider door | none | none | a new account per event would be wrong | L10 |
| Money | CCO OS | CCO OS | none | none | — | §8 |

---

## 5 Variability matrix

| Case | Grant mechanism | Scope | Seats | Duration | Can write | Never sees | Door behavior | Proved in |
|---|---|---|---|---|---|---|---|---|
| Bailey (Master) | staff role + Content Co-op `team_members` | all accounts | all + master tools | standing | everything, incl. lock | — | on a door: read-only "View as" | L9, L13 |
| Madeline (Schneider, year-long) | `organization_members` (client_admin), `expires_at` = engagement end | every Schneider job, **including new ones automatically** | Brief · Shoot · Cut · Delivery + Library | year | approve brief versions, notes, approve rounds, finish reviewing, download locked | other accounts, money, drafts, master home | `schneider.co-videopro.com` → Projects | L9, L13 |
| Jennifer (shoot-only) | `project_members` on one job, `seats={shoot}`, role viewer, `expires_at` = day after the last production day | one job | Shoot only (others dimmed, 404) | shoot window | none (read-only) | Brief, Cut, Delivery, Library, other jobs | Projects shows that one job | L9, L16 |
| Anonymous guest | review token + recipient-bound admission | one exact version | film only | invite expiry / 8 h admission | note; approve if the share is Approve | everything else | film route, no nav | rows 1, 6 (existing) |
| Open briefs on the same job | `briefs.lineage_key` + `deliverables.brief_id` | one job | Brief | per lineage | approve per lineage version | — | Brief lists lineages | L15 |
| One person in two accounts | membership rows in two orgs | per door | per door | per row | per door | the other account, on this door | separate session per door; generic-door chooser | L8 |
| Client B (test account for negatives) | own org + member | own | all | test only | — | anything Schneider | own door | L7, L8, L10 |
| Expired grant | `expires_at` in the past | none | none | — | — | all | "No access on this door" | L9 |
| New job in the account | `organization_id` set → Madeline's membership covers it | — | — | — | — | — | appears on Projects with no new grant | L13 |
| Delivery variant (manual vs AI-assisted) | same `deliverables` record; `assist_artifacts` optional | — | Delivery | — | Master | drafts (client) | identical client view | L17, L19 |

---

## 6 Ordered Land list after rows 1–6

| # | Land (one PR) | May touch | Depends on | Gate | Live proof artifact | Latch negative (must hold) | Closes |
|---|---|---|---|---|---|---|---|
| 1–6 | **As locked.** PR #36 tap-comment · roster proof · nav pick · VA-106 · Madeline harvest · share-mode port of PR #25 | per spine | — | — | per spine | per spine | nothing in this list starts before all six close |
| L7 | **Record migration (source only, unapplied):** §1a NEW columns and tables, `has_org_role`, `resolve_door`, `projects_select` extension | `supabase/migrations/<ts>_client_doors_record.sql`, `lib/covideopro/record.ts` types, `tests/*tenancy*.test.ts` | rows 1–6 (row 6 owns the share-posture column) | source only | migration dry-run receipt on scratch Postgres (M2) + RLS test transcript | client A JWT selecting a B job → 0 rows; staff sees both; existing rows and policies unchanged; live DB untouched | §1 |
| G1 | **Bailey applies the L7 migration on live** | — | L7 | **G1** | apply receipt | pre/post row counts identical | — |
| L8 | **Door resolver** behind `CVP_CLIENT_DOORS` (default off): Host → slug → org, header stamping, reserved labels, host-only cookies, door-minted auth links, staff read-only preview | `proxy.ts`, `lib/auth/host-surface.ts`, `lib/surface-origins.ts`, `app/api/auth/*`, `app/review/[token]`, tests | G1 | — | Host-header matrix on M2 `next start` for `schneider.localhost` + `clientb.localhost`: brand in door HTML, unknown slug 404, cookie has no `Domain` | flag off → identical routing on apex, `client.contentco-op.com`, admin; forged `x-cvp-door-org` stripped; A cookie on B host → login; apex `/review/{token}` paints for guest **and** signed-in client | §2a |
| L9 | **Grants (Master Accounts):** account slug/brand/`door_status`, long-running members, job seat grants with expiry; invites as copyable link | `app/(dashboard)/settings` (accounts section), `app/api/organizations/*`, `app/api/teams/invites` (no-send path), tests | L8 | none (no send) | phone recording: Bailey grants Madeline (year) and Jennifer (Shoot, El Paso, expiry); both rows hold after refresh | nothing sent (`notification_outbox` unchanged); existing team invites unchanged; client_admin cannot grant | §5 |
| G2 | **DNS wildcard `*.co-videopro.com` + Supabase redirect allowlist** | — | L9 | **G2** | DNS/TLS receipt | apex, admin, and client hosts still resolve and serve | — |
| L10 | **Schneider door live:** `door_status=live` for Schneider + smoke test | config + smoke test only | L9, G2 | — | phone on `schneider.co-videopro.com`: mark → Sign in → Projects with Schneider jobs only, as Madeline and as Jennifer | client B door shows 0 Schneider rows; A session absent on B host; legacy apex review link paints; overlay/logo/auth PASS; `compress:false` held | client-door ledger → PASS (spine #7) |
| L11 | **Nav shell from the picked master (no redraw):** phone bottom pipeline Projects · Brief · Shoot · Cut · Delivery + one drawer; desktop thin left; film route without nav rail; both scopes; ungranted seats dimmed; drawer items per §2b | `components/navigation/*`, `app/(dashboard)/layout.tsx`, seat routes as thin wrappers over existing pages | row 3 pick, L10 | — | phone + desktop screenshots, both sides, Jennifer's dimmed bar, film route without rail | film route and `/review/[token]` render as before; overlay ~6%, logo, auth untouched; no crew item; no second nav; no left+bottom on phone | nav ledger (shell half) |
| L12 | **Kill Land:** retire §7a routes and surfaces | routes in §7a, their tests | L11 | — | each killed route answers per §7a (308 or 404); screenshot of cleaned drawer | nothing on door or master imports killed code; review/film untouched; suite green | §7a |
| L13 | **Projects seat:** door = account jobs + seat word + needs-you; master = all accounts grouped, waiting on whom, due-ordered; row 5 columns mapped | `app/(dashboard)/projects/page.tsx`, new `lib/covideopro/status.ts` (DERIVED), `app/api/projects/*` | L12, row 5 | — | master home on phone ranks Schneider jobs by waiting on whom; Madeline's door shows Schneider only | no typed status control exists; client B sees none; counts equal the record query | spine #8 + #10; the Excel dies |
| L14 | **Cut seat:** versions, rounds, shares per job; deliverable status strip; opens the film | `components/projects/ProjectCockpit*` (Cut section), share components from row 6 | L13, row 6 | — | El Paso Cut on the door phone: open `bb081d37…`, tap a note, finish reviewing → outcome lands on the version; strip updates | guest + signed-in client paint the film; admission limits unchanged; PR #36 path unchanged; no send | Cut seat |
| L15 | **Brief seat:** lineages, versions, deliberate client approve, open another brief on the same job | new brief route, new `app/api/projects/[id]/briefs`, tests | L13 | — | El Paso `main` + `cutdowns`; Madeline approves a version on phone; holds after refresh | Jennifer → 404; approving a brief creates no job; nothing sent | Brief seat |
| L16 | **Shoot seat:** days, locations, call sheet (client-safe projection), shot list; read-only for clients | new `app/api/projects/[id]/shoot` (reads production entities), route | L13 | — | Jennifer on phone sees El Paso Shoot only; Bailey edits call time; Jennifer sees it after refresh | no crew states, crew login, page, or SMS; Jennifer's direct URL to Cut → 404 | Shoot seat |
| L17 | **Delivery seat:** deliverables (`due_at`, `brief_id`), DERIVED state, lock → `deliverable_items` + `sha256`; client downloads locked only; no wizard | `app/api/projects/[id]/deliverables` (EXISTS, gated), lock route, route | L14, L15 | — | El Paso hero story locked from its approved version; Madeline downloads; sha256 matches | `delivered` without lock impossible; unlocked items not downloadable; CCO commercial fields untouched; nothing sent | Delivery seat |
| L18 | **Library drawer:** account-scoped locked items + brand kit; master cross-account | `app/(dashboard)/library`, `lib/assets/*` | L17 | — | Madeline's Library shows El Paso locked items only | searching a client-B title on the Schneider door → 0; demo library not mounted in production | Library |
| L19 | **Assist artifacts (AI-fluid):** proposed cards in Brief / Shoot / Cut / Delivery; accept writes the target record, reject writes nothing | `components/assist/*`, `app/api/assist/*`, `assist_artifacts` | L17 + one real finished round (row 6) | provider keys (existing gate) | El Paso QC-vs-brief card accepted → `qc_checks` entry; a rejected card leaves the record unchanged | no card on any door; the model cannot send, spend, approve, or lock | spine #14 (CVP half) |
| L20 | **WEFTEC replay:** WEFTEC job on the Schneider account from disk after the event; many lineages, days, and deliverables through tus; fix what breaks | data + fixes only | L19 (L18 minimum) | — | master home ranks WEFTEC by due; Delivery list usable on phone at event volume; Madeline sees both jobs | El Paso records unchanged; no new account or door; nothing sent | §4 |

### 6b Order calls to settle in the forge

| Call | This seat | Peer position | Reason |
|---|---|---|---|
| Shell before seat fills | L11 comes before L13–L18 | spine #10 Lands the nav at the master home, after #8 | Every seat Land needs a place to hang. Without the shell, each Land invents placement (the PR #25 failure). |
| Cut before Brief | L14 before L15 | not ordered in peers | El Paso Cut is already live (F1), and row 6 finishes there; the client value is there first |
| Kill right after the shell | L12 | kill at end or unspecified | Removes demo noise before seats are proved against real records |
| Staff on a door | read-only "View as" | not stated | Bailey sees exactly the client view with no cross-write risk |
| Google sign-in on doors | off | not stated | No wildcard OAuth redirect; the one quiet Sign in path is locked |
| WEFTEC | paper now, replay after the event | HOLD (spines) | K7 asks for a pressure test, not a live event build |

---

## 7 Kill + don't-break

### 7a Kill

| Kill | Where | Lock / reason | Replaced by | Answer after kill | Land |
|---|---|---|---|---|---|
| Overview dashboard | `app/(dashboard)/page.tsx` | K5 Login → Projects | Projects | 308 → `/projects` | L12 |
| Opportunities | `app/(dashboard)/opportunities` | CCO OS owns commercial | CCO OS | 404 | L12 |
| Request center (P27, demo) | `app/(dashboard)/requests`, `app/(client)/portal/requests` | demo-only, simulated dispatch | open a brief lineage | 404 | L12 |
| Client portal (P23, demo) | `app/(client)/portal` | a second client shell | account door | 308 → `/projects` | L12 |
| Field | `app/(dashboard)/field` | K2 no crew | Shoot seat (read-only) | 404 | L12 |
| Activity page | `app/(dashboard)/activity` | not a seat | Audit log in the master drawer | 308 → audit log | L12 |
| Reports (P28, demo) | `app/(dashboard)/reports` | seeded browser data | DERIVED status on Projects | 404 | L12 |
| Reviews list | `app/(dashboard)/reviews` | folded into Cut | Cut seat | 308 → `/projects?seat=cut` | L12 |
| Whiteboard (P25, demo) | `app/(dashboard)/projects/[id]/whiteboard` | not a seat | — | 404 | L12 |
| Floating Copilot (P14, demo) | `components/copilot/*` mount | AI lives as artifact cards, not a chat drawer | L19 cards | unmounted | L12 |
| Demo workspace tabs (P24) | `ProjectWorkspaceTabs` | seats replace tabs | seats | unmounted | L12 |
| Crew UI of any kind | any | K2 | none | — (table `crew_members` untouched) | L12 |
| Wrong Schneider seed | `lib/demo/record-seed.ts` "Schneider National / Logistics"; `lib/demo/workspace.ts` "Physical Edge — El Paso" | misnames the real account and job | real record | seed renamed or removed | L12 |
| Delivery wizard / fixed step ritual | nothing to remove | K3 | assist cards + lock | never built | — |
| "Co-Production Pro" / "Co-Deliver" labels on doors | UI copy | naming debt | Co-VideoPro + account mark | — | L11 |

### 7b Don't-break

| Guard | Checked in |
|---|---|
| Rows 1–6 scope and order: PR #36 is the only tap-comment Land; PR #25 frozen until row 6; PR #27 only if a regression appears | every Land |
| Live tip `46a256f2`: player, mobile overlay ~6%, sapphire logo | every CVP Land |
| Quiet auth door (`c9804e1`, `5da6aed`), one Sign in path | L8, L10, L11 |
| `compress:false` | every Land |
| Guest film-first; anonymous guest **and** signed-in client paint the film | L8, L10, L11, L14 |
| Already-sent `co-videopro.com/review/{token}` links serve forever | L8 |
| `/api/upload/tus` is the only catalog writer; legacy writers stay `410 Gone` | L17, L20 |
| Recipient-bound admission limits unchanged | L14 |
| Version-bound approval rounds; exact-version notes | L14, L15 |
| Locked delivery immutability; delivered requires lock | L17 |
| CCO OS commercial authority; CVP never mutates commercial fields | L17 |
| CSP / `frame-ancestors 'none'`; demo gate stays server-only | L8 |
| Host-only auth cookies | L8, L10 |
| Nothing sent without Bailey's yes | every Land |
| Migration and DNS only at G1 / G2 | L7, G1, G2, L10 |
| ACS M4 train untouched | every Land |
| No nav redraw: the Fable/Grok drawing is the spec | L11 |

---

## 8 Out of scope

| Item | Why | Lives in |
|---|---|---|
| ACS rows (roster, VA-106, close-out, booking) | separate train | ACS spine |
| Crew product, crew states, van app | K2 | never |
| Money on the job (proposal / invoice UI) | CCO OS authority; gated on "Bailey says bill" | spine #13 |
| Outbound sends: invite mail, notification mail, CS bot or drafts | no-send rule | HOLD |
| Running WEFTEC in-product during the event | no Land races the event | L20 replay |
| Vanity domains (e.g. a client-owned host), SSO/SAML, Google on doors | wildcard only; one Sign in path | later contract |
| Per-account billing, plans, metering | not a lock | — |
| Wipster archive migration | HOLD | spine HOLD |
| Sandcastles scripting, drawing suite, NLE / transcript editor | HOLD | spine HOLD |
| Reopening CCNAS, scan policy, or approval setup | no live regression | — |
| Nav redesign; overlay / logo / auth redo | PASS held | — |
| Other agencies running their own masters | the master is Content Co-op only | — |
| Native mobile app | the phone web surface is the product | — |
| Auto-parsing disk documents into brief or shoot records | the Master enters records; media enters only via tus | possible L19 card later |
