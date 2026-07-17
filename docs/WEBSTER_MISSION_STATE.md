# Webster — Mission State (requirement → artifact → verification)

**Updated:** 2026-07-17 · **Method:** blueprint P0 gates mapped against the as-built repo at HEAD. Status: ✅ evidenced · ◐ partial · ❌ gap. Evidence paths are relative to repo root.

## P0 founding vertical slice gates

| # | Blueprint requirement | Status | Evidence / gap |
|---|---|---|---|
| 1 | Repo forensics, canonical authority, state machines, shared design tokens | ◐ | `docs/COVIDEOPRO_CURRENT_STATE.md`, `lib/covideopro/transitions.ts`, token system in `app/globals.css`. **Gap:** WEBSTER_REPO_FORENSICS.md donor matrix (below) |
| 2 | Independent desktop/mobile/review compositions (or explicit path) | ◐ | Desktop shell + cockpit; guest `/review/[token]`; responsive mobile (e2e-verified). **Gap:** purpose-built mobile IA (blueprint §9: Today/Shoot/Review/Inbox/More) |
| 3 | Inquiry → structured brief → versioned estimate → proposal/greenlight → project | ✅ | `tests/covideopro-demo-store.test.ts` (inquiry lifecycle, proposal gates, stage advance); `/opportunities`; cockpit Creative/Proposal; e2e flows b–d |
| 4 | Project workspace + pre-production readiness/shot list | ◐ | Cockpit sections incl. Plan + Production block (days/crew/locations/releases/call sheets, chase board; screenshot 25). **Gap:** shot list entity (named in blueprint §6.5), readiness roll-up |
| 5 | Mobile Today/Shoot flow w/ offline-capable notes | ❌ | Not built. Tranche candidate T4 |
| 6 | Real ingest → job state → proxy/metadata → transcript adapter | ◐ | tus upload + ffmpeg pipeline + transcriptions (prod paths; `lib/media-pipeline`, 45 pipeline tests). **Gap:** job-state surface in demo; transcript provider unexercised locally |
| 7 | Soundbite search/select → paper edit → ≥1 verified export | ✅ | Selects w/ provenance, radio-cut reasoning, sequence model, timeline, **EDL export verified** (`tests/covideopro-sequence-editing.test.ts`), captions SRT/VTT. Paper Edit as narrative doc = gap (selects→sequence exists) |
| 8 | Guest review → name → IN/OUT comment/reply → Finish Review → decision | ✅ | `finishDemoReview` (validated, comment provenance) + `FinishReviewBar` in the guest approval rail (screenshot 28); Decision Ledger in cockpit Reviews (screenshot 27); `tests/covideopro-finish-review.test.ts` (4 tests); migration 20260716150000 |
| 9 | Delivery matrix → QC → manifest | ◐ | Deliverables with frozen specs + QC gates (cockpit Delivery; screenshot 10). **Gap:** manifest with checksums/filenames/expiration/recipient ack |
| 10 | Security, audit, states, tests, screenshots, button proof | ◐ | 566 node tests + 6 e2e green; security suites; screenshots 01–26. **Gap:** full dead-control audit pass, Playwright journey for golden thread end-to-end |

## Signature capabilities (blueprint §6) — gap register for tranches

| Capability | Status | Tranche |
|---|---|---|
| Adaptive Inquiry & Discovery (one intelligent question at a time, why-it-matters, confidence indicators) | ❌ (inquiry form is single-shot) | T2 |
| Brief vs Estimate vs Proposal as separate versioned objects | ✅ (briefs + proposals versioned, linked) | — |
| Brief-to-Bid compiler (resource model from deliverables; versioned rate cards; deterministic totals) | ◐ (estimate lines exist; no rate cards, no compiler) | T3 |
| Project DNA (canonical record + generation provenance on documents) | ✅ spine; provenance on call sheets ✅ | — |
| Pre-Production Bible (research/citations, script/storyboard, shot list, risk register) | ◐ (days/locations/releases/call sheets; no shot list, no script/storyboard, no risk register) | T5 |
| Coverage Map (beats ↔ planned/captured, pre-wrap gap check) | ❌ | T6 |
| Media Gateway (managed + BYO-storage registration, lineage, idempotent jobs) | ◐ (managed upload + NAS; BYO registration not modeled) | T7 |
| Soundbite Finder & Story Graph (word-level, concept search, Story Spine, claims↔evidence) | ◐ (segments + selects + reasoning v1) | T8 |
| Review Reconciler (cluster duplicates, contradictions, scope-change detection, revision draft) | ◐ (consolidated rounds; no clustering/contradiction analysis) | T9 |
| Decision Ledger (decision, scope/assets, source comments, decider, supersession, status) | ◐ (decisions entity; no supersession/status UI) | T10 |
| Decision Room (client: 4 action classes only — info, choose, review/approve, sign/pay) | ◐ (guest review exists; portal room not unified) | T11 |
| Delivery Matrix & Archive (manifest+checksums; archive package) | ◐ / ❌ | T12 |
| After Action & Learning (estimate vs actual, variance, human-approved memory) | ❌ | T13 |
| Story Doctrine & Creative QA (rules, cited concerns, no mystery score) | ❌ | T14 |
| Webster Brain (memory scopes + write policy + provider adapters + agent runs audit) | ◐ (reasoning v1 + vault harness; no memory scopes/write-policy UI) | T15 |
| Webster Bridge (Tauri helper) | ❌ (post-P0 by blueprint) | P1+ |

## Open questions for the user (plain language, blocking nothing above)

1. **Name:** keep **Co-VideoPro** + your CVP artwork (shipped everywhere), or rebrand to **Webster** (blueprint's wordmark)? My recommendation: Webster blueprint governs the *product*, Co-VideoPro stays the *name* — but it's your call.
2. **Mobile:** blueprint wants a purpose-built mobile app (Today/Shoot/Review/Inbox/More, offline-first). Path A: purpose-built mobile web views at `/m/*` sharing domain logic (fast, PWA-installable). Path B: native shell later (Tauri/Capacitor). Recommend A now, B after El Paso proves the flows.
3. **Donor forensics:** the blueprint lists donor repos (Co-Produce BriefWizard, video-review-platform-* builds, Mission Control/Aether). Are any beyond this machine's `~/Desktop/Projects/contentco-op` tree worth exhuming for the matrix, or is this repo the authoritative donor?

## Shrinking open-work queue (next tranches, doctrine-ordered)

1. **T1:** Forensic docs (this file, TRUTH_MAP, DECISIONS update) + Finish Review ritual + Decision Ledger surface (gate 8 completion).
2. **T2:** Adaptive Discovery (question-at-a-time over the inquiry record, confidence/missing indicators).
3. **T3:** Rate cards + Brief-to-Bid compiler (deterministic totals; versioned rates).
4. **T4:** Mobile `/m` Today + Shoot views (offline-capable notes, role-adaptive).
5. **T5:** Shot list + Pre-Pro readiness roll-up.
6. **T12:** Delivery manifest (checksums via existing pipeline) + QC checklist UI.
7. **G1:** Production-runtime parity (M1 remainder → M2) — unchanged priority.

## Addendum 2026-07-17 (parallel synthesis doc adopted)

`WEBSTER_x_PRODUCTION_MACHINE_SYNTHESIS.md` (arrived via a parallel session) is adopted. Its deltas to the queue:
- **T6: Co-Script bridge** — Co-Script editor opens on the Webster brief (development); its paper-cut pass works transcripts → selects/sequences (post). Supabase-versioned substrate matches ours; highest-value remaining weave.
- **Researcher (fact register)** — new surface feeding `decisions` with CONFIRMED/UNVERIFIED/REFUTED + URL; the El Paso instance carries 8 live flagged claims as test data.
- **T5 sharpened:** shot list needs an **A-priority flag** ("do not leave Brook Hollow without the Rockwell-beside-new-PLC frame").
- Confirmed doctrine for every stage: agents propose; deterministic code owns money, access, state, timecode, versions; the human keeps the paper cut, the interview, the decision, and the liability.

## Back burner (user decision 2026-07-17)

**Cut Check (AI Review Assist, pass 1)** — verified and parked. Spec (`docs/superpowers/specs/2026-07-17-cut-check-design.md`) and 8-task TDD plan (`docs/superpowers/plans/2026-07-17-cut-check.md`) reviewed: deterministic engine (hook/pacing/structure/proof/cta), provenance citations, honest no-transcript path, approval surface with liability note, tenant/IDOR tests required, named drops honored — doctrine-aligned, no fake-AI. Parked behind: El Paso tranches + CCO OS money-surface port. Resume trigger: user says go, or post-El Paso hardening.
