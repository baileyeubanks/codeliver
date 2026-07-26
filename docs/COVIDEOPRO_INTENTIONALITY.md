# Co-VideoPro — What Bailey Actually Built (Intentionality Extraction)

**Date:** 2026-07-17 · **Method:** find-intentionality skill — extracted from the user's own artifacts, not from asking him to re-explain. Sources ranked by recency and authority: `~/Desktop/PRODUCTION_MACHINE_v1.md` (the canonical doctrine — "It is also the spec for Co-VideoPro"), his brand artwork (`CVP BLUE*`, five `Downloads/*2026-07-15.png` explorations, two Canva vector PDFs), the week's worktree docs, and his UI-regression critique (2026-07-17).

---

## The doctrine, in his words

> **"Fifteen roles. Three buckets. Five agents. Six documents."**
> **"The paper cut, the interview, and the frame are the film. Everything else is paperwork."**
> **"Agents take the forms. Cesar takes the frame. You take the paper cut, the interview, and the liability."**

The buckets are the product philosophy:
- **FORM** — a document, a schedule, a number, a check → **agent drafts, operator approves.**
- **JUDGMENT** — someone must decide and be accountable → **the operator. Never delegated.**
- **CRAFT** — someone must be physically there → **a human on the day.**

## The five agents (this IS Hermes, correctly framed)

| Agent | Owns (FORM only) | Produces | Cannot |
|---|---|---|---|
| 1. Line Producer | budget, expenses, receipts | running variance; receipts tally | decide to spend |
| 2. 1st AD | schedule, call sheets, sun math | one call sheet/day, 24h ahead | run the day |
| 3. Coordinator | releases, agreements, COIs | **the chase list** — who films tomorrow and hasn't signed | sign anything |
| 4. Researcher | fact register, claim→source | CONFIRMED/UNVERIFIED/REFUTED per claim | sign off |
| 5. Post Supervisor | delivery spec, QC | pass/fail against contracted spec | judge the cut |

Never touched by any agent: the paper cut, the interview, the frame, access/trust, legal sign-off.

## The six documents (everything else is deliberately dropped, and the drops are NAMED)

Call sheet · appearance release · location agreement · shot list · expense log · fact register.
Named drops: stripboard, day-out-of-days, formal cost reports, wrap book, lined script, art dept. *"A dropped document you named is a decision. A dropped document you forgot is a hole."* — This is the design doctrine for the UI too.

## The forcing function

**"Intelligence at the Physical Edge — Chapter One: El Paso."** Shoot Aug 17 scout, Aug 18–20 principal, Aug 21 contingency. 3-person unit (Bailey dir/prod/interviewer · Cesar DP · Alex photo/BTS). Today is 2026-07-17 — one month out. **"Do not build the north star. Build five entities, let a real shoot break them, then build the next five."**

The five entities (his Part 7 spec, verbatim): `production_days` (date·call·wrap·type·status) · `crew_members` (name·role·rate_basis·days·contact) · `locations` (name·address·contact·access_window·cleared_to_film[]·restricted[]·agreement_status) · `releases` (person·type·status unsent|sent|signed·signed_at·file_url·language) · `call_sheets` (production_day_id·version·generated_at·pdf_url).

**The one query that justifies the build:** who films tomorrow and has not signed? *"That query is the difference between a film and a lawsuit."*

## The brand, in his artwork

`co-videopro` lowercase. Blue/navy CVP monogram (document "C" + film "V" + "P", teal accent) with `CVP BLUE LONG.png` for chrome, `CVP BLUE TRANSX.png` (colorful stacked) for hero moments, `CVP BLUE.png` compact. Explored and rejected: "co-production pro" wordmark, "co-pro.ai", colorful chat-bubble marks. The blue CVP system is the choice.

## The design critique (2026-07-17, verbatim intent)

Media and content center stage "like it was" · minimalist design technique · self-contained features · not an admin app · match the researched examples (Metronic concepts: media cards, master/detail, quiet chrome). **Translation through the doctrine: name drops in the UI. Quiet the chrome; the film is the content.**

## Where the current build diverges from intent

1. **Home/Opportunities read as admin panels** — text rows and form cards; zero media presence. Violates "content center stage" and the minimalism doctrine.
2. **My interim text lockup replaced his real artwork** — restored to his rasters now (`public/brand/cvp-*.png`).
3. **Hermes was framed as a chat/insight assistant** — wrong frame. The five-agents model is the correct one: FORM-owning agents producing named artifacts for operator approval, with liability boundaries explicit.
4. **The loop register optimized for market parity** — correct second priority, wrong first. El Paso is the deadline that proves the schema; parity follows.

## Re-aligned priorities (the loop's new register order)

1. **El Paso slice:** five production entities + chase list + call-sheet generation (Agent 2 FORM artifact) — same discipline: contract → migration + demo slice → transitions + tests → surface → visual QA.
2. **Design restoration:** media-first minimalist Home/Opportunities, real CVP artwork, named-drop chrome.
3. **G1 production parity** (M1 routes; agent-17 paused on quota — self-execute remainder).
4. **Hermes as the five agents** over the record (line producer variance, chase list, fact register, QC pass/fail).
5. Market-parity items (G-register) resume after the shoot-proven schema settles.
