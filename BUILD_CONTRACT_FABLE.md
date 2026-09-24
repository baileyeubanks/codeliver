# BUILD CONTRACT — seat FABLE (one-shot, 2026-09-24)

**Inputs locked, not argued:** two sides only (client door `{client}.co-videopro.com` + Content Co-op master, L1–L3) · no crew product (L1) · delivery AI-fluid — record fixed, stage swappable (L4) · film route has no rail · login → Projects · nav PNGs approved (PR [#31](https://github.com/baileyeubanks/codeliver/pull/31)/[#32](https://github.com/baileyeubanks/codeliver/pull/32)) — nav is not redrawn here or in any Land below. Seats: **Projects · Brief · Shoot · Cut · Delivery + Library drawer.** Rows 1–6 of spine rev 4 stay in flight, untouched. Disk SoT: `CCO/clients/schneider-electric/2026-03-13_el-paso-customer-story` and `…/2026-09-25_weftec` (root already trusted by `scripts/schneider-preview.mjs`).

## 1 · Record contract

One chain, one writer per link, no status typed by hand. Migration application stays a Bailey gate.

| Link | Object today (repo truth) | Only writer | New in this contract |
|---|---|---|---|
| **Tenant** | `co_production.organizations` + team scope (`20260716120000`) | Master creates tenants | `tenant_doors` map: subdomain slug → org + brand mark. Code resolves `Host`; **DNS itself is a Bailey gate** |
| **Project** | `projects.stage` via transition validators (`lib/covideopro/transitions.ts`) | Stage moves by validator, never assignment | `source_root` label pointing at the disk SoT folder (pointer, not bytes) |
| **Deliverable** | `co_production.deliverables` + `deliverable_items` (`20260812120000`); `commercial_ref` frozen from CCO OS (`20260812000000`) | Specced from the finals class; CCO totals never mutated | Derived status column (Madeline map from row #5) — **derived, never hand-typed** |
| **Version** | Atomic asset+V1, single writer `/api/upload/tus` (`20260726084644`, `20260922055310`) | The one catalog writer | Disk-retrofit import writes versions through the same receipt discipline — no second writer |
| **Outcome** | Version-bound approval rounds (`20260922073000`) + durable `share_intent` (row #6) | **"Finish reviewing" is the only writer** (finished / approved / changes requested) | Outcome → Madeline-column mapping consumed by seats, not retyped |
| **Delivered** | `locked_at / locked_by / approval_id` (`20260812120000`) | Lock only from approved; **nothing sent without Bailey's yes** | One real delivered receipt on the golden-path deliverable (Land 10) |

## 2 · Two-side surface map

Same nav master, two scopes. Client door = one tenant, ever. Master = every tenant. No third nav.

| Seat | Client door `{client}.co-videopro.com` | CCO Master | Reads | Writes |
|---|---|---|---|---|
| **Door / Login** | Tenant mark on the door; Login → that tenant's Projects only | Master login → cross-tenant Projects | `tenant_doors` | Session only |
| **Projects** (home) | This tenant's productions, film-first cards, phase in words | **"Waiting on whom" home** across all tenants — where the Excel dies | Project + derived status | None |
| **Brief** | Read current brief; approve scope | Author + version briefs; consult briefs with no project yet | `briefs` / `brief_versions` | Client: approve · Master: version |
| **Shoot** | Milestone visibility only (dates, coverage done) — no crew, no rates | Full seat: days, shots, locations, releases, chase list. **Lanes = filters inside Shoot**, never new nav | Production entities (`20260716140000`, `20260717120000`) | Master: shot ticks, release states |
| **Cut** (film route — **no rail**) | Tap the film → one dialog; Review / Approve / Preview; **Finish reviewing** | Same review + round control, version compare | Exact versions, comments | Comment · outcome (the one write) |
| **Delivery** | Where each deliverable stands; download finals | Lock on approve; delivered receipts; invoice-ready mark (CCO stays money authority) | Deliverables + items | Client: confirm · Master: lock |
| **Library drawer** | Tenant-scoped delivered + b-roll library | All-tenant library, rights badges | Assets, rights | Favorites, cutdown requests |
| **Guest `/review/[token]`** | No nav at all (unchanged) | — | Admitted exact version | Comment / approve per share intent |

## 3 · El Paso seat fill (golden-path retrofit)

Every folder class in `CCO/clients/schneider-electric/2026-03-13_el-paso-customer-story` lands in exactly one seat. Import is pointer/receipt-disciplined; the disk stays SoT.

| Folder class (disk) | Seat | Object | Live proof (Latch checks) |
|---|---|---|---|
| Admin / SOW / contracts | Master only (CCO OS seam) | `commercial_ref` frozen on the job | Master job shows commercial state; **client door never renders it** |
| Brief / messaging / interview Qs | Brief | `Brief` + `BriefVersion` | Approved brief renders on both sides; versions ordered |
| Pre-pro: schedule, shot list, locations, releases | Shoot | `ProductionDay` · `Shot` · `Location` · `Release` (**no crew objects surfaced — L1**) | Chase list shows signed/unsigned truthfully; wrapped days read wrapped |
| Footage: interviews, b-roll, audio | Library drawer (Shoot provenance) | Assets with `source_label` | Hover-scrub cards; filter by day; no bytes claimed that disk lacks |
| Transcripts | Cut (support) | Transcript attached to asset | Transcript visible on its exact asset |
| Edit project files (Premiere/AE) | Cut | `Sequence` with disk pointer — **never uploaded** | Sequence row shows name/version; no fake playable |
| Exports: v1…vN review cuts | Cut | Versions V1…Vn, version-bound rounds | Switcher shows every cut; comments bind to exact version |
| Finals: master, cutdowns, captions | Delivery | `Deliverable` + `deliverable_items` | Status derived from record; delivered only with lock receipt |
| Stills / BTS | Library drawer | Image assets | Filterable; rights class honest |
| Graphics / music / licenses | Library drawer | Assets + rights badge | License noted; unlicensed never marked cleared |

## 4 · WEFTEC delta (event pressure test)

Same seats, zero new chrome. `…/2026-09-25_weftec`. Lanes are **Shoot filters**. Empty classes are honest-empty, never faked.

| Seat | El Paso (story) | WEFTEC (event) delta | Empty OK? |
|---|---|---|---|
| Brief | Full creative brief, versions | One-page coverage plan as Brief v1 | — |
| Shoot | Days + shot list + releases | **Lanes = filters:** booth demos · sessions · interviews · floor b-roll; releases per speaker | — |
| Cut | v1…vN review cuts | Near-empty until post-event; same-day selects only | **Yes** |
| Delivery | Master + cutdowns delivered | Same-week social cutdowns; master may never exist | **Yes** |
| Library drawer | Footage + stills + music | Bulk event footage lands here first, deliverable-less | — |
| Projects card | Stage in words (post → delivery) | Stage = production on event day, honest afterwards | — |

## 5 · Variability matrix

| Case | What varies | Seat behavior | Record rule | Proof |
|---|---|---|---|---|
| **Madeline: year-long multi-b-roll** | Footage accrues for months before any deliverable | Library accepts deliverable-less assets; Shoot days accrue; Cut stays dormant | No fake status: dormant Cut shows nothing, not "in review" | Card shows production stage with zero deliverables and lies about nothing |
| **Madeline: late testimonials** | New footage joins mid-Cut | Next cut is Vn+1 on the same asset chain | Outcome never silently reset; prior round stays bound to its version | V(n) outcome intact after V(n+1) exists |
| **Jennifer: footage-only** | Scope is capture + handoff; no edit | Cut/Delivery dormant; Delivery holds one **footage-package** deliverable | Delivered = handoff receipt, not an edited film | Project reads "footage delivered" with a receipt, no phantom cuts |
| **Open consult briefs** | Brief exists, no dates, no deliverables | Brief seat holds it; Projects card reads development | Nothing downstream is fabricated | Zero deliverables, zero versions, zero status invented |

## 6 · Ordered Land list — starts AFTER live rows 1–6

Each Land = **one PR + live proof on the M2 train + a Latch negative**. ACS rows #9/#11 keep their spine slots on the Grok lane; this contract does not reorder them. Rows 1–6 are not reopened.

| # | Land (one PR) | Spine | Depends | Live proof | Latch negative |
|---|---|---|---|---|---|
| 7 | **Client door**: `Host` → tenant, branded login → tenant Projects (`tenant_doors`, proxy resolution) | CVP-06 | #3 pick · #6 | Schneider stakeholder on a phone at `schneider.co-videopro.com` (Host-header until Bailey flips DNS): their mark, their projects, nothing else | Other tenants invisible; guest `/review/[token]` still plays (anon + signed-in, F1); generic door `client.contentco-op.com` still up; no DNS change in-repo |
| 8 | **El Paso seat fill**: disk import writes the record per §3 (pointers + receipt-disciplined versions) | CVP-03 input (#5) | #5 sheet · #6 | Every §3 row visible in its seat on live | Import marks nothing approved/delivered; no second catalog writer; disk stays SoT; no send |
| 9 | **Derived status pilot (Schneider)**: Madeline columns mapped onto review outcome per deliverable | CVP-03 | 8 | Madeline stops retyping: strip on the cockpit matches the record | No hand-edit path exists anywhere; outcome change re-derives without a retype |
| 10 | **Golden-path locked delivery**: one real El Paso deliverable approved → locked → delivered (record fixed; stage AI-fluid per L4) | CVP-07/L4 | 8 · 9 | Delivered state with lock receipt on the live surface, both sides | **Nothing sent**; CCO frozen totals untouched; lock refused from any state but approved |
| 11 | **Master "waiting on whom" home**: cross-tenant read of derived status | CVP-04 (#10) | 7 · 9 | The Excel dies: every tenant's stuck deliverable and who it waits on, one master screen | Client doors never render it; no second nav; tenant isolation holds |
| 12 | **WEFTEC pressure test**: same import + seats on the event folder; Shoot lanes as filters | new (event) | 8 | §4 table true on live: lanes filter, empty seats honest-empty | Zero new chrome; no event-specific seat; no fake status in empty classes |
| 13 | **Variability guards**: §5 cases pass as fixtures + live checks | new (guards) | 8 · 9 | All four §5 proofs on live | Dormant Cut shows no status; footage-only never claims an edit; consult brief fabricates nothing |

## 7 · Kill list + don't-break list

| Kill (nobody starts these) | Don't break (gate on every Land) |
|---|---|
| Crew product / van app / crew states (L1) | Live tip `46a256f2`: player, ~6% overlay, sapphire logo |
| Third nav or any nav redraw (PNGs approved) | Auth quiet door (`c9804e1`, `5da6aed`) |
| Rigid delivery ritual (L4) | Guest **and** signed-in client paint the film (F1) |
| Permanent comment deck under the film | Admission limits + version-bound approval (`20260922073000`) |
| Landing PR #25 as-is (frozen; #6 is the reconcile) | `compress:false`; exact-version comment binding |
| Demo-proposal promotion (two price authorities) | CCO OS money authority — frozen totals, never mutated |
| Hand-typed status anywhere | Bailey gates: DNS, migration application, any send |
| Widget dashboard as home | Generic door until per-client doors Land |
| WEFTEC-specific chrome or seats | Rows 1–6 in flight, unreopened |

## 8 · Out of scope

One line: anything not on a seat serving the El Paso golden path or the WEFTEC pressure test — crew surfaces, Wipster hosting exit, transcript NLE, drawing suite, phone CS bot, new payment rails — waits.
