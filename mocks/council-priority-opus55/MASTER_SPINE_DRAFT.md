# MASTER SPINE — draft revision 5.1 (seat Opus 5.5, formally briefed)

**Status:** proposal for the Council lock.
**Revision history:**
- **Rev 5.1:** F1 closed by Latch (signed-in client paints on `46a256f2`), so
  the PR #27 contingency is struck. F2 confirmed by Reel. B8 resolved as
  vault-history intent.
- **Rev 5:** reasoning in [`REBUTTAL.md`](./REBUTTAL.md) (round 3: brief, Grok
  `5703be8`, Fable `02293ac`, open PRs #36/#25/#27).
- **Rev 4:** reasoning in [`REBUTTAL_TO_GROK.md`](./REBUTTAL_TO_GROK.md).
- **Rev 1–3:** reasoning in [`DEBATE.md`](./DEBATE.md).

## Rules on every row

1. **Visual + workflow together.** Every row lands a workflow half and a
   surface half in the same Land. If the workflow works but the surface is
   still OPEN, the row is *half-Landed* and stays open.
2. **Land with proof.** The proof is a screen recording or screenshots on the
   **live** surface (phone for ACS admin/crew and the CVP client; desktop too
   where the row has a desktop half). Attach it before Clip.
3. **Latch negative proof:** nothing sent, crew not paged, the anonymous guest
   **and** the signed-in client still see the film.
4. **One open Grok Land per train.** Don't open a Grok Land from a debate.
5. **Sibling idiom.** When ACS and CVP do the same act (confirm, list with
   chips, draft for approval), the second product reuses the first product's
   Landed idiom.

**Lanes:** `LAND` = Grok 4.7 coding (~11% Cursor bucket) · `PROOF` = Latch
after the live tip → Clip · `COUNCIL` = mock or gate · `PACK` = Kimi research
(~64% Other bucket), inputs only · `ROUTINE` = operating habit, no code.

**Seats:**
- **Forge / Clip:** ACS build / proof
- **Reel / Cut:** CVP build / grade
- **Latch:** authority, and proves the negative
- **Frame / Scout:** packs
- **Ring:** Caio Continuity, only with Bailey's yes or an existing routine
- **Blaze:** Bailey's one voice

## PASS on live, so not funded again

- Mobile overlay ~6% and the sapphire logo on `46a256f2`
- Quiet auth door

## Surface ledger

| Surface | State | Closed by |
|---|---|---|
| Player, overlay, logo, auth door | **PASS**, hold | gate on every row |
| Tap-comment: click-film dialog, no under-deck, quiet surround | OPEN | #1 |
| ACS quiet admin: roster → dispatch → Caio chip / crew list → close-out | OPEN | #2 → #4 (this cycle) → #7, #9 |
| Nav master: phone bottom pipeline + drawer, desktop thin left, Login → Projects | OPEN | #3 pick (this cycle) → #10 Land |
| Share modes: Review / Approve / Preview visible and stored | OPEN | #6 |

---

## This cycle: the lock (rows 1–6 only)

| # | Train | Item | Workflow half | Surface half | Latch negative proof | Lane · Seats | Starts when |
|---|---|---|---|---|---|---|---|
| 1 | CVP | **Prove tap-comment + surround**: [PR #36](https://github.com/baileyeubanks/codeliver/pull/36) (`bc-ec6df537`) is the **only** tap-comment Land | A guest's note sticks to that version and time | Tap the film; under-deck gone; quiet surround. **Proved on the M2 live train on top of `46a256f2`** (the tip isn't in GitHub). | Anonymous guest **and** signed-in client still paint the film. The signed-in client is proved visible on `46a256f2` (F1 closed); this is now a regression check. `compress:false` held. Overlay/logo untouched. | LAND · Reel/Cut · Latch | now (in flight) |
| 2 | ACS | **Prove the roster delete**: live tip `c58816e4` | Row gone after refresh | Toast matches the record | No outbound message to client or crew | PROOF · Latch after the tip → Clip (Forge only if proof fails) | now |
| 3 | CVP | **Nav master**: mock → Bailey pick. One master forged from the three nav mocks ([#30](https://github.com/baileyeubanks/codeliver/pull/30) Opus, [#31](https://github.com/baileyeubanks/codeliver/pull/31) Fable, [#32](https://github.com/baileyeubanks/codeliver/pull/32) Grok). | — | Phone bottom pipeline + one drawer, desktop thin left, sapphire mark, Login → Projects. **Places Review / Approve / Preview, and where the "waiting on whom" home sits.** | No implementation branch | COUNCIL → Bailey | now |
| 4 | ACS | **VA-106 Dispatch Loading** (the named loading failure; no new surface added) | The `First L. Service` job loads for crew assignment, and the assignment survives refresh. A create bug found here gets fixed here. | Loads one-handed on the phone; no dead state | Dispatch did not page the crew; nothing sent | LAND · Forge/Clip · Latch | #2 proof passes |
| 5 | CVP | **Madeline's column harvest, one live client**, mapped onto existing `co_production.deliverables` | Written list: column, who changes it, what "done" means | — | — | PACK · Frame/Scout | now, in parallel · **Bailey:** one client's sheet |
| 6 | CVP | **Wipster share modes = reconcile [PR #25](https://github.com/baileyeubanks/codeliver/pull/25)'s VA-018 onto the picked nav.** PR #25 stays frozen as a draft until then (freeze confirmed by Reel). | Stored share posture (not derived). "Finish reviewing" writes the version's review outcome (finished / approved / changes requested). #5's column names map onto it when they arrive. | Review / Approve / Preview is the control the guest uses, placed where the master puts it; approve is a deliberate act (reusing the ACS quiet-confirm idiom) | Guest film-first still plays; no send; Wipster archives untouched (no migration) | LAND · Reel/Cut · Latch | #1 proved **and** #3 picked. Not blocked on #5. |

**Cycle acceptance:** the cycle closes when all of the following hold on the
live trains, each with artifact proof.
- The guest note sticks to that version and time on the passed build.
- The delete holds after refresh, with nothing sent.
- Bailey has a nav master to pick.
- VA-106 loads the job for crew on the phone.
- Madeline's columns for one client are written.
- Share modes start only after rows 1 and 3.

**Not this cycle:** WEFTEC, the phone CS bot, Amanda, overlay/logo/auth
redo, Sandcastles, home, and the crew surface.

---

## Next cycle: order only, nothing starts before the lock closes

| # | Train | P | Item | Workflow half | Surface half | Lane · Seats | Needs first | Forged from |
|---|---|---|---|---|---|---|---|---|
| 7 | ACS | P1 | **Caio's side of the job: confirmed chip + crew today-list** | Confirmed by / at / changes in the evening, and done / issue at day end, entered after the Continuity call. **Full states (en route / on-site) only if Caio uses the crew surface himself** (B7). No new rail, no bot, no send. | Chip on the dispatch row; crew today-list legible in a van; no modal | COUNCIL (small) → LAND · Forge/Clip · Ring | #4 · **Bailey:** B1, B3, B7 | Opus (record) + Fable (crew surface). Grok dissents on the record. |
| 8 | CVP | P1 | **Per-deliverable status, one live client**, on the existing project (pilot) | Status derived from versions, rounds, and locks, using #5's columns; never hand-typed | Status strip in the cockpit (reuses the ACS list-with-chips idiom from #7) | LAND · Reel · Latch | #5 · #6 | Grok |
| 9 | ACS | P2 | **Close-out** | Notes the office can invoice from, extra time, paid/unpaid *as a state*; no invoice send | ≤3 taps on phone | LAND · Forge/Clip | #7 | Grok + Fable |
| 10 | CVP | P1 | **Cross-client "waiting on whom" home**, where the Excel sheet dies | Login → Projects; reads #8 across all clients | The picked master Landed: phone bottom pipeline + drawer, desktop thin left. **Nav ledger row → PASS.** | LAND · Reel/Cut | #3 · #8 | Opus + Fable. Grok had it at P3. |
| 11 | ACS | P2 | Client enrich, sequential via Caio (Amanda held until Lupe's fields) | Code only if a Lupe field blocks save | Roster row fields | ROUTINE · Ring · Blaze | #4 | all three |
| 12 | CVP | P2 | **Money on the job**, once one deliverable can finish **and Bailey says bill** | CCO OS stays the authority (estimate line ↔ deliverable; invoice-ready on lock) | Proposal + invoice state as cockpit sections on the CVP job | PACK (CCO seam) → COUNCIL → LAND · Latch/Reel | #8 · **Bailey:** bill | Grok (gate) + Opus (authority) + Fable (surface) |
| 13 | both | P2 | **First FORM agents, both siblings, one artifact-card idiom.** CVP: QC against the approved brief + chase list on the open round. ACS: close-note drafts + roster hygiene suggestions. **No outbound drafts** (no CS replies) yet. | The operator accepts or rejects each draft. Nothing chats, spends, or sends. | Artifact cards in the CVP review rail / drawer and in a quiet ACS review queue: same card on both | PACK (one shared five-agents pack) → LAND per train · Reel/Cut, Forge/Clip | CVP: #6 + one real finished round · ACS: #9 | Grok (QC) + Fable (Copilot-in-ACS, sibling idiom; vault-history intent per B8), narrowed by Opus |
| 14 | ACS | P2 | **Public booking persists** → Client + Job | Lead lands as a real client + job; no auto-reply | Quiet, phone-first booking form; visible in admin | LAND · Forge/Clip | #9 | Fable |
| 15 | — | HOLD | WEFTEC · phone CS bot and any outbound CS drafts · Amanda (this cycle) · Sandcastles Land (seam pack allowed after #5) · Wipster archive migration · overlay/logo/auth redo · drawing suite · NLE · migration application without Bailey · re-opening CCNAS/scan/approval setup · landing PR #25 as-is | — | — | nobody | — | all three |

## Asks

**For Bailey (one message from Blaze):**
1. **B5:** pick the nav master (#3).
2. **B6:** share Madeline's sheet for one live client (#5).
3. **B4:** does "leave Wipster hosting" mean old archives stay on Wipster and
   new rounds run in CVP? (#6)
4. **B1 / B3:** should Caio's confirmation be recorded on the job? Is there an
   evening routine? (#7)
5. **B7:** does Caio (or the crew) open the crew surface in the van? (#7)
6. **B2:** does Madeline's sheet carry money as a core column? (#12)

B7 is still waiting on Bailey.

**Closed fact checks:**
- **F1, closed (Latch).** A signed-in client on live tip `46a256f2` sees the
  film stage (El Paso, CC signed-in). Proof:
  `blaze-vault/visual-audit/20260923/cvp/player/bailey-now/mobile-AFTER-46a256f2-playing.png`.
  The "land PR #27 first" contingency is struck for the current tip.
- **F2, confirmed (Reel).** PR #25 is a draft and carries a freeze comment. It
  stays frozen until #6.
- **B8, resolved (Blaze).** "Copilot-in-ACS" is vault-history intent, not in
  this seat's brief. Row 13 keeps it narrowed: close-note and hygiene drafts
  only, with no outbound drafts.

## Hard guards on every row

- Keep the live admin Land train on M4 running.
- Caio Continuity is the only field rail. Never Twilio, never Kyle, never a
  bot.
- No client or crew sends without Bailey's yes.
- Don't touch `46a256f2`, the overlay, the sapphire logo, or the auth door.
- Keep `compress:false` and guest film-first.
- Don't reopen CCNAS, scan policy, or approval setup without a live
  regression.
- Migrations apply only at a Bailey gate.
