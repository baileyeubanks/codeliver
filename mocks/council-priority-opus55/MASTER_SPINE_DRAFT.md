# MASTER SPINE — draft (seat Opus 5.5)

**Status:** proposal for Council forge, not yet the single spine.
**Reasoning:** [`DEBATE.md`](./DEBATE.md) (§6 ranking, §6.3 deltas, §8 credit rules).
**Order rule:** an item is ranked above anything that *reads* its record. Two
trains (ACS, CVP) run in parallel, so the numbers are global priority, not a
strict serial queue.

**Lanes:** `LAND` = Grok 4.7 product code on M4 (ACS) or M2 (CVP) with a proof
pass · `PACK` = Kimi research/brief, just-in-time · `GATE` = Council single
round · `BAILEY` = Bailey yes via Blaze · `ROUTINE` = operating habit, no code.

**Seats:** Forge (ACS build) · Clip (ACS proof) · Reel (CVP build) · Cut (CVP
grade) · Latch (auth/data authority, both) · Frame/Scout (Kimi packs) · Ring
(Caio Continuity, Bailey yes only) · Blaze (orchestration, Bailey's only voice).

---

## The spine (15)

| # | Train | Tier | Item | Lane | Seats | Needs first | Done when (business proof) |
|---|---|---|---|---|---|---|---|
| 1 | CVP | P0 | Finish `bc-ec6df537`: tap-comment on film, kill under-deck, quiet surround | LAND | Reel · Cut · Latch (if admission touched) | — | A guest on a phone taps the film, leaves a comment bound to the exact version, and sees it on the seek bar. `46a256f2` player tip, `compress:false`, and guest film-first all still pass. |
| 2 | ACS | P0 | Land PR#5 roster delete/toasts → Clip | LAND | Forge · Clip | — | Bailey deletes a duplicate client from his phone on live admin, and the toast is truthful. No other roster row changes. |
| 3 | CVP | P1 | **Deliverable contract**: extend `co_production.deliverables` with stakeholder(s), due date, owner, derived review/approval state, "waiting on", and CCO estimate-line ref | PACK → GATE C1 | Frame (Madeline sheet → column map) · Council · Latch | **BAILEY:** share Madeline's sheet | Every column in Madeline's sheet maps to a field or a derivation, or is a named drop. Council signs C1. No code. |
| 4 | ACS | P1 | **Job create/booking persists every time**, titled `First L. Service`, with client full-name/phone/address minimum | LAND | Forge · Latch · Clip | #2 | 20 consecutive job creates and edits (desktop + phone) all persist across reload, all titled correctly. No silent failures. |
| 5 | CVP | P1 | **Review ritual**: share modes Review / Approve / Preview, reviewer list, "finish reviewing", approve writes to the exact version | LAND (+ PACK if Wipster teardown gaps) | Reel · Cut · Latch | #1 | A client stakeholder finishes reviewing and approves V2 on a phone. The approval round shows on V2 only, and V1 stays untouched. |
| 6 | ACS | P1 | **ACS-VA-106 Dispatch Loading**: the tomorrow board (jobs × crew × window) with gaps flagged (no crew / no address-access / not confirmed) | LAND | Forge · Clip | #4 | At 6pm Bailey opens one screen on his phone and sees every job for tomorrow plus a gap list, and the gap list matches reality. |
| 7 | CVP | P1 | **Deliverable status Land (kill Excel)**: per-client, per-deliverable board derived from real versions, rounds, and locks | LAND | Reel · Latch · Cut | #3 (C1), #5 | Madeline runs one full week without opening the Excel sheet. |
| 8 | ACS | P1 | **Field-truth record + Caio confirm routine**: the board emits tonight's Caio call list, Ring calls via Continuity, and the answer is written onto each job (who, when, changes) | GATE C2 → LAND + ROUTINE | Council · Forge · Ring · Clip | #6 · **BAILEY:** approve routine evening Caio call | Five evenings in a row, every job for tomorrow carries a Caio confirmation or an open flag. No Twilio, no Kyle, no unsolicited sends. |
| 9 | CVP | P1 | **Projects home + shell nav**: home = "deliverables waiting on a decision"; phone = bottom pipeline + Claude drawer | LAND | Reel · Cut | #7 · **BAILEY:** pick nav master (Opus or Fable mock) | Bailey answers "what's waiting on whom?" for every client from the home in under a minute on his phone. |
| 10 | ACS | P1 | **Client enrich, sequential via Caio**: deep fields beyond the minimum; Amanda held until Lupe's fields arrive | ROUTINE (LAND only if a field is missing in admin) | Ring · Blaze · Forge (if needed) | #4 | Every active client has full name, phone, email, service address, and access notes. Amanda is done once Lupe's fields land. |
| 11 | ACS | P2 | **Close-out + roster hygiene**: complete, notes, extra time, paid/unpaid; weekly dedupe/archive (recurring regenerate if ACS runs recurring) | LAND + ROUTINE | Forge · Clip | #8 | Every job completed in a week is closed out within 24h with a known paid state. Weekly hygiene takes Bailey under 5 minutes. |
| 12 | CVP | P2 | **Commercial binding with CCO OS**: deliverable ↔ estimate line; locked delivery emits invoice-ready to CCO OS (CVP never owns money) | PACK → GATE C3 → LAND | Frame (seam map) · Council · Latch · Reel | #7 | One real approved deliverable appears invoice-ready in CCO OS against its estimate line with zero retyping. |
| 13 | CVP | P2 | **Creative AI v1 in pipeline**: Sandcastles SCA-001 / 002 / 006 in Brief → Script, provenance-bound, operator approves | LAND | Reel · Cut (packets on `cursor/sandcastles-sot-scrape-7503`) | #7 | One real project's script draft was produced in-product. Every claim cites project evidence or is marked unverified, and Bailey approved it. |
| 14 | CVP | P3 | **Multi-client, multi-stakeholder event orchestration (WEFTEC)**: per-deliverable approver sets, event rollup across clients | PACK → GATE C4 → LAND | Frame · Council · Reel · Latch | #7, #12 | One event with ≥3 clients runs its approvals and status from one CVP view. |
| 15 | ACS | P3 | **Inquiry intake + phone CS bot, design only** (lead record in admin, no auto-reply; bot not live) | PACK → design | Frame · Council | #8 solid for 2 weeks · **BAILEY** yes before anything goes live | A written, Bailey-approved design exists. Nothing sends. |

---

## Two trains, one view

```
CVP  ─ 1 ──────── 5 ──────── 7 ──── 9 ──── 12 ──── 13 ──── 14
        3 (pack+C1, runs during 1 and 5) ─┘

ACS  ─ 2 ── 4 ──── 6 ──── 8 ──── 10 (routine, runs alongside) ── 11 ──── 15
                         C2 ─┘
```

- **Open Lands at any moment:** at most one on each train.
- **Critical path:** CVP is `1 → 5 → 7 → 9`, and #3 must finish before #7
  starts. ACS is `2 → 4 → 6 → 8`.
- **Parallel non-Land work:** #3 (pack + gate) and #10 (routine) never take a
  Land slot.

## Bailey asks (batch in one message now)

1. Madeline's sheet (for #3)
2. Nav master pick: Opus or Fable (for #9)
3. Standing yes for the evening Caio confirm call (for #8)
4. Confirm "leave Wipster hosting" = new work in CVP, old archives stay on Wipster (for #5)

## Hard guards on every item

Keep the live admin Land train on M4 running. Keep the Caio Continuity path
intact. No client or crew sends without Bailey's yes. No Twilio, and never
Kyle. Keep the CVP live player tip `46a256f2`, `compress:false` Lands, and
guest film-first. Demo-only surfaces stay labeled demo.
