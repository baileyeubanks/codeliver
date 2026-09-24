# Council DEBATE — seat Opus 5.5 (revision 3)

**For:** Bailey, via Blaze · **Council:** Fable / Opus 5.5 / Grok 4.7
**Input:**
- `COMMAND_MAP_ACS_CVP_20260923`
- Blaze's full-system ground truth (2026-09-24)
- Fable `cursor/council-priority-fable-076b` @ `0ead4ef`
- Grok 4.7 `cursor/council-priority-spine-46d8` @ `5703be8`

**Mode:** design and strategy only. Nothing here lands product code.
**Companion:** [`MASTER_SPINE_DRAFT.md`](./MASTER_SPINE_DRAFT.md), revision 3.

## Ground truth this revision is built on (Blaze)

**One Commander, two sibling businesses.** Visual and workflow go hand in
hand, and a Land counts only with proof on the live train.

- **ACS OS.** Surfaces: admin, clients, crew, public. Flow: lead → real
  enriched client → job `First L. Service` → dispatch → Caio-only Continuity
  (never Twilio, never Kyle) → complete/roster. Quiet admin.
- **CVP.** Surfaces: co-videopro, client.contentco-op, admin OS, marketing.
  - **Sources of truth:** Wistia, Wipster, Sandcastles.
  - **North star:** kill Excel; native Wipster review; AI inside
    Brief → Shoot → Cut → Delivery; proposals/invoice on jobs; WEFTEC
    multi-stakeholder.
  - **Chrome:** Login → Projects; tap-film comment with no under-deck; phone
    nav is bottom + drawer; desktop is a thin left column; sapphire logo.
- **Live PASS:** mobile overlay ~6% and sapphire logo on `46a256f2`; quiet
  auth door. The ACS delete tip `c58816e4` is live and waiting on its
  Latch→Clip proof (reported by Grok).

## Change log (who was right, what moved)

The burden of proof is on *keeping* my draft. Every change names the
operating reason.

| Rev | Peer | Their operating point | What I changed |
|---|---|---|---|
| 2 | Fable + Grok | VA-106 is the morning failure that actually happens; job-create is part of its proof, not a Land in front of it | Job-create row dropped; it's VA-106's proof |
| 2 | Grok | "A share-mode Land that ignores the master will be rebuilt" | Nav master is P0 Council work; it must place Review/Approve/Preview (and, my extension, the home) |
| 2 | Grok | Madeline's columns for **one** client | Pack scoped to one live client |
| 2 | Grok | Share-mode "finish" writes a real status | Share modes are the first Excel-killing write |
| 2 | Grok + Fable | First AI = QC against the approved brief in a real round, plus versioning vs brief | Merged into one row |
| **3** | **Grok** | Delete tip `c58816e4` is live; ACS-01 is Latch→Clip **proof**, not code | Row #2 is a proof gate. VA-106 starts the moment proof passes. |
| **3** | **Grok (Blaze brief)** | "Grok Lands are the fat builder. Don't stop. Kimi packs stay careful." | **Reverted my rev-2 credit concession.** Blaze's map says "Fat Cursor bucket". The march keeps going past VA-106, and Kimi does one pack at a time. |
| **3** | **Fable** | Surface ledger: every spine item carries a PASS/OPEN surface outcome, and a Land whose workflow works but whose surface is OPEN is half-Landed | Adopted the ledger. Every row now has a surface proof, and "done" needs both halves. |
| **3** | **Fable** | "Projects home and Deliverable status may Land as one slice" | Merged into one CVP slice with two proofs, and it closes the nav ledger row. With Grok fat, it moves up to P1. |
| **3** | **Fable** | Surface specifics: close-out in ≤3 taps; version diff in the review rail, not a new screen; proposal/invoice as cockpit sections; Sandcastles as named artifacts in the drawer | Adopted as the surface half of those rows |
| **3** | **Fable** | Public booking → Client + Job persists (P2) | Added on the ACS train after close-out. Bailey's intent says "booking that persists". |
| 3 | (me, modifying Fable) | Fable: "No Grok Land without a Kimi pack" | **Modified:** no Land without its *inputs*. Kimi packs only information the repo can't give Grok (Madeline's sheet, the VA-106 failure report, the CCO seam). Grok reads the repo and the Sept commits in its own preflight. The reason: Kimi is careful, so packs that restate the repo burn the careful pool. |

**Still held, with evidence (§10):**
- Invoicing: CCO OS stays the money authority, but the money now *shows on
  the CVP job*.
- Field truth: a minimal record on the job, not a full en-route/on-site state
  machine.

### Evidence boundary

- **CVP.** Claims are checked against `main` @ `5da6aed` (Sept commits and
  migrations). July `STATUS.md` and `BLOCKERS.md` are stale.
- **ACS.** ACS code isn't in this workspace. ACS facts come from Blaze and the
  peers, and are marked **(unverified)** where I infer.
- **Caio's number.** It lives in Blaze's ground truth. Spine files name the
  rail, not the number.

---

## 0. Position in one paragraph

Both products are the **daily operating record of a small service business**,
and every spine row funds **a workflow and its surface in the same Land**.
ACS's day turns on *"is every job tomorrow booked, crewed, addressed, and
confirmed by Caio?"* CVP's day turns on *"which deliverable, for which client,
is waiting on whose decision?"*

The open order is Bailey's, and all three seats agree:
- **CVP:** tap-comment + surround → nav master (Council) → share modes
  that write a real status → deliverable status + Projects home on the picked
  nav.
- **ACS:** delete proof → VA-106 → Caio-confirmed on the dispatch row →
  close-out → public booking that persists.

Grok is the fat builder, so the march doesn't stop. Kimi is careful, so it
packs only what the repo can't tell Grok.

---

## 1. How the two businesses run, day to day

### 1.1 Astro Cleanings (ACS)

A cleaning company earns money when a scheduled clean happens at the right
address, with the right crew, and gets closed out. Most revenue is existing
and recurring clients **(unverified, and all seats assume it)**.

| When | What happens | Surface | Record |
|---|---|---|---|
| Inbound | New client, reschedule, complaint by phone, text, or site | Public booking → admin client row | Lead → **Client** (real person, enriched) |
| Office hours | Bailey books or changes a job | Job create on phone | **Job** `First L. Service` |
| Evening, about 6pm | Tomorrow's jobs get crew; access notes checked | **Dispatch board**, one-handed on phone | Job × crew × window |
| Evening / morning-of | Bailey confirms with **Caio** on Continuity/FaceTime | "Caio confirmed · time" chip | **Field truth** on the job |
| Day of | Crew cleans; Caio reports done or an issue | Job chip | done / issue + note |
| After | Close out | ≤3 taps on phone | notes, extra time, paid/unpaid |
| Weekly | Dedupe, archive, crew current | Roster with truthful toasts | Roster hygiene |

**The one ACS query:** *which jobs tomorrow are missing crew, address/access,
or Caio's confirmation?*

**Quiet admin** means reliable at 6:30am on a phone: no dead "Loading", no
toast storms, and no modal traps (Fable). It's a surface PASS *and* a
reliability property.

### 1.2 Content Co-op / Co-VideoPro (CVP)

CVP earns money when a **deliverable** sold on a proposal is **approved on an
exact version by the right stakeholder**, **delivered**, and **invoiced**.

| When | What happens | Surface | Record |
|---|---|---|---|
| Sales | Inquiry → estimate → accepted | CCO OS; shown on the CVP job | Estimate (CCO OS) → CVP project via handoff |
| Pre-pro | Brief, script | Brief step | Brief |
| Post | Each cut is a version | Project → asset | Version |
| Review | A guest on a phone taps the film, comments, and finishes | Thin on-film player + share mode | Comment on version+time; approval round on version |
| Tracking | "Who are we waiting on?" | **Madeline's Excel today** | No record in product yet |
| Delivery | Approved version locks and ships | Deliverable | Locked deliverable + items |
| Money | Invoice against the estimate | Invoice state on the CVP job | CCO OS |

**The one CVP query:** *which deliverables, across all clients, are waiting on
a decision, and whose?*

**Already in the repo (don't re-buy it):**
- `co_production.deliverables`, with a delivery lock that requires approval
  evidence.
- Version-bound approval rounds.
- Comments on the seek bar.
- Recipient-bound review admission.
- The CCO OS commercial handoff, whose migration says "CCO OS remains the
  commercial authority". CVP has no proposals API.

**Still missing:**
- `share_intent` is derived, so Review/Approve/Preview isn't a stored posture.
- Per-client deliverable status.

---

## 2. What ACS OS is, end to end

```
Lead ─▶ Client (real, enriched) ─▶ Job (First L. Service) ─▶ Dispatch ─▶ Field truth (Caio) ─▶ Close-out ─▶ Roster
```

**ACS OS is "the book of tomorrow"** plus its history. Admin, client, crew,
and public surfaces are doors onto that one book.

## 3. What CVP is, end to end

```
Estimate (CCO OS) ─▶ Project ─▶ Brief ─▶ Shoot ─▶ Version ─▶ Review (share mode) ─▶ Deliverable status ─▶ Locked delivery ─▶ Invoice (CCO OS, shown on job)
                                                   ▲                                        │
                                                   └──────────── revision round ◀───────────┘
```

**CVP is "Madeline's board with the film attached."** The deliverable is the
spine object. What each source-of-truth tool governs:
- **Wistia** governs the stage, and it already passes.
- **Wipster** governs the review ritual. New work moves to CVP.
- **Sandcastles** governs Brief → Script, later.

---

## 4. What Bailey wants: operating laws

1. **One Commander, one voice.** Bailey talks to Blaze. Nothing makes him read
   a PR.
2. **Answerable from the phone in under a minute**, for both one-queries.
3. **Visual and OS are one Land.** A write nobody can see, or a screen with no
   write, is half-Landed. Passed surfaces stay passed.
4. **Quiet is honesty plus reliability.** Every control is real, and nothing
   shows a dead state.
5. **Agents draft forms. Humans judge.** Nothing sends, calls, or approves on
   its own.
6. **Real people, real names.** `First L. Service`, full names, enriched
   contacts.
7. **Live with proof,** on M4 or M2.
8. **Don't stop, and don't sprawl.**

---

## 5. What "complete" means

### 5.1 Surface ledger (Fable's scoreboard, adopted)

| Surface outcome | State | Closed by spine # |
|---|---|---|
| Player: thin on-film, tip `46a256f2`, mobile overlay ~6% | **PASS**, hold | gate on every CVP Land |
| Logo: sapphire blue-long transparent mark | **PASS**, hold | gate on every CVP Land |
| Auth door quiet | **PASS**, hold | gate on every Land |
| Tap-comment: click-film dialog, under-deck gone, quiet surround | **OPEN** | #1 |
| Nav master: phone bottom pipeline + drawer, desktop thin left, Login → Projects | **OPEN** | #3 (pick) → #8 (Land) |
| Share modes: Review/Approve/Preview visible *and* stored | **OPEN** | #6 |
| ACS quiet admin: roster, dispatch, job create, field chips | **OPEN** | #2 → #4 → #7 |

### 5.2 ACS: five consecutive working days where
1. Every job for tomorrow is in admin by 6pm, `First L. Service`, with
   address, access, service, price, and crew, and it survives a refresh.
2. Dispatch loads one-handed on the phone with no dead state, flags every gap,
   and the gap list is empty by morning.
3. Every Caio confirmation is on its job, with who confirmed and when.
4. Every completed job is closed out in ≤3 taps within 24h, with notes and a
   paid/unpaid state.
5. A public booking lands as a real client + job in admin, with no auto-reply.
6. No unapproved send, no Twilio, no Kyle. The ACS quiet ledger row is PASS.

### 5.3 CVP: one full client cycle where
1. A guest taps the film on a phone and the comment sticks to version + time.
   The ledger's tap-comment row is PASS, and the overlay and logo are
   untouched.
2. The guest reviews in a stored share mode, finishes, and approves the exact
   version, with no Wipster link for new work.
3. Madeline runs a week **without Excel**, reading the Projects home on the
   picked nav. The nav ledger row is PASS.
4. The approval locks the exact version into the deliverable, and delivery
   goes out from CVP.
5. The job shows invoice-ready, then invoiced, with the money state coming
   from CCO OS against the estimate line and no retyping.

WEFTEC and a Sandcastles Land are the next march, not this "complete".

---

## 6. Ranked priorities (forged)

Every row carries a workflow half and a surface half. See
`MASTER_SPINE_DRAFT.md` for seats and gates.

### 6.1 ACS train

| Tier | Item | Workflow half | Surface half |
|---|---|---|---|
| **P0** | Delete tip `c58816e4`: Latch→Clip **proof** (code only if proof fails) | Row gone after refresh; nothing sent | Toast matches; ACS quiet on roster |
| **P1** | **VA-106 Dispatch Loading** | Crew assignment persists; the job it reads persisted as `First L. Service` (a create bug found here gets fixed here) | Loads one-handed on phone, no dead state, gaps flagged |
| **P1** | **Caio confirmed on the dispatch row** | confirmed_by / at / changes; done / issue at day end | Chip legible in a van; no modal |
| **P2** | **Close-out** | complete, notes, extra time, paid/unpaid; no send | ≤3 taps on phone |
| **P2** | Client enrich, sequential via Caio; Amanda held until Lupe's fields | Code only if a Lupe field blocks save | Roster row fields |
| **P2** | **Public booking persists** → Client + Job | Lead lands as a real client + job; no auto-reply | Quiet, phone-first booking form; visible in admin |
| **HOLD** | Phone CS bot (draft-only design, never live without Bailey), roster automation | — | — |

### 6.2 CVP train

| Tier | Item | Workflow half | Surface half |
|---|---|---|---|
| **P0** | `bc-ec6df537` tap-comment + surround (the open Grok Land) | Comment on exact version + time | Click-film dialog, under-deck gone, quiet surround; PASS rows held |
| **P0** | **Nav master** (Council, one master forged from the Opus + Fable mocks) | — | Places Review/Approve/Preview **and** the "waiting on whom" home; Bailey picks |
| **P1** | Madeline's columns for one live client → map onto `deliverables` (Kimi, then stop) | Field map incl. a stakeholder field | — |
| **P1** | **Share modes** on the picked nav | Durable posture; finish writes that client's review state on the version | Three modes visible; approve is a deliberate act; film first |
| **P1** | **Deliverable status + Projects home** on the picked nav: one slice, two proofs | Status derived from versions, rounds, and locks; never hand-typed | Status strip in the cockpit, then home = "waiting on whom"; nav ledger row → PASS |
| **P2** | **Money on the job** | CCO OS stays authority: deliverable ↔ estimate line; locked delivery emits invoice-ready; invoice state reads back | Proposal + invoice state as cockpit sections on the CVP job (Fable) |
| **P2** | **Version vs brief + QC FORM draft** | QC checklist vs approved brief; chase list on the open round; operator accepts | Diff and checklist in the review rail, not a new screen |
| **P3** | Sandcastles seam pack (read set: brief + version + open comments) | Pack only | Named artifacts in the drawer, not chat |
| **HOLD** | WEFTEC UI (stakeholder field rides the column map), Wipster archive migration, overlay/logo/auth redo, drawing suite, NLE, migrations without Bailey | — | — |

---

## 7. Defer list (with re-entry triggers)

| Deferred | Re-enters when |
|---|---|
| Redoing overlay, logo, or auth | Only on a live regression |
| Nav variants after the pick | Only if Bailey rejects the master |
| Separate ACS job-create Land | Only if VA-106 shows the bug is in create |
| New code on the ACS delete | Only if Latch→Clip proof fails |
| En-route / on-site live job states | Only once someone other than Bailey can write them from the field without a new rail |
| Proposals/invoicing as a CVP-owned money system | Never. CCO OS owns money, and CVP shows it. |
| Sandcastles Land | After one real round finishes in CVP and the pack exists |
| WEFTEC orchestration UI | After CVP "complete" |
| Phone CS bot live; Twilio; Kyle on the rail | Bot: Continuity proven + Bailey yes. Twilio/Kyle: never. |
| Wipster archive migration | Only if a client asks for an old thread |
| Separate Kimi reality refresh of July STATUS/BLOCKERS | Folded into each Grok Land's own preflight |
| Migration application | Bailey gate only |

---

## 8. Credit-aware sequencing (revision 3)

### 8.1 Lanes

| Lane | Reading | Rule |
|---|---|---|
| **Grok 4.7 Lands** | **Fat builder. Don't stop.** (Blaze: "Fat Cursor bucket ~11%, main builder") | Product code with a surface proof. **One open Land per train.** When a Land proves, the train pulls the next row immediately. No Lands on PASS surfaces. |
| **Kimi packs** | **Careful** ("still burn for packs; don't waste on vanity") | **One pack at a time**, and only for information the repo can't give Grok: Madeline's sheet, the VA-106 failure report, the CCO seam. |
| **Council** | Mixed | Nav master now. Two small gates later: the field-truth record and the CCO seam. |

### 8.2 The march (no cycle stop)

| Order | CVP train (Reel/Cut) | ACS train (Forge/Clip) | Kimi (one at a time) | Council |
|---|---|---|---|---|
| 1 | #1 tap-comment + surround | #2 delete proof (Latch→Clip) | #5 Madeline's columns, one client | #3 nav master |
| 2 | #6 share modes (after #1 proof, #3 pick, #5) | #4 VA-106 | VA-106 failure note, if Forge lacks one | field-truth record (small) |
| 3 | #8 status + home | #7 Caio confirmed | CCO seam audit | CCO seam |
| 4 | #11 money on the job | #9 close-out | — | — |
| 5 | #12 version vs brief + QC | #13 public booking | Sandcastles seam (#14) | — |

### 8.3 Bailey asks (one message)

1. Pick the nav master when Council posts it.
2. Share Madeline's sheet for one live client.
3. B1: should Caio's confirmation be recorded on the job? Is there an existing
   evening routine?
4. Confirm that new work stops going to Wipster and the archives stay put.

### 8.4 Pull rule and stop conditions

- **Pull rule:** when a Land proves, the train pulls its next row. When a Land
  waits on Bailey, the train pulls the next unblocked row on the same train.
  No side quests.
- **Stop conditions:**
  - The live admin train on M4 breaks.
  - The Caio Continuity path breaks.
  - Any path could send without Bailey's yes.
  - `46a256f2`, the overlay, the logo, or the quiet auth door regress.
  - `compress:false` is lost, or guest film-first breaks.

---

## 9. What would still change my mind

- **Field truth.** If Caio's confirmations already land on the job through a
  routine, drop row #7.
- **Money in Madeline's sheet.** If her core column is money, row #11 moves up
  beside #8.
- **Job-create is the dispatch bug.** If VA-106 finds the failure in job
  create, the fix lands inside VA-106 (already the rule).
- **Share-mode schema.** If share modes need a migration to store the posture,
  a Bailey migration gate goes in front of #6.
- **Bucket reading.** If Blaze says the Grok bucket really is nearly empty,
  the march pauses after #4 and #6, and the other rows wait for the next
  cycle.

---

## 10. Rebuttals: reasoning with peers (round 2)

Peers were read directly from their branches. Blaze may paste full text into
the fences.

### 10.1 Fable

<!-- BEGIN FABLE PASTE -->

_(Source: `mocks/council-priority-fable/DEBATE.md` @ `0ead4ef`.)_
**Core claim:** "Upstream" means the object every step writes to. Businesses
run on rituals. Workflow and surface are one deliverable, carried by a
PASS/OPEN ledger. No Grok Land without a Kimi pack.

<!-- END FABLE PASTE -->

**Adopted as-is (Fable is right on operations):**

| # | Fable's point | Spine edit |
|---|---|---|
| F1 | VA-106 + job-create are one "tomorrow morning works" slice | #4 carries job persistence in its proof |
| F4 | Quiet = no dead loading, no toast storms, no modal traps, one-handed at 6:30am | Surface half of #2, #4, #7 |
| F10 | Surface ledger; a Land that leaves its surface OPEN is half-Landed | §5.1; every spine row has a surface proof |
| F11 | Home + status can Land as one slice | #8 merged; it closes the nav ledger row |
| F12 | Close-out ≤3 taps; diff in review rail; money as cockpit sections; Sandcastles as named artifacts in the drawer | Surface halves of #9, #12, #11, #14 |
| F13 | Public booking → Client + Job persists | #13 on the ACS train |

**Adopted with modification:**

| # | Fable's point | Modification (operating reason) | Spine edit |
|---|---|---|---|
| F2 | No Grok Land without a Kimi pack | Rule changed to "no Land without its *inputs*". Kimi is the careful pool (Blaze), so it packs only what the repo can't tell Grok. | §8.1 |
| F3 | Separate Kimi reality refresh of July STATUS/BLOCKERS | Folded into each Grok preflight. Grok is fat and reads the repo itself. | Row dropped |
| F5 | Caio loop as a full state machine (scheduled → en route → on-site → done/issue) | **Minimal version:** confirmed (evening) + done/issue (day end). With a Continuity-only rail, every "en route / on-site" tick is Bailey relaying a call by hand during the workday, and nothing reads those states yet. | #7 |

**Contested (operating reason only):**

| # | Fable's point | Consequence if we follow it | Evidence | Spine |
|---|---|---|---|---|
| F7 | "Promote existing demo-runtime proposal model to remote runtime" | Two places where a price can change, so the invoice disagrees with the estimate, and Bailey reconciles money by hand | Migration `20260812000000_commercial_handoff_fields.sql`: "Co-VideoPro never mutates them — CCO OS remains the commercial authority". No proposals API route in `app/api`. | #11 keeps CCO as authority **and** takes Fable's surface (money shown as cockpit sections on the job) |

**Surface ledger impact:** tap-comment (#1), nav (#3 → #8), share modes
(#6), and ACS quiet (#2 → #4 → #7) are all funded inside P0/P1.

### 10.2 Grok 4.7

<!-- BEGIN GROK 4.7 PASTE -->

_(Source: `mocks/council-priority-grok47/DEBATE.md` @ `5703be8`.)_
**Core claim:** The surface and the write are one funded item. Passed work
stays passed. Grok Lands are the fat builder, so don't stop; Kimi packs stay
careful. ACS-01 is proof on `c58816e4`, then VA-106. CVP runs tap-comment →
nav master → share modes.

<!-- END GROK 4.7 PASTE -->

**Adopted as-is:**

| # | Grok's point | Spine edit |
|---|---|---|
| G1 | A share-mode Land that ignores the master gets rebuilt | #3 before #6 |
| G2 | VA-106 next; job-create is a check | #4 |
| G3 | Madeline's columns for one client, then stop | #5 |
| G4 | Finish writes the status field | #6 |
| G6 | First AI = QC against the brief inside a real round | #12 |
| G8 | Migrations at a Bailey gate; don't reopen CCNAS, scan, or approval setup | Guards |
| G10 | Delete tip `c58816e4` is live; ACS-01 is proof, not code | #2 is a proof gate |
| G11 | Grok is the fat builder; Kimi careful | §8 reverted to this reading |

**Contested:**

| # | Grok's point | Consequence if we follow it | Spine |
|---|---|---|---|
| G5 | No field-truth row | "Not confirmed by Caio" can't show on the dispatch board, so the ACS one-query fails and confirmation lives in Bailey's head | #7 held, minimal. **Bailey B1.** |
| G12 | Projects home at P3, after status | With Grok fat, the nav master would stay a drawing for a long stretch, leaving the nav ledger row OPEN while status already exists to fill the home | #8 = status + home as one P1 slice |
| G7 | Proposal/invoice "on the same job" | Agree on the surface. Authority stays CCO OS. | #11 merged |

### 10.3 Where Fable and Grok disagree with each other (my rulings)

| Point | Fable | Grok | Operating consequence that decides it | Ruling |
|---|---|---|---|---|
| Credit reading | Grok scarce, Kimi abundant | Grok fat, Kimi careful | Blaze's own map: "Fat Cursor bucket, main builder" / "don't waste on vanity". Treating Grok as scarce would stall the march at VA-106, against "don't stop". | **Grok fat, Kimi careful** |
| Pack before every Land | Yes | Kimi one pack, then stop | With Kimi careful, packs that restate the repo burn the careful pool | **Inputs-only packs** |
| Caio loop | Full state machine, P1 | No row | Continuity-only rail means each live state is Bailey relaying a call by hand | **Minimal record, P1; Bailey B1** |
| Projects home | P1, after status | P3 | Nav ledger row stays OPEN otherwise | **P1, merged with status** |
| Proposals/invoice | Promote CVP demo model, P2 | Same job, P3 | Two money authorities vs one | **CCO authority, shown on job, P2** |
| Sandcastles | P2 Land later | Pack after KIMI-01, no Land | Kimi careful; needs a real finished round to read | **Pack at P3, no Land yet** |
| Public booking | P2 | Not listed | Bailey's intent: "booking that persists" | **P2, ACS train** |

### 10.4 Needs Bailey

| # | Question | Council lean |
|---|---|---|
| B1 | Should Caio's confirmation be recorded on the job (a chip on dispatch)? | Yes (Fable, Opus), no (Grok) |
| B2 | Does Madeline's sheet track money as a core column? | If yes, #11 moves up |
| B3 | Is there an existing evening Caio routine, or should we approve one? | Exists or approve |

### 10.5 Forged result

`MASTER_SPINE_DRAFT.md` revision 3 carries these rulings. Blaze renames it
`MASTER_SPINE.md` once Fable and Grok answer this round.
