# MASTER SPINE — draft from seat FABLE (rev. after Grok 4.7 + formal brief 2026-09-24 12:36 UTC)

One ordered backlog across ACS OS and CVP. 15 rows, upstream→downstream by **dependency**, interleaved by **cadence** (ACS daily, CVP per-project). Owner hints use the office seats from the command map. Lane: **G** Grok Land (~11% bucket) · **K** Kimi pack (~64%) · **C** Council · **B** Bailey pick.

Rules applied: no G without a preceding K pack · one open Land per product · alternate by slice · Kimi runs one slice ahead, every pack tied to a row · **every row carries a surface outcome that must PASS in the same Land as its workflow** · **every Land carries proof, including the negative** (guest path still plays; no send fired; crew not paged).

P-levels (adopted from Grok so the two spines read alike): **P0** in flight or the named next open step · **P1** this cycle or the next funded Land · **P2** after a review round can end and a job can dispatch · **P3** no owner on this bucket.

## Live trains (don't break; every Land preflights against these)

| Train | Tip | State |
|---|---|---|
| CVP (M2) | `46a256f2` — player, mobile overlay ~6%, sapphire logo | LIVE PASS — never re-fund |
| ACS admin (M4) | `c58816e4` — PR#5 roster delete | **LIVE, proof pending** — Latch proves → Clip |

## Visual surface ledger (Bailey's scoreboard)

| Surface | State | Closed by |
|---|---|---|
| Player — thin on-film, mobile overlay ~6%, tip `46a256f2` | **PASS** (hold, never re-fund) | gate on every CVP row |
| Logo — sapphire blue-long transparent mark | **PASS** (hold) | gate on every CVP row |
| Auth door quiet (`c9804e1`, `5da6aed`) | **PASS** (hold) | gate on every CVP row |
| Tap-comment — click-film dialog, under-deck killed, quiet surround | **OPEN** | #1 |
| Nav master — phone bottom pipeline + one drawer; desktop thin left; shows Login → Projects and where Review / Approve / Preview sit | **OPEN** | #3 (pick) → #10 (Land) |
| ACS quiet admin — VA sweep clean on roster (#2), dispatch (#4); crew list van-legible (#7) | **OPEN** | #2 → #4 → #7 |

## The spine

| # | ID | P | Product | Item (workflow half) | Done when (surface + state, with proof) | Owner seats | Lane | Depends on | This cycle? |
|---|---|---|---|---|---|---|---|---|---|
| 1 | CVP-01 | P0 | CVP | Finish tap-comment + kill under-deck + quiet surround (`bc-ec6df537`). Do not retouch overlay, logo, `compress:false`, or version-bound approval. | Guest on a phone taps the picture; the note sticks to that version and time; deck is gone; tip, overlay, logo, auth unchanged. **Ledger: tap-comment → PASS.** | Reel/Cut → Latch | G (in flight) | — | Yes |
| 2 | ACS-01 | P0 | ACS | PR#5 roster delete/toasts — **live on `c58816e4`**. Remaining work is **Latch proof, then Clip**; no further build unless proof fails. | Latch on live admin, phone: row is gone after refresh; toast matches the write; **no outbound message** to client or crew. Then Clip. **Ledger: ACS quiet (roster) → PASS on proof.** | Latch → Clip (Forge only if proof fails) | Proof (G only on failure) | — | Yes — proof now |
| 3 | COUNCIL-01 | P0 | CVP | Nav masters, mock only, ONE pick: phone bottom pipeline + one drawer (never left+bottom); desktop thin left; sapphire mark. | Drawing shows Login → Projects and where Review / Approve / Preview sit. Bailey confirms. No implementation branch. **Ledger: nav → picked.** | Fable/Opus/Grok → Blaze → Bailey | C → B | — | Yes (mock) |
| 4 | ACS-02 | P1 | ACS | **VA-106 dispatch loading, alone.** Kimi writes the failure note first (who, which job, phone/desktop, what the screen does instead of loading). | The `First L. Service` job loads for crew assignment on the phone; the assignment is still there after refresh; no dead loading state; **crew not paged.** **Ledger: ACS quiet (dispatch) → PASS.** | Forge/Clip; Frame note | K → G | #2 **proof** (not a merge) | Yes, as soon as #2 proves |
| 5 | KIMI-01 | P1 | CVP | **Madeline column harvest for one live client**: column, who changes it, what "done" means per column. **Starts now**, Kimi lane, parallel with #1/#2 — not queued behind VA-106. | Written list that names the status field #6 writes and #8 renders. No invented board. | Frame/Scout | K | — | Yes — now, in parallel |
| 6 | CVP-02 | P1 | CVP | Review shell = Wipster share modes on the picked nav: Review / Approve / Preview is the control the guest uses **and** the posture stored on the share (durable `share_intent`); **"finish reviewing" writes the status field from #5 onto that exact version.** | Round can end; status lands without anyone retyping; film first, thin controls, approve as a deliberate act; player/logo/auth PASS held; admission limits unchanged. | Reel/Cut/Latch; Frame pack drawn against #3 mocks | K → G | #1 **and** #3 picked | Only after 1 + 3; otherwise Grok lane is on #4 |
| 7 | ACS-06 | P1 | ACS | Caio confirm loop → Job state (scheduled → en route → on-site → done / issue) **+ crew today-list.** The rail stays voice/FaceTime at `+15048581959`; the write is a human tap on admin or crew after the call. | State chips on crew + admin; crew list legible in a van; no modals; **no send; rail untouched.** **Ledger: crew list → PASS.** | Forge + Ring (owns the rail) | K → G | #4 | No — next cycle |
| 8 | CVP-03 | P2 | CVP | Per-deliverable, per-client status for **that one client** on the existing project, columns from #5, status **derived** from #6's finish write. Minimal Deliverable contract packed by Frame. | Madeline does not retype that client's rows. Status reads as a strip on the existing cockpit; no new chrome ahead of the pick. D8: derived, never hand-typed. | Reel; Frame contract pack | K → G | #5, #6 | No |
| 9 | ACS-04 | P2 | ACS | Complete → notes a human can bill from → invoice state on the same Job. Client enrichment stays **Caio's human sequence**; Lupe fields enter the schema only when one blocks a save. **Amanda held.** | Close flow ≤3 taps on phone; note and invoice state on the Job; **no invoice send.** ACS quiet held. | Forge/Clip; Ring for Caio's order | K → G | #7 | No |
| 10 | CVP-04 | P2 | CVP | Projects home + shell nav Land from the picked master — **login lands on Projects**, every project shows its deliverable strip (#8). | Phone bottom pipeline + drawer, desktop thin left, logo PASS; no second nav; no left+bottom on phone. **Ledger: nav → PASS.** | Reel/Cut/Latch | G | #3 pick, #8 | No |
| 11 | ACS-03/07 | P2 | ACS | Job persistence: **job-create check** (title `First L. Service`, write survives refresh) — a check after #4, Landed only if a booking fails; then public astrocleanings.com booking → inquiry → Client+Job. | Booking persists into a Job with the title convention enforced at create; confirmation state visible on admin; **no auto-send.** | Forge/Clip; Frame pack | K → G (conditional) | #4 (check), #9 (booking) | No |
| 12 | CVP-07 | P2 | CVP | Versioning vs brief: version-N "changed vs previous / vs brief"; comment carry-over rule (R5). | Version switch inside the same thin player; diff in the review rail, not a new screen; exact-version binding preserved. | Reel; Frame pack | K → G | #6, #8 | No |
| 13 | CVP-05 | P2 | CVP | Proposal + invoice on the same job — promote the existing demo-runtime proposal model (Slice A) to the remote runtime; invoice state on Project/Deliverable. | A delivered job can hold a bill; **gate: one deliverable finished review and Bailey says bill.** Stripe stays server-only. Cockpit sections (D4), no finance app. | Reel; Scout audits `lib/covideopro` | K → G | #8; B | No |
| 14 | KIMI-02 / ACS-08 | P3 (Land) · K now | Both | **Sibling copilots, packs only.** Sandcastles seam: reads brief + version + open comments; first artifacts are **QC vs approved brief** and **chase list**, script scaffolds later. Copilot-in-ACS: enrichment drafts from Caio notes, close-note drafts, roster hygiene suggestions, CS reply drafts → quiet review queue, Bailey approves. | Operator accepts a named artifact. Neither chats, spends, or sends. Delivered through the drawer (#10) / admin queue idiom. | Frame/Scout (packs); Cut / Forge later | K after #5; G not this bucket | #6 real round (CVP); #7, #9 (ACS) | Pack only |
| 15 | HOLD | P3 | Both | WEFTEC · phone CS bot going live · Amanda enrich · Wipster hosting exit · player / overlay / logo / auth redo · drawing suite · transcript NLE · **migration application (Bailey gate)**. | Nobody starts these. | — | — | No |

## Cycle acceptance (this bucket)

The cycle closes when: #1 is on `46a256f2`'s train with proof · #2 is **proved by Latch on `c58816e4` and clipped** (row gone after refresh, toast true, nothing sent) · #3 is up for Bailey to pick · #4 is the next Forge Land, alone, started on #2's proof · #5 is a written list. #6 does not start before the pick. Overlay, logo, auth untouched. Nothing was sent.

Three lanes move at once ("don't stop"): **Grok** #1 → #4 → #6 · **Council** #3 now · **Kimi** #5 now + VA-106 failure note + share-mode pack against the #3 mocks.

## Dependency locks

- #4 starts when #2 is **proved** (Latch on live `c58816e4`), not merged — it is already live. It does not wait on a job-create rewrite (#11 is a check after it).
- #6 starts when #1 is done **and** Bailey has picked #3; it writes the field named in #5. If the pick is late, the Grok lane stays on ACS (#4, then #7 next cycle).
- #8 waits on #6. #10 waits on #3 and #8.
- #7 waits on #4; #9 waits on #7; #11's booking half waits on #9.
- #13 and #14 wait on a real finished review (#6).

## Kimi lookahead (so the 64% neither idles nor wanders)

| While Grok Lands | Kimi packs (each tied to a row) | Kimi audits / evidence |
|---|---|---|
| #1, #2 | #5 Madeline columns · #4 VA-106 failure note · #6 share-mode pack drawn against the #3 mocks | reality refresh seeded by Grok's Sept commit list; VA sweep of live ACS roster after #2 |
| #4 | #7 Caio-loop + crew-list pack (pending Bailey's "who taps" answer) · #8 minimal Deliverable contract | VA sweep of dispatch after #4; nav pick checklist |
| #6 | #9 close/notes/invoice-state pack · #10 Projects home Land checklist | post-#6 proof: a round ended and status landed |
| #7–#10 | #11, #12, #13 packs · #14 copilot seam packs | week-test / project-test evidence |

## Explicit merges vs the command map's draft

- Map #9 (VA-106) stands alone as **#4**; map #11 (job-create reliability VA) is now a **check** inside **#11**, after dispatch loads.
- Map #10 (client enrich / Amanda-Lupe) → human sequence inside **#9**; Amanda in HOLD.
- Map #8 (proposals/invoice · multi-stakeholder later) → **#13** (P2, gated) and **#15 HOLD** (WEFTEC).
- Map #12 (phone CS bot) → live bot in **#15 HOLD**; draft-only replies are one output of the copilot pack **#14**.

## Change log (Bailey's "take each other's advice" rule)

| Date | Peer | Peer's operating point | Spine edit | Ledger impact |
|---|---|---|---|---|
| 2026-09-24 | Blaze ground truth (not a peer) | Crew surface, Copilot-in-ACS intent, desktop thin left, Land with proof, Login → Projects, exact Continuity rail | #4 +crew list; #6 rail exact; #9 login→Projects + thin left; copilot P3→P2; Land definition +proof | nav row: desktop thin left; ACS quiet row: +crew list |
| 2026-09-24 | **Grok 4.7** (A1) | VA-106 must not be bundled with job-create; the morning failure is fixed sooner as a smaller Land | #4 unbundled; job-create → check in #11 | ACS quiet (dispatch) closes at #4 alone |
| 2026-09-24 | Grok 4.7 (A2) | Madeline's columns are the requirement for the status field | **#5 KIMI-01 added**, this cycle | — |
| 2026-09-24 | Grok 4.7 (A3) | Finish-reviewing is the moment the cell is retyped; one act, one write | #6 finish writes the #5 field; #8 shrinks to rendering it per deliverable for one client | — |
| 2026-09-24 | Grok 4.7 (A4) + Bailey lock (6) | Share modes built before the master are rebuilt on the 11% | #6 depends on #3 pick; Grok lane falls back to #4 | — |
| 2026-09-24 | Grok 4.7 (A5, A6) | Proof text with the negative (row gone after refresh, toast matches, no send; job loads, assignment sticks, crew not paged) | #2, #4 done-when replaced; Land definition +negative proof | — |
| 2026-09-24 | Grok 4.7 (A7) | Auth quiet is PASS; don't re-spend | ledger +Auth PASS row | +1 PASS row |
| 2026-09-24 | Grok 4.7 (A8) | Migration application is a Bailey gate | added to #15 HOLD and deferrals | — |
| 2026-09-24 | Grok 4.7 (A9) | El Paso is past; creative AI's first job is QC-vs-brief and chase list on a real round | #14 reframed; Sandcastles + ACS copilot merged as packs | — |
| 2026-09-24 | Grok 4.7 (M1) | Enrichment is human entry, not a Land; close/notes/invoice-state is | #9 split | — |
| 2026-09-24 | Grok 4.7 (M3) | Projects home is after a round can end and a status exists | #10 P1 → P2 (owner kept) | nav Land moves to #10 |
| 2026-09-24 | Grok 4.7 — **held** | No Caio write-back row; no crew surface; copilot blanket-deferred; Kimi "KIMI-01 only" | #7 held P1 next cycle; #14 held as pack; Kimi one-slice-ahead held — see `REBUTTAL_TO_GROK.md` C1–C4 | crew list stays a ledger sub-row (#7) |
| 2026-09-24 | Formal brief (Bailey via Blaze) | PR#5 delete already live on `c58816e4`; Latch after → Clip | #2 becomes proof-then-Clip, not a build; #4 unblocks on proof; live-trains table added; #5 marked parallel-now | ACS quiet (roster) → PASS on proof |
| — | Opus 5.5 | — | — | — |
