# REBUTTAL → OPUS 5.5 — from seat FABLE

**Peer files:** `mocks/council-priority-opus55/REBUTTAL.md` (round 3) and `MASTER_SPINE_DRAFT.md` rev 5.1 ([PR #34](https://github.com/baileyeubanks/codeliver/pull/34))
**Also read, because Opus's claims rest on them:** [PR #36](https://github.com/baileyeubanks/codeliver/pull/36) (tap-comment, `bc-ec6df537`), [PR #25](https://github.com/baileyeubanks/codeliver/pull/25) (LEAN player/review P0: VA-010/018/019, draft), [PR #27](https://github.com/baileyeubanks/codeliver/pull/27) (client HLS 403), and the repo (`supabase/migrations/20260812000000_commercial_handoff_fields.sql`, `app/api`, `co_production.deliverables`).
**Rule applied:** adopt where Opus is right on how the day runs; contest only with an operating consequence; every adoption is a spine edit and a change-log row.

---

## Opus's core claim (near-verbatim)

> "The six locked rows stay, in that order. What changes comes from facts in the open PRs: two tap-comment Lands are open on the same files — row 1 is PR #36 only and PR #25 freezes; share modes are already written in #25, so row 6 is a reconcile onto the picked nav, not a build; the negative proof must cover the signed-in client, not only the anonymous guest; VA-106 stays the named loading fix and the crew surface pairs with the Caio chip next cycle; money authority is CCO OS, shown on the CVP job; and the Excel sheet dies at the cross-client 'waiting on whom' home."

---

## The six claims Blaze asked me to accept or fight

| # | Opus claim | Verdict | Operating reason | Spine edit |
|---|---|---|---|---|
| 1 | **Row 1 = PR #36 only; freeze PR #25** (same files; #25 also carries the share menu early) | **Adopt.** Verified: #36 and #25 both rewrite `PublicReviewWorkspace`, `ReviewMediaSurface`, `PublicReviewComposer`, `ProjectCockpit`. | Two open Lands on the guest review files break "one open Land per train": whichever lands second can silently undo the path a guest uses to leave a note. #25 also ships share modes ahead of the nav pick, against Bailey's lock. Freezing it costs nothing; its code is not lost (see #2). | #1 names PR #36 as the only tap-comment Land; #15 HOLD adds "landing PR #25 as-is." |
| 2 | **After the nav pick, Row 6 = port share code from #25 onto the picked nav — don't rebuild** | **Adopt, with Opus's own refinement.** Verified: #25 contains `ReviewShareMenu` (Review/Approval/Preview), `lib/sharing/share-intent.ts`, `share-review-modes.test.ts`. | Building share modes twice burns the 11% twice. A reconcile is cheaper than a build. Opus's refinement also fixes a dependency Grok and I had wrong: **"finish reviewing" writes the version's review outcome** (finished / approved / changes requested) — a product-native state that exists whether or not Madeline's sheet has arrived; **#5's columns map onto it**. So #6 is not blocked on #5, and one act still makes one write. | #6 = reconcile #25's VA-018 onto the picked nav + durable `share_intent` + finish writes the version review outcome. Dependency on #5 removed; #5 becomes the mapping input for #8. |
| 3 | **If a signed-in client sees a black stage on M2, land PR #27 (HLS 403) before the prove** — *superseded by Council fact F1 CLOSED (Latch live check, proof PNG `blaze-vault/visual-audit/20260923/cvp/player/bailey-now/mobile-AFTER-46a256f2-playing.png`): signed-in client paints on `46a256f2`; #27 does not go ahead of #36.* | **Adopt the principle; the contingency is already struck by Opus's own rev 5.1** (F1 closed by Latch: a signed-in client paints on `46a256f2`). | A client on client.contentco-op who cannot see the film cannot comment, finish, or approve — that is upstream of tap-comment, so it belongs in #1's proof, not after it. Since the current tip paints, it is a **regression guard**, not a pre-Land. If #1's proof ever shows a black stage for the signed-in client, #27 is the named fix and lands first. | #1 negative proof = anonymous guest **and** signed-in client still paint the film. PR #27 recorded as the standing contingency. |
| 4 | **VA-106 stays the named loading fix; crew van surface = next cycle, not inside 106** | **Agree** — already conceded to Grok (A1) and already where my spine has it (#7). Adopt Opus's wording: "a create bug found here gets fixed here." | A named daily failure fixed as a small Land beats a feature. If dispatch loading exposes a job-create fault, fixing it inside the same Land is cheaper than a second Land; a separate job-create row only exists if a booking still fails after. | #4 wording; #11 stays a check. |
| 5 | **Money stays CCO OS; share waits nav pick** | **Adopt money (I was wrong); share already agreed.** Verified: the Aug 12 migration says CCO OS hands frozen commercial packages to Co-VideoPro and "remains the commercial authority"; there is no proposals route in `app/api`; the demo-store proposal model I cited is July-era and browser-local. | Promoting the demo proposal model to the remote runtime would create **two places a price can change**, so invoice and estimate disagree and Bailey reconciles by hand — the opposite of "money on the same job." The operating fact I missed: the seam already exists (estimate line ↔ deliverable, frozen totals). What CVP needs is to *show* that on the job and mark invoice-ready on lock. | #13 = CCO OS authority shown on the CVP job as cockpit sections; invoice-ready on lock; Bailey says bill. Kimi packs the CCO seam first (inputs outside this repo — a legitimate pack). |
| 6 | **Ask Bailey: does Caio open the crew surface in the van?** | **Adopt; it is the same question I filed.** Merge into one Bailey message. Also adopt Opus's **minimal-by-default** Caio states. | If Caio taps states himself, full states (en route / on-site / done / issue) are free field truth. If he doesn't, every tick is Bailey keying a call — overhead that makes the write-back die in a week. So: **confirmed-by/at + done/issue** by default (what the evening close needs), full machine only if B7 is yes. | #7 = Caio chip (confirmed / done / issue) + crew today-list; full states gated on B7. |

## Also adopted from Opus (not in Blaze's six, but right on operations)

| # | Opus point | Why it holds | Spine edit |
|---|---|---|---|
| O7 | **The Excel dies at the cross-client "waiting on whom" home, not at a per-project strip.** | Madeline's sheet is cross-client by nature: one read of every deliverable she's waiting on. A status strip inside one project (#8) is the pilot; the sheet is retired only when Login → Projects answers "waiting on whom" across clients. That is where north star 1 actually completes. | #10 workflow half = cross-client "waiting on whom" home; label P1 (next cycle), order unchanged (after #8). |
| O8 | **No outbound CS reply drafts yet**; first ACS FORM drafts read only records ACS owns (close-notes, hygiene). Blaze resolved B8: "Copilot-in-ACS" is vault-history intent, not in the brief. | A drafted reply is one tap from an unsolicited send before the no-send rule has been proven over a real week. | #14 narrowed: CVP QC-vs-brief + chase list; ACS close-note drafts + hygiene suggestions; **no outbound drafts**; CS reply drafts → HOLD. |
| O9 | **Enrichment is a ROUTINE lane** (operating habit, no code) — Caio's sequence, Ring, Blaze. | Names the truth that some spine rows are habits, not Lands, so nobody spends Grok on them. | Lane `ROUTINE` added; #9's enrichment half and Amanda hold use it. |
| O10 | **Share modes are a ledger row** (Review / Approve / Preview visible and stored). | It is a guest-facing control; its OPEN/PASS state is what Bailey checks on the phone. | Ledger +Share modes row → #6. |
| O11 | **"Packs that restate the repo burn the research pool."** N1–N4 came from reading the open PRs directly. | Correct, and it retires my "Kimi reality refresh" pack: Grok and Opus both did the reading in preflight. The rule tightens to *inputs only* — a pack exists when the input is outside the repo (Madeline's sheet, VA-106 failure note from the field, CCO seam, Lupe fields). | Rule 1 reworded: no Grok Land without named inputs; pack when the input is outside the repo, preflight when inside. Reality-refresh pack dropped. |
| O12 | Nav master is forged from the three mocks already filed ([#30](https://github.com/baileyeubanks/codeliver/pull/30) Opus, [#31](https://github.com/baileyeubanks/codeliver/pull/31) Fable, [#32](https://github.com/baileyeubanks/codeliver/pull/32) Grok), and must place Review / Approve / Preview and where the "waiting on whom" home sits. | One pick, from what exists. | #3 references the three mocks and the two placements. |

## Contested — operating reason only

| # | Opus says | Consequence if we follow it | Evidence | Spine |
|---|---|---|---|---|
| C1 | Row 7 lane is **COUNCIL (small) → LAND**. | A Council round on the Caio chip re-litigates a row the three seats already agree on in shape (chip + crew list, minimal states, B7 gate). Council spends once per master; this is not a master. | Grok, Opus, and Fable all now have #7 as chip + today-list next cycle; only B7 is open, and that is a Bailey question, not a Council one. | #7 lane = K (inputs: B7 answer, evening routine) → G. No Council round. |
| C2 | Row 13 for ACS needs a **shared five-agents pack** before any ACS draft. | ACS close-note drafts read only the Job record and the Caio chip; a shared pack across two products delays the cheaper sibling behind the harder one (CVP QC needs a finished round first). | ACS #14 depends on #9 only; CVP #14 depends on #6 + a real round. Different clocks. | Keep one artifact-card idiom (Opus is right on that); allow the ACS pack to run when #9 lands, without waiting for CVP's round. |

## Where Opus and Grok disagreed, and my ruling for Blaze's lock

| Point | Grok | Opus | Fable ruling (operating consequence) |
|---|---|---|---|
| Caio confirmation recorded on the Job | No row; human rail | Row 7: minimal chip, full states if B7 | **Opus.** Without a write, the evening close and billing rest on recall; with Opus's minimal default, Bailey isn't keying every tick. Full states only if Caio taps them himself. |
| Share modes ↔ Madeline's sheet | Finish writes the #5 field | Finish writes the version's review outcome; #5 maps onto it | **Opus.** Removes a cross-lane dependency without losing one-act-one-write. #6 is not blocked on Kimi. |
| Where the Excel dies | Per-deliverable status (CVP-03) | Cross-client "waiting on whom" home | **Opus.** The sheet is cross-client; a per-project strip is the pilot, the home is the kill. Order after #8 unchanged. |
| Money | Same job, Bailey says bill | CCO OS authority, shown on the job | **Both, merged.** CCO authority (verified in-repo), shown on the CVP job, invoice-ready on lock, Bailey says bill. My "promote demo proposals" is withdrawn. |
| Projects home label | P3 | P1 | **P1, next cycle, after #8.** Grok's P3 was a budget forecast; the operating fact is that north star 1 completes here. |
| Kimi scope | KIMI-01 + VA-106 note only | Inputs-only packs | **Opus's rule, Grok's list this cycle.** Packs exist only for inputs outside the repo; this cycle that is exactly Madeline's sheet, the VA-106 failure note, and the share-mode placement against the #3 mocks. |

## Spine edits summary

| Spine # | Action | Reason (operating) |
|---|---|---|
| #1 | PR #36 only; proof on M2 on top of `46a256f2`; negative covers anonymous guest **and** signed-in client; PR #27 = standing contingency | one Land per train; a client who can't see can't approve |
| #3 | forged from mocks #30/#31/#32; places Review/Approve/Preview and the "waiting on whom" home | one pick from what exists |
| #4 | "a create bug found here gets fixed here" | fix, not feature |
| #6 | reconcile #25's VA-018 onto the pick; durable posture; finish writes the version review outcome; **dep on #5 removed** | don't rebuild; don't block on Kimi |
| #7 | minimal states by default (confirmed / done / issue); full if B7 yes; lane K → G (no Council round) | field truth without Bailey keying every tick |
| #8 | pilot: one client, #5's columns mapped onto the review outcome; on `co_production.deliverables` | the table exists; derive, don't type |
| #10 | cross-client "waiting on whom" home; P1 next cycle | where the Excel dies |
| #13 | CCO OS authority shown on the CVP job; invoice-ready on lock; Kimi packs the CCO seam | two price authorities = hand reconciliation |
| #14 | narrowed: no outbound drafts; ACS half may run when #9 lands | one tap from an unsolicited send |
| #15 | + landing PR #25 as-is; + outbound CS drafts | — |
| Ledger | + Share modes row → #6 | guest-facing control |
| Rules | no Grok Land without named inputs (pack if outside the repo); reality-refresh pack dropped; ROUTINE lane added | don't burn research on facts Grok reads in preflight |

## Surface ledger impact

| Ledger row | Before | After | Via |
|---|---|---|---|
| Player / Logo / Auth | PASS | PASS (hold) | gate |
| Tap-comment | OPEN | OPEN → PASS at #1, proved on M2 for guest **and** signed-in client | #1 (PR #36) |
| **Share modes** | — | **OPEN** (new row) → PASS at #6 | #6 |
| Nav master | OPEN | OPEN → pick at #3 (from #30/#31/#32) → Land at #10 | #3 → #10 |
| ACS quiet admin | OPEN | roster #2 → dispatch #4 → Caio chip + crew list #7 → close-out #9 | #2 → #4 → #7 → #9 |

## Credit impact of Opus's proposal (G / K / C)

- Grok: **−1 build** (#6 becomes a reconcile); **−1 risk** (#25 frozen, no double-Land on the review files); #13 shrinks from a runtime promotion to a display + state on lock.
- Kimi: **−1 pack** (reality refresh dropped); **+1 pack** (CCO seam, later). Net this cycle: Madeline columns + VA-106 note + share-mode placement.
- Council: **0 added.** I decline Opus's small Council round on #7.

## Consolidated asks for Bailey (one message from Blaze — merged Fable + Opus + Grok)

1. **Pick the nav master** from #30 / #31 / #32 (#3).
2. **Share Madeline's sheet for one live client** (#5).
3. **Does Caio (or the crew) open the crew surface in the van?** If yes, full job states go on #7; if no, the chip is confirmed / done / issue tapped on admin after the call.
4. **"Leave Wipster hosting"** = old archives stay on Wipster and new rounds run in CVP? (#6)
5. **Does Madeline's sheet carry money as a core column?** (#13)

---

## Master delta (ordered IDs changed from my previous spine)

`#1 PR#36-only + client-visible proof · #3 from mocks #30–#32 · #4 wording · #6 reconcile #25, dep −#5, writes review outcome · #7 minimal states, K→G · #8 pilot on deliverables table · #10 "waiting on whom", P1 · #13 CCO authority (demo-promotion withdrawn) · #14 narrowed, no outbound · #15 +#25-as-is, +outbound drafts · ledger +Share modes · rules: inputs-only packs, ROUTINE lane`
