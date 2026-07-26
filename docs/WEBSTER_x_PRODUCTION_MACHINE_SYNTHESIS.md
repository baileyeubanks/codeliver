# WEBSTER × PRODUCTION MACHINE — Synthesis
## Co-Script + Creative Brief + Production Machine are already ONE system. This names the seams.

**Written:** 2026-07-17 · **Status:** additive synthesis — reconciles three named pieces against the in-flight Webster/Co-VideoPro build. **Touches no code, no deploy, no existing doc.** New file only.
**Scope:** generic Content Co-op system. El Paso (*Intelligence at the Physical Edge, Ch.1*) is instance #1.

> **The finding that reframes the request.** You asked me to weave three things into a mega tool. All three already live inside one machine — **Webster / Co-VideoPro** — whose lifecycle spine is exactly the seam they snap into. This document does not build a new thing. It maps what exists, names the gaps, and applies the Production Machine's doctrine to the queue that's already open in `WEBSTER_MISSION_STATE.md`.

---

## 1. THE THREE PIECES → ONE LIFECYCLE

Co-VideoPro's spine (from `COVIDEOPRO_PRODUCT_MODEL.md`):
```
inquiry → intake → development → preproduction → production → post → review → delivery → archived
```

| Your named piece | What it actually is | Where it lives on the spine | Build status |
|---|---|---|---|
| **Creative brief** (`cco-content-brief`) | Inquiry funnel → structured brief | `inquiry → intake → development` | **✅ gate 3 evidenced** — `/opportunities`, brief lifecycle, proposal gates |
| **Co-Script / Sandcastles** (`coscript`) | AI writing engine — angle → outline → draft → rewrite → score → hooks | `development` (treatment/script) **and** `post` (paper cut) | **Standalone today.** The seam to weave: its documents become Webster `briefs`/`sequences`, its AI passes become the writing surface inside the project. |
| **Production Machine** (tonight's doctrine) | Pre-pro operating system — 5 agents, 6 forms, 5 entities | `preproduction → production` | **◐ gate 4 partial** — days/crew/locations/releases/call-sheets/chase-board exist; **shot list + readiness roll-up are the named gaps (queue T5).** |

**There is no fourth thing to build.** There is one machine with a proven front (brief→proposal→project), a partial middle (pre-pro), and a writing engine (Co-Script) that isn't yet wired into the middle.

---

## 2. THE DOCTRINE THAT GOVERNS THE WHOLE MACHINE

From the Production Machine, and it holds for every stage, not just the shoot:

| Bucket | Rule | Who owns it in Webster |
|---|---|---|
| **FORM** — a document, schedule, number, or check | AI **proposes**, deterministic code **owns the write** | Agents draft; `lib/covideopro/transitions.ts` validates; user approves |
| **JUDGMENT** — someone must decide and be accountable | Never delegated | The operator. Every stage gate. |
| **CRAFT** — someone must physically be there | A human on the day | DP, interviewer, editor |

This is already the blueprint's stated architecture principle — *"deterministic code owns money, access, state, timecode, versions, and side effects; AI may propose cited diffs."* The Production Machine is the same law, expressed as production roles: **agents take every FORM; the operator keeps the paper cut, the interview, and the liability.**

---

## 3. THE FIVE AGENTS → EXISTING SURFACES

The Production Machine's five agents are not new services to invent — they are **role-shaped views over entities Webster already has or has queued.**

| Agent | Reads | Writes (proposes) | Webster home | Status |
|---|---|---|---|---|
| **Line Producer** | `estimate_lines`, receipts | cost-to-actual, expense tally | Cockpit Proposal + a receipts view | est_lines ✅ · receipts = gap |
| **1st AD** | `production_days`, `crew_members`, `locations` | call sheets, one-liner | Production block (screenshot 25) | entities ✅ · sun/heat math = gap |
| **Coordinator** | `releases`, `locations` | **the chase list** ("who films tomorrow, unsigned") | chase board ✅ (gate 4) | **already partly built** |
| **Researcher** | claims in scripts/graphics | fact register (CONFIRMED/UNVERIFIED/REFUTED + URL) | new surface, feeds `decisions` | proven externally; not yet in-app |
| **Post Supervisor** | `deliverables.spec` | QC pass/fail before ship | Delivery (queue T12) | spec entity ✅ · QC UI = queue |

**Implication:** wiring the five agents is mostly *surfacing and generating over existing entities*, not net-new architecture. The Coordinator's chase board already exists — it's the proof the pattern works.

---

## 4. CO-SCRIPT: THE ONE REAL WEAVE STILL TO DO

Brief and Production Machine are already inside Webster. **Co-Script is the piece that's still standalone**, and it's the highest-value weave because it closes the loop between *writing* and *producing*.

The seam, generically:

```
Webster brief (development)  ──▶  Co-Script editor opens ON that brief
        │                              │  angle · outline · draft · score · hooks
        │                              ▼
        │                         treatment / script  ──▶  Webster `sequences` / `scripts`
        ▼                                                        │
   proposal / greenlight                                         ▼
        │                                             production captures footage
        ▼                                                        │
   PRE-PRO (Production Machine) ◀────── shot list derived from the script ──┘
        │
        ▼
   POST: transcripts ──▶ Co-Script "paper cut" pass ──▶ selects/sequences ──▶ export
```

Two facts make this clean rather than a rebuild:
1. **Co-Script's data model is already Supabase + versioned** (`001_coscript_schema.sql`), same substrate as Webster. Documents can become Webster entities without a translation layer.
2. **Co-Script's AI passes are the writing brain the blueprint's "Brain" section already anticipates.** They plug in as `development`-stage tools, not a parallel product.

**The paper cut** — the single most important editorial act — is a Co-Script *pass over transcripts*. That's the moment the two products are obviously one: the same editor that drafted the treatment assembles the cut from what people actually said.

---

## 5. WHAT THIS MEANS FOR THE OPEN QUEUE

Mapping tonight's doctrine onto the existing `WEBSTER_MISSION_STATE.md` queue — **nothing here reorders it, it sharpens it:**

| Queue item | Production Machine contribution |
|---|---|
| **T3** rate cards + Brief-to-Bid compiler | This is **Agent 1 (Line Producer)**. Deterministic totals over versioned rates = the budget top sheet. |
| **T5** shot list + pre-pro readiness roll-up | This is **gate 4's completion** + **Agent 2 (1st AD)**. The 6 forms *are* the readiness definition. |
| **T12** delivery manifest + QC UI | This is **Agent 5 (Post Supervisor)**. |
| gate 8 Finish Review + Decision Ledger | The **Coordinator's** "adequate?" judgment + `decisions` memory. |
| **Researcher** (not yet queued) | **Propose adding:** a fact-register surface feeding `decisions`. It has already caught 8 bad claims on the El Paso instance — it's earned a place. |

**The 5 entities the shoot needs** (`production_days`, `crew_members`, `locations`, `releases`, `call_sheets`) — the mission state says these already exist as of gate 4. The remaining pre-pro gap is **`shot_lists`** (blueprint §6.5) + the **readiness roll-up**. That's T5. It's small.

---

## 6. EL PASO AS THE FORCING FUNCTION (instance #1)

Generic system, but proven against one real shoot. What El Paso hardens:

- **releases chase list** — Balliew, Dagnino, Trejo, Wickersham, Sims + a field tech + a Schneider engineer. Spanish-language variants. The 9pm-before-shoot query.
- **locations `cleared_to_film[]` / `restricted[]`** — KBH Desal, Brook Hollow, wastewater, the campus. Screens/labels/radio channels are the restricted set — a real critical-infrastructure constraint, not a hypothetical.
- **shot_lists A-priority flag** — the Rockwell-beside-new-PLC frame. If the entity can't carry "do not leave without this," it's not done.
- **fact register** — the 8 flagged claims are live test data.
- **call_sheets** — Aug 18–20, real sun/heat math (outdoor before 10:00 / after 17:00).

A schema that survives August 20th is worth more than one designed in a doc. **Do not build the north star; harden these against the real shoot, then generalize.**

---

## 7. WHAT I DID NOT DO — AND THE OPEN QUESTIONS

**I did not:** modify code, run a migration, deploy, touch Supabase or production data, expose secrets, or overwrite any existing doc. `WEBSTER_MASTER_BLUEPRINT.md`, `_MISSION_STATE.md`, `_TRUTH_MAP.md`, and `COVIDEOPRO_PRODUCT_MODEL.md` are untouched. This is a new, additive file.

**Because these are the real blockers before any build tranche runs** (and two echo the mission state's own open questions):

1. **Naming.** Webster vs Co-VideoPro — the mission state already flags this as your call. Nothing here depends on it.
2. **Is Co-Script's weave a T-item you want scheduled?** It's the one genuinely-new integration. Recommend it becomes **T6: Co-Script development+paper-cut bridge**, after El Paso proves the pre-pro flows (T5).
3. **Who runs the build?** This repo is an **in-flight, deploy-connected autonomous mission.** The safe path is to continue it in its own controlled tranche runs against the blueprint — not ad hoc edits. Tonight's contribution is doctrine and mapping; the code tranches (T3, T5, T6, T12) should run through the same contract → migration → tests → surface → QA loop everything else did.

**The recommendation in one line:** the mega tool exists — it's Webster. The weave that's actually missing is **Co-Script into the development and post stages**, and the pre-pro slice's **shot list + readiness roll-up (T5)**. Do those two, against El Paso, and the three pieces are one machine with evidence.

---

## THE DOCTRINE, RESTATED FOR THE WHOLE MACHINE

> **One lifecycle. Three buckets. Agents propose; deterministic code owns money, access, state, timecode, and versions.**
> Co-Script writes. The Production Machine produces. Webster remembers.
> The human keeps the paper cut, the interview, the decision, and the liability.
