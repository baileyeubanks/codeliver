# Master spine draft — Grok 4.7
**Date:** 2026-09-24 · **Seat:** GROK 4.7, with Fable. Opus is not a seat on this rewrite.
**Status:** Bailey lock on CVP shape. Six-row order holds. No new questions.

## Doctrine — Bailey lock

Two sides only.

- **Client door:** `{client}.co-videopro.com`. Schneider is `schneider.co-videopro.com`. The film, the tap-comment, and the share live here.
- **Master:** Bailey’s Content Co-op OS. One operator seat controls Schneider and the other A-list clients. Login → Projects.

No crew side. No van app. No crew states. B7 is closed. Council nav mocks stand — he said they worked. Do not redraw them into a third surface.

Delivery is AI-fluid. There is no rigid delivery ritual. A cut moves because the operator and the model work the job, not because a fixed ceremony says so.

ACS is the sibling. Quiet admin, Caio on Continuity, roster and dispatch load. That dispatch load is not a crew app.

## Opus rev 5 — accepted

Read against PR #36, draft PR #25, and PR #27. The six rows stay in order.

| Opus change | Ruling | Operating evidence |
| --- | --- | --- |
| Row 1 is PR #36 only. Freeze #25. | Accept | #36 (`bc-ec6df537`) is the tap-film Land. #25 also rewrites the same review files (VA-019) and would ship share modes plus VA-020–025 ahead of the nav pick. Two Lands on one train undo the guest path. |
| Row 2 is Latch after the live tip, then Clip. | Accept | Tip `c58816e4` is already live. More delete code is not the day. |
| Row 6 ports VA-018 from frozen #25 after the nav pick. | Accept | Review / Approve / Preview is already written. Rebuilding it burns Grok twice. Shipping #25 now places the menu before the master. |
| PR #27 before row 1 closes if the client film is black. | Withdrawn. F1 closed. | Latch on live tip `46a256f2`: signed-in client film is visible, not black, not HLS 403. Proof: `blaze-vault/visual-audit/20260923/cvp/player/bailey-now/mobile-AFTER-46a256f2-playing.png`. Do not land #27 ahead of #36. |
| VA-106 adds no crew surface. | Accept | VA-106 is the loading failure. A crew today-list or Caio state machine inside it delays the load. A create bug found while loading is fixed inside this Land. |

Dead on this rewrite: crew surface, van app, crew states, a rigid delivery ritual, and PR #27 ahead of PR #36. Overlay and logo on `46a256f2` stay unfunded. PR #25 stays a frozen draft until row 6.

| Bucket | Burns on |
| --- | --- |
| Grok Lands (fat, don't stop) | #36 only on row 1. Not #27. Then 4. Then 6 as a port of VA-018 after the nav pick. #25 stays draft. |
| Council | 3 now, so 6 is built once. |
| Kimi (careful) | 5 only. 13 after 5, not beside it. |

## Ordered backlog

| # | ID | P | Item | Done when (surface and state) | Owner | This cycle? |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | CVP-01 | P0 | PR #36 only (`bc-ec6df537`). Freeze PR #25. Do not land PR #27 ahead of it. Proof on the M2 live train on top of `46a256f2`. | Guest taps the film, note sticks to that version and time, under-deck gone. Signed-in client film already paints (F1 closed). Overlay, logo, `compress:false` untouched. | Reel / Cut, then Latch | Yes, in flight |
| 2 | ACS-01 | P0 | Delete tip `c58816e4` is live. No new delete code unless proof fails. | Latch after the tip, then Clip. Row stays gone, toast matches, no send. | Latch, then Clip | Yes, proof gate |
| 3 | COUNCIL-01 | P0 | Nav masters already in hand. Two sides only: client door `{client}.co-videopro.com`, and the Content Co-op master over every A-list client. Phone bottom + drawer, desktop thin left, sapphire mark. | Review / Approve / Preview are placed. No crew item. No new mock. No implementation branch. | Council | Yes, mock stands |
| 4 | ACS-02 | P1 | VA-106 dispatch loading on the quiet admin. Not a crew app. Field confirm stays Caio at +1 504 858 1959 on Continuity. Never Twilio, never Kyle. | The `First L. Service` job loads for assignment and survives refresh. A create bug found here is fixed here. Nothing sent. | Forge / Clip · Latch | Yes, when 2 proof passes |
| 5 | KIMI-01 | P1 | Madeline column harvest for one live client. | Written list: column, who changes it, what done means. | Frame / Scout | Yes, pack in parallel |
| 6 | CVP-02 | P1 | Port VA-018 from frozen PR #25 onto the two-sided nav. Client door and master only. Do not merge #25. | Review / Approve / Preview is stored. No delivery ceremony attached. Madeline's columns map when item 5 arrives. They do not block this row. Wipster hosting stays. | Reel / Cut · Latch | After 1 is proved and the nav stands |
| 7 | CVP-03 | P2 | Per-deliverable status for that one client on the existing project. | Madeline does not retype that client's rows. | Reel | No |
| 8 | ACS-03 | P2 | Job-create check. Title `First L. Service`. | Only if a booking still fails to persist after dispatch loads. Not a Land ahead of VA-106. | Forge | No, unless 4 exposes it |
| 9 | ACS-04 | P2 | Complete writes notes a human can bill from. | Note is on the job. No invoice send. | Forge | No |
| 10 | ACS-05 | P2 | Caio client enrich, in his order. Amanda held. | Code only for a Lupe field that blocks save. | Ring · Forge | No Land unless Bailey says |
| 11 | CVP-04 | P3 | Master home: Login → Projects across A-list clients. Client work opens on `{client}.co-videopro.com`. | Home shows item 7 status. No crew door. No second nav. | Reel | No |
| 12 | CVP-05 | P3 | Proposal and invoice on the same job. | A delivered job can hold a bill Bailey chose to send. | Reel | No |
| 13 | KIMI-02 | P3 | Sandcastles seam pack. | Read set is brief, version, open comments. No chatbot, no send. | Frame / Scout | After 5. No Land |
| 14 | CVP-06 | P3 | AI-fluid help on the job, from brief through delivery. Not a delivery ritual. | The operator accepts or ignores a draft. Nothing chats, spends, sends, or marches a cut through fixed gates. | Reel, brief from Frame | No |
| 15 | HOLD | — | Crew surface, van app, crew states. Rigid delivery ritual. WEFTEC. Phone CS bot. Amanda. PR #27. Wipster hosting cutover. Player, overlay, or logo redo. Drawing suite. Transcript NLE. Migration application. | Dead or deferred. Nobody starts these. | — | No |

## Dependency locks

- 4 starts when 2's Latch → Clip proof passes. It does not grow a crew surface. A create bug found in the load is fixed inside 4.
- 6 starts when 1 is proved and the two-sided nav is the one already in hand. It ports VA-018. It does not wait on 5. It does not add a delivery ritual.
- 1 is PR #36 only. F1 is closed. PR #27 does not land ahead of #36. PR #25 stays frozen until row 6.
- B7 is closed. No crew surface, van app, or crew states on either sibling.
- 7 waits on 6.
- 8 is a check after 4, not a gate before it.
- 11 waits on 3 and 7.
- 12 and 14 wait on a real finished review (6).

## Cycle acceptance

Six rows, two CVP sides. Row 1 is PR #36. Row 6 ports VA-018 after that nav, from a still-frozen #25. Crew side and any rigid delivery ritual are dead. No new questions.
