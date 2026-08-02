# Co‑VideoPro — North-Star UI Elevation Plan (MAIN INSPIRATION + doctrine import)

**Date:** 2026-07-17 · **Sources:** `~/Desktop/MAIN INSPIRATION.png` (the co-videopro target mockup) + the ACS OS engineering plan (doctrine import: exception-first, KPI tiers, color grammar, AI tier ladder). All behavior rules from `COPROVIDEO_DESIGN_BIBLE.md` still govern.

## 1. MAIN INSPIRATION decomposition → what exists vs what's missing

| Mockup element | Status today | Tranche |
|---|---|---|
| Left rail: sections + PROJECT SHORTCUTS + RECENT PROJECTS + AI Copilot | ◐ rail exists (sections + shortcuts); no recents, no copilot | N2 |
| Project header: title + version + status + tabs | ✅ (switcher + stage chip + sections) | — |
| Giant graded player, center stage | ✅ (review workspace; timeline stage) | — |
| Right rail: Review & Approval steps + Activity + Recent Assets | ◐ pieces exist across dock/popovers; not one composed rail | **N1** |
| Production Pipeline strip (4 phases with sub-items) | ◐ lifecycle drawer covers this statically | N3 |
| AI Tools grid (Auto Rough Cut, Smart Scene Select, Auto Captions, B-roll Suggest, Video Enhancement, Look Match) | ◐ equivalents: radio cut (≈rough cut), reasoning selects (≈scene select), captions (real). Enhancement/Look Match = no honest local basis | N4 (only what's real) |
| Project Timeline (week gantt with phase bars) | ◐ plan/production days exist; no composed week view | N5 |
| My Tasks table + Project Info | ◐ tasks exist in Plan; no composed bottom band | N3 |
| AI Copilot panel (chat) | ❌ — deferred: Hermes/five-agents surface instead (doctrine > mascot chat) | later |

## 2. Doctrine import from the ACS plan (adapted to video production)

- **Exception-first home rail:** exceptions = promise vs prediction divergence, pre-declared. Co‑VideoPro triggers: unsigned release with shoot ≤48h · proposal sent >7d unanswered · revision round open >5d · deliverable in QC >3d · unassigned production day <7d out · milestone overdue. Each carries owner + repair verbs (chase release, nudge client, consolidate comments, re-spec). Cleared by state change only. Quiet board = good day.
- **KPI tiers:** Daily (review-waiting count, unsigned releases ≤48h, QC queue, days-at-risk) · Weekly (estimate vs actual per project, revision rounds per asset, approval latency) · Monthly (margin per client, conversion by source, archive growth). Never a lagging metric on the daily screen.
- **Color grammar:** lifecycle hues fixed (blue=system, amber=discovery/prep, red=production/blocker, sage=approved/delivered) — red reserved for exceptions, never decoration. Matches the bible's signal discipline.
- **AI tier ladder (replaces "AI buttons"):** T1 read-only drafts (radio cut, brief draft, bid compile — current) · T2 reversible writes with undo window (outbox dry-run) · T3 pre-approval (client-facing: proposal send, review link, checkout link, call-sheet distribute) · T4 multi-stakeholder (payments, contracts). Approval cards show the full artifact in-surface; approve/edit/reject are equal verbs. This is the five-agents model formalized — **no AI Tools grid ships until each tool has a real engine behind it** (current honest set: Rough Cut=reasoned radio cut, Scene Select=reasoning selects, Captions=SRT/VTT — these three may surface; Enhancement/Look Match stay out until real).

## 3. Tranches

- **N1 (now):** the composed right rail on the project cockpit — Review & Approval (stage steps from real approvalStages) · Activity (real log) · Recent Assets (real thumbnails) — one rail, real data, bible-grade graphite styling.
- **N2:** rail recents (recent projects from activity) + exception rail at Home (triggers from §2, owner+verbs, clear-by-state).
- **N3:** Production Pipeline strip + My Tasks + Project Info band in the cockpit overview.
- **N4:** honest AI trio (Rough Cut / Scene Select / Captions) as T1 cards in a Brain drawer, artifact-first with approval verbs.
- **N5:** week-gantt Project Timeline (production days + milestones, color grammar, today line).

## 4. Standing constraints (unchanged)

No fake controls; every number click-lands on its cards; color = state only; graphite bible atmosphere; tests + e2e + screenshots per tranche; the demo runtime stays the truthful local authority.
