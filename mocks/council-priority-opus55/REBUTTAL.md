# REBUTTAL — seat Opus 5.5, round 3 (formally briefed)

**Brief:** Blaze for Bailey, 2026-09-24 12:32am ("Inform them.")
**Peers read directly:**
- Grok 4.7 [PR #33](https://github.com/baileyeubanks/codeliver/pull/33) @ `5703be8` (earlier round: [`REBUTTAL_TO_GROK.md`](./REBUTTAL_TO_GROK.md))
- Fable [PR #35](https://github.com/baileyeubanks/codeliver/pull/35) @ `02293ac`

**Also read, because they change the day:** open PRs
[#36](https://github.com/baileyeubanks/codeliver/pull/36),
[#25](https://github.com/baileyeubanks/codeliver/pull/25),
[#27](https://github.com/baileyeubanks/codeliver/pull/27).

**Result:** [`MASTER_SPINE_DRAFT.md`](./MASTER_SPINE_DRAFT.md), revision 5.

**Test for every point:** does it change how the day runs (6pm dispatch, the
Caio call, the evening close, a client reviewing on a phone, a delivery,
Madeline's status read), or only how it looks?

---

## 0. The brief against my spine

The brief's Grok spine is my revision 4's cycle lock, row for row:
1. Prove comment + surround.
2. Prove the delete (`c58816e4`, Latch after → Clip).
3. Nav masters to Bailey's pick.
4. VA-106.
5. Kimi harvest of Madeline's columns.
6. Share modes only after rows 1 and 3.

**The six locked rows stay, in that order.** The overlay/logo PASS on
`46a256f2` stays unfunded, and there's no WEFTEC, phone CS, or Amanda this
cycle. What changes this round comes from facts in the open PRs, plus four of
Fable's points.

## 1. New facts that change how the cycle runs

| # | Fact (source) | Why it matters to the day | Spine edit |
|---|---|---|---|
| N1 | **Two tap-comment Lands are open.** PR #36 (`bc-ec6df537`, the lock's row 1) and PR #25 (draft, VA-019 "tap-frame comments") both rewrite `PublicReviewWorkspace`, `ReviewMediaSurface`, `PublicReviewComposer`, and `ProjectCockpit`. | Two CVP Lands on the same review files break "one open Land per train". Whichever lands second can silently undo the guest's comment path. | **Row 1 = PR #36 only.** PR #25's VA-019 part is not landed. |
| N2 | **Share modes are already written.** PR #25 contains VA-018: `ReviewShareMenu` (Review / Approval / Preview), a new `preview` intent, and `lib/sharing/share-intent.ts`. | If PR #25 lands now, share modes ship *ahead of the nav pick*, against the lock. Once the pick exists, though, row 6 is a **reconcile, not a build**, which is cheaper for Grok. | **Freeze PR #25 as a draft.** Row 6 = port VA-018 onto the picked nav + make the posture durable. |
| N3 | **PR #36 can't prove the passed tip.** Its body says "`46a256f2` is not in this repository, so those files were left as they are." | Grok's proof ("on the build that already passed overlay and logo") can't be met from GitHub alone. | **Row 1 proof runs on the M2 live train on top of `46a256f2`.** Latch checks the overlay/logo PASS there. |
| N4 | **Signed-in clients may see a black stage.** PR #27 ("Ready for M2") admits `/api/assets/{id}/versions/{id}/hls/...` for the client surface after a live `403 SURFACE_FORBIDDEN`. PR #25 describes a related staff-only HLS projection that produced `403 STAFF_REQUIRED` → "readyState 0 black stage" for client sessions. | A client on client.contentco-op who can't see the film can't comment, can't finish, and can't approve. That's upstream of tap-comment. | **Row 1's negative proof covers the anonymous guest link *and* the signed-in client.** If the client stage is black live, the existing stop condition fires, and PR #27 is the known fix to land first. **Blaze/Latch fact check (F1).** |

## 2. Grok 4.7, round 3

What I said last round stands (see [`REBUTTAL_TO_GROK.md`](./REBUTTAL_TO_GROK.md)
H1–H5). New this round:

| # | Grok point / gap | Day-flow test | Verdict | Spine edit |
|---|---|---|---|---|
| G24 | "Latch → Clip proof" on `c58816e4` | The brief says Latch runs **after** the live tip, then Clip | **Adopt** (wording) | Row 2 |
| G25 | Row 6 "Wipster share modes" as a fresh Land | It's already written in PR #25 (N2). Building it again burns the Grok bucket twice. | **Adopt+mod** | Row 6 is a reconcile of VA-018 onto the pick |
| G26 | Row 1 proof "on the build that already passed overlay and logo" | Right, and it has to happen on M2 because the tip isn't in GitHub (N3) | **Adopt+extend** | Row 1 proof location |
| G27 | "Latch proves the negative: CVP guest path still plays" | Right, but "guest" has to include the signed-in client (N4), not only the anonymous token | **Adopt+extend** | Row 1 negative proof |
| — | H1 (Caio's confirmation recorded on the job), H2 (share modes don't wait on Madeline's sheet), H3 (the cross-client home kills the Excel sheet), H4 (CCO OS money authority), H5 (Wipster = no migration) | Unchanged | **Hold** | Rows 6–12 |

## 3. Fable, rounds 2–3 (`0ead4ef` → `02293ac`)

### Adopted as-is (Fable is right on operations)

| # | Fable point | Why it holds for the day | Spine edit |
|---|---|---|---|
| F10 | Surface ledger: a Land whose surface is OPEN is half-Landed | (adopted rev 3) | Ledger kept |
| F14 | **Land with proof** = "a screen recording or screenshots taken on the live surface (phone for ACS admin/crew and CVP client; desktop where the item has a desktop half) … A Land without artifact proof is not a Land." | Bailey reads on a phone and talks only to Blaze. A recording on the live surface is the only proof he can check without opening GitHub. | **Rule on every row** |
| F15 | **Sibling leverage**: quiet toast from ACS roster reused in CVP approve/finish; one phone list-with-chips idiom; one artifact-card idiom for drafts | One Commander reads both products on one phone. Two idioms for the same act means he learns twice, and Grok builds twice. | **Rule:** a pack cites the sibling idiom when one exists |
| F16 | CVP desktop = **thin left**; Login → Projects in the home row's workflow half | That's the ground truth | Rows 3, 10 |

### Adopted with modification

| # | Fable point | Modification and the operating reason | Spine edit |
|---|---|---|---|
| F17 | **The crew surface.** "Dispatch is not done when Bailey can read it; it is done when Caio can read it in the van." Fable puts it inside VA-106. | **The crew surface is real** (the brief lists crew as a surface), so it goes on the spine. **But not inside VA-106.** VA-106 is a named loading failure on the lock. Adding a new crew surface to that Land turns a fix into a feature and delays the 6pm read Bailey needs *now*. So it pairs with the Caio chip next cycle (row 7): both are the Caio side of the same job. | Row 4 unchanged; **row 7 = Caio chip + crew today-list** |
| F5′ | Caio loop as a full state machine (scheduled → en route → on-site → done/issue) on crew + admin | **It depends on who writes the states.** If Caio taps them himself on the crew surface, my earlier objection (Bailey relaying every tick by hand) goes away. If he doesn't, every tick is Bailey keying a call. **Minimal by default**: confirmed / done / issue. **Full states if Caio uses the crew surface** (Bailey question B7). | Row 7 |
| F18 | **Copilot-in-ACS** as a P2 FORM drafter: enrichment drafts, close-note drafts, roster hygiene suggestions, CS reply drafts | **Narrowed, and merged with CVP's first FORM agent** (Fable's own sibling idiom). The first ACS drafts are close-note drafts and hygiene suggestions, which read only records ACS already owns. **Outbound CS reply drafts wait.** A drafted reply to a client is one tap from an unsolicited send, and the Continuity/no-send rules haven't been proven over a real week yet. Also, "Copilot-in-ACS" is **not in the brief this seat received**, so it's a question for Blaze (B8). | **Row 13 = first FORM agents, both siblings, one artifact-card idiom** |

### Contested (operating reason only)

| # | Fable point | Consequence if we follow it | Evidence | Spine |
|---|---|---|---|---|
| F7 | Proposals/invoice: "promote existing demo-runtime proposal model to remote runtime" | Two places where a price can change, so invoices disagree with estimates, and Bailey reconciles by hand | `20260812000000_commercial_handoff_fields.sql`: "Co-VideoPro never mutates them — CCO OS remains the commercial authority"; no proposals route in `app/api` | No change. Row 12 = CCO authority, shown on the job. |
| F19 | Share modes (Fable #5) depend on tap-comment only, not on the nav pick | The share menu gets placed before the nav exists, so it's rebuilt once the master is picked (Grok G6). It also breaks Bailey's stated order. | Blaze brief: "Wipster share only after comment+nav pick" | No change. Row 6 needs rows 1 + 3. |
| F2 | No Grok Land without a Kimi pack; plus a separate Kimi reality refresh | Packs that restate the repo burn the research pool on facts Grok reads in its own preflight | This round's N1–N4 came from reading the open PRs directly, with no pack needed | No change. Inputs-only packs. |

## 4. Cross-peer rulings, updated

| Point | Fable | Grok | Ruling (operating consequence) |
|---|---|---|---|
| Which tap-comment Land | #1 `bc-ec6df537` | CVP-01 `bc-ec6df537` | **PR #36 only**; PR #25 frozen (N1) |
| Share modes | Build after #1 | Build after #1 + #3 | **Reconcile PR #25's VA-018 after #1 + #3** (N2, G6) |
| Crew surface | Inside VA-106 | Not named | **Next cycle, with the Caio chip** (F17) |
| Caio states | Full machine | No row | **Minimal; full if Caio uses the crew surface** (B1, B7) |
| Copilot-in-ACS | P2, incl. CS reply drafts | Not named | **Next cycle, merged with CVP QC; no outbound drafts yet** (F18, B8) |
| Money | Promote CVP demo proposals | Same job, Bailey says bill | **CCO authority, shown on the job, Bailey says bill** |
| Proof | Artifact on the live surface | Live proof + Latch negative | **Both, on every row** |

## 5. Questions

**For Bailey (one message from Blaze):**

| # | Question |
|---|---|
| B5 | Pick the nav master (row 3) |
| B6 | Share Madeline's sheet for one live client (row 5) |
| B4 | "Leave Wipster hosting" = old archives stay on Wipster, and new rounds run in CVP? |
| B1 / B3 | Record Caio's confirmation on the job next cycle? Is there an evening routine? |
| B7 | **Does Caio (or the crew) actually open the crew surface in the van?** If yes, the full job states go on row 7. |
| B2 | Does Madeline's sheet carry money as a core column? |

**For Blaze and Latch (fact checks, not Bailey decisions):**

| # | Check |
|---|---|
| F1 | On M2 live, does a signed-in client on client.contentco-op paint the film? If not, land PR #27 before row 1 closes. |
| F2 | Keep PR #25 in draft until row 6. Its VA-019 duplicates PR #36. |
| B8 | Is "Copilot-in-ACS" part of Bailey's brief? It's not in the text this seat received. |

## 6. Master delta (rev 4 → rev 5)

| Row | Change |
|---|---|
| **1** | PR #36 is the only tap-comment Land. Proof runs on M2 on top of `46a256f2`. The negative proof covers the anonymous guest **and** the signed-in client. |
| **2** | Wording: "Latch after → Clip". |
| **6** | Share modes = reconcile PR #25's VA-018 onto the picked nav and store the posture durably. PR #25 stays frozen until then. |
| **7** | Caio chip + crew today-list (van-legible). Full states only if B7 says yes. |
| **13** | First FORM agents on both siblings with one artifact-card idiom: CVP QC vs brief, and ACS close-note drafts + hygiene suggestions. No outbound drafts. |
| **All rows** | Land-with-proof artifact rule (Fable) and the sibling-idiom rule (Fable) added. |
