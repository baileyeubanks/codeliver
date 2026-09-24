# BUILD CONTRACT — seat Opus 5.5 · deep-tenancy / architecture input (rev 3, 2026-09-24)

| Field | Value |
|---|---|
| Role | **Architecture and tenancy input** to Fable's forge (Bailey doctrine 2026-09-24: Fable leads). Fable's `FORGED_MASTER_SPINE.md` ([#38](https://github.com/baileyeubanks/codeliver/pull/38)) governs order and rulings. This file specifies *how* its Land rows are built: subdomain → account, session scope, client A ≠ B, schema, projections, and failure modes. |
| Land numbers | Forge §C: **L7–L20**, G1, G2, Money (#13), ACS 9 / 11. Every row here keys to one of those. |
| Not | A Land, a second order, or a Bailey question. Rows 1–6 are untouched. |
| Gates | **G1** migration apply · **G2** wildcard DNS + Supabase redirect allowlist · any send · "Bailey says bill" |
| Repo base | `main` @ `5da6aed`. Every EXISTS cell names its migration or file. |
| Legend | **EXISTS** in repo · **NEW** applied only at G1 · **DERIVED** computed, never typed · **W1 / W2 / W3** = the three walls in §2a |

## 0 Alignment to the forge

| Forge ruling | Effect in this rev |
|---|---|
| A1 record shape = Opus (columns on `organizations`, no `tenant_doors`) | §1a and the §1d migration spec are the L7 schema |
| A12 Jennifer = Shoot-only seat grant (Opus) + footage-package record (Fable) | `project_members.seats` restored; footage-package lock rule in §1c |
| A13 Madeline = year grant (Opus) + no-fake-status record rules (Fable) | `organization_members` year grant; dormant-seat rule in §1b |
| A18 AI-fluid = Opus record shape, consensus kinds | `assist_artifacts` restored, limited to two kinds: `qc_vs_brief`, `chase_list` |
| A2 `disk_key` + `nas_path` together | Kept, with one build constraint: `nas_path` is written only by the tus commit (§6b N1) |
| A4 tenancy = Opus §2a | Deepened in §2c–§2i |
| A14 Land grain L7–L20 | §6 is a per-Land architecture annex, not an order |
| L16 "client-safe call sheet" | Specified as a structured projection, never `call_sheets.content` or `pdf_url` (§2i, §6b N3) |

---

## 1 Record contract

### 1a Objects

| Object | Seat | Table today | State rule | Tenancy key | Writer | Client sees | Change |
|---|---|---|---|---|---|---|---|
| Master workspace | — | `co_production.teams` (Content Co-op) + `team_members` — EXISTS `20260715093300` | — | `projects.team_id` | Bailey (staff) | never | none |
| Client account | Projects | `co_production.organizations` — EXISTS `20260716120000` | `door_status` off → preview → live | `organizations.id` | Master | name + mark | **NEW** `slug`, `brand`, `disk_key`, `door_status` |
| Account membership (long-running) | — | none | active while `expires_at` is null or in the future | `organization_id` | Master | own row | **NEW** `organization_members` |
| Job grant (scoped) | — | `project_members` (`role`, `expires_at`) — EXISTS | as today | `project_id` | Master | own row | **NEW** `seats text[]` |
| Job | Projects | `projects` (`stage` via `lib/covideopro/transitions.ts`, `organization_id`, `cco_estimate_*`) — EXISTS | stage by validator only | `organization_id` | Master | §2i allowlist | **NEW** `disk_key` |
| Brief | Brief | `briefs` + `brief_versions` — EXISTS | draft → in_review → approved → superseded | `project_id` | Master versions; client approves | in_review / approved | **NEW** `lineage_key`, `title`; unique on lineage |
| Shoot day | Shoot | `production_days` (`date`, `call`, `wrap`, `type`, `status`, `notes`) — EXISTS `20260716140000` | scheduled → in_progress → wrapped / cancelled | `project_id` | Master | §2i allowlist | none |
| Location | Shoot | `locations` — EXISTS | agreement none → drafted → sent → signed | `project_id` | Master | name, address, access window | none |
| Shot | Shoot | `shots` (`description`, `size`, `priority`, `status`) — EXISTS `20260717120000` | planned → covered / dropped | `project_id` | Master | description + status | none |
| Release | Shoot | `releases` — EXISTS | unsent → sent → signed | `project_id` | Master | never | none |
| Call sheet | Shoot | `call_sheets` (`content` text, `pdf_url`) — EXISTS | versioned per day | `project_id` | Master | **never** (free text may carry crew names and contacts) | none |
| Crew | — | `crew_members` (name, rate, contact) — EXISTS | — | — | — | never (K2) | none |
| Asset | Cut, Library | `assets` (`nas_path` = tus commit storage key, `20260726084644`) — EXISTS | file identity | `project_id` | `/api/upload/tus` only | §2i allowlist | **NEW** `source_relative_path` |
| Version | Cut | `versions` (+ `previous_version_id`) — EXISTS | exact; one current | asset | tus only | shared versions | none |
| Sequence | Cut | `sequences` — EXISTS `20260716120000` | pointer row; never uploaded | `project_id` | Master | never | none |
| Share | Cut | `review_invites` + `review_view_admissions` — EXISTS | posture stored by row 6 | asset → project → org | Master | the film | row 6 |
| Note | Cut | `comments` (version-bound 0–100 pins) — EXISTS | tap writes time + pin on the version | version | guest, client, Master | shared thread | none |
| Review outcome | Cut | approval rounds, version-bound — EXISTS `20260922073000` | "Finish reviewing" is the only writer | version | client / guest per share | own step | none |
| Deliverable | Delivery | `deliverables` (+ `qc_checks`, `locked_at`, `locked_by`, `approval_id`) — EXISTS | specced → encoding → qc → ready → delivered (lock) · expired | `project_id` | Master | §2i allowlist | **NEW** `due_at`, `brief_id`, `kind` |
| Delivered set | Delivery | `deliverable_items` (`sha256`, immutable once locked) — EXISTS `20260812120000` | written by the lock only | deliverable | lock | download list | none |
| Assist artifact | Delivery | none | proposed → accepted / rejected | `project_id` | model proposes; Master decides | never | **NEW** `assist_artifacts` |
| Commercial ref | Master job | `projects.cco_*`, `commercial_total_cents`, `commercial_ref` — EXISTS `20260812000000` | CCO OS writes; CVP never mutates | `project_id` | CCO OS | never | none |
| Door resolution | — | none | brand only; `preview` / `live` | — | — | brand | **NEW** `resolve_door(slug)` |
| Role checks | — | `role_rank`, `has_team_role`, `has_project_role` — EXISTS | — | — | — | — | **NEW** `has_org_role`, `has_project_seat`; `has_project_role` gains an org branch |

### 1b Derived values (never typed)

| Value | Computed from | Shown on |
|---|---|---|
| Seat word per job | First match wins: brief `in_review` → Brief · day `scheduled` / `in_progress` → Shoot · open round → Cut · deliverable not locked → Delivery · else Done. Restricted to the viewer's granted seats. | Projects rows |
| Deliverable status | versions + review outcome + `locked_at`; Madeline's columns are labels on this value | Cut strip, Delivery, master home |
| Waiting on whom | pending round step (client) · `changes_requested` (Content Co-op) · brief `in_review` (client approver) · past `due_at` (Content Co-op) | master home; client "Needs you" |
| Needs-you count | viewer's pending steps + brief versions awaiting them, in granted seats only | Projects badge |
| Dormant seat | seat with no records on this job, or not granted to this viewer | nav: dimmed, not focusable |

### 1c Invariants

| Invariant | Held by |
|---|---|
| Nothing sent without Bailey's yes; invites are copyable links | L9 |
| `delivered` only through the lock | EXISTS `deliverables_delivered_requires_lock` |
| Lock from an approved version only, **except** `deliverables.kind='footage_package'`, which locks by explicit Master act with no round (Jennifer) | L17 |
| One catalog writer; `nas_path` and `source_relative_path` are set only inside the tus commit RPC | L7, L17, L20 |
| Exact-version binding for notes, outcomes, deliveries | EXISTS |
| Every door read passes W1 + W2 + W3 (§2a) | L8, L10 |
| Clients never read commercial, assist, releases, call-sheet text, sequences, crew, or storage paths | §2i, RLS |
| Delivery "how" lives in `spec`, `qc_checks`, `assist_artifacts`; never a step machine | K3 |

### 1d L7 migration spec (column level)

| Table | Column / object | Type | Constraint | Default | Index | Notes |
|---|---|---|---|---|---|---|
| `organizations` | `slug` | text | `^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$`; not in the reserved set | NULL (no door) | UNIQUE | reserved: `www admin app api client review master mail status staging dev cdn assets auth` |
| `organizations` | `brand` | jsonb | object; keys `mark_url` (https or `/brand/…`), `accent` (`#rrggbb`) | `'{}'` | — | read by `resolve_door` only |
| `organizations` | `disk_key` | text | `^[a-z0-9-]{2,80}$` | NULL | UNIQUE | e.g. `schneider-electric` |
| `organizations` | `door_status` | text | IN (`off`, `preview`, `live`); `door_status='off' OR slug IS NOT NULL` | `'off'` | — | `preview` = staff-only door |
| `organization_members` | table | — | `UNIQUE(organization_id, user_id)`; role IN (`client_admin`, `client_member`); FK cascade on org + user | `created_at now()` | `(user_id)` | RLS forced; select own rows or staff; writes service-role only |
| `project_members` | `seats` | text[] | `seats <@ '{brief,shoot,cut,delivery}'` and `cardinality(seats) >= 1` | `'{brief,shoot,cut,delivery}'` | — | existing rows keep all four |
| `projects` | `disk_key` | text | `^\d{4}-\d{2}-\d{2}_[a-z0-9-]+$` | NULL | UNIQUE `(organization_id, disk_key)` | e.g. `2026-03-13_el-paso-customer-story` |
| `briefs` | `lineage_key`, `title` | text, text | `^[a-z0-9-]{1,40}$` | `'main'`, `''` | UNIQUE `(project_id, lineage_key, version)` replaces `(project_id, version)` | existing rows become `main` |
| `deliverables` | `due_at` | timestamptz | — | NULL | `(project_id, due_at)` | ordering only |
| `deliverables` | `brief_id` | uuid | FK `briefs` ON DELETE SET NULL; trigger: same `project_id` | NULL | — | which open brief it answers |
| `deliverables` | `kind` | text | IN (`edit`, `footage_package`) | `'edit'` | — | footage package = Jennifer lock rule |
| `assets` | `source_relative_path` | text | no leading `/`, no `..`, ≤ 1024 | NULL | — | written only by the tus commit RPC from upload metadata |
| `assist_artifacts` | table | — | kind IN (`qc_vs_brief`, `chase_list`); status IN (`proposed`, `accepted`, `rejected`); `decided_*` set iff status ≠ proposed | `proposed` | `(project_id, status)` | RLS: rank ≥ producer only; no client select |
| function | `has_org_role(org, rank)` | bool | SECURITY DEFINER, `search_path=''`; active membership; `client_admin` and `client_member` both rank 30 (`reviewer`) | — | — | 30 < member (50), so no production writes |
| function | `has_project_role` | bool | add branch: `project.organization_id` non-null and `has_org_role(...)`, capped at 30 | — | — | one change reaches every child-table policy |
| function | `has_project_seat(project, seat)` | bool | staff / team → true; org member → true; project member → `seat = ANY(seats)` | — | — | used by seat-table policies (§2f) |
| function | `resolve_door(slug)` | row | SECURITY DEFINER; returns `organization_id, name, brand, door_status` only when `door_status` IN (`preview`, `live`) | — | — | EXECUTE granted to service_role only |
| policy | seat tables | — | `briefs`, `brief_versions` → brief · `production_days`, `shots`, `locations` → shoot · `versions`, `comments` → cut · `deliverables`, `deliverable_items` → delivery; each adds `AND has_project_seat(project_id, seat)` for rank < 50 | — | — | W3 enforces seats in the database, not only in the API |
| policy | staff-only tables | — | `releases`, `call_sheets`, `crew_members`, `sequences`, `assist_artifacts` require rank ≥ 70 | — | — | clients get 0 rows |

---

## 2 Two-side surface map

### 2a Tenancy mechanism (three walls)

| Concern | Mechanism | Where | Fails closed as |
|---|---|---|---|
| Host → door | `^(?<slug>[a-z0-9-]{2,40})\.co-videopro\.com$`; reserved labels rejected | `lib/auth/host-surface.ts` `resolveDoorSlug`, `proxy.ts` | unknown / reserved / off → one generic 404 body |
| Slug → account | `resolve_door(slug)` via service role; cached 60 s per slug (brand only) | NEW RPC | backend down → structured 503; never another door |
| **W1 cookie** | Supabase SSR cookies host-only (no `Domain=`), `Secure`, `HttpOnly`, `SameSite=Lax`; one session per host | Supabase SSR config | any cookie with `Domain=.co-videopro.com` fails CI |
| **W2 binding** | Proxy strips inbound `x-cvp-door-org`, stamps it after resolution; door handlers require it and filter `organization_id = door org`; mutating requests require `Origin` = door origin | `proxy.ts`, `lib/api/*` | missing → 403 `DOOR_UNBOUND`; bad Origin → 403 |
| **W3 database** | `has_org_role` / `has_project_role` / `has_project_seat` in RLS; client API reads go through §2i allowlists | L7 | 0 rows |
| Membership gate | After session: `has_org_role(door org)` or an active project grant in the door org; `preview` doors admit staff only | proxy + NEW function | sign out on this host → "No access on this door" |
| Master sees | staff + Content Co-op `team_members` → every team job across accounts; account filter is view-only | EXISTS `has_team_role` | no team row → empty |
| Staff on a door | read-only "View as {account}", client projection + banner | `roleCanAccessSurface` | write → 403 `PREVIEW_READ_ONLY` |
| Client on the master host | redirect to their door, or the generic-door chooser if several | EXISTS surface redirect | `SURFACE_FORBIDDEN` |
| Guest links | already-sent apex `/review/{token}` links serve forever; new links mint on the door host; token org ≠ door org → 404 on that door | `getReviewSiteUrl`, `app/review/[token]` | 404 |
| DNS / TLS | `*.co-videopro.com` on the existing Cloudflare tunnel; one-level wildcard cert | `infra/runtime/cloudflare` | **G2** |
| Headers | CSP, `frame-ancestors 'none'`, security headers unchanged on every host; authenticated HTML `Cache-Control: private, no-store` | `next.config.ts` | — |
| Brand | account mark + name beside the sapphire lockup (no redraw); no mark → name | `organizations.brand` | — |

### 2b Seats × sides

| Surface | Route | Side | Scope | Reads | Writes | Phone | Desktop |
|---|---|---|---|---|---|---|---|
| Login | `/login` | door | one account | brand | session | quiet door, account mark, Login → Projects | same |
| Login | `/login` | master | all | — | session | quiet door, Login → Projects | same |
| Projects | `/projects` | door | one account | jobs visible to the viewer; seat word; needs-you | none | bottom pipeline, Projects active | thin left |
| Projects ("waiting on whom") | `/projects` | master | all accounts | team jobs by account; waiting on whom; due order | account filter (view); create job | same, operator scope | thin left + filter |
| Brief | `/projects/[id]/brief` | door | one job | lineages; in_review / approved | approve a version (deliberate confirm) | card per lineage | two-pane |
| Brief | same | master | one job | all versions | version, lineage, mark in_review (no mail) | same | same |
| Shoot | `/projects/[id]/shoot` | door | one job | client-safe call sheet (§2i): days, call / wrap, location name / address / access window, shot list + coverage | none | day list | day + detail |
| Shoot | same | master | one job | all production entities; lanes = filters | days, shots, locations, releases, call sheets | lane chips inside the seat | same |
| Cut | `/projects/[id]/cut` | door | one job | shared versions; outcome; strip | open film | list + strip | same |
| Cut | same | master | one job | assets, versions, rounds, shares, sequences | tus upload; share; start round | same | same |
| Film | `/projects/[id]/assets/[assetId]`, `/review/[token]` | both + guest | one exact version | version, notes, outcome | tap note; Finish; version switch in place | **no nav rail**; back chevron to Cut | **no nav rail**; review rail per PR #36 |
| Delivery | `/projects/[id]/delivery` | door | one job | name, due, DERIVED state, locked items | download locked items | list by due | list + pane |
| Delivery | same | master | one job | + spec, `qc_checks`, assist cards, lock evidence | spec; accept / reject cards; **lock** | same | same |
| Money | master job header | master | one job | frozen CCO total | none | one line | same |
| Library (drawer) | `/library` | door | one account | account assets by project; finals downloadable when locked | download | drawer | drawer |
| Library (drawer) | same | master | all accounts | all assets; account + project filters | curate | same | same |
| Drawer | — | door | — | — | — | Library · Members (client_admin, read-only) · Notifications · Sign out | same |
| Drawer | — | master | — | — | — | Library · Accounts · Team · Settings · Audit log · Archive · Trash · Sign out | same |
| Accounts | `/settings/accounts` | master | all | orgs, members, grants | account, slug, brand, `door_status`; year member; job seat grant + expiry; copyable invite | drawer → Accounts | settings pane |
| Dormant / ungranted seat | any seat route | door | — | — | — | dimmed, not focusable | route 404 |

### 2c Request lifecycle on a door

| Step | Actor | Action | Output | On failure |
|---|---|---|---|---|
| 1 | Cloudflare | wildcard DNS + cert; tunnel to M2 `next start` on :4103 | request with `Host: schneider.co-videopro.com` | TLS error (G2 not done) |
| 2 | `proxy.ts` | normalize Host (existing `normalizedHostname`); match door pattern; reject reserved | `slug=schneider` | generic 404 |
| 3 | `proxy.ts` | `resolve_door(slug)` (cache 60 s) | `organization_id`, brand, `door_status` | 404 (off / unknown) · 503 (backend) |
| 4 | `proxy.ts` | strip inbound `x-cvp-door-org`; stamp resolved org | trusted header | — |
| 5 | `proxy.ts` | public route? (`/login`, `/review/*`, `/api/review/*`, auth, health) → continue with brand | — | — |
| 6 | `proxy.ts` | read host-only session cookie; verify with Supabase | user | → `/login` on this host |
| 7 | `proxy.ts` | membership gate: `has_org_role` or grant in org; preview door → staff only; staff → View-as | role on door | sign out this host → "No access on this door" |
| 8 | route handler | require door header; `Origin` check on mutations; filter by door org; seat check | query | 403 / 404 |
| 9 | Postgres | RLS: `has_project_role` (org branch) + `has_project_seat` | rows | 0 rows → 404 |
| 10 | route handler | §2i allowlist projection; `no-store` | response | — |

### 2d Session scope matrix

| Host | Surface | Org bound | Who may sign in | After login | Cookie scope | Guest `/review/{token}` | Cross-host behavior |
|---|---|---|---|---|---|---|---|
| `co-videopro.com` | master (+ legacy review host) | none | staff | Projects (all accounts) | host-only apex | serves all tokens (already-sent links) | clients → redirected to their door |
| `admin.contentco-op.com` | master alias | none | staff | Projects (all accounts) | host-only | existing behavior | same as apex |
| `client.contentco-op.com` | generic door | none | clients | one account → that door; several → chooser | host-only | existing behavior | stays until every live account has a door |
| `{slug}.co-videopro.com` | client door | one | members of that org, job grantees in it, staff (View-as) | this account's Projects | host-only per door | tokens of this org only | no session carries to any other door |
| `*.localhost` / `localhost` | dev | per slug when flag on | per rules above | same | host-only | demo rules unchanged | proof host for L8 |

### 2e Client A ≠ B negative-proof matrix

| # | Vector | Expected | Stopped by | Proved in | Test |
|---|---|---|---|---|---|
| X1 | A signed in on A door opens B door | B login page; no session | W1 | L8, L10 | `tenancy-cookie-scope.test.ts` + live |
| X2 | A pastes A's cookie value onto B host | session valid but gate fails → signed out on B host | membership gate | L8 | `tenancy-membership-gate.test.ts` |
| X3 | A on A door requests `/api/projects/{B uuid}` | 404 | W2 + W3 | L8, L13 | `tenancy-api-binding.test.ts` |
| X4 | A on A door requests B asset HLS playlist or segment | 404 | W2 + W3 | L14 | `tenancy-media-binding.test.ts` |
| X5 | A forges `x-cvp-door-org: B` | header replaced with A | W2 strip | L8 | `tenancy-header-strip.test.ts` |
| X6 | A opens a B review token on A door | 404 | token-org check | L8 | `tenancy-review-token-door.test.ts` |
| X7 | A holds a B review token and opens it on apex or B door | plays as a guest under recipient-bound admission; review tokens are bearer links by design | admission rules (EXISTS) | row 1 / 6 | existing admission tests |
| X8 | A searches Library for a B title | 0 results | W2 + W3 | L18 | `tenancy-library-scope.test.ts` |
| X9 | A's browser queries Supabase directly with A's JWT for B rows | 0 rows | W3 | L7 | RLS transcript (scratch DB) |
| X10 | Cross-origin POST from B door page to A door API | 403 | W2 Origin + W1 `SameSite` | L8 | `tenancy-origin-check.test.ts` |
| X11 | Person in A and B | A door shows only A; B door only B | W2 | L10 | live, two accounts |
| X12 | A requests password reset on A door, opens link on B host | rejected; link valid only on A host | door-minted redirect | L8 | `tenancy-auth-links.test.ts` |
| X13 | Edge cache serves A's HTML on B host | never: cache key includes host; authenticated HTML `private, no-store` | headers | L8 | curl header check |
| X14 | Membership expires mid-session | next request → signed out on that door | gate per request | L9 | `tenancy-expiry.test.ts` |
| X15 | Staff View-as on A door attempts a write | 403 `PREVIEW_READ_ONLY` | role check | L8 | `tenancy-preview-readonly.test.ts` |
| X16 | Jennifer (Shoot only) opens Cut / Brief / Delivery URL | 404; seat dimmed | `has_project_seat` (W3) + API | L15, L16, L17 | `tenancy-seat-grant.test.ts` |
| X17 | Client reads `releases`, `call_sheets`, `crew_members`, `assist_artifacts`, or commercial fields | 0 rows / field absent | W3 rank ≥ 70 + §2i | L7, L16, L19 | RLS transcript |
| X18 | Unknown or reserved slug | same generic 404 body | resolver | L8 | `tenancy-door-resolver.test.ts` |

### 2f API binding on door hosts

| Route family | On a door host | On master | Source |
|---|---|---|---|
| `/api/auth/*`, `/api/health*`, `/api/version` | allowed; auth links minted for this host | allowed | EXISTS client allowlist |
| `/api/review/*`, `/api/review/media/*` | allowed; token org must equal door org | allowed (all tokens) | EXISTS + L8 |
| `GET /api/projects`, `GET /api/projects/:id`, `GET /api/projects/:id/assets`, `GET /api/assets` | door-bound, §2i projection | full | PR #19 safe set + L8 |
| Asset HLS playlist / segments, `GET /api/media/versions/:id` | door-bound + cut seat | full | PR #27 + L14 |
| `GET` / `PATCH` (accept / decline) `/api/teams/invites` | door-bound | full | PR #19 |
| `GET /api/projects/:id/briefs` · `POST` approve | door-bound + brief seat; approve rank 30 | full | NEW L15 |
| `GET /api/projects/:id/shoot` | door-bound + shoot seat; client-safe projection | full | NEW L16 |
| `GET /api/projects/:id/deliverables` · locked downloads | door-bound + delivery seat | full + lock | EXISTS (gated) + L17 |
| `GET /api/library` | door-bound | cross-account | NEW L18 |
| `/api/upload/tus*`, `/api/organizations*`, `/api/teams` (writes), `/api/webhooks`, `/api/billing/*`, `/api/transcode*`, `/api/analytics*`, `/api/ai/*`, `/api/contacts*`, `/api/inquiries*`, `/api/notifications/send`, `/api/assist/*`, lock | **403 `SURFACE_FORBIDDEN`** | staff | EXISTS admin allowlist |
| `POST` / `DELETE` on any project or asset route | **403** (except comment and approve under review rules) | staff | PR #19 narrowing |

### 2g Failure modes

| Failure | Behavior | Why safe |
|---|---|---|
| `resolve_door` / Supabase down | structured 503 on door hosts; apex and guest review unaffected | never guesses a door |
| Slug renamed | old slug 404 after at most 60 s of cache; new slug live; sent door-host review links on the old slug break, apex links keep working | slugs are rarely changed; rename is a Master act |
| `door_status` live → off | door 404 within 60 s; sessions on that host are useless | fail closed |
| `door_status` preview | staff only; clients get "No access on this door" | Bailey checks the door before clients |
| Membership revoked or expired | next request signs out on that door | gate runs per request, not per login |
| Staff role removed | loses master and View-as on next request | EXISTS role check |
| Project `organization_id` null | invisible on every door; master only | door reads require non-null |
| Project moved to another account | disappears from old door, appears on new door; review tokens follow the job's org | tokens resolve through the job |
| Cloudflare wildcard missing | door hosts fail TLS; nothing else changes | G2 is additive |

### 2h Auth flows on doors

| Flow | Door behavior | Invariant |
|---|---|---|
| Sign in | same quiet single Sign in path (email + password); account mark above the form | locked auth door; no second path |
| Google | off on doors | no wildcard OAuth redirect |
| Sign out | clears this host only | other doors and apex unaffected |
| Password reset / confirm | `redirect_to` = requesting door origin, validated against the resolved door; Supabase allowlist `https://*.co-videopro.com/**` (G2) | link unusable on another host |
| Invite accept | Master copies a door-host link (no send); accept runs on that door; creates `organization_members` or a `project_members` row with seats | nothing sent |
| Session refresh | host-only refresh cookie; no cross-host refresh | W1 |

### 2i Client projection allowlists (API, second to W3)

| Object | Client may receive | Never |
|---|---|---|
| `organizations` | `name`, `brand` | `owner_id`, `notes`, `disk_key` |
| `projects` | `id`, `name`, DERIVED seat word, needs-you, granted seats | `stage`, `owner_id`, `team_id`, `cco_*`, `commercial_*`, `disk_key` |
| `briefs` / `brief_versions` | `lineage_key`, `title`, `version`, `status`, `objectives`, `audience`, `message`, `deliverables_notes` (in_review / approved only) | drafts, `created_by` |
| `production_days` | `date`, `call`, `wrap`, `type`, `status` | `notes` |
| `locations` | `name`, `address`, `access_window` | `contact`, `agreement_status`, `cleared_to_film`, `restricted` |
| `shots` | `description`, `size`, `status` | `notes`, `priority` |
| `call_sheets`, `releases`, `crew_members`, `sequences`, `assist_artifacts` | nothing | everything |
| `assets` | `id`, `title`, `file_type`, duration, poster | `nas_path`, `source_relative_path`, `file_url` |
| `versions` | `id`, `version_number`, `is_current`, duration, playback via exact-version route | `file_url`, storage keys |
| `comments` | existing external-safe projection | internal fields |
| `deliverables` | `name`, `due_at`, DERIVED state, `locked_at`, `kind` | `spec`, `qc_checks`, `approval_id`, `locked_by` |
| `deliverable_items` | download link (locked only), `sha256` | storage keys |

---

## 3 El Paso seat fill (golden path)

| Anchor | Value |
|---|---|
| Account | Schneider Electric · `slug=schneider` · `disk_key=schneider-electric` |
| Job | El Paso Water customer story · `disk_key=2026-03-13_el-paso-customer-story` (never "Physical Edge — El Paso") |
| Live asset | `1ec225a9-e405-453a-9a53-d9dfa7e063a3`, version `bb081d37-ef8f-450f-8006-307f342d148e` (PR #27; F1 on `46a256f2`) |
| Fill rule | Link the existing live job; never recreate it. Media and finals only via tus (`source_relative_path` set by the commit). Documents → records entered by the Master. Edit files → `sequences` pointer rows. The fill marks nothing approved or delivered and sends nothing. |
| Grants for proof | Madeline: `organization_members` client_admin, year expiry · Jennifer: `project_members` on El Paso, `seats={shoot}`, expiry after the last day |

| Folder class (disk) | Seat | Record target | Madeline (all seats) | Jennifer (Shoot only) | Master | Empty class | Land |
|---|---|---|---|---|---|---|---|
| Admin / SOW / contracts | master | `commercial_ref` (CCO OS writes) | never | never | commercial line | none | Money |
| Brief / messaging / interview Qs | Brief | `briefs` `main` v1..n | approved version | dimmed, 404 | all versions | "No brief on file" | L15 |
| Pre-pro: schedule, shot list, locations, releases | Shoot | `production_days` · `shots` · `locations` · `releases` · `call_sheets` | client-safe call sheet | client-safe call sheet | full | day with date only | L16 |
| Footage: interviews, b-roll, audio | Library | `assets` via tus | Library | dimmed | Library + filters | empty section | L18 |
| Transcripts | Cut | transcript on its exact asset | — | — | on asset | none | L14 |
| Edit project files | Cut | `sequences` pointer | never | never | name + version | none | L14 |
| Review exports v1…vN | Cut | `versions` on the live chain; rounds | film, notes, Finish | 404 | all + chase list | Cut dormant | L14 |
| Finals: master, cutdowns, captions | Delivery | `deliverables` (`kind=edit`, `brief_id`) → lock → items + `sha256` | locked downloads | 404 | spec, QC, lock | stays `specced` | L17 |
| Stills / BTS, graphics / music / licenses | Library | `assets` via tus + rights note | Library, licensed only | dimmed | rights badge | empty | L18 |

---

## 4 WEFTEC delta

| Anchor | Value |
|---|---|
| Job | `disk_key=2026-09-25_weftec`; second Schneider row; same door, seats, schema |
| Timing | Paper pressure test now; live replay from disk after the event (L20); no Land races the date |

| Dimension | El Paso | WEFTEC | Record | Tenancy / architecture effect | Land |
|---|---|---|---|---|---|
| Briefs | 1–2 lineages | coverage plan as v1; more lineages if briefed | `lineage_key` | none | L15 |
| Shoot | one site | several days / halls; lanes = filters | more rows | projection unchanged | L16 |
| Stakeholders | Madeline + Jennifer | more Shoot-only grants (e.g. booth contacts) | `project_members.seats` rows | grant many seats in one Accounts sheet; each expires | L9 |
| Cut | v1…vN | near-empty until after the event | none | honest-empty | L14 |
| Delivery | master + cutdowns | same-week social cutdowns; a master may never exist | `due_at`; maybe `footage_package` | due-ordered projection | L17 |
| Library | story assets | bulk event footage first | none | project filter | L18 |
| Upload volume | few large files | many clips the same day | none (tus) | CCNAS / scan **not** reopened | — |
| Door | Schneider | Schneider | none | no new account or door | L10 |

---

## 5 Variability matrix

| Case | Grant (what she may see) | Record rule (what the record may claim) | Door behavior | A≠B / seat vector | Land |
|---|---|---|---|---|---|
| **Madeline, year-long** | `organization_members` client_admin, `expires_at` = engagement end; covers new Schneider jobs automatically | footage accrues before deliverables; dormant Cut shows nothing; late testimonials = Vn+1, V(n) outcome kept; her columns are labels on DERIVED status | Schneider door → Projects | X3, X8, X14 | L9, L13, L14 |
| **Jennifer, shoot-only** | `project_members` on the job, `seats={shoot}`, expiry after the last day | Cut dormant; Delivery holds one `footage_package` deliverable locked by a Master act; no phantom cuts | Projects shows her job(s); other seats dimmed | X16, X17 | L9, L16, L17 |
| **Open brief, same job** | as the account | job at Brief with nothing downstream; more briefs as lineages on the same job; no separate inquiry object | Brief seat | — | L15 |
| Anonymous guest | review token | recipient-bound admission, exact version | film only | X6, X7 | rows 1, 6 |
| One person in two accounts | two memberships | — | one account per door; generic-door chooser | X11 | L10 |
| Client B (negative) | own membership | — | own door | X1–X10 | L8, L10 |
| Expired grant | past `expires_at` | — | signed out on that door | X14 | L9 |
| Staff View-as | staff role | — | read-only client projection | X15 | L8 |

---

## 6 Architecture annex per forge Land (Fable §C governs order)

| Forge Land | Architecture work | Files | Tests | Vectors proved | Must not |
|---|---|---|---|---|---|
| L7 | §1d migration: columns, `organization_members`, `assist_artifacts`, `has_org_role`, `has_project_seat`, `has_project_role` org branch, `resolve_door`, seat and staff-only policies | `supabase/migrations/<ts>_client_doors_record.sql`, `lib/covideopro/record.ts` | RLS transcript on scratch Postgres | X9, X17 | apply to live; touch existing rows beyond defaults |
| G1 | Bailey applies L7 | — | pre/post row counts | — | — |
| L8 | door resolver, W1 cookie config, W2 strip / stamp / Origin, membership gate, View-as, door-minted auth links, flag `CVP_CLIENT_DOORS` | `proxy.ts`, `lib/auth/host-surface.ts`, `lib/surface-origins.ts`, `app/api/auth/*`, `app/review/[token]` | `tenancy-door-resolver`, `-cookie-scope`, `-membership-gate`, `-header-strip`, `-origin-check`, `-auth-links`, `-review-token-door`, `-preview-readonly` | X1, X2, X5, X6, X10, X12, X13, X15, X18 | change apex / admin / generic-door routing with the flag off |
| L9 | Accounts pane: slug, brand, `door_status`, members, seat grants, expiry; copyable invites | `app/(dashboard)/settings`, `app/api/organizations/*`, `app/api/teams/invites` | `tenancy-expiry`, grants tests | X14 | send anything; let client_admin grant |
| G2 | wildcard DNS + Supabase redirect allowlist | — | DNS/TLS receipt | — | — |
| L10 | Schneider `door_status=live` | config | live two-account smoke | X1, X11 | — |
| L11 | shell reads granted seats from the session projection to dim seats; film route renders no rail | `components/navigation/*` | seat-dim test | — | redraw; add a crew item |
| L12 | kill routes; remove the wrong Schneider seeds | §7a routes | suite | — | touch review / film |
| L13 | `lib/covideopro/status.ts` DERIVED values restricted to granted seats | `app/(dashboard)/projects/page.tsx`, `app/api/projects/*` | `tenancy-api-binding` | X3 | expose `stage` or commercial fields on doors |
| L14 | Cut + version switch; HLS door binding + cut seat | Cut route, PR #27 HLS routes | `tenancy-media-binding`, `-seat-grant` | X4, X16 | change admission limits |
| L15 | brief API with lineage + approve at rank 30 | `app/api/projects/[id]/briefs` | `-seat-grant` | X16 | create a job from a brief |
| L16 | client-safe call sheet from structured fields (§2i) | `app/api/projects/[id]/shoot` | projection test | X16, X17 | return `call_sheets.content`, `pdf_url`, crew, or location contact |
| L17 | lock rules incl. `footage_package`; locked downloads | deliverables + lock routes | lock tests | X16 | lock from unapproved `edit` |
| L18 | library query door-bound | `app/api/library`, `app/(dashboard)/library` | `tenancy-library-scope` | X8 | mount demo library in production |
| L19 | `assist_artifacts` (two kinds); accept writes `qc_checks`; staff-only RLS | `app/api/assist/*`, Delivery seat | assist tests | X17 | client visibility; send / spend / approve / lock |
| L20 | WEFTEC via tus + grants | data | re-run X1–X18 on two jobs | all | new account, door, seat, or table |
| Money | read of commercial fields on master only | master job header | projection test | X17 | write commercial columns; show on doors |
| 9 / 11 | ACS sibling train | — | — | — | stall or open |

### 6b Architecture notes to the forge

| # | Note | Where it binds |
|---|---|---|
| N1 | `assets.nas_path` is the tus commit storage key and idempotency match (`20260726084644_atomic_upload_catalog_v1.sql:311`). Forge A2 holds only if nothing but the tus commit writes it; disk provenance goes in `source_relative_path`, set by the same commit. | L7, L17, L20 |
| N2 | Seats need database enforcement (`has_project_seat`), not only UI dimming, or X16 fails through a direct API call | L7, L14–L17 |
| N3 | `call_sheets.content` and `pdf_url` are free text and may carry crew names, rates, and contacts. "Client-safe call sheet" (forge L16) must be composed from structured `production_days`, `locations`, and `shots` fields (§2i). | L16 |
| N4 | Extending `has_project_role` with an org branch, capped at rank 30, is one change that reaches every child-table policy; adding org checks table by table would miss some | L7 |
| N5 | Forge L18 says "locked items + brand kit"; forge A13 says Madeline's deliverable-less footage is legal. Library should list account assets by project and allow downloads of finals only when locked, so both hold. | L18 |
| N6 | `footage_package` needs `deliverables.kind` so the "lock from approved only" rule and Jennifer's handoff can both be enforced | L7, L17 |
| N7 | Review tokens are bearer links by design (X7). A≠B applies to sessions and doors, not to someone holding a shared link. | L8 |

---

## 7 Kill + don't-break

### 7a Kill (forge L12 executes; forge §E governs)

| Kill | Where | Answer after kill |
|---|---|---|
| Overview dashboard | `app/(dashboard)/page.tsx` | 308 → `/projects` |
| Opportunities | `app/(dashboard)/opportunities` | 404 |
| Request center (P27 demo) | `app/(dashboard)/requests`, `app/(client)/portal/requests` | 404 |
| Client portal (P23 demo) | `app/(client)/portal` | 308 → `/projects` |
| Field | `app/(dashboard)/field` | 404 |
| Activity page | `app/(dashboard)/activity` | 308 → audit log |
| Reports (P28 demo) | `app/(dashboard)/reports` | 404 |
| Reviews list | `app/(dashboard)/reviews` | 308 → `/projects?seat=cut` |
| Whiteboard (P25 demo) | `app/(dashboard)/projects/[id]/whiteboard` | 404 |
| Floating Copilot (P14 demo) | `components/copilot/*` mount | unmounted |
| Demo workspace tabs (P24) | `ProjectWorkspaceTabs` | unmounted |
| Wrong seeds "Physical Edge — El Paso", "Schneider National / Logistics" | `lib/demo/workspace.ts`, `lib/demo/record-seed.ts` | renamed or removed |
| Crew UI; delivery wizard; nav redraw; rail on the film; hand-typed status; chatbot drawer | — | never built |

### 7b Don't-break (tenancy-specific additions to forge §E)

| Guard | Checked in |
|---|---|
| Apex, `admin.contentco-op.com`, and `client.contentco-op.com` routing byte-identical with `CVP_CLIENT_DOORS` off | L8 |
| Already-sent apex review links serve forever | L8, L10 |
| No cookie ever set with a parent `Domain` | L8 and every later Land (CI) |
| Existing `project_members` rows keep full access (default all seats) | L7 |
| Existing RLS for staff and owners unchanged | L7 |
| Guest **and** signed-in client paint the film (F1) | L8, L10, L11, L14 |
| `46a256f2` chrome, quiet auth door, `compress:false`, CSP | every Land |
| tus is the only writer of `assets`, `nas_path`, and `source_relative_path` | L17, L20 |
| Nothing sent; G1 / G2 only at Bailey's gate | every Land |

---

## 8 Out of scope

| Out | Why |
|---|---|
| Rows 1–6; ACS rows 9 / 11 | in flight / sibling train |
| Any Land from this file | Fable forges; Lands cite the forged master |
| Vanity domains, SSO / SAML, Google on doors | wildcard + one Sign in path |
| Cross-account client views (agency seats spanning accounts) | one account per door |
| Per-account billing, plans, metering | not a lock |
| Crew product; outbound sends; invoice send; CS bots | locks |
| AI kinds beyond `qc_vs_brief` and `chase_list` | consensus |
| Reopening CCNAS, scan policy, approval setup | no live regression |
| Other agencies' masters; native apps | master = Content Co-op; phone web is the product |
| A question back to Bailey | locks closed |
