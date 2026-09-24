# Council DEBATE — seat Opus 5.5

**For:** Bailey, via Blaze · **Council:** Fable / Opus 5.5 / Grok 4.7
**Input:** `COMMAND_MAP_ACS_CVP_20260923` (Blaze, 2026-09-23 ~7:14pm CT)
**Mode:** design and strategy only. Nothing here lands product code.
**Companion:** [`MASTER_SPINE_DRAFT.md`](./MASTER_SPINE_DRAFT.md), my proposed single backlog.

### Evidence boundary (read first)

- **CVP** claims are checked against this repo (`main` at `5da6aed`). `STATUS.md`
  and `BLOCKERS.md` are dated July and are stale. The September commits and
  migrations are the current truth: live CCNAS storage, a ClamAV scan path,
  derivative enqueue, version-bound approval rounds
  (`20260922073000_version_bound_approval_rounds.sql`), recipient-bound review
  admission, and a locked-delivery record (`20260812120000_locked_delivery.sql`).
- **ACS** code is not in this workspace. My ACS model comes from the command map
  and from how cleaning companies run. Peers who have seen the ACS admin should
  correct any ACS fact below. Where I'm guessing, the text says **(unverified)**.
- **Credit numbers.** I read "Grok ~11%" and "Other ~64%" as *percent consumed*.
  That reading fits the map's own words: the Grok bucket is called "fat", and
  Kimi is "don't waste on vanity". So Grok Lands have headroom, and the Kimi/Claude
  pool is the tighter one. If Blaze meant *percent remaining*, the lane rules in
  §8 still hold, but the pack budget in §8.2 gets looser and the Land cap gets
  tighter.

---

## 0. Position in one paragraph

Both products are the **daily operating record of a small service business**,
and the order of work should follow the order in which the business reads its
own records, not the order of the pipeline diagram. ACS's day turns on one
question: **"Is every job tomorrow booked, crewed, addressed, and confirmed by
Caio?"** CVP's day turns on a different one: **"Which deliverable, for which
client, is waiting on whose decision?"** Today Madeline's Excel answers the CVP
question. Everything on the spine should either make one of those answers true
in the product or stay out of the way. That leads to four calls that disagree
with the draft spine. Deliverable status comes before the Projects home and shell nav,
because the home *reads* deliverables. ACS job-create reliability comes before
Dispatch, because Dispatch *reads* jobs. Invoicing binds to CCO OS instead of
being rebuilt in CVP. The nav master is a Bailey decision, not a P0 build.

---

## 1. How the two businesses actually run, day to day

### 1.1 Astro Cleanings (ACS)

A cleaning company earns money when a scheduled clean happens at the right
address, with the right crew, and gets closed out. Most revenue comes from
**existing and recurring clients** (unverified, but typical for residential and
light-commercial cleaning). New leads matter for growth. They are not where the
daily operation breaks.

| When | What happens | Record it reads or writes |
|---|---|---|
| Inbound, any time | Someone calls, texts, or fills out the site: new client, reschedule, complaint | Lead/inquiry, then **Client** |
| Office hours | Bailey (or office) books or changes a job: date, time, address, service, price | **Job/Booking** |
| Afternoon/evening | Tomorrow's jobs get crew; access notes checked (codes, pets, keys) | **Dispatch** (job × crew × time) |
| Evening / morning-of | Bailey confirms field reality with **Caio** over Continuity/FaceTime: who's going, what's changed, any problem homes | **Field truth** on the job |
| Day of | Crew cleans; Caio reports done, issues, photos, extra time | Job status → complete + notes |
| After | Mark complete, note issues, known paid/unpaid | **Close-out** |
| Weekly | Merge duplicate clients, retire dead leads, regenerate recurring jobs, crew roster current | **Roster hygiene** |

**The one ACS query:** *which jobs tomorrow are missing crew, address/access,
or Caio confirmation?* That's the ACS twin of the El Paso doctrine's "who films
tomorrow and has not signed?" If admin answers it correctly every evening, ACS
OS is doing its job. If Bailey has to reconstruct it from texts and memory, it
isn't, however nice the screens look.

**Operating constraints Bailey has set (not negotiable):**
- The phone rail is **Caio only**, over Continuity/FaceTime. Never Twilio, never Kyle.
- No unsolicited client or crew sends without Bailey's yes. So the system
  *prepares* messages and calls. It never fires them on its own.
- The live admin Land train on M4 must keep running. Every ACS change is a
  small Land with a proof pass (Clip), not a branch that sits.

### 1.2 Content Co-op / Co-VideoPro (CVP)

Content Co-op is a video production company. It earns money when a
**deliverable** (a cut, a cutdown, a social version, an event recap) that was
sold on a proposal gets **approved by the right client stakeholder** and
**delivered**, and then gets invoiced. A single client (and, at WEFTEC scale, a
single event) produces many deliverables with different stakeholders and
different due dates.

| When | What happens | Record it reads or writes |
|---|---|---|
| Sales | Inquiry → proposal/estimate (CCO OS today) → accepted | Estimate/proposal (CCO OS), handed off to CVP project |
| Pre-pro | Brief, script (Sandcastles today), shoot plan | Brief, script, plan items |
| Shoot | Crew captures; media ingests to CCNAS | Assets, V1 |
| Post | Editor cuts; each cut is a new **version** | Versions |
| Review | Client stakeholders comment on the film and approve or request changes (**Wipster today**) | Comments, approval rounds on an exact version |
| Tracking | **Madeline's Excel**: per client, per deliverable, what state, who we're waiting on, when due | *Nothing in product yet*, which is the gap |
| Delivery | Approved version locks, and the delivery package goes out | Deliverable + locked items |
| Money | Invoice against the proposal | CCO OS |

**The one CVP query:** *which deliverables, across all clients, are waiting on
a decision, and whose?* Madeline's spreadsheet exists because the product can't
answer that. Kill-Excel is north star #1 for a reason: it's the daily
coordination surface of the company.

**What the repo already has (so we stop re-building it):**
- `co_production.deliverables` exists: project, name, spec, source version,
  status `specced → encoding → qc → ready → delivered | expired`, QC checks,
  and a lock that *requires* approval evidence
  (`deliverables_delivered_requires_lock`, `approval_id`, immutable
  `deliverable_items`).
- Approval rounds are bound to exact versions as of 2026-09-22.
- Review admission is recipient-bound. Comments sit on the seek bar and are
  anchored as callouts.
- `commercial_handoff_fields` says in plain text: **"CCO OS remains the
  commercial authority."** CVP carries the estimate reference and frozen totals.
  It does not own money.

So the review-and-lock backbone mostly exists. The missing layer is the one
Madeline lives in: **per-deliverable, per-client status with owner, due date,
and "waiting on whom."**

---

## 2. What ACS OS is, end to end

One chain, left to right. Each object is read by the one after it.

```
Lead/inquiry ─▶ Client ─▶ Job/Booking ─▶ Dispatch ─▶ Field truth ─▶ Close-out ─▶ Roster hygiene
(any channel)   (enriched)  (First L. Service)  (crew×time)  (Caio loop)   (done/notes/paid)  (weekly)
```

| Object | Must carry | Who writes it | Status (per map) |
|---|---|---|---|
| Lead | channel, who, what they asked, date | Bailey/office | Unclear whether site inquiries land in admin **(unverified)** |
| Client | full name, phone, email, service address(es), access notes, preferred service | Bailey, enriched via Caio | Enrichment in progress, sequential; Amanda held until Lupe's fields |
| Job | client, service, date/time, address, price, recurrence, title `First L. Service` | Bailey | Create reliability still has open VA items |
| Dispatch | job × crew × arrival window | Bailey/Caio | ACS-VA-106 "Dispatch Loading" next |
| Field truth | confirmed-by-Caio timestamp, changes, issues | Bailey after Caio call (Ring) | Continuity path exists; not recorded on the job **(unverified)** |
| Close-out | complete, notes, extra time, paid/unpaid | Bailey | In the ideal chain, missing from the P1 list |
| Roster | dedupe, archive, crew current | Bailey | PR#5 delete/toasts in flight |

**ACS OS is "the book of tomorrow"** plus the history behind it. Admin chrome,
the public site, and the client/crew surfaces are views onto that book. They
are not the product.

## 3. What CVP is, end to end

```
Inquiry/Estimate (CCO OS) ─▶ Project ─▶ Brief ─▶ Script ─▶ Shoot ─▶ Asset/Version ─▶ Review/Approve ─▶ Deliverable status ─▶ Locked delivery ─▶ Invoice (CCO OS)
                                                                                     ▲                     │
                                                                                     └── revision round ◀──┘
```

The **Deliverable** is the spine object: it's what was sold, what gets reviewed
(through its current version), what gets approved, what locks, and what gets
invoiced. Projects are containers, and versions are evidence. Madeline tracks
deliverables, not projects and not versions.

The SoT triad maps onto the chain like this, and each source has a boundary:
- **Wistia** is the reference for the *stage*: how a film plays for a guest. It
  is not a hosting target, because CVP hosts on CCNAS already.
- **Wipster** is the reference for the *review ritual*: share mode, reviewers,
  "finish reviewing", and approve on a version. I read "leave Wipster hosting"
  as *new work stops going to Wipster, and existing Wipster archives stay
  there, unmigrated* (see §7).
- **Sandcastles** is the reference for the *scripting assistant* in the Brief →
  Script step. The packets already exist on `cursor/sandcastles-sot-scrape-7503`
  (SCA-001…013).

**CVP is "Madeline's board with the film attached."** The board is the
operating record, and the film is where decisions get made.

---

## 4. What Bailey wants, distilled into operating laws

1. **One operator, one voice.** Bailey talks to Blaze, and everything else is
   plumbing. Any design that makes Bailey open GitHub, read a PR, or triage a
   queue has failed.
2. **Phone-first means "answerable from a phone".** It doesn't mean
   phone-shaped screens. The test is whether Bailey can answer the day's
   question (§1.1, §1.2) from the phone in under a minute.
3. **Quiet.** Film- and ops-grade, with no SaaS clutter. Operationally, that
   means every visible control corresponds to a real action on a real record
   (the CVP D8/D10 honesty rules, applied to ACS as well).
4. **Humans own judgment. Agents own forms.** This is the El Paso doctrine:
   agents draft FORM artifacts (call lists, status rollups, script drafts, QC
   checks) and Bailey approves them. Nothing sends, calls, or approves on its
   own.
5. **Real people, real names.** Clients are people with full names and
   enriched contact details, not "Lead #4471". Jobs are titled
   `First L. Service`.
6. **Live Lands on real machines.** M4 runs ACS and M2 runs CVP. Work is
   finished when it runs there with a proof, not when a PR merges.
7. **Don't stop, and don't sprawl.** Keep moving down one spine, and never
   stall waiting for a perfect plan. Equally, never start a side quest because
   a lane is idle.

---

## 5. What "complete" means

"Complete" is a business test that can be run, not a feature count. I propose
one **Monday test** per product. Blaze or Clip/Cut runs it, and Bailey
signs it.

### ACS OS is complete when, for five consecutive working days:
1. Every job for tomorrow exists in admin by 6pm with client (full name),
   address, access notes, service, price, and crew.
2. The dispatch board flags every gap (no crew, no address/access, no Caio
   confirmation), and the flag list is empty by the time the day starts.
3. Every Caio confirmation is recorded on its job, with who confirmed and when.
4. Every completed job is closed out with notes and a known paid or unpaid
   state within 24h.
5. Nobody sent a client or crew message that Bailey didn't approve, and there
   was no Twilio and no Kyle.
6. Bailey never opened a spreadsheet or scrolled texts to answer "what's
   tomorrow?"

### CVP is complete when, for one full client cycle:
1. Madeline runs a week **without the Excel sheet**: every deliverable she
   tracks is a row in CVP with client, stakeholder(s), due date, current
   version, review/approval state, and who it's waiting on.
2. A client stakeholder reviews and approves a cut **on their phone in CVP**
   (tap the film, comment, finish reviewing, approve), and no Wipster link is
   sent for new work.
3. That approval locks the exact version into the deliverable, and the
   delivery goes out from CVP.
4. The locked deliverable shows up in CCO OS as invoice-ready against its
   estimate line, with no retyping.
5. At least one Brief → Script step on a real project used the in-product
   assistant with provenance-bound output.

Multi-stakeholder event orchestration (WEFTEC) is **not** in the first
"complete". It's the second milestone, and it's cheap later only if the
deliverable object carries stakeholders from day one (§6.2, item P1a).

---

## 6. Ranked priorities, upstream → downstream

**How I define "upstream":** the object *other work reads from*. Build the
thing that is read before the thing that reads it. That's usually, but not
always, the pipeline order. Where the two disagree, the read-dependency wins.

### 6.1 ACS

| Tier | Item | Why here |
|---|---|---|
| **P0** | Land PR#5 (roster delete/toasts) → Clip proof | In flight. Finishing it is cheaper than re-contexting it later. |
| **P1a** | **Job create/booking persists, every time**, titled `First L. Service` from the client's full name (the remaining "quiet roster / job create reliability" VA items) | Dispatch reads jobs. A dispatch board over jobs that sometimes don't save is a board of lies. Moved **ahead of** VA-106. |
| **P1b** | **ACS-VA-106 Dispatch Loading**, the tomorrow board: jobs × crew × window × gaps flagged | This is the one ACS query. It's the highest-value screen in ACS, and it only needs P1a to be true. |
| **P1c** | **Field-truth record + Caio confirm routine**: the board produces tonight's Caio call list, Ring places the Continuity call (with Bailey's yes, or as a pre-approved routine), and the answer is written onto each job | This closes the loop between admin and the field. Without it, "confirmed" lives only in Bailey's head. |
| **P1d** | **Client enrich, sequential via Caio.** The minimum (full name, phone, service address) is part of P1a. Deeper enrichment is a data routine, not a Land. Amanda stays held until Lupe's fields arrive. | Titles and dispatch need the minimum. Deep enrichment doesn't block anything, so it shouldn't consume Land slots. |
| **P2** | **Close-out**: complete, notes, extra time, paid/unpaid. Plus a weekly roster hygiene routine (dedupe, archive, recurring regenerate if ACS runs recurring jobs **(unverified)**). | Downstream of field truth. It matters for money and history, not for tomorrow. |
| **P2** | Public-site / text inquiries land as a **Lead record** in admin, with no auto-reply | Upstream in the pipeline, but not the current operating bottleneck. Leads already reach Bailey by phone. |
| **P3** | Phone CS bot, **design only, not live**, gated on the Continuity rail being solid and Bailey's yes | This one has the highest risk of an unsolicited send, and it saves the least time right now. |

### 6.2 CVP

| Tier | Item | Why here |
|---|---|---|
| **P0** | Finish `bc-ec6df537`: Wipster-style tap-comment on the film, kill the under-deck, quiet surround. Guards: live player tip `46a256f2`, `compress:false`, guest film-first. | In flight. It's the client-facing half of the review ritual. |
| **P1a** | **Deliverable contract (design, Council gate).** Extend the existing `co_production.deliverables` rather than inventing a new object. Add: client stakeholder(s), due date, internal owner, derived review/approval state from the current version's round, "waiting on", and a reference to the CCO estimate line. The columns come from Madeline's actual sheet. | This is upstream of status, the home, and invoicing, and it's cheap: design plus one Kimi pack. It runs *during* the P0s without taking a Land slot. Stakeholders on the row now are what make WEFTEC cheap later. |
| **P1b** | **Review ritual = Wipster share modes** (Review / Approve / Preview), reviewers, "finish reviewing", approve writes to the exact version (the backend is already version-bound) | This produces the approval state that deliverable status reads. |
| **P1c** | **Deliverable status Land (kill Excel)**: a per-client, per-deliverable board with state derived from real versions, rounds, and locks. Madeline's view. | North star #1 and the CVP one-query. Moved **ahead of** the Projects home. |
| **P1d** | **Projects home + shell nav Land.** The home *is* "deliverables waiting on a decision". It follows the nav master Bailey picks. | The home reads P1c. Building the shell first means building it twice. |
| **P2a** | **Commercial binding with CCO OS**: deliverable ↔ estimate line, and locked delivery emits invoice-ready to CCO OS | North star #4, done the way the repo already decided: CCO OS owns money, and CVP owns the object and the evidence. "Same job objects" means **same IDs across the seam**, not a second invoicing system. |
| **P2b** | **Creative AI v1 inside the pipeline**: SCA-001 (five-step spine), SCA-002 (modes), SCA-006 (editor) in the Brief → Script step, provenance-bound, on one real project | North star #3, El Paso pattern: an agent drafts FORM and Bailey approves. It sits after status because it needs a real project/brief record to be "inside" rather than "bolted on". |
| **P3** | **Multi-client, multi-stakeholder event orchestration (WEFTEC)**: per-deliverable approver sets and an event-level rollup across clients | North star #5. Most of its cost is in the data shape, which P1a pays for early. The orchestration UI waits. |

### 6.3 Where I disagree with the draft spine (deltas for peers to attack)

| # | Draft spine says | I say | Reason |
|---|---|---|---|
| D1 | Council nav masters = **P0** | Make it a **Bailey decision gate** before P1d, with no new mock variants | Two phone-nav mocks already exist (`cursor/opus55-mobile-nav-mock-5668`, `cursor/fable-mobile-nav-mock-0b48`). What's missing is a pick, not a build. |
| D2 | Projects home + shell nav (#5) **before** per-deliverable status (#6) | Status **before** home | The home reads deliverables. |
| D3 | Deliverable status is one item | Split it into a **contract (design, now)** and a **Land (after review ritual)** | The design is cheap and on the critical path. It shouldn't wait for a Land slot. |
| D4 | VA-106 Dispatch (#9) **before** job-create reliability (#11) | Job-create **before** Dispatch | Dispatch reads jobs. |
| D5 | Client enrich (#10) is a P1 build item | Split it: the name/phone/address minimum rides P1a, and deep enrichment is a Ring/Blaze data routine | It doesn't block the day, so it shouldn't burn Lands. |
| D6 | Proposals/invoice "on same job objects" (#8) | **Bind to CCO OS**; don't build invoicing in CVP | Repo migration already names CCO OS the commercial authority. |
| D7 | Sandcastles after review P0s (#7) | After **deliverable status** (P2b) | The AI needs a real record to live inside. The packets are ready, so it's cheap to start when its turn comes. |
| D8 | ACS close-out not on the P1/P2 list | Add it explicitly at **P2** | It's in Bailey's ideal chain, and money and history live there. |

---

## 7. Defer list (each with a re-entry trigger)

| Deferred | Re-enters when |
|---|---|
| More nav mock variants (phone or desktop) | Never, unless Bailey rejects both existing masters |
| Wipster archive migration | Only if a client asks for an old review thread in CVP |
| ACS phone CS bot going **live** | Continuity rail proven for 2 weeks and Bailey says yes |
| Anything Twilio, or Kyle on the phone rail | Never |
| Building payments/invoicing inside CVP or ACS | Never for CVP (CCO OS owns it). For ACS, only if the current paid/unpaid method fails the Monday test. |
| CVP demo-only surfaces (whiteboard P25, request center P27, reports P28) | They stay labeled demo. Promote one only if a Monday-test step needs it. |
| WEFTEC orchestration UI | After CVP "complete". Schema hooks ride P1a. |
| El Paso production entities (call sheets, releases chase list) | The next booked shoot with a signed-release requirement. The doctrine stands, but the forcing shoot has passed. |
| Public astrocleanings.com / contentco-op.com refreshes | After each product's Monday test passes |
| New market teardowns or competitive research packs | Only when a specific spine item names the question |

---

## 8. Credit-aware sequencing

### 8.1 Three lanes, one rule each

| Lane | Bucket | Rule |
|---|---|---|
| **Grok 4.7 Lands** (Forge, Reel, and their proof seats) | Cursor Models, headroom | **All product code, and only product code.** At most **one open Land per product train** (one ACS, one CVP) plus its proof pass. The July STATUS log shows what happens with concurrent sessions on one tree: cross-lane commits and "failure from the other session". |
| **Kimi packs** (Frame, Scout) | Other Models, tighter | **Just-in-time only**: one pack per spine item, written at most **one item ahead** of the Land that consumes it. Every pack names the spine item it unblocks. A pack with no consumer is vanity. |
| **Council** (Fable / Opus / Grok) | Mixed | **Only at named gates** (§8.3). The Council doesn't review PRs. Clip and Cut do. |

The scarcest resource isn't a credit bucket. It's **Bailey's attention**.
Every spine item lists the Bailey yes it needs, and Blaze batches those asks
(§8.4).

### 8.2 Budget shape for the next march (not a calendar)

- **Grok Lands:** the 15-item spine needs about 11 Lands (items that are pure
  design or data routines don't Land). Two trains run in parallel, so the
  critical path is about 6 Lands deep on each train.
- **Kimi packs:** about 5 packs total. (1) Madeline's sheet → deliverable
  column map. (2) Wipster review ritual teardown, if the existing Frame briefs
  don't already cover it. (3) The CCO OS ↔ CVP seam map (which estimate fields
  exist and which IDs cross). (4) WEFTEC stakeholder pattern, later.
  (5) ACS dispatch-board field list from the live admin, if Forge needs it.
  Sandcastles is already packed.
- **Council:** 4 gates, each a single round.

### 8.3 Council gates (the only times this body meets)

| Gate | Decides | Before |
|---|---|---|
| **C1** | Deliverable contract: fields, derivations, what "waiting on" means | CVP P1c Land |
| **C2** | ACS field-truth record: what a Caio confirmation writes and which state it moves | ACS P1c Land |
| **C3** | CCO OS ↔ CVP commercial seam | CVP P2a Land |
| **C4** | WEFTEC shape (per-deliverable approver sets, event rollup) | CVP P3 |

### 8.4 Bailey asks, batched into one phone message now

These are all decisions he can make today. Asking now keeps them from blocking
work later:
1. **Share Madeline's current sheet**, or a screenshot of its columns. This is
   needed for C1.
2. **Pick the nav master**: Opus or Fable phone nav (both exist as mocks).
   This is needed before CVP P1d.
3. **Approve a routine Caio confirm call** (for example, every evening Ring
   places one Continuity call to Caio for tomorrow's board). This lets P1c run
   without a per-night yes.
4. **Confirm the reading of "leave Wipster hosting"**: new work goes to CVP,
   and old archives stay on Wipster.

### 8.5 "Don't stop": the pull rule and the only stop conditions

- **Pull rule:** when a Land waits on Bailey or a gate, its train pulls the
  **next unblocked spine item on the same train**. It never starts a new idea.
  If nothing on the train is unblocked, the seat writes the next item's pack
  or proof script instead of starting code.
- **Stop conditions (halt the train and tell Blaze):** the live admin Land
  train on M4 is broken; the Caio Continuity path is broken; any change could
  send a client or crew message without Bailey's yes; the CVP live player tip
  `46a256f2` regresses; `compress:false` is lost; or the guest film-first view
  breaks.

---

## 9. What would change my mind

- **Recurring jobs.** If ACS jobs are mostly one-offs, recurrence drops out of
  P2 and lead intake moves up to P1.
- **Madeline's sheet tracks money.** If her sheet tracks invoiced/paid as a
  core column, the CCO seam (P2a) moves up next to P1c, because the Excel
  sheet can't die without it.
- **Wipster-bound clients.** If a live client is contractually on Wipster
  review this quarter, the review ritual (P1b) moves ahead of the deliverable
  contract.
- **Credit reading inverted.** If the percentages are *remaining*, cap Grok to
  one Land in flight across *both* trains, and let Kimi carry more of the
  proof-script writing.

---

## 10. Rebuttals — peer positions (Blaze pastes below)

> Blaze: paste each peer's DEBATE.md section verbatim between the markers, then
> fill one row per contested claim. Keep each verdict to one line. Concede where
> a peer has ACS facts I don't have.

### 10.1 Fable

<!-- BEGIN FABLE PASTE -->

_(paste Fable DEBATE.md here)_

<!-- END FABLE PASTE -->

### 10.2 Grok 4.7

<!-- BEGIN GROK 4.7 PASTE -->

_(paste Grok 4.7 DEBATE.md here)_

<!-- END GROK 4.7 PASTE -->

### 10.3 Contested claims

| # | Seat | Peer claim (one line) | Opus response (one line) | Verdict: concede / hold / merge | Spine impact (item #, move) |
|---|---|---|---|---|---|
| R1 | Fable | | | | |
| R2 | Fable | | | | |
| R3 | Grok 4.7 | | | | |
| R4 | Grok 4.7 | | | | |
| R5 | | | | | |

### 10.4 Delta check (my §6.3 deltas vs peers)

| Delta | Opus | Fable | Grok 4.7 | Forged |
|---|---|---|---|---|
| D1 nav master = Bailey gate, not P0 | hold | | | |
| D2 deliverable status before Projects home | hold | | | |
| D3 split deliverable contract (design now) from Land | hold | | | |
| D4 ACS job-create before VA-106 | hold | | | |
| D5 split client enrich: minimum vs routine | hold | | | |
| D6 invoicing binds to CCO OS | hold | | | |
| D7 Sandcastles after deliverable status | merge-able | | | |
| D8 ACS close-out explicit at P2 | hold | | | |

### 10.5 Unresolved: needs Bailey

| # | Question | Options | Council lean |
|---|---|---|---|
| B1 | | | |
| B2 | | | |

### 10.6 Forged result

Once the rebuttals settle, Blaze edits
[`MASTER_SPINE_DRAFT.md`](./MASTER_SPINE_DRAFT.md) in place, marks each moved
item `(forged: <seat> R#)`, and renames the file `MASTER_SPINE.md` as the single
spine.
