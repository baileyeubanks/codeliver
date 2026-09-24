# MASTER SPINE — seat FABLE (rev. 4: BAILEY LOCK on CVP product shape, 2026-09-24 12:48 UTC)

**This pass is forged by Fable + Grok 4.7.** Verified repo/Latch/Reel facts from earlier rounds (PR #36/#25 file overlap, F1 client paints, CCO handoff migration) are kept as Council facts, not as peer positions. Zero open Bailey questions.

## Bailey lock — CVP product shape (voice, just now)

| # | Locked | What it does to the spine |
|---|---|---|
| L1 | **Two sides only: CLIENT side + Content Co-op MASTER side. No crew side** — B7 closed: no crew product, no van app, no crew states. | Former row 7 (Caio chip + crew today-list) **dies**. Caio's confirmation stays voice on Continuity; Bailey marks done / issue at the evening close on admin (#9). ACS surfaces are admin / clients / public. |
| L2 | **Master = Bailey's Content Co-op OS**, a multi-tenant operator controlling Schneider **and** other A-list clients — not one client silo. | #10 "waiting on whom" home is a master-side, cross-tenant read. #8 pilot runs on one A-list tenant inside the master. Money authority (CCO OS) is the master side. |
| L3 | **Per-client branded door: `{client}.co-videopro.com`** (e.g. `schneider.co-videopro.com`). | New row **#7**: client-side door pattern — subdomain resolves tenant, tenant brand mark, Login → that tenant's Projects. `client.contentco-op.com` is the generic door until per-client doors Land. |
| L4 | **Delivery is AI-fluid.** No rigid delivery ritual frozen into the product. | Doctrine: the **record** is fixed (deliverable → version → approved → delivered state; nothing sent without Bailey's yes); the **how** of delivery (QC, encode, package, AI assists) is a swappable stage, chosen per job as tools change. #12/#14 reworded; "rigid delivery ritual" added to HOLD. |
| L5 | Council nav mocks: WOW; consult-the-council worked. | #3 pick is imminent; nothing on Grok waits idle for it (#4 is the fallback). |

## Product shape in one line each

- **CLIENT side** — `{client}.co-videopro.com`: a branded door, Login → Projects, film first, tap the film to comment, Review / Approve / Preview, finish reviewing, see where each deliverable stands. No under-deck. Phone bottom pipeline + one drawer; desktop thin left.
- **MASTER side** — Content Co-op OS (admin OS): every tenant, every deliverable, "waiting on whom" across clients, the pick-and-place of share modes, money shown from CCO OS, FORM drafts for the operator. Same nav master, operator scope.
- **ACS** — admin (Bailey, phone) / clients / public. Field truth is Caio's voice on Continuity; the record is marked on admin.

One ordered backlog across ACS OS and CVP. 15 rows, upstream→downstream by **dependency**, interleaved by **cadence** (ACS daily, CVP per-project). Owner hints use the office seats from the command map. Lane: **G** Grok Land (~11% bucket) · **K** Kimi pack (~64%, inputs only) · **C** Council · **B** Bailey pick · **PROOF** Latch after live tip → Clip · **ROUTINE** operating habit, no code.

Rules applied: no G Land without **named inputs** — a Kimi pack when the input is outside the repo (Madeline's sheet, a field failure note, the CCO seam), Grok preflight when it is inside · one open Land per train · alternate by slice · Kimi one slice ahead, inputs only · **every row carries a surface outcome that must PASS in the same Land as its workflow** · **every Land carries proof, including the negative** (guest path still plays; no send fired; crew not paged).

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
| Tap-comment — click-film dialog, under-deck killed, quiet surround; anonymous guest **and** signed-in client paint the film | **OPEN** | #1 (PR #36 only) |
| Share modes — Review / Approve / Preview visible to the guest and stored on the share | **OPEN** | #6 |
| Nav master — phone bottom pipeline + one drawer; desktop thin left; **one master, two scopes: client door and Content Co-op master**; shows Login → Projects, where Review / Approve / Preview sit, and where the master's "waiting on whom" home sits | **OPEN** — mocks reviewed (WOW) | #3 (pick from mocks #30/#31/#32) → #7 client door · #10 master home |
| Client door — `{client}.co-videopro.com` resolves tenant + brand mark, Login → that tenant's Projects | **OPEN** | #7 |
| ACS quiet admin — roster (#2) → dispatch (#4) → close-out (#9). **No crew list (L1).** | **OPEN** | #2 → #4 → #9 |

## The spine

| # | ID | P | Product | Item (workflow half) | Done when (surface + state, with proof) | Owner seats | Lane | Depends on | This cycle? |
|---|---|---|---|---|---|---|---|---|---|
| 1 | CVP-01 | P0 | CVP | Prove tap-comment + under-deck gone + quiet surround: **[PR #36](https://github.com/baileyeubanks/codeliver/pull/36) (`bc-ec6df537`) is the only tap-comment Land; [PR #25](https://github.com/baileyeubanks/codeliver/pull/25) stays frozen** (same review files). Do not retouch overlay, logo, `compress:false`, or version-bound approval. | Proved **on the M2 live train on top of `46a256f2`** (tip not in GitHub): guest on a phone taps the picture; note sticks to that version and time; deck gone. Negative: **anonymous guest and signed-in client both still paint the film** — **F1 CLOSED: signed-in client currently passes on `46a256f2`** (proof PNG in the fact record). [PR #27](https://github.com/baileyeubanks/codeliver/pull/27) stays **behind** #36; it is the named fix only if this check regresses. **Ledger: tap-comment → PASS.** | Reel/Cut → Latch | G (in flight) | — | Yes |
| 2 | ACS-01 | P0 | ACS | PR#5 roster delete/toasts — **live on `c58816e4`**. Remaining work is **Latch proof, then Clip**; no further build unless proof fails. | Latch on live admin, phone: row is gone after refresh; toast matches the write; **no outbound message** to client or crew. Then Clip. **Ledger: ACS quiet (roster) → PASS on proof.** | Latch → Clip (Forge only if proof fails) | Proof (G only on failure) | — | Yes — proof now |
| 3 | COUNCIL-01 | P0 | CVP | Nav master, ONE pick, forged from the three filed mocks ([#30](https://github.com/baileyeubanks/codeliver/pull/30) Opus · [#31](https://github.com/baileyeubanks/codeliver/pull/31) Fable · [#32](https://github.com/baileyeubanks/codeliver/pull/32) Grok): phone bottom pipeline + one drawer (never left+bottom); desktop thin left; sapphire mark. | Drawing shows both scopes on one master — client door (Login → Projects) and Content Co-op master (cross-tenant "waiting on whom") — and where Review / Approve / Preview sit. Bailey confirms (mocks already reviewed: WOW). No implementation branch. **Ledger: nav → picked.** | Fable/Opus/Grok → Blaze → Bailey | C → B | — | Yes (mock) |
| 4 | ACS-02 | P1 | ACS | **VA-106 dispatch loading, alone** — the named loading fix, no new surface. Kimi writes the failure note first (who, which job, phone/desktop, what the screen does instead of loading). A create bug found here gets fixed here. | The `First L. Service` job loads for crew assignment on the phone; the assignment is still there after refresh; no dead loading state; **crew not paged.** **Ledger: ACS quiet (dispatch) → PASS.** | Forge/Clip; Frame note | K → G | #2 **proof** (not a merge) | Yes, as soon as #2 proves |
| 5 | KIMI-01 | P1 | CVP | **Madeline column harvest for one live client**: column, who changes it, what "done" means per column; mapped onto the existing `co_production.deliverables` and onto #6's review outcome. **Starts now**, Kimi lane, parallel with #1/#2. Input from outside the repo (Bailey shares the sheet). | Written mapping that #8 renders. No invented board. **#6 does not wait on this.** | Frame/Scout | K | B: one client's sheet | Yes — now, in parallel |
| 6 | CVP-02 | P1 | CVP | Wipster share modes = **reconcile PR #25's VA-018 (`ReviewShareMenu`, `share-intent.ts`) onto the picked nav — don't rebuild.** Posture stored on the share (durable `share_intent`, not derived). **"Finish reviewing" writes the version's review outcome** (finished / approved / changes requested); #5's columns map onto that outcome when they arrive. | Round can end; outcome lands on the exact version without anyone retyping; Review / Approve / Preview placed where the master puts it; approve as a deliberate act (ACS quiet-confirm idiom); film first; player/logo/auth PASS held; admission limits unchanged; no send. **Ledger: share modes → PASS.** | Reel/Cut/Latch; Frame: placement pack against the #3 pick | G (reconcile) | #1 proved **and** #3 picked. **Not blocked on #5.** | Only after 1 + 3; otherwise Grok lane is on #4 |
| 7 | CVP-06 | P1 | CVP | **Per-client branded door: `{client}.co-videopro.com`** (e.g. `schneider.co-videopro.com`). Subdomain resolves the tenant; tenant brand mark on the door; Login → that tenant's Projects only; guest review links keep working. `client.contentco-op.com` stays as the generic door until then. | A Schneider stakeholder opens `schneider.co-videopro.com` on a phone, sees their mark and their projects, nothing of any other tenant; guest link still film-first; sapphire lockup where the master says. **Ledger: client door → PASS.** | Reel/Cut/Latch; Blaze supplies tenant list + marks (input outside repo) | K (inputs) → G | #3 pick; #6 (so the door opens onto a review that can end) | No — next cycle |
| 8 | CVP-03 | P1 | CVP | **Pilot:** per-deliverable, per-client status for **one A-list tenant (Schneider) inside the master**, on the existing project, on `co_production.deliverables`, #5's columns mapped onto the review outcome from #6; **derived** from versions, rounds, locks. | Madeline does not retype that client's rows. Status strip on the existing cockpit (list-with-chips idiom); no new chrome ahead of the pick. D8: derived, never hand-typed. | Reel; Latch | G | #5, #6 | No — next cycle |
| 9 | ACS-04 | P2 | ACS | **Close-out (evening close on admin):** Bailey marks **done / issue** after Caio's Continuity call — the only write of field truth, on admin, by Bailey — plus notes the office can invoice from, extra time, paid / unpaid **as a state** on the same Job. **No crew product, no crew states (L1).** Client enrichment is **ROUTINE** (Caio's sequence via Ring/Blaze; code only if a Lupe field blocks a save). **Amanda held.** | Close flow ≤3 taps on phone; note and invoice state on the Job; **no invoice send.** ACS quiet held. **Ledger: ACS quiet (close-out) → PASS.** | Forge/Clip · ROUTINE: Ring/Blaze | G · ROUTINE | #4 | No — next cycle |
| 10 | CVP-04 | P1 | CVP | **Master-side cross-tenant "waiting on whom" home — where the Excel sheet dies.** Content Co-op OS reads #8's derived status across Schneider and every other A-list tenant; every project shows its deliverable strip. Client side of the same Land: Login → Projects on each door (#7). | The picked master Landed: phone bottom pipeline + drawer, desktop thin left, logo PASS; no second nav; no left+bottom on phone. **Ledger: nav → PASS.** | Reel/Cut/Latch | G | #3 pick, #7, #8 | No — next cycle, after #8 |
| 11 | ACS-03/07 | P2 | ACS | Job persistence: **job-create check** (title `First L. Service`, write survives refresh) — a check after #4, Landed only if a booking fails; then public astrocleanings.com booking → inquiry → Client+Job. | Booking persists into a Job with the title convention enforced at create; confirmation state visible on admin; **no auto-send.** | Forge/Clip; Frame pack | K → G (conditional) | #4 (check), #9 (booking) | No |
| 12 | CVP-07 | P2 | CVP | Versioning vs brief: version-N "changed vs previous / vs brief"; comment carry-over rule (R5). | Version switch inside the same thin player; diff in the review rail, not a new screen; exact-version binding preserved. | Reel; Frame pack | K → G | #6, #8 | No |
| 13 | CVP-05 | P2 | CVP | **Money on the job — master side; CCO OS stays the commercial authority** (`20260812000000_commercial_handoff_fields.sql`: estimate line ↔ deliverable, frozen totals, "Co-VideoPro never mutates them"). CVP **shows** proposal + invoice state on the job and marks invoice-ready on lock. *Demo-runtime proposal promotion withdrawn — two price authorities means hand reconciliation.* | A delivered job holds a bill Bailey chose to send; **gate: one deliverable finished review and Bailey says bill.** Cockpit sections (D4), no finance app; no new payment rail. | Reel/Latch; Scout packs the CCO seam (input outside this repo) | K (seam) → G | #8; Bailey says bill | No |
| 14 | KIMI-02 / ACS-08 | P2 (Land next cycle+) · K now | Both | **First FORM agents, both siblings, one artifact-card idiom.** CVP: AI **inside** Brief → Shoot → Cut → Delivery — first artifacts **QC vs approved brief + chase list** on the open round (reads brief + version + open comments). **Delivery stays AI-fluid (L4):** assists are chosen per job and swapped as tools change; only the record (approved → delivered, nothing sent without yes) is fixed. ACS: **close-note drafts + roster hygiene suggestions** (reads only records ACS owns). **No outbound drafts** — CS reply drafts wait until the no-send rule is proven over a real week. | Operator accepts or rejects each named artifact. Nothing chats, spends, or sends. Same card in the CVP rail/drawer and in a quiet ACS review queue. | Frame/Scout (one idiom pack); Cut / Forge per train | K after #5; G per train on its own clock | CVP: #6 + one real finished round · ACS: #9 (may run first) | Pack only |
| 15 | HOLD | P3 | Both | **Crew surface / van app / crew states (B7 closed — no crew product)** · **any rigid, frozen delivery ritual (L4)** · WEFTEC · phone CS bot and any outbound CS drafts · Amanda enrich (this cycle) · Wipster hosting exit / archive migration · player / overlay / logo / auth redo · drawing suite · transcript NLE · **migration application (Bailey gate)** · re-opening CCNAS / scan / approval setup without a live regression · **landing PR #25 as-is**. | Nobody starts these. | — | — | No |

## Council fact record (closed facts bind the rows above)

| # | Fact | State | Effect on the spine |
|---|---|---|---|
| F1 | Signed-in client on live tip `46a256f2` sees the film stage — not black, not HLS 403. Proof: `blaze-vault/visual-audit/20260923/cvp/player/bailey-now/mobile-AFTER-46a256f2-playing.png` (El Paso review, CC signed-in, frame ~00:00:10:07). | **CLOSED** (Latch live check) | **PR #27 does not go ahead of PR #36.** Row 1 stays PR #36 tap-comment + surround only. The "still plays" negative covers guest **and** signed-in client, and currently passes for signed-in; #27 is the named fix only if that check regresses. |
| F2 | PR #25 is a frozen draft with a freeze comment. | **CONFIRMED** (Reel) | Row 6 = port #25's VA-018 share code onto the picked nav after #1 proved + #3 picked. **Not a merge-now.** |
| B7 | Crew surface in the van? | **CLOSED (Bailey lock L1): no crew product.** | Former row 7 dies; field truth stays Caio's voice on Continuity; Bailey marks done / issue at close-out (#9). Row 7 is now the client door. |

## Cycle acceptance (this bucket)

The cycle closes when: #1 (PR #36) is proved on M2 on top of `46a256f2` for guest and signed-in client · #2 is **proved by Latch on `c58816e4` and clipped** (row gone after refresh, toast true, nothing sent) · #3 is up for Bailey to pick · #4 is the next Forge Land, alone, started on #2's proof · #5 is a written list. #6 does not start before the pick. Overlay, logo, auth untouched. Nothing was sent.

Rows 1–6 are unchanged by the lock. Three lanes move at once ("don't stop"): **Grok** #1 → #4 → #6 · **Council** #3 now · **Kimi** #5 now + VA-106 failure note + share-mode pack against the #3 mocks.

## Dependency locks

- #4 starts when #2 is **proved** (Latch on live `c58816e4`), not merged — it is already live. It does not wait on a job-create rewrite (#11 is a check after it).
- #6 starts when #1 is proved **and** Bailey has picked #3. It is a reconcile of PR #25's VA-018, not a build, and it is **not blocked on #5** (finish writes the version's review outcome; #5 maps onto it). If the pick is late, the Grok lane stays on ACS (#4, then #9 next cycle).
- #8 waits on #6. #7 (client door) waits on #3 and #6. #10 waits on #3, #7, #8.
- #9 waits on #4; #11's booking half waits on #9.
- #13 and CVP's half of #14 wait on a real finished review (#6). ACS's half of #14 waits on #9 only.

## Kimi lookahead (so the 64% neither idles nor wanders)

| While Grok Lands | Kimi packs (each tied to a row) | Kimi audits / evidence |
|---|---|---|
| #1, #2 | #5 Madeline columns · #4 VA-106 failure note · #6 share-mode **placement** against the #3 pick | VA sweep of live ACS roster after #2. *(Reality-refresh pack dropped — open PRs were read in preflight; packs are inputs only.)* |
| #4 | #7 client-door inputs (tenant list + brand marks from Blaze; subdomain contract — no DNS change without a verified target) · #8 mapping onto `co_production.deliverables` | VA sweep of dispatch after #4; nav pick checklist |
| #6 | #9 close-out inputs (evening routine) · #10 master "waiting on whom" Land checklist | post-#6 proof: a round ended and the outcome landed on the version |
| #7–#10 | #13 CCO seam pack · #14 one artifact-card idiom pack · #11, #12 inputs | week-test / project-test evidence |

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
| 2026-09-24 | **Opus 5.5** (1) | Two tap-comment Lands on the same review files; whichever lands second undoes the guest path | #1 = PR #36 only; #25 frozen; #15 +"#25 as-is" | — |
| 2026-09-24 | Opus 5.5 (2) | Share modes already written in #25; finish writes the version's review outcome, Madeline's columns map onto it | #6 = reconcile, dep −#5 | +Share modes ledger row |
| 2026-09-24 | Opus 5.5 (3) | A client who can't see the film can't approve — upstream of tap-comment | #1 negative proof covers signed-in client; PR #27 standing contingency (F1 closed, not pre-Land) | tap-comment row wording |
| 2026-09-24 | Opus 5.5 (4) | A create bug found in VA-106 gets fixed there | #4 wording | — |
| 2026-09-24 | Opus 5.5 (5) — **Fable was wrong** | CCO OS is the commercial authority (verified in migration); promoting demo proposals = two price authorities | #13 rewritten; demo promotion withdrawn | — |
| 2026-09-24 | Opus 5.5 (6) | Minimal Caio states by default; full only if Caio opens the crew surface | #7 minimal states, B-gated | — |
| 2026-09-24 | Opus 5.5 (O7) | The Excel dies at the cross-client "waiting on whom" home, not a per-project strip | #10 workflow half + P1 next cycle | nav Land stays #10 |
| 2026-09-24 | Opus 5.5 (O8, B8) | Outbound CS drafts are one tap from an unsolicited send; Copilot-in-ACS is vault-history intent | #14 narrowed; CS drafts → HOLD | — |
| 2026-09-24 | Opus 5.5 (O9–O11) | ROUTINE lane; share modes are a surface; packs that restate the repo burn research | lanes +ROUTINE; reality-refresh pack dropped; rule = inputs only | +Share modes row |
| 2026-09-24 | Council facts F1 / F2 / B7 (Latch, Reel, Blaze) | Signed-in client paints on live `46a256f2`; #25 frozen by Reel; B7 open | #1 keeps #36 only, #27 behind it as regression-only fix; #6 port-after-pick confirmed; #7 minimal states pending B7; fact record added | tap-comment negative currently passes for signed-in |
| 2026-09-24 | **BAILEY LOCK** (L1–L5) | Two sides only (client + Content Co-op master); no crew product; `{client}.co-videopro.com` doors; multi-tenant master; AI-fluid delivery; nav mocks WOW | Row 7 crew/Caio-states **dies** → row 7 = client door; #9 absorbs done/issue at close-out; #10 master-side cross-tenant; #13/#14 reworded; HOLD + crew surface + rigid delivery ritual; B7 closed; all Bailey questions removed | ACS quiet row loses crew list; +Client door row; nav row = one master, two scopes |
| 2026-09-24 | Opus 5.5 — **held** | Council round on #7; shared five-agents pack gating ACS drafts | #7 lane K→G, no Council; ACS #14 half may run on #9 — see `REBUTTAL_TO_OPUS.md` C1–C2 | — |
