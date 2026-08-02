# Co-VideoPro — Canon

**Adopted:** 2026-08-01 · **Authority:** the official Co-VideoPro brand guidelines supplied by Bailey (2026-08-01), on top of the architecture in `../../CCO_PRODUCT_CANON.md`.

**Where this file disagrees with any other design document in this repo, this file wins.** It supersedes the five-dialect scheme in `COPROVIDEO_DESIGN_BIBLE.md` and `COVIDEOPRO_CCO_UNIVERSE_ADOPTION.md` §1, and it supersedes every interim palette explored before this date (graphite/Archivo, ink-950 + signal-orange, cream-editorial-everywhere, and the four-colour-mark-as-phase-colour mapping).

---

## 1. Architecture — two apps, one ontology, one seam

Unchanged by the visual reset. Only the skin changed.

| App | Owns | Never does |
|---|---|---|
| **CCO OS** | Commercial authority: contacts, quotes, invoices, payments, approvals, reporting. CCO-DB (`briokwdoonawhxisbydy`). | Does not own creative production state. |
| **Co-VideoPro** | Creative/production: brief, media, sequences, review, delivery. | **Never mutates commercial totals.** |

**The seam** is the commercial handoff: one immutable quote version drives the PDF, the approval, the payment schedule, the invoice, the Stripe amount, the reporting, and the Co-VideoPro project handoff. Co-VideoPro *receives* an accepted commercial package and reads it; it cannot alter it. Any surface that displays money must show it as inherited, with its version, and must not offer an edit affordance.

### The shared ontology

Both apps render windows onto the same object model. Surfaces select from it; they never invent objects.

```
Client → Project → { Brief → Proposal → Assets → Sequences → Reviews → Delivery }
```

The pipeline spine — the orchestration throughline a project travels:

```
Inquiry → Plan → Produce → Review → Deliver
```

Rules that bind every surface:

1. Every object displays **what it belongs to** and **what it came from** (breadcrumb + lineage). The architecture must be readable from the UI alone.
2. An object's phase is a property of the **object type**, not of the call site. `Brief`/`Proposal` are Plan; `Assets`/`Sequences` are Produce; `Reviews` is Review; `Delivery` is Deliver.
3. An object's phase may differ from its project's current phase. A project standing at Review has not started Delivery, and no surface may imply otherwise.
4. An object may not be referenced by a project that does not own it.
5. Counts are derived, never typed twice.

Reference implementation of the model: `docs/design/cvp/ontology.mjs` (concept harness).

---

## 2. Visual system — official, and the only one

### 2.1 The one-line version

**Light UI. Inter. Sapphire blue. Neutrals dominate. Red/Amber/Green carry meaning and nothing else. Dark is the player, not the product.**

### 2.2 Colour

**Brand blue — the identity and the interaction colour.**

| Token | Value | Role |
|---|---|---|
| `--sapphire` | `#0057FF` | **Primary.** CTAs, links, active states, primary buttons, player accent, key data. |
| `--deep-blue` | `#0033A0` | Hover, pressed, dark emphasis. |
| `--gradient-base` | `#0003CC` | Start of the brand gradient. |
| `--sky` | `#4DA3FF` | Secondary accents, highlights, end of the brand gradient. |
| `--pale` | `#BCC2FF` | Soft fills, tags, selected state. |
| `--ice` | `#EAF2FF` | Lightest tint. Info backgrounds, active row wash. |

**Brand gradient** `#0003CC → #4DA3FF` is for the **logo, hero accents and premium moments only**. Never a large UI fill.

**Neutrals — these dominate the screen.**

| Token | Value | Role |
|---|---|---|
| `--white` | `#FFFFFF` | The dominant surface. Panels, cards, rows, sidebar. |
| `--canvas` | `#F7F9FC` | Page canvas behind panels. |
| `--gray-100` | `#F1F5F9` | Subtle fills, hover, disabled surface. |
| `--gray-300` | `#CBD5E1` | Borders and hairlines. Icon strokes at rest. |
| `--gray-500` | `#8B94A3` | **Non-text only.** Icons, dividers, disabled glyphs. |
| `--gray-700` | `#334155` | Secondary and caption text. |
| `--slate` | `#1A2233` | Dark surfaces other than the player. |
| `--ink` | `#040F1C` | Primary text. Player chrome. |

> **Contrast note (binding).** `--gray-500` measures **3.0:1 on white** and therefore may not carry text. Every text tier on a light surface is `--ink` (18.9:1), `--gray-700` (10.4:1) or `--sapphire` (7.0:1). Hierarchy below secondary is made with **size, weight and tracking — not with a lighter grey.**

**Semantic Red / Amber / Green — purpose only, never decorative.**

| Token | Value | Means |
|---|---|---|
| `--green` | `#16A34A` | Complete · approved · healthy |
| `--amber` | `#F59E0B` | Attention · in review · pending |
| `--red` | `#DC2626` | Blocker · needs action · over estimate |
| `--sapphire` | `#0057FF` | Active · in progress (blue doubles as a state) |

**Pipeline phase and object state are expressed with blue + neutrals + RGY-for-health. There is no rainbow.** Phase is named in words and positioned on the spine; colour reports *health*, not *which phase*. The four-colour CVP mark does **not** map to phases and is superseded as an in-product device by the **CVP ribbon mark** (blue gradient ribbon, `#0003CC → #4DA3FF`).

**Retired by this file:** signal-orange as a brand colour; rose/amber/mint as a decorative trio; the violet AI accent (→ `--sky`); four-colour-per-phase encoding.

### 2.3 Type — Inter only

| Role | Size / line | Weight |
|---|---|---|
| Display | 48 / 56 | Inter 800 |
| H1 | 48 / 56 | Bold 700 |
| H2 | 32 / 40 | SemiBold 600 |
| H3 | 24 / 32 | SemiBold 600 |
| Body | 16 / 24 | Regular 400 |
| **Data** | **14 / 20** | **Medium 500** |
| Caption | 12 / 16 | Regular 400 |

`Data 14/20` is an addition to the supplied scale, required because dense tabular surfaces sit between Body and Caption. It is the only addition; nothing else may be invented.

All figures — counts, currency, timecodes, dates, day-counts — set in **tabular numerals**. Archivo is dropped.

### 2.4 Form

- **Radii:** `12px` panels and cards · `8px` buttons, chips, fields · `999px` dots, status pills, and the topbar search pill (named as a pill in the guidelines). Nothing else.
- **Borders:** 1px `--gray-300`. One hairline value everywhere.
- **Grid:** 4px.
- **Elevation:** light and rare. Cards sit on the canvas by border, not by shadow.

### 2.5 Components

- **Primary button** — filled `--sapphire`, white label, radius 8px, hover `--deep-blue`.
- **Secondary button** — white, 1px `--sapphire` border, `--sapphire` label.
- **Disabled** — `--gray-100` surface, `--gray-500` glyph.
- **Fields** — white, 1px `--gray-300`, focus ring `--sapphire`.
- **Icons** — 24px line, 1.5–2px stroke, `--sapphire` on light.
- **Left sidebar** — white / near-white, grouped **Workspace · Production · Library · Admin**, active item a `--sapphire` pill.
- **Topbar** — search pill, `--sapphire` Upload button, avatar.
- **Status pill** — coloured dot + label. RGY + blue only.

### 2.6 Where dark is allowed

`--ink #040F1C` is **player chrome and media wells only** — the review stage, the transport, the timeline well. It is not a product theme. No operator surface is dark.

---

## 3. Concept harness

The flagship reference build for this system lives at `docs/design/cvp/` (`foundation.css`, `ontology.mjs`, `render.mjs`) and renders the **Planning & Orchestration Cockpit**. It is a concept, not shipped code; shipped surfaces adopt it tranche by tranche. `foundation.css` is the token authority — a surface that reads tokens from it cannot drift.

Hermes takeover notes: `../../HERMES_HANDOFF_CVP_FLAGSHIP.md`. Evidence screenshot: `docs/design-evidence/flagship-orchestration-light-20260801/cvp-orchestration-cockpit.png`.
