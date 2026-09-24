# MASTER SPINE — draft from seat FABLE

One ordered backlog across ACS OS and CVP. 15 items, upstream→downstream by **dependency**, interleaved by **cadence** (ACS daily, CVP per-project). Owner hints use the office seats from the command map. Lane: **G** Grok Land (~11% bucket) · **K** Kimi pack (~64%) · **C** Council · **B** Bailey pick.

Rules applied: no G without a preceding K pack · one open Land per product · alternate by slice · Kimi runs one slice ahead.

| # | P | Product | Item | Ritual it moves | Owner seats | Lane | Depends on | Land gate (don't break) |
|---|---|---|---|---|---|---|---|---|
| 1 | P0 | CVP | Finish Wipster tap-comment + kill under-deck + quiet surround (`bc-ec6df537`) | Review round on a phone | Reel/Cut → Latch | G (in flight) | — | player tip `46a256f2` plays; `compress:false`; guest film-first |
| 2 | P0 | ACS | Finish admin PR#5 roster delete/toasts → Clip | Weekly roster hygiene | Forge → Clip/Latch | G (in flight) | — | live admin Land train; no data loss on delete |
| 3 | P0 | CVP | Council nav masters (phone bottom-pipeline + Claude drawer; desktop) — mock only, ONE pick | Client front door | Fable/Opus/Grok → Blaze → Bailey | C → B | — | none (mock) |
| 4 | P1 | ACS | ACS-VA-106 Dispatch Loading + remaining job-create reliability VA | Morning dispatch | Forge/Clip; Frame packs | K → G | #2 | dispatch renders tomorrow's Jobs on phone with no dead state |
| 5 | P1 | CVP | Review shell = Wipster ritual: share modes Review/Approve/Preview · "finish reviewing" · approval bound to exact version | Approval (the money moment) | Reel/Cut/Latch; Frame packs | K → G | #1 | `46a256f2`; anonymous admission limits unchanged |
| 6 | P1 | ACS | Caio confirm loop → Job state (scheduled → en route → on-site → done/issue) via Continuity rail only | Field truth | Forge + Ring (gates any outbound) | K → G | #4 | Continuity only; no Twilio; no client/crew sends |
| 7 | P1 | CVP | Deliverable object + per-deliverable per-client status (contract → transitions + tests → minimal surface in existing cockpit) | "Where is each deliverable?" (kill Madeline Excel) | Reel; Frame contract pack; Scout reality-map refresh of STATUS/BLOCKERS first | K → G | #5 (status derives from approval state) | D8 honesty: status is derived, never hand-typed |
| 8 | P1 | ACS | Client enrich sequential (Caio-sourced) · hold Amanda until Lupe fields · Complete → notes → invoice state on Job | Evening close | Forge/Clip; Frame drafts Lupe field spec | K → G | #6 | schema order: Lupe fields before Amanda |
| 9 | P1 | CVP | Projects home + shell nav Land (renders #7 data using the #3 master) | Client front door, producer overview | Reel/Cut/Latch | G | #3 (Bailey pick), #7 | guest film-first; no left+bottom nav on phone |
| 10 | P2 | ACS | Booking persistence: astrocleanings.com booking → inquiry → Client+Job (no auto-sends) | Intake feeder | Forge/Clip; Frame packs | K → G | #8 | no unsolicited sends; Job title convention `First L. Service` enforced at create |
| 11 | P2 | CVP | Versioning vs brief: version-N "changed vs previous / vs brief" · comment carry-over rule (R5) | Review round v2+ | Reel; Frame packs | K → G | #5, #7 | exact-version binding preserved |
| 12 | P2 | CVP | Proposals/invoice on job objects — promote existing demo-runtime proposal model (Slice A) to remote runtime; attach invoice state to Project/Deliverable | Inquiry → proposal → invoice | Reel; Scout audits what already exists in `lib/covideopro` | K → G | #7 | Stripe stays server-only; no new payment rail |
| 13 | P2 | CVP | Sandcastles scripting assistant as FORM drafter (interview Qs, shot list, fact register, script scaffold) → operator approves · surfaced in Claude drawer | Brief | Cut; Frame packs (five-agents frame) | K now → G later | #9 (drawer exists) | never touches the paper cut; artifacts, not chat |
| 14 | P3 | ACS | Roster hygiene automation (dupes, stale, recurring next-date) · Phone CS bot draft-only behind Bailey yes | Weekly hygiene; inbound | Forge + Ring | K design → G later | #8, #10; Continuity rail proven | bot NOT live; every send is a Bailey yes |
| 15 | P3 | CVP | Multi-client multi-stakeholder event orchestration (WEFTEC-scale) — spec only until a real event is booked | Event week | Scout spec; Reel later | K only | #9, #11, #12 | none until spec accepted |

## Reading the spine

- **Items 1–3 are all in flight or Council-cost.** They finish; nothing new starts on Grok until #1 and #2 are Landed and clipped.
- **Items 4–9 are the P1 core.** They alternate ACS/CVP and cover both rituals for both companies: dispatch + Caio loop + close for ACS; approval + Deliverable status + front door for CVP. Completing #4–#9 satisfies the "one real week / one real project" tests in `DEBATE.md §4`.
- **Items 10–13 are P2 — feeders and money.** Intake, versioning depth, proposals/invoice, scripting FORM drafter. Kimi should be packing these while Grok is on #6–#9.
- **Items 14–15 are P3 and Kimi-only until a real event or the week-test forces them.**

## Kimi lookahead schedule (so the fat bucket never idles)

| While Grok Lands | Kimi packs | Kimi audits |
|---|---|---|
| #1, #2 | #4, #5 | reality-map refresh of CVP `STATUS.md`/`BLOCKERS.md` vs Sept commits (for #7) |
| #4, #5 | #6, #7 | ACS Lupe field spec (for #8) |
| #6, #7 | #8, #9 | what exists in `lib/covideopro` proposals/estimates (for #12) |
| #8, #9 | #10, #11 | five-agents frame for Sandcastles (for #13) |
| #10–#13 | #14 design, #15 spec | week-test / project-test evidence collection |

## Explicit merges vs the command map's draft

- Map #9 (VA-106) + map #11 (job-create reliability VA) → spine **#4**. Same "tomorrow morning works" slice.
- Map #10 (client enrich / Amanda-Lupe) + the unlisted "Complete/invoice/notes" step → spine **#8**. Both are the evening-close write path on the Job.
- Map #8 (proposals/invoice · multi-stakeholder later) → split into **#12** (P2, runtime promotion) and **#15** (P3, spec only).
- Map #12 (phone CS bot) folded into **#14** with roster hygiene automation; both are post-trust automations.

## Explicit moves vs the command map's draft

- **Per-deliverable status (#7) moves ahead of Projects home (#9).** Status is the data; home is the view. A home without derived status is Excel with a login.
- **Caio confirm loop (#6) enters as P1** although the map does not list it as its own item. It is the only way "field truth" becomes data and the precondition for both the evening close and any future bot.
- **Sandcastles (#13) moves from map P1 to P2.** It saves Bailey's time but does not unblock a client ritual or a payment; it also needs the drawer (#9) to be a delivery surface. Kimi packs it now at zero Grok cost.
