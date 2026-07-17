# Co-VideoPro — Recursive Improvement Loop

**Established:** 2026-07-17 · **Purpose:** the standing protocol for continuously closing gaps between Co-VideoPro and the mission + market frontier. Loop discipline: superpowers (brainstorm → plan → TDD), mission honesty rules (no fake surfaces), and the acceptance bar in the mission brief.

---

## 1. The loop (every iteration, in order)

1. **Re-baseline** — `npm test` (must stay green), `tsc --noEmit` (0), boot the app, one render/runtime proof. If baseline is red, the loop is a *repair* loop, nothing else.
2. **Select** the top item from the gap register (§2) by score.
3. **Spec** — brainstorming discipline: context, 2–3 approaches with trade-offs, written spec in `docs/superpowers/specs/` when non-trivial.
4. **TDD** — failing test first (watch it fail), minimal implementation, refactor.
5. **Verify** — tests green + runtime exercise + screenshot evidence in `docs/design-evidence/`.
6. **Record** — update the gap register, `COVIDEOPRO_UPGRADE_LOG.md`, and relevant docs. Commit with evidence in the message.

## 2. Gap register (scored; re-scored each loop)

Score = value(1–5) × parity-gap(1–5) ÷ effort(1–5) ± risk notes. Highest first.

| # | Gap | Value | Parity | Effort | Score | Notes |
|---|---|---|---|---|---|---|
| G1 | Production runtime parity for record entities (API routes + execute migrations 014/015) | 5 | 5 | 4 | 6.3 | R1/R2 compound if deferred; dual-runtime divergence risk |
| G2 | Caption export (SRT/VTT from segments) + word-level transcript refinement | 4 | 4 | 2 | 8.0 | Cheap, real, Descript-parity surface |
| G3 | Hermes project panel (summary, blockers, cited answers over the record) | 4 | 4 | 3 | 5.3 | Vault harness exists; provenance rules set |
| G4 | Playwright E2E + visual regression harness | 4 | 5 | 3 | 6.7 | Mission-mandated; protects every future loop |
| G5 | Demo store domain slicing (record/media/review modules) | 3 | 3 | 2 | 4.5 | Prevents god-object rot before more features |
| G6 | Timeline undo/redo + multitrack model + waveform | 4 | 4 | 4 | 4.0 | NLE credibility core |
| G7 | Client portal room (proposal approve, schedule, invoices, downloads) | 4 | 4 | 4 | 4.0 | Mission surface; reuse review-token authority |
| G8 | Import path (Frame.io/Drive/Dropbox asset + comment import) | 4 | 5 | 5 | 4.0 | Adoption blocker in the real world; user never mentioned |
| G9 | Review presence/collab sessions + comment export | 3 | 3 | 3 | 3.0 | Frame.io parity |
| G10 | Call sheets + field mode + scheduling board | 4 | 4 | 5 | 3.2 | Mission pillar; plan_items foundation exists |
| G11 | Permissions enforced in demo (role switcher) | 3 | 4 | 2 | 6.0 | Removes "theater" gap G-permissions |
| G12 | Invoice PDFs + estimate-vs-actual | 3 | 3 | 3 | 3.0 | Finance depth beyond milestones |
| G13 | Script editor + shot lists + storyboard | 4 | 4 | 5 | 3.2 | Creative pillar beyond briefs |
| G14 | QC checklist UI + delivery packages + download audit | 3 | 3 | 4 | 2.3 | Delivery depth |
| G15 | Analytics/learning rollups (insights surface) | 3 | 4 | 5 | 2.4 | Only after data is real at scale |
| G16 | Multi-tenant/freelancer access, email-in inquiries, calendar sync, time zones, storage retention, backup/DR | 3 | 4 | 5 | 2.4 | User-blind-spot set; schedule deliberately |

## 3. Cadence rules

- After **3 feature loops** → 1 **hardening loop** (tests/perf/a11y/docs).
- After **every G1-adjacent feature loop** → the next loop must be a **parity loop** (production runtime catch-up) until R2 is closed.
- After **5 loops** → re-run the enterprise benchmark check: did any competitor move? Update `COVIDEOPRO_ENTERPRISE_BENCHMARK.md`.

## 4. Slice "done" definition (binding)

A slice is done only when: UI exists · behavior is real · data persists · permissions enforced · failure states visible · processing state truthful · tests pass · rendered result inspected.

## 5. Anti-goals (never count as progress)

- Nav destinations or controls without backing behavior.
- Features verified only by code inspection (no runtime/screenshot).
- Test-count growth without a failing-first cycle.
- Register score inflation to feel faster.
