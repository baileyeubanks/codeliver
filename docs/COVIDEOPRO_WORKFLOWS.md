# Co-VideoPro — Workflow Traces

Status of the mission's 20 core workflows after the 2026-07-16 upgrade. Verified means exercised end-to-end against the demo runtime (persisted, validated) with UI evidence; store-level means the validated mutation path is test-covered.

## Slice A — commercial spine

1. **Inquiry creation — ✅ VERIFIED.** Home "New inquiry" or Opportunities → capture (summary, source, optional org/contact created inline) → persisted, activity event. Tests: demo-store inquiry lifecycle.
2. **Lead qualification — ✅ VERIFIED.** `new → triaged → qualified` with guards (org + contact required); decline terminal. UI: Opportunities inbox actions.
3. **Brief creation — ✅ VERIFIED.** Cockpit → Creative: versioned brief (objectives/audience/message/references/deliverables), `draft → in_review → approved`, approved edits supersede. Screenshot 07.
4. **Proposal generation — ✅ VERIFIED.** Cockpit → Proposal: narrative + estimate lines with markup/optional flags, computed totals, versioned. Screenshot 08.
5. **Estimate approval — ✅ VERIFIED.** `draft → in_review → sent → approved` with approver identity required; decline terminal; change orders version forward.
6. **Project creation — ✅ VERIFIED.** Two paths: inquiry conversion (qualified inquiry → project at `intake` with org/contact linked) and proposal approval enabling `preproduction` via the stage chip. Stage advance is gated and one-step.
7. **Pre-production planning — ◐ REAL, MINIMAL.** Plan section: production days/milestones/tasks with dates, assignees, meta, dependencies; explicit statuses. Crew/location/equipment dedicated models remain roadmap. Screenshot 09.

## Slice B — media to edit

8. **Media ingest — ◐ EXISTING (unchanged this phase).** tus resumable upload in production; demo simulates phases truthfully client-side; NAS pipeline + worker auth exist.
9. **Proxy/processing — ◐ EXISTING.** Real ffmpeg pipeline (`lib/media-pipeline`, worker routes); 45 pipeline tests incl. real processing pass locally.
10. **Transcript creation — ◐ EXISTING.** Transcription API + workbench UI; provider path needs credentials (unverified locally).
11. **Clip selection — ✅ VERIFIED (record level).** Selects with in/out, source (transcript/review/manual), transcript segment ids; seeded from transcript; UI list in Sequences. Transcript-workbench → select creation UI is the remaining wire-up (roadmap 1).
12. **Sequence editing — ◐ REAL MODEL, NO TIMELINE UI YET.** Sequences with clips (source/record times validated, durations enforced), assembled from selects back-to-back; `draft → in_review` gated on clips + review version. Screenshot 11. Visual timeline is the next slice (R4).

## Slice C — review to delivery

13. **Review upload — ✅ EXISTING.** Versions, share links, public token review (1176-line surface), annotations with pins/shapes.
14. **Frame-accurate feedback — ◐ EXISTING.** Frame indicator + timecoded comments + annotations; runtime frame-step verification pending (visual QA queue).
15. **Revision creation — ✅ VERIFIED.** Consolidated revision rounds: open comments → one round with linked ids; `open → in_progress → addressed → verified`, verification guarded by unresolved comments (waivable with intent). Screenshot 12.
16. **Final approval — ✅ EXISTING.** Approval workflows + stages + history.
17. **Deliverable encoding — ◐ REAL MODEL.** Deliverables with frozen specs and `specced → encoding → qc → ready → delivered/expired`; QC requires a frozen source version. Encoding itself rides the existing transcode pipeline; the handoff is roadmap 4.
18. **Client download — ◐ EXISTING.** Token review downloads + download events; delivery packages/expiration UX roadmap.
19. **Archive — ◐ EXISTING.** Project archive/trash; archive-learning analytics roadmap.
20. **Organizational learning — ❌ ROADMAP.** Insights surface deliberately unshipped (D8) until rollup data is real.

## The five mission vertical slices

- **Inquiry → Brief → Proposal → Approval → Project:** ✅ working end-to-end on the demo runtime (store-tested, UI-verified).
- **Project → Production Plan → Call Sheet → Field Mode:** ◐ plan exists; call sheet/field mode roadmap.
- **Ingest → Transcript → Selects → Sequence:** ◐ selects→sequence working; ingest/transcript provider paths pre-existing.
- **Sequence → Review Version → Consolidated Feedback → Revision:** ◐ consolidation→revision working; sequence→review-version render roadmap.
- **Approved Version → QC → Delivery:** ✅ deliverable QC flow working (specs, gates, states).
