# THE ONE-SHOT ANSWERS — architect's defaults for all 124

**Authority:** These are my rigorous defaults as architect, grounded in `CCO_PRODUCT_CANON.md`, `CCO_GOAL.md` §2/§4, `STATUS.md` (C5A/C6B hardening), the Wistia triage, and the license audit. **Any line Bailey contradicts becomes canon instantly; unanswered lines are the build defaults.** Flagged ⚑ = genuinely owner-flavored, but still defaulted.

---

## A. Business model & money truth

1. **Sells:** three line-item families — (a) production packages (interview/testimonial, brand story, event recap, product/industrial demo), (b) day rates (shoot day, edit day), (c) monthly retainers (N deliverables/month). ⚑
2. **Hybrid:** rate-card templates in the quote builder with per-line override. Templates seed the 80% case; overrides are explicit and logged.
3. **Buyer:** marketing/comms/ops directors at energy, manufacturing, and industrial services companies, $20M–$2B revenue. Schneider is the archetype.
4. **Sales motion:** repeat clients > referrals > inbound. Outbound is not a product surface (reinforces Tier-3 rejection).
5. **Real Schneider job (default model):** inbound email → call → brief captured → quote v1 → one revision → approval click → 50% deposit via Stripe → shoot → ingest → V1 review link → 2 comment rounds → approval → balance invoice → paid → delivered + hosted. This is the G8 script.
6. **Terms:** 50% deposit to schedule, balance net-30 on delivery. Late: 1.5%/mo. Kill fee: deposit retained. ⚑
7. **Rails:** Stripe card + ACH (payment links from the invoice). Check/wire recorded manually as offline payments against the same invoice.
8. **Tax:** Texas sales tax on delivered digital goods where applicable — engine supports a per-quote tax rate field, default 0 until accountant confirms. ⚑
9. **Refund policy text:** on every quote: deposit non-refundable once crew is booked; balance refundable minus incurred costs before delivery. ⚑
10. **Acceptance:** client click on the approval page for an exact quote version + deposit paid = accepted. Either alone = pending.
11. **Discounts:** any line may be discounted; >15% of subtotal requires owner flag (Bailey) in the UI — enforced as a confirm dialog with audit entry, not a hard block.
12. **Change orders:** always a new quote version (v2, v3…) referencing the prior; never an edit. The accepted version stays frozen.
13. **Weekly 5:** AR outstanding · pipeline value by stage · jobs in production · avg days-to-pay · utilization (edit days booked/available). Monthly: revenue by client, margin by job. Accountant: standard P&L export + 1099/vendor list. ⚑
14. **Multi-currency:** no. USD only at v1; schema carries `currency` defaulted `USD` so it never blocks a migration.
15. **Carry target:** 20 jobs/mo × $8k avg = $160k/mo without degradation. Sizing floor for infra decisions. ⚑

## B. Product boundary

16. **Never-list:** public video hosting for arbitrary uploaders, stock marketplace, live streaming, social scheduling/publishing, lead-gen gates/webinars/MAP (Tier-3, rejected), NLE plugins marketplace.
17. **The exact 80%:** ingest → transcode/proxy → transcript → selects via transcript → radio cut → rough assembly on timeline → titles/captions pass → loudness-normalized web master → review-ready V1 with frame-comment link. **Last 20% handed off:** color grade, final mix, motion graphics/VFX, mastering/versions for broadcast. Interface = OTIO timeline + referenced media.
18. **OTIO round-trip:** Premiere Pro and DaVinci Resolve are the contract targets; FCP via OTIO best-effort; Avid never at v1.
19. **Browser-only.** No desktop wrapper; PWA install is free and allowed.
20. **Multi-editor realtime:** never at NLE v1. Single-writer lock per sequence with presence indicators ("Kailany is viewing").
21. **Motion graphics:** handoff. In-app = static title cards + lower-third text overlays with brand fonts only.
22. **Color:** LUT preview (viewer-only) + handoff. No grading suite.
23. **Audio:** in-app loudness normalize to **-16 LUFS** for web masters; stems/mix handoff via OTIO.
24. **Captions:** SRT + VTT export, machine-generated with in-app human correction pass (transcript editor already exists — captions are a render of it). Burn-in optional at delivery.
25. **Multicam:** later. Not in P5 scope; data model must not preclude it (asset → N camera angles).
26. **Stock integrations:** none.
27. **AI rank:** ① transcription (foundation of the thesis) ② transcript search ③ silence/filler removal with preview ④ rough-cut auto-assembly from selects ⑤ auto-reframe social crops ⑥ B-roll suggestion. Only ①② are P5 blockers.
28. **AI budget:** ≤ $40/project default; Whisper-class local or API at ~$0.006/min makes this generous. Alert at 2×.

## C. People, roles, tenants

29. **Team today:** Bailey + 2–4 contract editors/producers. System assumes all crew are authenticated staff with individual identity.
30. **2-year carry:** 10 concurrent editors, 40 active projects, 200 client accounts. Sizing floor.
31. **Client roles:** viewer / commenter / approver / billing — combinable, per-project grants. Approver can be downgraded mid-project; past attributions persist (append-only).
32. **Cross-tenant:** never. Confirmed law. Enforced at RLS + route tests, not convention.
33. **Enterprise demands:** security questionnaires yes (answerable), SSO/SAML defer until a named client contract requires it — RBAC and identity model must not preclude it. Residency: US-only storage is satisfiable today (Supabase US + NAS in Houston).
34. **Audit answer to:** Bailey first, client on request, court if it comes — so approvals carry identity + exact version hash + timestamp + IP, immutably. (C6B admission bridge is the substrate.)
35. **Audit retention:** 7 years, matching US commercial records norms. ⚑

## D. Data model & authority

36. **Canonical entities:** contact, organization, brief, quote, quote_version, project, asset, sequence, sequence_version, comment, approval_event, review_link (invite), delivery_record, invoice, payment, handoff_snapshot. Missing from the naive list: **organization** (client company) and **handoff_snapshot** (the seam artifact).
37. **Immutable at acceptance:** line items, totals, terms text, validity window, version hash. Versioned on change: everything — new row, new hash, supersedes pointer.
38. **Deletable:** draft quotes, unlinked uploads, test data (nonce-tagged). **Frozen:** accepted quote versions, approval events, delivered masters' records, invoices, payments. Client deletion demand → tombstone + export, never silent purge.
39. **Volume:** 200 GB/project typical, 1 TB max, 2–4 TB/mo ingest. ⚑
40. **Retention:** RAW hot 90 days post-delivery → NAS cold indefinitely. Purge = owner-approved job with preimage receipt (same doctrine as ACS writer gate).
41. **Client contract clauses:** none known today; schema carries `retention_class` per project so a future NDA can tighten without migration. ⚑

## E. Media pipeline

42. **Raw ingest:** ProRes, mp4/h264/h265, BRAW, MXF (XDCAM), WAV. Max single file 500 GB via tus resumable (already the only catalog writer per C5A).
43. **Proxy ladder:** edit = 1080p H.264 CRF23; review = 720p H.264 fast-start; archive = source untouched on NAS. HDR/RAW sources get a Rec.709 proxy; source stays authoritative.
44. **Transcode compute:** M4 first (FFmpeg, free, already the house runtime), job queue with concurrency 2; cloud burst (later) only when queue depth > 6h of work. Budget $0 now, ≤$150/mo ceiling.
45. **Frame accuracy:** ±0 frames at proxy fps for comment binding — comments store media-relative milliseconds + fps + version hash; rendering derives the frame. (C6B pins are 0–100 percentages; the comment model adds ms — both kept.)
46. **Timecode:** store source TC when present; binding is media-relative time (ms), TC displayed when available. Jam-sync not assumed.
47. **Delivery color:** Rec.709 SDR only. HDR sources tone-mapped at proxy/master render.
48. **Watermark:** per-link optional, burned into the review proxy at render ("Prepared for {org} · {date}"). Pre-approval downloads default watermarked. (C6B: watermark-enabled invites currently fail closed — lifting that gate is a P5 task.)
49. **Download matrix:** originals = staff only · review proxies = client per-link permission · delivered masters = approver/billing roles.
50. **Delivery bandwidth:** 500 GB/mo ceiling alert; Vercel/Cloudflare fronting, NAS origin for cold masters. ⚑

## F. Review & approval spine

51. **Attributable bar:** verified identity (named account OR email-Verified invite) + exact version hash + timestamp + IP + admission receipt (C6B bridge). Legal e-sign: not required at v1 — the packet is evidence-grade.
52. **Comments:** timecode + text at P0; pixel-region pins (already constrained 0–100) at P0 since the schema exists; draw-on-frame at P5+1.
53. **Version compare:** A/B toggle + side-by-side at P5; list-only before that.
54. **Approval states:** `in_review → changes_requested | approved | approved_with_changes`, plus `superseded` when a new version lands, plus `locked` at delivery. No other states.
55. **Silence nudge:** staged draft at day 2, 5, 9 — human-approved sends (same governance as ACS: nothing auto-sends).
56. **Link expiry:** default 30 days, revocable, per-link override. Admissions (browser sessions) 8h with 15-min signed grants — already built.
57. **Pre-approval download:** off by default, per-link toggle. Post-approval: delivered masters per role matrix (E49).
58. **Comment visibility:** team sees all; client viewers see their own org's comments only.

## G. The NLE

59. **Tracks:** V1/V2/A1/A2 fixed at P0 (covers interview+B-roll+music+nat), unlimited tracks P5+2. Model is track-list, not fixed lanes.
60. **P0 clip ops:** trim, ripple delete, roll, razor, insert/overwrite from transcript selects. Slip/slide/speed = P5+1.
61. **Transitions:** cross-dissolve only at P0, applied to V1 edit points.
62. **Keyboard:** Premiere-like subset (J/K/L, I/O, ripple delete, razor, undo/redo). Published map; no customization at v1.
63. **Autosave:** debounced 5s + on-blur; crash recovery restores last autosave; named snapshots at every V-n publish. Sequence versions are immutable rows — recovery is "open the version," never "hope the file's fine."
64. **Perf floor:** any M-series Mac or 2021+ Windows laptop, latest Chrome/Safari/Edge, 1080p proxy timeline scrub without dropped frames. 4K only via proxies — never source playback in the browser.
65. **The gesture — confirmed:** select sentence in transcript → delete → ripple cut on timeline. Plus its inverse: select spans → "assemble selects" → new sequence.
66. **Search:** project-wide transcript search at P0; library-wide search at P6 (vault index).
67. **Never-lag ranking:** ① playback scrub ② trim response ③ transcript sync ④ render progress. Ship-blocking if ① drops frames on the floor hardware.

## H. Delivery layer (P7)

68. **Player:** CCO-branded (Dark Cinema) default; client logo on the delivery page (not the player chrome) at P7+1.
69. **Custom client domains:** never at v1. `client.contentco-op.com` is the door.
70. **Embed:** iframe first; oEmbed endpoint is ~free on top; JS player never at v1.
71. **Analytics:** collect plays, unique viewers (privacy-safe hash), avg % watched, drop-off curve, referer. Client sees summary card (plays, avg watch, completion); full detail stays internal.
72. **Client report page:** in scope at P7 — one calm page per delivered video ("your film, live, performing"). This is the Wistia ADOPT-tier lesson without becoming Wistia.
73. **P0 link controls:** password + expiry. Domain restriction later.
74. **Self-serve archive:** approver/billing can download delivered masters + caption files. Project source never self-serve.

## I. CCO OS commercial spine

75. **Brief intake:** both — public brief form on `contentco-op.com` (Cream Editorial) feeding the same queue as operator-entered call notes. One canonical brief entity, `source` field distinguishes.
76. **Line-item library seed (15):** shoot day (half/full), 2-cam interview package, drone day, edit day, rough cut, final cut per deliverable (:15/:30/:60/2-min/5-min), revision round, rush fee, travel day, mileage, licensing/music pass, caption package, social cutdowns (per set), retainer month.
77. **Winning proposal pattern:** one-page narrative (their problem → the film → the plan) + line-item page + terms. Cream Editorial PDF, raster-exact brand. ⚑
78. **Invoice mapping:** 1:1 from the accepted quote version — deposit invoice and balance invoice both reference the same version hash. Deviations = new version (A12).
79. **Splits:** 50/50 default; any split expressible as schedule rows on the quote version (each row → its own invoice at its trigger).
80. **Pipeline:** `lead → contacted → briefed → quoted → negotiating → won | lost`, with `lost_reason`. Won auto-creates the project handoff.
81. **CRM depth:** notes + tags + last-touch + pipeline stage. Nothing more — CCO OS is not Salesforce.
82. **Monday report:** AR aging + pipeline by stage + this week's shoots and deliveries + silence nudges pending. One page, printable. ⚑

## J. The seam (G7)

83. **Crossing fields (handoff_snapshot):** client org + primary contact, project name/code, deliverables list with specs and due dates, frozen quote_version id + hash, scope notes, crew assignments, budget cap in **edit hours**.
84. **Mechanism:** Co-VideoPro reads CCO-DB through a **service-only handoff API** that materializes an immutable snapshot row — no live cross-product table reads from the client surface.
85. **Mid-production money change:** new quote version in CCO OS → re-approval → new handoff snapshot (supersedes pointer) → Co-VideoPro project shows the change as history. Never an in-place edit.
86. **Budget visibility:** editors see deliverables, dates, and edit-hour caps. Money line items stay in CCO OS, role-gated. (Matches the price-blind doctrine Bailey enforced on ACS crew.)

## K. Infrastructure & deploy

87. **Host map final:** Vercel = all four web hosts. M4/Blaze = transcode + automation jobs runtime. NAS = cold masters + backups + evidence. M2 = source/review/build. Confirmed per canon + ACS doctrine.
88. **Environments:** production + Vercel preview per branch. No staging tier — preview + gates is the discipline.
89. **Email:** Resend (matches ecosystem direction); `no-reply@contentco-op.com` for transactional, `hello@` for human. ⚑
90. **2am policy:** page only if payment flow or live review links are failing; everything else = morning digest. Alert channel = iMessage to Bailey via the existing gateway.
91. **Backups:** Supabase PITR + weekly pg_dump → NAS; NAS masters are the footage backup (they ARE the cold copy); RPO 24h DB / 0 delivered masters; RTO 4h. ⚑
92. **Infra ceiling:** ≤$150/mo now, ≤$400/mo at A15's carry target. Exceeding = architecture review, not a bigger credit card.
93. **Domains:** the four canonical hosts only. `codeliver` name retires when convenient (O111).

## L. Security & access

94. **Client auth:** token-gated review links (existing admission bridge) + optional magic-link account for repeat clients who want the portal. No passwords for clients at v1.
95. **Team auth:** Supabase email+password now; Google Workspace SSO when the Workspace identity migration lands (ecosystem direction is Google).
96. **SOC2:** not now; expected questionnaire pressure within 12–18 months from energy clients — keep the audit substrate (D34) so the answers are cheap. ⚑
97. **Secrets:** `.env.local` on M2 (symlink discipline as in ACS), Vercel env for deploys, never in git. Rotation = Bailey only. Missing keys render explicit unavailable states (STATUS anti-drift contract), never silent fallbacks.
98. **Abuse posture:** C6B limits stand (admissions/invite/hour, comments/min); upload endpoints staff-auth only; public brief form = rate-limited + Turnstile-class bot check.

## M. Integrations

99. **Accounting:** CSV/QBO export of invoices + payments now; direct QuickBooks sync later. Accountant never logs into CCO OS.
100. **Calendar:** shoot dates are project milestones, not a synced calendar at v1. Google Calendar read-overlay is an ACS pattern — do not port it here until a real double-booking hurts.
101. **Frame.io migration:** start clean. Build a CSV/comment import only when a named client's archive demands it.
102. **Webhooks/Zapier:** outbound webhooks at P6 (job status, approval events) — cheap and enterprise-flattering. Zapier app never at v1.
103. **MCP server (P7.8):** read: projects, assets, review status, transcript search. act: none at v1. Never-list: send, approve, mutate money, delete anything.

## N. Design & brand

104. **Dialect boundary:** Dark Cinema = routes where pixels are the content: `/review/*`, `/nle/*`, `/deliver/*` player, transcode/render monitors. Royal Light Cockpit = all working surfaces: boards, lists, quotes, projects, vault. Cream Editorial = public + proposal PDFs. A route declares its dialect; mixed-dialect pages are defects.
105. **Logos:** raster-exact doctrine, same as ACS — supplied marks only, no redraws. ⚑ (assets needed from Bailey)
106. **Accessibility:** WCAG AA as best-effort with two hard rules: captions correct on delivered video, and the review player fully keyboard-operable.
107. **Browser matrix:** latest-2 Chrome, Safari, Edge. Firefox best-effort. No IE, no legacy Edge, ever.

## O. Legacy & migration

108. **Current data:** scattered (email, spreadsheets, Frame.io history) — **no import for G8**; G8 runs one real new job clean. Historical import is a P6+ decision with a real client archive in hand. ⚑
109. **NAS archive indexing:** yes at P6 — vault index job walks the NAS footage tree read-only and catalogs, never moves.
110. **codeliver:** the GitHub remote name carrying the Co-VideoPro lineage (`baileyeubanks/codeliver`). No live users as a product. Rename repo to `co-videopro` when admin access allows; until then it's plumbing, not product.
111. **49 legacy files:** nothing needed — they were design renders, competitor scrapes, retired ROOT surfaces. Adoption of the reconcile branch drops them; history retains them. (Decided 2026-08-01.)

## P. Process & governance

112. **Code touchers:** agents + Bailey only through P7. First hire = staff role in the RBAC model, not a process change.
113. **Releases:** continuous after gates — every merge to the canonical branch is deployable; the version endpoint (G2) makes staleness measurable. No versioned marketing releases until P7.
114. **Autonomy when unreachable:** agents may write code, tests, docs, review packets, and local previews. Hard never-list: sends, deploys to production hosts, money mutations, DB migrations against live, deletions, secret rotation. (Same spine as ACS.)
115. **Bailey's personal done-check:** open the surface on his phone and do the job it claims to do. The loop plans for this: every phase ends with a preview URL + the one gesture to try. ⚑

## Q. Success & kill criteria

116. **The one number:** **editor-hours from ingest-complete to V1 review link in the client's inbox.** Baseline today ≈ 8–16h for a standard interview package. Target ≤ **2h** by P5 exit. Every architectural choice is downstream of this number.
117. **Perfect Tuesday:** footage uploaded from set before crew leaves → transcript ready at dinner → rough assembly Wednesday morning → client comments by lunch → V2 same day → approval + balance invoice by Friday → delivered + hosted + measured. Two jobs in flight feels calm.
118. **Kill criteria:** if at P5 exit the time-to-V1 number hasn't halved vs baseline, or the OTIO round-trip loses more than it saves, stop the NLE and bridge to Premiere+existing-review-spine instead. The review spine is kept either way (§4.10).
119. **Bailey's fear-check:** the system drifts into generic video SaaS (§2 #9) — so every phase review asks "does this serve the production company we are, or the SaaS we're not."

## R. Sequencing & constraints

120. **Hard dates:** none on file — first real Schneider-class job through the system is scheduled by Bailey when G7 closes. G8 is its gate. ⚑
121. **Must not break:** `co-videopro.com` live review links for any active client work; `contentco-op.com` public face. All P-work lands behind preview URLs until gated.
122. **Bailey hours/week:** assume 2h for decisions/reviews — the loop budgets one decision batch + one phone-gesture check per phase. ⚑
123. **Re-ranked by "sell more work sooner":** P2 (money spine) → G5 (one real file) → P7 delivery teasers → P5 NLE. But gate law says G2/G4 precede — so the plan runs P1 foundation while gates close in parallel, then P2 early. (This is exactly the rollout plan's shape.)

---

*124 questions, 124 answers. Override protocol: Bailey's contradiction on any line rewrites that line; the doc carries the change log.*
