# MEGA ROLLOUT — CCO OS + Co-VideoPro: from current state to operating

> **For Hermes:** Use subagent-driven-development per phase. Every phase closes with evidence (a response, a row, a receipt, or a rendered page), exact SHAs, and an independent review by an agent that did not write the code.

**Goal:** One real Content Co-op job running end to end with the money right (CCO_GOAL §1), then scale to 20 jobs/mo × $8k.

**North-star number:** editor-hours from ingest-complete → V1 review link in client inbox ≤ 2h (baseline 8–16h). *(Answers Q116)*

**Ground truth inputs:** `CCO_PRODUCT_CANON.md` · `CCO_GOAL.md` (gates G0–G8, §2 failure modes, §4 decided) · `STATUS.md` (C5A/C6B hardened source, unapplied migrations) · `ARCHITECTURE_ONE_SHOT_ANSWERS.md` (124 defaults) · license audit (Vidstack MIT ✅ · FreeFrame MIT ✅ · Twick SUL ✅ · OpenVideo/Remotion commercial — excluded).

**Harness (every phase exit):** `git diff --check && npm run typecheck && npm run lint && npm test && npm run build` + surface-specific evidence + independent exact-SHA review.

---

## ERA 0 — CLOSE THE FOUNDATION GATES (days, not weeks)

*Everything downstream is untrustworthy until G0–G2 close (§2 #4). Mostly operational, not feature work.*

### Wave 0.1 — G0 Custody + G2 Deployment truth (IN FLIGHT — finish)
| Task | Evidence | Status |
|---|---|---|
| `/api/version` endpoint + tests | commit `a13d197`, 2/2 green, pushed | ✅ done |
| Runtime :4103 from repo worktree (not /private/tmp) | `lsof` cwd inside repo + `/api/health` 200 | started, verify next turn |
| Verify Vercel preview answers `/api/version` with `a13d197` | curl response | pending |
| Account for 106 modified + 12 untracked in definitive repo; 326 dirty in publish-live; 522 in cco-main | ledger committed | pending |
| Archive 38MB `audit/` → NAS, delete from tree | NAS receipt | decided, execute |
| Adopt `integration/cco-reconcile-20260731` as cco-main main (ref update, no checkout) | ref receipt | decided, execute |
| Independent review of `a13d197` | review packet | dispatch |
| Rewrite CCO_GOAL §0, record 5 §6 decisions | diff | pending |

### Wave 0.2 — G4 Database reality (the big one)
The C5A + C6B migrations are **reviewed source, never applied**. This wave applies them to CCO-DB (`briokwdoonawhxisbydy`) under writer-gate discipline:
1. Preflight: live PostgreSQL version/syntax check, effective grants census, current data contamination census (legacy 0–1 pins), storage provider config audit — read-only, receipts each.
2. Preimage: full `pg_dump` of affected schemas → NAS encrypted, SHA receipt.
3. Apply C5A (upload/asset/V1 authority + sealed inode storage) in a maintenance window → verify RPC behavior, grants, constraints **live** (not source): insert-through-RPC probe row, then remove per rollback plan.
4. Apply C6B (review admission bridge) → verify admission limits (32 active/invite, 32/hour, 120 attempts/10min) with probe traffic.
5. Configure the env layer STATUS.md lists as absent: storage provider + write-enable + `NAS_MEDIA_ROOT` + admission signing key + trusted ingress header. Missing keys must render explicit unavailable states, never silent fallback (anti-drift contract).
6. Malware policy: `required` with no scanner leaves bytes quarantined — install ClamAV on M4 or wire a scan hook; until then only the local-demo provider bypasses (per source).
**Exit:** every C5A/C6B claim re-verified against the live DB; evidence = rows, RPC responses, receipts. Independent review.

### Wave 0.3 — G3 Doors
1. `admin.contentco-op.com/os` currently 404 → route the CCO OS shell (publish-live lineage) so `/os/*` serves the commercial surface.
2. `client.contentco-op.com` has no DNS → add the record, point at the CVP client role surface (Vercel).
3. Verify against `dig`/`curl`, never contract files (§2 #2). Evidence: four hosts answering with correct product + `/api/version` where applicable.

---

## ERA 1 — THE MONEY SPINE (P2, pulled early per Answers R123)

*Why early: it sells work sooner, it's CCO-DB-only (no NLE dependency), and G6 needs it proven before the seam.*

### Wave 1.1 — Schema + quote engine
- Tables: `organizations`, `contacts`, `briefs`, `quotes`, `quote_versions` (immutable: line items, totals, terms, hash, supersedes pointer), `quote_events`. RLS per-tenant. Writer-gate registry entries for every new table (ACS doctrine ported).
- Quote engine: rate-card template library (15 seeded line items per Answers I76), per-line override with audit, discount >15% owner-flag confirm, tax rate field default 0, 50/50 split schedule rows.
- **Tests:** immutability (accepted version rejects writes), version supersession chain, hash stability, split-schedule math, tenant isolation probes.

### Wave 1.2 — Approval + PDF
- Approval page (Cream Editorial public surface, token-gated like ACS `/approve/[token]` — pattern port, not code copy): one-page narrative + line items + terms → **Approve** binds identity + version hash + timestamp + IP → `approval_events`.
- Proposal PDF renderer (raster brand, one-page narrative + line-item page + terms).
- Deposit Stripe payment link minted on approval; acceptance = approval + deposit (Answers A10).
- **Evidence:** a synthetic quote walks brief → v1 → approval → deposit invoice → Stripe test-mode payment → receipt. All rows + receipts committed as proof artifacts.

### Wave 1.3 — Invoicing + reporting
- Invoice entity 1:1 with quote version (deposit + balance from schedule rows), offline payment recording (check/wire), Stripe reconciliation.
- Monday report: AR aging + pipeline by stage + week's shoots/deliveries + pending nudges. One page, printable.
- Pipeline: `lead → contacted → briefed → quoted → negotiating → won | lost(+reason)`; won creates the handoff snapshot (stub until Era 3).
- **Exit G6:** one real (or owner-approved synthetic) contact → brief → quote → approval → invoice → Stripe → reporting, one version throughout, totals immutable everywhere downstream.

---

## ERA 2 — ONE REAL FILE (G5 — the review spine proven live)

*The strongest asset in the tree (§4.10) — hardening exists in source; this era proves it at runtime.*

1. **Upload:** staff-authenticated tus upload through `/api/upload/tus` (only writer) with a REAL file (a real shoot's interview, not a fixture) → sealed inode storage on NAS (`NAS_MEDIA_ROOT`).
2. **Asset + V1:** service-only atomic RPC binds upload → asset → exact V1 (C5A path) → transcode job on M4 mints 1080p/720p proxies (Vidstack player serves proxy; source untouched).
3. **Playback:** authenticated playback resolves immutable version through the receipt-bound range route — verify byte-range requests, no signed-URL leakage.
4. **Anonymous review:** invite → admission bridge (opaque token, 8h admission, 15-min host-only grants, token-free media URL) → public allowlist payload → frame comment source-bound to exact version with 0–100 pins.
5. **Attributable approval:** approval attempt via live admission + compare-and-set on the pending step; approval packet records identity + version hash + timestamp + IP. (STATUS says exact-version attribution is open — this wave closes it: bind reviewer identity server-side from the admission, not caller-supplied.)
6. **Locked delivery:** approval → delivery record → download disposition per role matrix → asset states `approved`/`final` refuse generic edits (already source-true; prove live).
**Exit G5:** the real file's full journey with rows, receipts, and a screen recording of the anonymous client's browser. Independent review + Bailey phone-gesture check: *open the link, leave a frame comment, approve.*

---

## ERA 3 — THE SEAM (G7)

1. `handoff_snapshots` table + service-only API: on `won`, materialize immutable snapshot (client org, contacts, project name/code, deliverables + specs + due dates, frozen quote_version id+hash, scope notes, crew, edit-hour cap).
2. Co-VideoPro project opens from the snapshot — no live cross-product table reads from client surfaces (Answers J84).
3. Change-order flow: new quote version → re-approval → new snapshot with supersedes pointer → project shows history. **Test:** attempt to mutate a commercial total from Co-VideoPro → refused, audit entry written.
4. Editors see deliverables/dates/edit-hour caps; money line items never render in Co-VideoPro (role-gated, test-pinned).
**Exit G7:** accepted Era-1 quote opens as a Co-VideoPro project; totals immutable; seam receipt committed.

---

## ERA 4 — THE NLE (P5 — the thesis, ADR-first)

### Wave 4.1 — ADR (one week, no code)
Decide and record: timeline model (track-list, V1/V2/A1/A2 at P0), rendering approach (Canvas/WebGL compositor vs CSS/DOM — benchmark both with 1080p proxy), state model (immutable sequence versions), OTIO import/export fidelity targets (Premiere + Resolve round-trip fixture suite), keyboard map (Premiere subset). The ADR names what we will NOT build (Wave G59–61 answers).

### Wave 4.2 — Transcript spine (the unfair advantage, first)
- Transcription worker on M4 (Whisper-class), word-level timestamps bound to asset version.
- Transcript editor: correction pass, speaker labels.
- **The gesture:** delete sentence → ripple cut. Select spans → assemble selects → new sequence. (Answers G65)
- Project-wide transcript search.
- **Tests:** word-timestamp → frame mapping ±0 at proxy fps; ripple delete math; search correctness.

### Wave 4.3 — Engine P0
- Sequence/timeline surface (Dark Cinema): V1/V2/A1/A2, trim/ripple/roll/razor, insert/overwrite from selects, cross-dissolve on V1 edit points, J/K/L+I/O Premiere-subset keys.
- Autosave 5s debounce + immutable version rows; recovery = open the version.
- Perf gate: no dropped frames scrubbing 1080p proxy on floor hardware (Answers G64); ship-blocker.
- Loudness normalize to -16 LUFS on web-master render; SRT/VTT export from the corrected transcript.

### Wave 4.4 — Rough-cut assembly + handoff
- Auto-assembly from selects (AI rank ④) with human review — never auto-publishes.
- OTIO export → Premiere/Resolve round-trip fixture suite green; import back without catastrophic loss (documented loss list: color, plugins).
**Exit:** the north-star number measured on a real project: ingest→V1 ≤ 2 editor-hours. Kill criteria armed (Answers Q118): if not halved vs baseline, stop NLE, bridge to Premiere + review spine.

---

## ERA 5 — PRODUCTION DATA + PLAN & BOARD (P3, P4 — parallel with late NLE)

- **P3:** script breakdown → shot list → stripboard → call sheet → kanban. Each is a route surface with its own authority module (§2 #10 — nothing lands in `ProjectCockpit.tsx`; the monolith dies this era: 109KB → route surfaces, P1 exit criterion).
- **P4 field mode:** shoot-day surface (Royal Light): call sheet, shot checklist, footage logging with card-offload ingest → tus upload queue. Offline-tolerant (IndexedDB queue, honest offline states — port the ACS P5 crew-portal pattern).
- **Evidence:** a shoot day run through field mode → footage lands in vault same evening.

---

## ERA 6 — SEAM HARDENING + ENTERPRISE (P6)

- RBAC matrix live across both products (staff/client roles per Answers C31), audit views ("who approved what, when, from where" in one query), outbound webhooks (job status, approval events), library-wide transcript search, NAS vault indexing (read-only catalog of the footage tree).
- Questionnaire-readiness pack: the honest security/audit answers for energy clients (Answers L96).
- SSO: build only when a named client contract requires; RBAC model already allows it.

---

## ERA 7 — DELIVERY LAYER (P7) + G8 OPERATING

1. Hosted delivery pages (Dark Cinema player, client logo on page), iframe embed + oEmbed, password + expiry at P0.
2. Analytics: plays/unique/% watched/drop-off; client summary card + internal detail. The "your film, live, performing" page (Answers H72).
3. Watermark burn into pre-approval proxies (lifts the C6B fail-closed gate deliberately, with tests).
4. MCP server: read-only (projects, assets, review status, transcript search). Never-list enforced: no send/approve/money/delete.
5. **G8 — OPERATING:** one real Schneider-class job runs contact → … → delivered + hosted + measured, real money, every gate's evidence fresh. Bailey's phone-gesture check at every stage.

---

## Cross-era governance (never relaxes)

- Evidence closes gates — never a doc (§2 #4). Deployment truth precedes functional gates (G2 exists precisely for this).
- Independent exact-SHA review per wave; author ≠ reviewer; no commits while review runs.
- Writer-gate discipline for any batch DB mutation (preimage + registry + owner approval).
- No sends auto-fire — nudges/approvals/invoices stage for human approval (ACS doctrine).
- Dialect law enforced per-route; monolith ban enforced (§2 #10); license check before any dependency (§2 #8).
- Bailey's 2h/week: one decision batch + one phone-gesture check per wave, batched by the loop.

## Risk register (top 5)

1. **C5A/C6B migrations fail live application** → preimage + rollback plan + maintenance window; worst case = restore, gates stay red, nothing lies about it.
2. **NLE perf floor unachievable in browser compositor** → ADR wave exists to kill this early; kill criteria in Answers Q118.
3. **Vercel/hosting cost creep past K92** → monthly budget alert; architecture review before credit card.
4. **Scope drift toward video-marketing SaaS** → §2 #9 tripwire; every phase review asks the fear-check question (Q119).
5. **Bailey decision latency** → §6-pattern: decisions batched, defaulted per Answers doc, surfaced not stalled.

## Immediate next actions (this week)

1. Finish Wave 0.1 (verify :4103, audit/ → NAS, cco-main adoption, review `a13d197`, rewrite §0).
2. Launch Wave 0.2 preflight (read-only DB census + storage config audit).
3. Dispatch Era 1 Wave 1.1 schema work to a coder agent with the Answers doc as spec.
