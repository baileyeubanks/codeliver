# BUILD CONTRACT — seat FABLE (one-shot, 2026-09-24)

**Inputs locked, not argued:** two sides only (client door `{client}.co-videopro.com` + Content Co-op master, L1–L3) · no crew product (L1) · delivery AI-fluid — record fixed, stage swappable (L4) · film route has no rail · login → Projects · nav PNGs approved (PR [#31](https://github.com/baileyeubanks/codeliver/pull/31)/[#32](https://github.com/baileyeubanks/codeliver/pull/32)) — nav is not redrawn here or in any Land below. Seats: **Projects · Brief · Shoot · Cut · Delivery + Library drawer.** Rows 1–6 of spine rev 4 stay in flight, untouched. Disk SoT: `CCO/clients/schneider-electric/2026-03-13_el-paso-customer-story` and `…/2026-09-25_weftec` (root already trusted by `scripts/schneider-preview.mjs`).

**Consensus folded from `BUILD_CONTRACT_GROK` (PR [#37](https://github.com/baileyeubanks/codeliver/pull/37)), adopt-before-contest:** spine row grid 7–15 kept so the contracts read row-for-row · ACS rows 9/11 stand as unstalled placeholders · `assets.nas_path` is the disk pointer (existing column, not a new one) · hosts resolve in `lib/auth/host-surface.ts` · demo title "Physical Edge — El Paso" never becomes the live job name · PR #27 stays behind #36. **Held against Grok, on Bailey's fixed input:** Jennifer is footage-only / Cut dormant (§5), not a second status sheet.

## 1 · Record contract

One chain, one writer per link, no status typed by hand. Migration application stays a Bailey gate.

| Link | Object today (repo truth) | Only writer | New in this contract |
|---|---|---|---|
| **Tenant** | `co_production.organizations` + team scope (`20260716120000`); hosts resolve in `lib/auth/host-surface.ts` | Master creates tenants | `tenant_doors` map: subdomain slug → org + brand mark. Code resolves `Host`; **DNS itself is a Bailey gate** |
| **Project** | `projects.stage` via transition validators (`lib/covideopro/transitions.ts`) | Stage moves by validator, never assignment | Disk pointer rides existing `assets.nas_path` — the CCO folder stays SoT, no second library, no bytes copied |
| **Deliverable** | `co_production.deliverables` + `deliverable_items` (`20260812120000`); `commercial_ref` frozen from CCO OS (`20260812000000`) | Specced from the finals class; CCO totals never mutated | Derived status column (Madeline map from row #5) — **derived, never hand-typed** |
| **Version** | Atomic asset+V1, single writer `/api/upload/tus` (`20260726084644`, `20260922055310`) | The one catalog writer | Disk-retrofit import writes versions through the same receipt discipline — no second writer |
| **Outcome** | Version-bound approval rounds (`20260922073000`) + durable `share_intent` (row #6) | **"Finish reviewing" is the only writer** (finished / approved / changes requested) | Outcome → Madeline-column mapping consumed by seats, not retyped |
| **Delivered** | `locked_at / locked_by / approval_id` (`20260812120000`) | Lock only from approved; **nothing sent without Bailey's yes** | One real delivered receipt on the golden-path deliverable (Land 14) |

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

| Case | What varies | Seat behavior | Record rule | Proof | Closed by |
|---|---|---|---|---|---|
| **Madeline: year-long multi-b-roll** | Footage accrues for months before any deliverable | Library accepts deliverable-less assets; Shoot days accrue; Cut stays dormant | No fake status: dormant Cut shows nothing, not "in review" | Card shows production stage with zero deliverables and lies about nothing | Land 8 |
| **Madeline: late testimonials** | New footage joins mid-Cut | Next cut is Vn+1 on the same asset chain | Outcome never silently reset; prior round stays bound to its version | V(n) outcome intact after V(n+1) exists | Land 12 |
| **Jennifer: footage-only** (Bailey's fixed input; not a second status sheet) | Scope is capture + handoff; no edit | Cut/Delivery dormant; Delivery holds one **footage-package** deliverable | Delivered = handoff receipt, not an edited film | Project reads "footage delivered" with a receipt, no phantom cuts | Land 8 negative |
| **Open consult briefs** | Brief exists, no dates, no deliverables | Brief seat holds it; Projects card reads development | Nothing downstream is fabricated | Zero deliverables, zero versions, zero status invented | Land 8 negative |

## 6 · Ordered Land list — starts AFTER live rows 1–6

Each Land = **one PR + live proof on the M2 train + a Latch negative**. Numbering is the spine rev 4 grid (consensus with Grok, row-for-row comparable); ACS rows 9/11 hold their slots on the Grok lane, unstalled and unopened here. Rows 1–6 are not reopened. §5 variability cases close inside 8/12/15, not as a separate Land.

| # | Land (one PR) | Spine | Depends | Live proof | Latch negative |
|---|---|---|---|---|---|
| 7 | **Client door**: `Host` → tenant (`lib/auth/host-surface.ts` + `tenant_doors`), branded login → tenant Projects | CVP-06 | #3 pick · #6 | Schneider stakeholder on a phone at `schneider.co-videopro.com` (Host-header until Bailey flips DNS): their mark, El Paso Water on their list, nothing else | Other tenants invisible; guest `/review/[token]` still plays (anon + signed-in, F1); generic door `client.contentco-op.com` still up; no DNS change in-repo |
| 8 | **El Paso retrofit + derived status pilot**: disk fill writes the record per §3 (`assets.nas_path` pointers, receipt-disciplined versions), Madeline columns mapped onto review outcome per deliverable | CVP-03 (#5 input) | #5 sheet · #6 | Every §3 row visible in its seat on live; Madeline stops retyping — the strip matches the record | Fill marks nothing approved/delivered; no second catalog writer; disk stays SoT; no hand-edit path exists; open/no-sheet case shows the outcome, never an invented column; no send |
| 9 | **ACS-04 close-out** — sibling train, holds its slot | ACS-04 | #4 | Unchanged by this contract | Do not stall it; do not open it here |
| 10 | **Master "waiting on whom" home**: cross-tenant read of derived status; shell copied from the approved nav PNGs, film route hides the rail | CVP-04 | 7 · 8 | The Excel dies: every tenant's stuck deliverable and who it waits on, one master screen; phone bottom + drawer, desktop thin left | Client doors never render it; no second nav; no left+bottom on phone; no crew item; tenant isolation holds |
| 11 | **ACS-03 job check** — sibling train, holds its slot | ACS-03 | #4 | Unchanged by this contract | Do not stall it; do not open it here |
| 12 | **Version switch on the same film** (El Paso v1…vN; late testimonials land as Vn+1) | CVP-07 | #6 · 8 | Notes stay on their exact version across switches; V(n) outcome intact after V(n+1) exists | No rail beside the film; `46a256f2` overlay and logo unchanged |
| 13 | **Money shown on the master job** from CCO OS handoff fields | CVP-05 | 8 · a finished round · Bailey says bill | El Paso job shows the frozen total on the master | CVP never writes `commercial_total_cents`; no invoice send; no finance seat; client door never shows it |
| 14 | **AI-fluid Delivery on El Paso**: named drafts only — QC vs approved brief + chase list of open comments; operator accepts or ignores, then marks delivered → locked receipt (record fixed, stage swappable, L4) | CVP-08 / KIMI-02 | #6 · 8 · one real finished round | Operator accepts/ignores each draft; one real deliverable reads delivered with a lock receipt, both sides | Draft never sends, spends, or approves; **nothing sent**; lock refused from any state but approved; no chatbot |
| 15 | **WEFTEC pressure test**: same door, same seats, disk `…/2026-09-25_weftec`; lanes = Shoot filters | CVP-09 (new) | 7 · 8 · 12 · 14 proven on El Paso | §4 table true on live: second Schneider row, lanes filter, empty Cut/Delivery honest-empty | Zero new chrome, seat, door, or table; no fake status in empty classes |

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
| Demo title "Physical Edge — El Paso" as the live job name | PR #27 stays behind #36 (regression-only fix) |
| `crew_members` as a product surface | Guest review links already sent keep working |

## 8 · Out of scope

One line: anything not on a seat serving the El Paso golden path or the WEFTEC pressure test — crew surfaces, Wipster hosting exit, transcript NLE, drawing suite, phone CS bot, new payment rails — waits.
