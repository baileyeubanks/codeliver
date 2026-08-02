# THE ONE-SHOT QUESTIONNAIRE — everything an architect must know to build CCO OS + Co-VideoPro

**Purpose:** Bailey answers any subset, in shorthand, keyed by number (e.g. `C3: net-30, 50% deposit`).
Every answer lands in canon. Unanswered questions default to "agent's best judgment, flagged in the build."
Over-estimated by design — skip what doesn't apply.

---

## A. Business model & money truth

1. What does Content Co-op actually sell, as a line-item list? (day rates, packages, retainers, per-deliverable?)
2. Is pricing from a rate card, freeform per quote, or hybrid with templates?
3. Who is the buyer persona — title, company size, industry? (Schneider = energy/industrial. Who else?)
4. Sales motion: inbound, outbound, referral, repeat clients — ranked by share?
5. Describe one real Schneider job end to end, as it actually happened — every step from first contact to final payment.
6. Payment terms: deposit %, milestones, net-N? Late-fee policy?
7. Which payment rails must work: Stripe card/ACH, check, wire, other?
8. Sales tax handling — required on any line items? Which jurisdictions?
9. Refund / kill-fee / cancellation policy in writing?
10. What legally constitutes quote acceptance: click, signature, first payment?
11. Who may discount, and what's the max % without owner sign-off?
12. Change orders mid-production: new quote version, amendment, or informal?
13. What 5 numbers do you check weekly? Monthly? What does your accountant need at year-end?
14. Multi-currency ever? International clients?
15. What's the revenue target this system should carry without breaking (jobs/month × avg size)?

## B. Product boundary — what Co-VideoPro is NOT

16. Final no-list: what will Co-VideoPro never do? (live streaming? hosting for the public? stock marketplace?)
17. The "80% first assembly" — define the exact 80%: rough cut, radio cut, selects, transcript edit? What precisely is the last 20% handed off?
18. Which finishing suites must the OTIO handoff round-trip with: Premiere, Resolve, FCP, Avid?
19. Browser-only NLE, or must a desktop wrapper exist?
20. Real-time multi-editor collaboration on one timeline: in scope, later, or never?
21. Motion graphics / titles: in-app minimum set, templates, or handoff?
22. Color: LUT preview + scopes, or handoff-only?
23. Audio: in-app mixing to which loudness standard (-16 LUFS? -23?), or handoff?
24. Captions: required at delivery? Formats (SRT/VTT/burn-in)? Human-corrected or machine-OK?
25. Multicam sync/editing — in scope for event work?
26. Stock media integrations (Artlist/Pond5/etc.) — any?
27. AI features ranked by want: transcription, silence removal, filler-word removal, rough-cut auto-assembly, transcript search, auto-reframe for social, B-roll suggestion?
28. Monthly budget ceiling for AI/API costs per project?

## C. People, roles, tenants

29. Who works at CCO today — you plus how many editors/producers, employees vs contractors?
30. In 2 years: how many simultaneous editors should the system carry?
31. Client-side roles: viewer / commenter / approver / billing — can one person hold several? Can an approver be downgraded to viewer mid-project?
32. Must client orgs ever see each other's anything? (assume never — confirm)
33. Enterprise client requirements already encountered: SSO/SAML? Security questionnaires? Data residency?
34. Audit trail: who must be able to answer "who approved this, when, from what IP" — you, the client, a court?
35. Retention of the audit log: how many years?

## D. Data model & authority

36. Canonical entity list sanity-check: contact, brief, quote, quote_version, project, asset, sequence, version, comment, approval, delivery, invoice, payment — what's missing?
37. When a quote changes, exactly what stays immutable and what versions? (line items only? terms text? validity window?)
38. What is deletable vs frozen forever? (assets after delivery? a client who demands deletion?)
39. Footage volume: GB per project typical/max? TB per month?
40. Retention: how long must RAW live after delivery? Where does archive go (NAS)? Who may purge?
41. Any client contract clauses today dictating storage/region/encryption?

## E. Media pipeline

42. Ingest formats that must upload raw without pre-transcode? Max single-file size? (ProRes, BRAW, R3D, MXF, mp4?)
43. Proxy ladder: which resolutions/codecs for edit vs review vs archive?
44. Transcode compute: M4, cloud (which provider), hybrid? Monthly ceiling?
45. Frame accuracy: what tolerance is acceptable for comment-to-frame binding (±0 frames? ±1?)
46. Timecode: do shoots jam-sync? Must review comments bind to TC, or is media-relative time enough?
47. Delivery color space: Rec.709 only, or HDR ever?
48. Review-link watermarking: burned-in, per-viewer, or none?
49. Which roles may download originals vs proxies vs nothing?
50. Hosted-delivery bandwidth budget/month?

## F. Review & approval spine (the unfair advantage)

51. "Attributable approval" — minimum bar: named account + timestamp + IP? E-sign legal weight needed?
52. Frame comments: pixel-region + timecode + draw-on-frame — all three or subset?
53. Version compare: side-by-side player, A/B toggle, or list-only?
54. Approval states: enumerate the exact set (vN → approved / approved-with-changes / changes-requested / rejected / superseded?)
55. Client goes silent: nudge cadence and who/what sends it?
56. Do review links expire? Default window?
57. Can a client download before approval? After approval, which renditions?
58. Does a client's comment ever notify other client viewers, or only the team?

## G. The NLE (P5)

59. Track model: fixed lanes (V1/V2/A1/A2) or unlimited tracks?
60. Must-have clip ops: trim, ripple, roll, slip, slide, razor, speed ramp — which are P0?
61. Transitions: cross-dissolve only at P0, or more?
62. Keyboard map: Premiere-like, FCP-like, or custom minimal?
63. Autosave: interval, crash-recovery expectation, version history depth?
64. Performance floor: oldest machine + browser that must edit 1080p smoothly? Is 4K timeline playback required?
65. Text-based editing: delete-sentence-cuts-clip (ripple) — the core gesture, confirm?
66. Search: transcript search within project only, or across the whole library?
67. What must NEVER lag, ranked: playback scrub, trim response, transcript sync, render progress?

## H. Delivery layer (P7)

68. Hosted player: white-labeled per client? Client logo or CCO brand?
69. Custom domains for client portals (videos.schneider.com) — ever?
70. Embed: iframe, oEmbed, or JS player?
71. Analytics events: play/pause/seek/completion/drop-off — which does the CLIENT see vs only you?
72. Delivery page report: a pretty "your video performed" page for the client — in scope?
73. Password, domain-restriction, expiry on delivered links — which are P0?
74. Does the client ever get a downloadable archive of project + deliverables (self-serve)?

## I. CCO OS commercial spine

75. Brief intake: client self-serve form, sales call then you enter, or both?
76. Quote builder: line-item library with saved rates — what are the 20 most common line items?
77. Proposal PDF: attach the best proposal you've ever sent — what made it win?
78. Invoice auto-generated from accepted quote version — confirm the 1:1 mapping, or do invoices deviate?
79. Partial invoices / deposit-balance splits: exact rules?
80. Pipeline stages for contacts: lead → contacted → briefed → quoted → won/lost — edit this list?
81. CRM depth: notes/tags/last-touch per contact, or keep it minimal?
82. What report would you open every Monday morning?

## J. The seam (G7)

83. On quote acceptance, exactly which fields cross into Co-VideoPro? (enumerate: client, project name, deliverables, due date, budget cap, line items…)
84. Does Co-VideoPro read CCO-DB directly, via API, or via a copied handoff record?
85. If money changes mid-production, what's the exact flow: new quote version → re-approval → project budget re-freeze?
86. May an editor ever SEE the budget/line items, or is commercial data role-gated from creative staff?

## K. Infrastructure & deploy

87. Host map final answer: Vercel for web apps; M4 runs what, exactly? NAS stores what, exactly?
88. Environments: production + preview enough, or a staging tier?
89. Email: transactional provider (Resend/Postmark/SES)? From-addresses per product?
90. When the site is down at 2am, what happens: page you, log-only, or nothing until morning?
91. Backups: DB cadence, footage strategy, acceptable data loss (RPO) and downtime (RTO)?
92. Total infra budget/month ceiling?
93. Domain list beyond contentco-op.com / admin. / client. / co-videopro.com — anything parked or planned?

## L. Security & access

94. Client portal: accounts with passwords, magic links, or token-gated links only?
95. Team auth: Supabase email+password OK, or must it be Google Workspace SSO?
96. Any client already demanding SOC2/pen-test letters? Expected within 12 months?
97. Secrets: where do they live today, and who/what may rotate them?
98. Rate-limit/abuse posture for public upload and review links?

## M. Integrations

99. Accounting: QuickBooks/Xero export, CSV, or none?
100. Calendar: any scheduling of shoots inside CCO OS, or external?
101. Do clients come FROM Frame.io with data to migrate, or start clean?
102. Webhooks/Zapier for clients' tools — a requirement or nice-to-have?
103. MCP server (P7.8): what should an AI assistant be allowed to read? To do? Hard never-list?

## N. Design & brand

104. Dialect law: define "media context" precisely — which routes/panels are Dark Cinema vs Royal Light?
105. Raster-exact logo doctrine like ACS, or is vector re-creation acceptable?
106. Accessibility target: WCAG AA, or best-effort?
107. Browser support matrix: which browsers/versions must the NLE and review player support?
108. The most beautiful internal tool you've ever used — name it. The one you hate — name it.

## O. Legacy & migration

109. Where does current client/project data live (spreadsheets, Frame.io, email, head)? Import required before G8?
110. NAS footage archive: current folder convention? Worth indexing into the vault?
111. codeliver repo: old product name? Any live users on it? Canonical relationship to Co-VideoPro?
112. The 49 dropped legacy files — anything in them you actually still need?

## P. Process & governance

113. Who besides agents + you ever touches code — external devs, future hires?
114. Release cadence: continuous deploy on merge, or versioned releases with notes?
115. When you're unreachable for a week: what may agents do autonomously — what is the hard never-list beyond sends/deploys/money?
116. Definition of done for P1–P7 beyond the gate table — anything you personally check before calling a phase done?

## Q. Success & kill criteria

117. The one number that proves this worked — time-to-first-assembly? jobs/month? approval turnaround? revenue/job?
118. In 12 months, what does a Tuesday look like if this system is perfect?
119. Kill criteria: what result says stop building and go back to off-the-shelf tools?
120. What are you most afraid I'll build wrong? (the thing you'd check first)

## R. Sequencing & constraints

121. Hard dates: next real Schneider (or other) job that must run through the system?
122. What must NOT break while we build — current client work on what surfaces?
123. Hours/week you can give to decisions and reviews?
124. If P1–P7 were re-ranked by "sell more work sooner," what order would you choose?

---

## The 10 that block the most (answer these first)

**A5** (real job walkthrough) · **B17** (the 80% definition) · **B27** (AI feature rank) · **D39-40** (footage volume + retention) · **E42-44** (ingest + transcode + compute budget) · **F51** (attributable approval bar) · **G64-65** (performance floor + text-editing gesture) · **J83-86** (seam fields + budget visibility) · **K92** (infra budget) · **Q117** (the one number)
