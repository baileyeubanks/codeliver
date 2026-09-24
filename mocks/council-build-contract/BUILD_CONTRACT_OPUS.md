# BUILD CONTRACT — seat Opus 5.5 (one-shot, rev 2 — consensus folded, 2026-09-24)

| Field | Value |
|---|---|
| Status | Final Opus contract. Consensus with Fable ([#38](https://github.com/baileyeubanks/codeliver/pull/38)) and Grok ([#37](https://github.com/baileyeubanks/codeliver/pull/37)) is adopted where it is obvious (§0). Remaining differences sit in §6b for the forge. Not a Land. |
| Governs | CVP Lands **after** spine rows 1–6 close. Rows 1–6 are not reopened, re-ordered, or stalled. |
| Bailey | GO full speed 2026-09-23; "do whatever consensus is obvious, no re-ask." Zero questions. Gates G1 (migration apply) and G2 (DNS) are named where they fall. |
| Inputs | Bailey locks (below) · spine rev 5.1 / rev 4 / Grok draft · nav mocks [#30](https://github.com/baileyeubanks/codeliver/pull/30) / [#31](https://github.com/baileyeubanks/codeliver/pull/31) / [#32](https://github.com/baileyeubanks/codeliver/pull/32) · peer contracts #37, #38 · repo `main` @ `5da6aed` |
| Disk | `CCO/clients/schneider-electric/2026-03-13_el-paso-customer-story` and `.../2026-09-25_weftec` on the CCO Mac, the root `scripts/schneider-preview.mjs` already trusts. This seat did not read them. Fill rows map **folder classes**, never invented contents. |
| Legend | **EXISTS** = in a named migration or file · **NEW** = new column or function, applied only at G1 · **DERIVED** = computed, never typed · **7a…15** = spine-grid Land numbers (§6) |

| Lock | Text | Enforced by |
|---|---|---|
| K1 | Client door `{client}.co-videopro.com` plus a Content Co-op Master over many accounts | §2a, Land 7 |
| K2 | No crew product, crew states, or van app | §7a |
| K3 | Delivery is AI-fluid: the record is fixed, the stage is swappable, no sacred wizard | §1c, Land 14 |
| K4 | Film route has no nav rail | §2b, Lands 10a, 12 |
| K5 | Login → Projects | §2b, Land 10a |
| K6 | Seats: Projects · Brief · Shoot · Cut · Delivery, plus a Library drawer | §2b, Lands 10a–10f |
| K7 | Golden path is El Paso Water × Schneider; WEFTEC is the event pressure test | §3, §4, Lands 8, 15 |
| K8 | Keep the Fable/Grok nav drawing; no redraw | Land 10a, §7b |

## 0 Consensus folded (adopt before contest)

| # | Consensus | Held by | Change in this rev |
|---|---|---|---|
| C1 | Lands use the spine rev 4 grid 7–15; ACS 9 and 11 keep their slots, unopened | Fable + Grok | §6 renumbered. The finer PR splits of the Opus plan become sub-Lands (7a–7d, 8a–8b, 10a–10g). |
| C2 | Order: door (7) → El Paso fill + derived status (8) → master home + nav shell (10) → version switch (12) → money shown (13) → AI-fluid Delivery drafts (14) → WEFTEC (15) | Fable + Grok | Adopted. Seat surfaces ride row 10, right after the shell. |
| C3 | Money is **shown** read-only on the master job from the CCO handoff fields, gated on "Bailey says bill" | Fable + Grok | Moved from out of scope to Land 13 |
| C4 | AI-fluid Delivery = exactly two named drafts: **QC vs approved brief** and **chase list of open comments**; accept or ignore; no chatbot | Fable + Grok | The `assist_artifacts` table is dropped. Accept writes the existing `deliverables.qc_checks`; ignore writes nothing. |
| C5 | Client Shoot view is progress only (dates, wrapped days, coverage done); no call sheets, crew, or rates | Fable + Grok | §2b client Shoot narrowed |
| C6 | Library = the tenant's assets (footage, b-roll, stills, finals) keyed by project, not only locked finals | Fable + Grok | §2b Library widened |
| C7 | Disk stays source of truth: no second library, no pointer faked as playable | Fable + Grok | Intent adopted. Mechanism corrected in §6b (`nas_path` is the tus commit key). |
| C8 | Jennifer = **shoot-only / footage-only job shape**: Cut dormant, Delivery holds one footage-package handoff | Fable (Bailey's fixed input) + Opus "shoot-only" | §5 rewritten. The seat-grant column `project_members.seats` is dropped. |
| C9 | Madeline = year-long engagement: footage accrues before deliverables; late testimonials land as Vn+1; her sheet columns are **labels** on the derived outcome | Fable + Grok + spine #5 | §5 rewritten |
| C10 | Open brief = a brief on the **same job object** at development, with nothing downstream fabricated | Fable + Opus | §5 row |
| C11 | Demo title "Physical Edge — El Paso" never becomes the live job name | all three | §7a |
| C12 | WEFTEC: same door, same seats, no new table, seat, or door; empty classes stay honest-empty; lanes are Shoot filters | Fable + Grok | §4 |
| C13 | Kill: under-film deck, rail on the film, second player, chatbot drawer, hand-typed status, widget-dashboard home, WEFTEC chrome, PR #25 as-is, PR #27 ahead of #36, demo-proposal promotion, `crew_members` as a surface | Fable + Grok | §7a merged |
| C14 | Don't-break: ACS tip `c58816e4` (Latch → Clip), Wipster hosting stays, generic door until per-client doors Land | Fable + Grok | §7b merged |

---

## 1 Record contract

### 1a Objects

| Object | Seat | Table today | State rule | Tenancy key | Writer | Client sees | Change |
|---|---|---|---|---|---|---|---|
| Master workspace | — | `co_production.teams` (Content Co-op) + `team_members` — EXISTS `20260715093300` | — | `projects.team_id` | Bailey (staff) | never | None. Every job's `team_id` is the Content Co-op team. |
| Client account | Projects | `co_production.organizations` — EXISTS `20260716120000` | `door_status` off → preview → live | `organizations.id` | Master only | own name + mark | **NEW** `slug` (`^[a-z0-9-]{2,40}$`, unique) · `brand jsonb` · `disk_key` (e.g. `schneider-electric`) · `door_status` |
| Account membership | — | none | active while `expires_at` is null or in the future | `organization_id` | Master | own row | **NEW** `co_production.organization_members(organization_id, user_id, role client_admin/client_member, expires_at, invited_by)` |
| Job grant | — | `co_production.project_members` (`role`, `expires_at`) — EXISTS | as today | `project_id` | Master | own row | none |
| Job | Projects | `co_production.projects` (`stage` via `lib/covideopro/transitions.ts`, `organization_id`, `cco_estimate_*`) — EXISTS | stage moves by validator only | `organization_id` (non-null for door reads) | Master | name, DERIVED seat word | **NEW** `disk_key` (e.g. `2026-03-13_el-paso-customer-story`, unique per account) |
| Brief | Brief | `briefs` + `brief_versions` — EXISTS | draft → in_review → approved → superseded | `project_id` | Master versions; client approves | in_review / approved | **NEW** `lineage_key text DEFAULT 'main'`, `title`; unique becomes `(project_id, lineage_key, version)` (contested, §6b) |
| Shoot day | Shoot | `production_days` — EXISTS `20260716140000` | scheduled → in_progress → wrapped / cancelled | `project_id` | Master | date + DERIVED progress | none |
| Location | Shoot | `locations` — EXISTS | agreement none → drafted → sent → signed | `project_id` | Master | never | none |
| Shot | Shoot | `shots` — EXISTS `20260717120000` | planned → covered / dropped | `project_id` | Master | coverage count only | none |
| Release | Shoot | `releases` — EXISTS | unsent → sent → signed | `project_id` | Master | never | none |
| Asset | Cut, Library | `assets` (`nas_path` = tus commit storage key, `20260726084644`) — EXISTS | file identity | `project_id` | `/api/upload/tus` only | tenant assets | **NEW** `source_relative_path text` (disk provenance from upload metadata, set by the same commit; read-only) |
| Version | Cut | `versions` (+ `previous_version_id`) — EXISTS | exact version; one current | asset | tus only | versions shared to them | none |
| Sequence (edit project) | Cut | `sequences` — EXISTS `20260716120000` | disk pointer; never uploaded | `project_id` | Master | never | none |
| Share | Cut | `review_invites` + `review_view_admissions` — EXISTS | Review / Approve / Preview **stored** (row 6) | asset → project → org | Master | the film | Owned by row 6; nothing added here |
| Note | Cut | `comments` (version-bound, 0–100 pins) — EXISTS | tap writes time + pin on that version | version | guest, client, Master | shared thread | none |
| Review outcome | Cut | approval rounds, version-bound — EXISTS `20260922073000` | "Finish reviewing" is the only writer: finished / approved / changes requested | version | client or guest per share | own step | none |
| Deliverable | Delivery | `deliverables` (+ `qc_checks`, `locked_at`, `locked_by`, `approval_id`) — EXISTS | specced → encoding → qc → ready → delivered (lock only) · expired | `project_id` | Master | name, due, DERIVED state | **NEW** `due_at timestamptz` · `brief_id` |
| Delivered set | Delivery | `deliverable_items` (`sha256`, immutable once locked) — EXISTS `20260812120000` | written by the lock only | deliverable | lock command | download list | none |
| Commercial ref | Master job | `projects.cco_estimate_id`, `cco_estimate_version_id`, `commercial_total_cents`, `commercial_ref` — EXISTS `20260812000000` | CCO OS writes; CVP never mutates | `project_id` | CCO OS | never | none |
| Crew | — | `crew_members` — EXISTS | — | — | — | — | No product surface (K2) |
| Door resolution | — | none | brand only, and only for `preview` / `live` | — | — | brand | **NEW** RPC `co_production.resolve_door(slug)` (SECURITY DEFINER) |
| Org role check | — | `has_project_role`, `has_team_role` — EXISTS | — | — | — | — | **NEW** `co_production_private.has_org_role(org_id, rank)`; `projects_select` admits it |

### 1b Derived values (never typed)

| Value | Computed from | Shown on | Replaces |
|---|---|---|---|
| Seat word per job | First match wins: brief `in_review` → Brief · day `scheduled` / `in_progress` → Shoot · open round → Cut · deliverable not locked → Delivery · else Done | Projects rows | Showing typed `stage` on doors (stage stays the master lifecycle) |
| Deliverable status | versions + review outcome + `locked_at` | Cut strip, Delivery, master home | Typed status cells; Madeline's columns become labels on this value (row 5 map) |
| Waiting on whom | pending round step (client) · `changes_requested` outcome (Content Co-op) · brief `in_review` (client approver) · past `due_at` (Content Co-op) | Master home; client "Needs you" | the Excel |
| Shoot progress (client) | `production_days.status` + `shots` covered / planned | client Shoot | call-sheet detail |
| Dormant seat | seat with no records for this job (e.g. Cut on a footage-only job) | nav shows the seat dimmed | a fake "in review" |

### 1c Invariants

| Invariant | Held by |
|---|---|
| Nothing is sent without Bailey's yes; invites return a copyable link | Land 7c; `notification_outbox` never drained by these Lands |
| `delivered` only through the lock | EXISTS `deliverables_delivered_requires_lock` |
| Lock from `approved` only, except a footage-package handoff, which is an explicit Master lock with no review round | Land 14 |
| One catalog writer (`/api/upload/tus`); legacy writers stay `410 Gone`; no disk import writes `assets` directly | Lands 8a, 15 |
| Notes, outcomes, deliveries bind to an exact version | EXISTS |
| Every door read is filtered by the door org **and** RLS membership | §2a |
| Clients never see money, drafts, other accounts, the master home, locations, releases, or sequences | §2b |
| Delivery "how" lives in `spec` + `qc_checks` + the two drafts, never in a step machine | K3 |

---

## 2 Two-side surface map

### 2a Tenancy mechanism

| Concern | Mechanism | Where | Fails closed as |
|---|---|---|---|
| Host → door | `proxy.ts` matches `^(?<slug>[a-z0-9-]{2,40})\.co-videopro\.com$`. Reserved labels are rejected: `www admin app api client review master mail status staging dev cdn assets auth`. | `lib/auth/host-surface.ts` (new `resolveDoorSlug`), `proxy.ts` | unknown, reserved, or `door_status=off` → one generic 404 body |
| Slug → account | `resolve_door(slug)` server-side, cached 60 s per slug, brand fields only | NEW RPC | backend down → structured 503; never falls through to another door |
| Surfaces | Door host = `client` surface bound to **one** org. `co-videopro.com` + `admin.contentco-op.com` = master. `client.contentco-op.com` = generic door, no org, until per-client doors Land. | `host-surface.ts`, `surface-origins.ts` | unlisted host → existing rejection |
| Request binding | Proxy strips any inbound `x-cvp-door-org` and stamps it after resolution (the demo-capability header pattern). Client API handlers on a door require it and filter `organization_id = door org`. | `proxy.ts`, `lib/api/*` | missing on a door host → 403 `DOOR_UNBOUND` |
| Session scope | Supabase SSR cookies stay **host-only** (no `Domain=`); a door login is never sent to another door or the apex. Same quiet single Sign in on every door; Google is off on doors (no wildcard OAuth redirect). Callback and reset links are minted on the requesting door host. | Supabase SSR config, `app/api/auth/*` | a `Domain=.co-videopro.com` cookie fails the test |
| Membership gate | After the session: `has_org_role(door org)`, or an active `project_members` row on a job in the door org. Otherwise sign out of that host and show "No access on this door". | NEW `has_org_role` | no list rendered |
| RLS | `projects_select` also admits `has_org_role(organization_id, rank)`. The project-grant path is unchanged. | migration at G1 | 0 rows |
| Master sees | Staff (`content_coop_role=staff`) + Content Co-op `team_members` → every job with `team_id` = Content Co-op, all accounts; account filter is view-only | EXISTS `has_team_role` | no team row → empty list |
| Staff on a door | Read-only **"View as {account}"**: client projection + banner | `roleCanAccessSurface` | any write → 403 `PREVIEW_READ_ONLY` |
| Client on the master host | Redirect to their door (one account) or the generic-door chooser (several) | EXISTS surface redirect | `SURFACE_FORBIDDEN` |
| Person in two accounts | One session per door; the generic door lists their doors; no client surface lists two accounts together | chooser | — |
| Guest links | Already-sent `co-videopro.com/review/{token}` links serve forever. New links mint on `{slug}.co-videopro.com/review/{token}`. A token whose job org ≠ door org → 404 on that door. | `getReviewSiteUrl` (door-aware), `app/review/[token]` | 404 |
| Client A ≠ B | Three independent checks: host-only cookie, door-org request binding, RLS membership | Lands 7a, 7b, 7d negatives | — |
| DNS / TLS | Wildcard `*.co-videopro.com` on the existing Cloudflare tunnel; Supabase redirect allowlist `https://*.co-videopro.com/**` | `infra/runtime/cloudflare` | Bailey gate **G2** |
| Headers | CSP and `frame-ancestors 'none'` unchanged on every host | `next.config.ts` | — |
| Brand | Account mark + name beside the sapphire CVP lockup (no redraw); no mark → name only | `organizations.brand` | — |

### 2b Seats × sides

| Surface | Route | Side | Scope | Reads | Writes | Phone | Desktop |
|---|---|---|---|---|---|---|---|
| Login | `/login` | door | one account | `resolve_door` brand | session | quiet door, account mark, Login → Projects | same |
| Login | `/login` | master | all | — | session | quiet door, Login → Projects | same |
| Projects | `/projects` | door | one account | this account's jobs; DERIVED seat word; needs-you | none (opens a job) | bottom pipeline, Projects active; film-first cards; seat word in words | thin left |
| Projects ("waiting on whom" home) | `/projects` | master | all accounts | all team jobs grouped by account; DERIVED waiting on whom; due order | account filter (view only); create job | same list, operator scope | thin left + account filter |
| Seat tap on home | `/projects?seat=` | both | as above | same | none | Brief / Shoot / Cut / Delivery filter jobs by seat word | same |
| Brief | `/projects/[id]/brief` | door | one job | lineages; in_review / approved versions | approve a version (deliberate confirm, ACS quiet-confirm idiom) | card per lineage | two-pane |
| Brief | same | master | one job | all versions | new version; new lineage; mark in_review (no mail) | same | same |
| Shoot | `/projects/[id]/shoot` | door | one job | DERIVED progress: dates, wrapped days, coverage done | none | progress list | same |
| Shoot | same | master | one job | days, locations, shots, releases; **lanes = filters** by day / location | day and shot status, release state | lane filter chips inside the seat, never new nav | same |
| Cut | `/projects/[id]/cut` | door | one job | versions shared to the viewer; outcome; deliverable strip | open the film | version list + strip | same |
| Cut | same | master | one job | all assets, versions, rounds, shares, sequences (pointer rows) | upload (tus); share (row 6 modes); start a round | same | same |
| Film | `/projects/[id]/assets/[assetId]`, `/review/[token]` | both + guest | one exact version | version, notes, outcome | tap note (row 1); Finish reviewing (row 6); version switch in place (Land 12) | **no nav rail**; film first; back chevron to Cut | **no nav rail**; review rail as in PR #36 |
| Delivery | `/projects/[id]/delivery` | door | one job | deliverables: name, due, DERIVED state; locked items | download locked items | list by due | list + pane |
| Delivery | same | master | one job | + `spec`, `qc_checks`, the two drafts, lock evidence | set spec; accept / ignore drafts; **lock** (writes `deliverable_items` + `sha256`) | same | same |
| Money (read-only) | master job header | master | one job | `commercial_total_cents`, `commercial_ref` | none | one line on the job | same |
| Library (drawer) | `/library` | door | one account | account assets keyed by project (footage, b-roll, stills, finals) | download per share permission; finals only when locked | drawer item | drawer item |
| Library (drawer) | same | master | all accounts | all assets, account + project filters, rights badges | favorites | same | same |
| Drawer | — | door | — | — | — | Library · Members (client_admin, read-only) · Notifications (in-app) · Sign out | same |
| Drawer | — | master | — | — | — | Library · Accounts · Team · Settings · Audit log · Archive · Trash · Sign out | same |
| Accounts | `/settings/accounts` | master | all | organizations, members | account, slug, brand, `door_status`; add member with expiry; invite = copyable link | drawer → Accounts | settings pane |
| Dormant seat | any seat route | both | — | — | — | seat shows **dimmed, not focusable**, so the bar stays the drawing | same |

---

## 3 El Paso seat fill (golden path)

| Anchor | Value |
|---|---|
| Account | Schneider Electric · `slug=schneider` · `disk_key=schneider-electric` |
| Job | El Paso Water customer story · `disk_key=2026-03-13_el-paso-customer-story` |
| Live asset | `1ec225a9-e405-453a-9a53-d9dfa7e063a3`, version `bb081d37-ef8f-450f-8006-307f342d148e` (PR #27; client paint proved by F1 on `46a256f2`) |
| Fill rule | Link the existing live job; never recreate it. Playable media and finals enter only through tus, with `source_relative_path` recording the disk origin. Documents become records entered by the Master. Edit project files are pointer rows, never uploaded. Nothing is marked approved or delivered by the fill. Nothing is sent to Schneider. |

| Folder class (disk) | Seat | Record target | Client door sees | Master sees | If the class is empty | Land |
|---|---|---|---|---|---|---|
| Admin / SOW / contracts | master only | `commercial_ref` frozen by CCO OS (not by the fill) | never | commercial line (Land 13) | nothing shown | 13 |
| Brief / messaging / interview questions | Brief | `briefs` lineage `main` v1..n | approved version | all versions | "No brief on file" | 8a, 10c |
| Pre-pro: schedule, shot list, locations, releases | Shoot | `production_days` from 2026-03-13 · `shots` · `locations` · `releases` | progress: days wrapped, coverage done | full, with release state | day with date only | 8a, 10d |
| Footage: interviews, b-roll, audio | Library (Shoot provenance) | `assets` via tus, `source_relative_path` | account footage in Library | same + filters | empty Library section | 8a, 10f |
| Transcripts | Cut (support) | transcript on its exact asset | never | on the asset | none | 8a |
| Edit project files (Premiere / AE) | Cut | `sequences` pointer row, never uploaded | never | name + version, not playable | none | 8a |
| Review exports v1…vN | Cut | `versions` V1…Vn on the live asset chain; rounds version-bound | film, notes, Finish | all versions + chase list | Cut dormant | 8a, 10b |
| Finals: master, cutdowns, captions | Delivery | `deliverables` (+ `brief_id`) → lock → `deliverable_items` + `sha256` | DERIVED state; locked downloads | spec, QC, lock | stays `specced` | 8a, 10e, 14 |
| Stills / BTS | Library | image `assets` via tus | Library | Library | empty | 8a |
| Graphics / music / licenses | Library | `assets` + rights note | Library, licensed only | rights badge; unlicensed never marked cleared | empty | 8a |

---

## 4 WEFTEC delta (event pressure test)

| Anchor | Value |
|---|---|
| Job | `disk_key=2026-09-25_weftec`, a **second Schneider row**, same door, same seats |
| New | Only `deliverables.due_at` (a column already in Land 7a). No new table, seat, door, or chrome. |
| Timing | Paper pressure test now; the live fill comes from disk after the event (Land 15). No Land races the event date. |

| Dimension | El Paso (story) | WEFTEC (event) | Record delta | Surface delta | Empty OK? | Covered by |
|---|---|---|---|---|---|---|
| Brief | full creative brief, versions | one-page coverage plan as Brief v1; more lineages only if briefed | none (`lineage_key` if used) | none | — | 10c |
| Shoot | one site, days + shot list + releases | several days / halls; **lanes = filters** (e.g. booth demos · sessions · interviews · floor b-roll); releases per speaker | more rows, same tables | lane filter chips inside Shoot | — | 10d |
| Cut | v1…vN review cuts | near-empty until after the event; same-day selects only | none | none | **yes** | 10b |
| Delivery | master + cutdowns | same-week social cutdowns; a master may never exist | `due_at` drives order | due chip + overdue-first sort | **yes** | 10e, 14 |
| Library | footage + stills + music | bulk event footage lands here first, deliverable-less | none | project filter | — | 10f |
| Projects card | seat word moves post → delivery | Shoot on event days, honest afterwards | none | due-ranked on master home | — | 10a |
| Upload volume | few large files | many clips the same day | none (tus) | none | — | CCNAS / scan **not** reopened (§8) |
| Tenancy | Schneider door | same door | none | none | — | 7d |
| Money | CCO OS | CCO OS | none | none | — | 13 |

---

## 5 Variability matrix

| Case | What varies | Seat behavior | Record rule | Access mechanism | Proof | Closed by |
|---|---|---|---|---|---|---|
| **Madeline: year-long** | footage accrues for months before any deliverable | Library takes deliverable-less assets; Shoot days accrue; Cut dormant until a cut exists | no fake status: a dormant Cut shows nothing, not "in review" | account membership with `expires_at` = engagement end, so new jobs appear with no new grant | card reads Shoot with zero deliverables and lies about nothing | 8a, 10a |
| **Madeline: late testimonials** | new footage joins mid-Cut | next cut is Vn+1 on the same asset chain | prior outcome stays bound to V(n); never silently reset | same | V(n) outcome intact after V(n+1) exists | 12 |
| **Madeline: her sheet** | column names, who edits, what "done" means | columns render as labels on the DERIVED deliverable status | no hand-edit path; with no sheet the outcome still shows | — | strip matches the record; no retyping | 8b |
| **Jennifer: shoot-only** | scope is capture + handoff, no edit | Shoot active; Cut dormant (dimmed); Delivery holds one **footage-package** deliverable | delivered = Master lock of a footage set (`deliverable_items` + `sha256`), not an edited film; if a sheet exists, its columns are labels (Grok) | account membership or job grant | job reads "footage delivered" with a receipt; no phantom cuts | 8a, 14 |
| **Open brief on the same job** | brief exists; no dates, no deliverables | Brief seat holds it; card reads Brief; other seats dormant | no separate inquiry / opportunity object; nothing downstream fabricated; further briefs open as lineages on the same job | as the account | zero versions, zero deliverables, zero invented status | 10c |
| Anonymous guest | one exact version | film only | recipient-bound admission | review token | film paints (rows 1, 6) | existing |
| One person in two accounts | two memberships | one account per door | — | membership rows | the other account never renders on this door | 7b |
| Client B (negative test) | own account | own door | — | own membership | no Schneider row anywhere | 7a, 7b, 7d |
| Expired membership | `expires_at` in the past | none | — | none | "No access on this door" | 7c |
| Staff on a door | preview | client projection, read-only | — | staff role | writes 403 | 7b |
| Delivery via AI draft or by hand | the how | same Delivery seat | same record; drafts optional | — | identical client view | 14 |

---

## 6 Ordered Land list after rows 1–6 (spine grid)

| # | Land (one PR) | Spine | May touch | Depends on | Gate | Live proof (M2 train) | Latch negative (must hold) |
|---|---|---|---|---|---|---|---|
| 1–6 | **As locked.** PR #36 tap-comment · roster proof · nav pick · VA-106 · Madeline harvest · share-mode port of PR #25 | — | per spine | — | — | per spine | nothing below starts before all six close |
| 7a | **Door record migration (source only, unapplied):** §1a NEW columns, `organization_members`, `has_org_role`, `resolve_door`, `projects_select` extension | CVP-06 | `supabase/migrations/<ts>_client_doors_record.sql`, `lib/covideopro/record.ts`, tenancy tests | rows 1–6 | source only | dry-run receipt on scratch Postgres + RLS transcript | client A JWT selecting a B job → 0 rows; staff sees both; live DB untouched |
| G1 | **Bailey applies 7a on live** | — | — | 7a | **G1** | apply receipt | pre/post row counts identical |
| 7b | **Door resolver** behind `CVP_CLIENT_DOORS` (off by default): Host → slug → org, header stamping, reserved labels, host-only cookies, door-minted auth links, staff preview | CVP-06 | `proxy.ts`, `lib/auth/host-surface.ts`, `lib/surface-origins.ts`, `app/api/auth/*`, `app/review/[token]` | G1 | — | Host-header matrix on `next start` for `schneider.localhost` + `clientb.localhost`: brand in the HTML, unknown slug 404, cookie without `Domain` | flag off → identical routing on apex, generic door, admin; forged header stripped; A cookie on B host → login; apex review link paints for guest **and** signed-in client |
| 7c | **Master Accounts:** slug, brand, `door_status`, members with expiry; invite = copyable link | CVP-06 | `app/(dashboard)/settings` (accounts), `app/api/organizations/*`, `app/api/teams/invites` (no-send path) | 7b | none | phone recording: account + member created; rows hold after refresh | nothing sent (`notification_outbox` unchanged); client_admin cannot add members |
| G2 | **Wildcard DNS + Supabase redirect allowlist** | — | — | 7c | **G2** | DNS/TLS receipt | apex, admin, generic door still serve |
| 7d | **Schneider door live** (`door_status=live`) | CVP-06 | config + smoke test | 7c, G2 | — | phone at `schneider.co-videopro.com`: mark → Sign in → Projects with El Paso Water, nothing else | client B door shows 0 Schneider rows; A session absent on B host; legacy review link paints; overlay / logo / auth PASS; `compress:false`; generic door still up |
| 8a | **El Paso fill** per §3: link the live job; tus for media with `source_relative_path`; records by the Master; sequences as pointer rows | CVP-03 | fill runbook + tus metadata field; no new writer | 7d | — | every §3 class visible in its record on live (via the existing cockpit until 10b–10f) | fill marks nothing approved or delivered; no second catalog writer; disk untouched; no send |
| 8b | **Derived status:** `lib/covideopro/status.ts` (seat word, deliverable status, waiting on whom); Madeline columns as labels | CVP-03 | `lib/covideopro/status.ts`, `app/api/projects/*` read path, strip in the cockpit | 8a, row 5 (labels only; not blocking) | — | El Paso strip shows the outcome from Finish; matches a record query | no hand-edit path anywhere; with no sheet the outcome still shows, no invented column |
| 9 | ACS-04 close-out — sibling train, slot held | ACS-04 | — | — | — | unchanged | not stalled, not opened here |
| 10a | **Nav shell + master "waiting on whom" home + client Projects:** copy the picked mock (no redraw); phone bottom Projects · Brief · Shoot · Cut · Delivery + one drawer; desktop thin left; film hides the rail; dormant seats dimmed | CVP-04 | `components/navigation/*`, `app/(dashboard)/layout.tsx`, `app/(dashboard)/projects/page.tsx` | row 3 pick, 7d, 8b | — | master phone: El Paso shows who it waits on; Schneider door phone: Schneider only; desktop thin left; film with no rail | no second nav; no left+bottom on phone; no crew item; client doors never render the master home; `46a256f2` chrome unchanged |
| 10b | **Cut seat** on the shell (versions, outcome, strip, shares from row 6) | CVP-04 | Cut route + `ProjectCockpit*` Cut section | 10a, row 6 | — | El Paso Cut on the door phone: open `bb081d37…`, tap a note, Finish → outcome on the version; strip updates | guest + signed-in client paint the film; admission limits unchanged; PR #36 path unchanged |
| 10c | **Brief seat** (lineages, versions, deliberate approve) | CVP-04 | brief route, `app/api/projects/[id]/briefs` | 10a | — | El Paso approved brief on both sides; an approve holds after refresh | approving creates no job; nothing sent |
| 10d | **Shoot seat** (client progress; master days / shots / releases; lanes as filters) | CVP-04 | shoot route, read of production entities | 10a | — | El Paso days read wrapped; coverage count on the door | no crew states, call sheets, or rates on the door; no page / SMS |
| 10e | **Delivery seat** (due, DERIVED state, lock, locked downloads) | CVP-04 | delivery route, `app/api/projects/[id]/deliverables` (EXISTS), lock route | 10b | — | El Paso hero story locked from its approved version; door downloads it; sha256 matches | delivered without lock impossible; unlocked items not downloadable; CCO fields untouched |
| 10f | **Library drawer** (account assets by project; master cross-account) | CVP-04 | `app/(dashboard)/library`, `lib/assets/*` | 10a | — | door Library shows only Schneider assets, filtered by El Paso | a client-B title search on the Schneider door → 0; demo library not mounted in production |
| 10g | **Kill Land** per §7a | CVP-04 | routes in §7a + their tests | 10a | — | each killed route answers per §7a | door and master import nothing killed; film / review untouched; suite green |
| 11 | ACS-03 job check — sibling train, slot held | ACS-03 | — | — | — | unchanged | not stalled, not opened here |
| 12 | **Version switch on the same film** (El Paso v1…vN; late testimonials land as Vn+1) | CVP-07 | player version switch only; binding EXISTS `20260922073000` | row 6, 8a | — | switch versions on the El Paso film; notes stay on their version; V(n) outcome intact after V(n+1) | no rail beside the film; overlay and sapphire mark unchanged |
| 13 | **Money shown on the master job** from CCO handoff fields | CVP-05 | master job header read of `commercial_total_cents` / `commercial_ref` | 8a, one finished round, **Bailey says bill** | Bailey says bill | El Paso on the master shows the frozen total | CVP never writes those columns; no invoice send; no finance seat; door never shows it |
| 14 | **AI-fluid Delivery drafts:** QC vs approved brief + chase list of open comments; accept writes `qc_checks`, ignore writes nothing; lock stays a Master act | CVP-08 | Delivery seat only; reads `briefs`, current version, open `comments` | row 6, 10e, one finished El Paso round | provider keys (existing gate) | each draft is a card on El Paso Delivery; accept adds a `qc_checks` entry; a real deliverable locks with a receipt | draft never sends, spends, approves, or locks; no chatbot; lock refused except from approved (or a footage-package handoff) |
| 15 | **WEFTEC pressure test:** second Schneider job from `…/2026-09-25_weftec` after the event, same door and seats | CVP-09 | data via tus + fixes found | 7d, 8, 10a–10f, 12, 14 proven on El Paso | — | door lists El Paso Water and WEFTEC; lanes filter; empty Cut / Delivery honest-empty; master home ranks by due | no new table, seat, door, or chrome; El Paso unchanged; nothing sent |

### 6b Still differs — for the forge

| Point | Opus (this contract) | Peer | Reason to prefer Opus |
|---|---|---|---|
| Disk pointer | Keep the peers' intent. Media goes through tus; disk origin lives in NEW `assets.source_relative_path`; edit files are `sequences` pointer rows. | `assets.nas_path` points at the disk folder (Fable, Grok) | `nas_path` is the tus commit's storage key and idempotency match (`20260726084644_atomic_upload_catalog_v1.sql:311`). Setting it by hand to a Mac path is a second catalog writer, which all three contracts forbid. |
| Door map | Columns on `organizations` | NEW `tenant_doors` table (Fable) | One fewer table; slug and brand are account facts |
| Many briefs on one job | NEW `briefs.lineage_key` | not stated | Today's `UNIQUE(project_id, version)` allows one lineage; a second open brief would otherwise need a new job |
| Tenancy detail | Host-only cookies, header binding, RLS, reserved labels, Google off on doors | not specified | K1 needs a mechanism, not a slogan |
| Master opening a job | Stays on the master; staff get a read-only "View as" on a door | the job opens on the client door (Grok) | Keeps writes on the master surface; no cross-host session |
| Client act in Delivery | Download locked items only | "Client: confirm" (Fable) | Only one seat proposed it; it adds a write with no named record |
| Sub-Land split | 7a–7d, 8a–8b, 10a–10g, one PR each | one PR per grid row | Keeps each PR provable against one negative |
| WEFTEC timing | Replay from disk after the event | not stated | Nothing races 2026-09-25 |

---

## 7 Kill + don't-break

### 7a Kill

| Kill | Where | Why | Replaced by | Answer after kill | Land |
|---|---|---|---|---|---|
| Crew product, van app, crew states; `crew_members` as a surface | any | K2 | none (table untouched) | — | never built |
| Rigid delivery ritual / wizard (fixed QC → encode → package gates) | nothing to remove | K3 | two drafts + lock | never built | — |
| Nav redraw or a third nav | — | K8 | picked mock | — | — |
| Pipeline rail on the film | — | K4 | back chevron | — | 10a |
| Permanent comment deck under the film | — | row 1 | tap composer | — | row 1 |
| Second player; chatbot drawer; floating Copilot (P14 demo) | `components/copilot/*` mount | C4 | Delivery drafts | unmounted | 10g |
| Hand-typed status anywhere | — | C9 | DERIVED status | — | 8b |
| Widget-dashboard home (Overview) | `app/(dashboard)/page.tsx` | K5 | Projects | 308 → `/projects` | 10g |
| Opportunities | `app/(dashboard)/opportunities` | CCO OS owns commercial | CCO OS | 404 | 10g |
| Request center (P27 demo) | `app/(dashboard)/requests`, `app/(client)/portal/requests` | demo, simulated dispatch | a brief on the job | 404 | 10g |
| Client portal (P23 demo) | `app/(client)/portal` | second client shell | account door | 308 → `/projects` | 10g |
| Field | `app/(dashboard)/field` | K2 | Shoot seat | 404 | 10g |
| Activity page | `app/(dashboard)/activity` | not a seat | Audit log in the master drawer | 308 → audit log | 10g |
| Reports (P28 demo) | `app/(dashboard)/reports` | seeded data | DERIVED status | 404 | 10g |
| Reviews list | `app/(dashboard)/reviews` | folded into Cut | Cut seat | 308 → `/projects?seat=cut` | 10g |
| Whiteboard (P25 demo) | `app/(dashboard)/projects/[id]/whiteboard` | not a seat | — | 404 | 10g |
| Demo workspace tabs (P24) | `ProjectWorkspaceTabs` | seats replace tabs | seats | unmounted | 10g |
| WEFTEC-specific chrome or seats | — | C12 | same seats | — | — |
| Demo "Physical Edge — El Paso" and "Schneider National / Logistics" seeds | `lib/demo/workspace.ts`, `lib/demo/record-seed.ts` | misname the real job and account | real record | renamed or removed | 10g |
| Demo-proposal promotion | — | two price authorities | CCO OS | never built | — |
| Landing PR #25 as-is; PR #27 ahead of #36 | — | spine | row 6 port; #27 regression-only | — | — |
| "Co-Production Pro" / "Co-Deliver" labels on doors | UI copy | naming debt | Co-VideoPro + account mark | — | 10a |

### 7b Don't-break

| Guard | Checked in |
|---|---|
| Rows 1–6 in flight and unreopened; PR #36 is the only tap-comment Land; PR #25 frozen until row 6; PR #27 regression-only | every Land |
| ACS tip `c58816e4`: Latch, then Clip; ACS M4 train untouched | every Land |
| Live tip `46a256f2`: player, ~6% overlay, sapphire logo | every CVP Land |
| Quiet auth door (`c9804e1`, `5da6aed`), one Sign in path | 7b, 7d, 10a |
| `compress:false` | every Land |
| Guest film-first; anonymous guest **and** signed-in client paint the film (F1) | 7b, 7d, 10a, 10b |
| Already-sent review links keep working | 7b |
| Generic door `client.contentco-op.com` until per-client doors Land | 7b, 7d |
| Wipster hosting stays | every Land |
| `/api/upload/tus` is the only catalog writer | 8a, 15 |
| Admission limits; version-bound approval; exact-version notes | 10b, 12 |
| Locked delivery immutability; delivered requires lock | 10e, 14 |
| CCO OS money authority: frozen totals, never mutated | 13 |
| CSP / `frame-ancestors 'none'`; demo gate server-only; host-only cookies | 7b |
| Bailey gates: migration apply (G1), DNS (G2), any send | 7a, G1, G2, 7d, every Land |
| No nav redraw | 10a |

---

## 8 Out of scope

| Out | Why |
|---|---|
| Rows 1–6 | already in flight or proof; this contract starts at 7 |
| Landing anything from this file | Blaze forges; Lands cite the forged master |
| ACS dispatch, close-out, booking (rows 9, 11) | sibling train |
| Caio's Continuity phone rail | field truth stays voice; no crew product |
| Invoice send, finance seat, new payment rails | CCO OS authority; Land 13 is read-only |
| Outbound sends: invite mail, notification mail, phone CS bot, outbound drafts | nothing sends itself |
| AI drafts beyond the two named Delivery drafts (brief drafts, shot-list drafts, chat) | C4 |
| Running WEFTEC in-product during the event | Land 15 replays after |
| Vanity domains, SSO / SAML, Google sign-in on doors | wildcard only; one Sign in path |
| Per-account billing, plans, metering | not a lock |
| Wipster hosting cutover or archive migration | Wipster stays |
| Sandcastles, drawing suite, transcript NLE | not a seat |
| Reopening CCNAS, scan policy, or approval setup | no live regression |
| Player, overlay, logo, auth redo | PASS on `46a256f2` |
| Amanda enrich | held |
| Other agencies running their own masters; native mobile app | the master is Content Co-op; the phone web surface is the product |
| A question back to Bailey | locks are closed |
