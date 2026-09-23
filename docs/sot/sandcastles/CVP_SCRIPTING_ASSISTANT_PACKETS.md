# CVP Scripting Assistant — Implementation Packets (SCA-001…)

**Date:** 2026-09-23 · **Owner:** Bailey · **Lane:** Co-Script weave (T6-adjacent), reasoning engine (Hermes)
**Purpose:** intimate, buildable packets for the Co-VideoPro Scripting Assistant, templated from the Sandcastles scrape (`SANDCASTLES_SCRIPTING_SOT.md`). Each packet is self-contained: intent, source pattern, CVP adaptation, data shape, UX/state contract, doctrine constraints, dependencies, acceptance checks.
**Doctrine (applies to every packet):** provenance law (every generated claim binds to project evidence or is labeled unverified) · honest processing states (job name + output destination + real duration) · professional production-OS tone (no consumer-viral copy) · color is state-only · demo/browser-local persistence must be labeled, never promoted to production truth · server-authoritative metering.

Packet order is dependency order. SCA-001→007 are the assistant spine; SCA-008→013 are cross-cutting surfaces the spine depends on or feeds.

---

## SCA-001 — Scripting Assistant spine: the five-step guided flow

- **Source pattern:** Sandcastles scriptwriter v3.2 — `Prompt → Research → Hook → Style → Script`, "<60 seconds to a viral script," one job per step (vaultlaunch).
- **Intent:** a single guided surface that takes a project from intent to a provenance-bound script draft, ending in a real editor.
- **CVP adaptation:**
  - Route: `app/(review)/projects/[id]/scripts/new` (wizard host); drafts persist server-side per project.
  - Steps: **Brief → Evidence → Hook → Style → Script** (renamed to production dialect; same spine).
  - Step state machine: `idle → collecting_input → processing(honest) → review → confirmed`; user may go back without losing later-step drafts (steps re-run dirtied).
  - Every step writes a `script_run_step` record so the whole run is auditable in the existing vault/agent-run harness.
- **Data shape:**
  - `script_run { id, project_id, mode (SCA-002), brief_text, status, created_by, created_at }`
  - `script_run_step { id, run_id, step: brief|evidence|hook|style|script, input_json, output_json, provenance_refs[], duration_ms, model_id, status }`
- **UX contract:** visible 5-step progress rail; each step shows its output for explicit confirmation before advancing; total elapsed time shown honestly; "Save draft & exit" at every step.
- **Doctrine constraints:** no auto-advance through Hook; no viral framing in any label ("winning script" → "grounded draft").
- **Dependencies:** SCA-002 (mode), SCA-007 (evidence), SCA-004 (hook), SCA-005 (style), SCA-006 (script editor), SCA-008 (async states).
- **Acceptance checks:** a run can be completed end-to-end against demo fixtures; every step record carries provenance refs or an explicit `unverified` marker; back-navigation preserves confirmed steps; run is resumable after reload.

## SCA-002 — Script context modes (Original / Finisher / Fixer analog)

- **Source pattern:** Sandcastles story modes — Original (research included), Finisher (notes→script, no outside research), Fixer (raw script→finished script, no outside research); dropdown on every new story (finisherfixermodes).
- **Intent:** make context scope an explicit, first-class user choice — the user decides whether external research enters generation.
- **CVP adaptation:**
  - Modes: **`grounded`** (brief + project evidence mining), **`develop`** (raw notes → finished script, project evidence only, no new mining), **`repair`** (existing draft → revised draft, structure/style fixes only).
  - Mode selector lives on the first step of SCA-001 and is echoed in the header of every later step ("mode: develop — no new research").
  - Mode constrains SCA-007: `grounded` runs full evidence mining; `develop`/`repair` restrict context to user-supplied text + already-linked project records.
- **Data shape:** `script_run.mode enum('grounded','develop','repair')`; `script_run.source_text` (notes/draft for develop/repair).
- **UX contract:** mode is never defaulted silently — the chooser describes exactly what context each mode admits; switching mode mid-run requires confirmation and marks downstream steps dirty.
- **Doctrine constraints:** in `develop`/`repair`, the evidence step must visibly state "no new research added" rather than disappearing (honesty about what the model saw).
- **Dependencies:** SCA-001 host; SCA-007 honors the mode gate.
- **Acceptance checks:** repair mode never introduces facts absent from the input draft + linked records (tested with fixture transcripts); mode appears in the run audit trail.

## SCA-003 — Hook & Style Bank (Vault analog)

- **Source pattern:** The Vault — "Save To Vault" extracts hook and/or style from any video into a reusable template; hook templates carry `[variable]` slots + provenance (@channel + view count) + search (vaultlaunch; stills 4:42 AM). Queued data shape already noted in `COVIDEOPRO_SCRIPTING_REFERENCES.md`.
- **Intent:** a project/team-scoped bank of reusable hook and style templates, generated deterministically from reasoning-scored segments — never hand-typed viral gimmicks.
- **CVP adaptation:**
  - Surface: Bank panel inside the scripting workspace (and later a Templates-adjacent library view).
  - "Save to Bank" available on any select/transcript segment and on any generated hook/style the user likes.
  - Two template kinds: `hook` (opening-line structure) and `style` (voice/structure descriptor: pacing, sentence shape, story arc).
- **Data shape (per scripting-references doc, extended):**
  - `bank_item { id, project_id|team_id, kind: hook|style, template_text, variables[], source_segment_ids[], source_script_run_ids[], score, tags[], created_by, created_at }`
  - Provenance law: `source_segment_ids` non-empty for extracted items; user-authored items marked `origin: manual`.
- **UX contract:** bank browser with search + tag filter + score sort; each card shows provenance (linked segments) and usage count; insert-into-run is one click from Hook/Style steps.
- **Doctrine constraints:** no gradient identity cards; no view-count virality chrome — provenance shown is *project* provenance (segment, interviewee, timestamp).
- **Dependencies:** reasoning pass 1 segment scoring (E1); SCA-004/005 consume the bank.
- **Acceptance checks:** extraction from a fixture transcript produces a template with resolvable segment citations; bank items render in Hook/Style step pickers; deleting a source segment flags (not silently orphans) the bank item.

## SCA-004 — Hook step: generator over the bank

- **Source pattern:** Hook step auto-generates hooks leveraging Vaulted formats; "Generate more hooks" modal with template `[variable]` slots + provenance + search (vaultlaunch; stills 4:42 AM).
- **Intent:** hook creation as a scored generator over banked formats, grounded in the run's evidence — a deliberate checkpoint, never a free-text afterthought.
- **CVP adaptation:**
  - Step 3 of SCA-001. Input: confirmed brief + evidence pack (SCA-007) + selected bank hook formats.
  - Generation fills `[variable]` slots from the evidence pack; each candidate carries its format's provenance + the evidence refs used.
  - Candidates ranked by reasoning score (deterministic pass first: length, question/curiosity structure, keyword coverage vs brief; Hermes pass optional later).
- **Data shape:** `hook_candidate { id, run_id, bank_item_id, filled_text, variable_bindings{var: segment_id[]}, score, status: proposed|chosen|rejected }`.
- **UX contract:** batch of candidates with per-candidate provenance popover; "generate more" re-rolls with a visible job state; user must explicitly choose or write one hook to advance; chosen hook is editable inline before confirming.
- **Doctrine constraints:** every candidate shows what evidence it binds; candidates that bind nothing are labeled `unverified` and visually de-emphasized, not hidden (honesty) — user may still choose with a confirm.
- **Dependencies:** SCA-003 bank; SCA-007 evidence pack.
- **Acceptance checks:** with fixtures, generated hooks cite real segment ids; "generate more" shows named job + destination; run cannot advance with zero hook decision.

## SCA-005 — Style step: style as a reversible filter layer

- **Source pattern:** "The Style step acts like a filter on top of your writing. It will instantly convert any script to mimic the templated writing style and story structure" (vaultlaunch).
- **Intent:** style application as a *transformation layer* over a draft — previewable, reversible, re-appliable — not a regeneration dice roll.
- **CVP adaptation:**
  - Step 4 of SCA-001; also exposed later as an editor action ("apply style") on any script version.
  - Styles come from SCA-003 bank (`kind: style`) + a small set of system presets (e.g. direct-address, interview-voiceover, caption-forward).
  - Implementation: style descriptor + draft → styled draft; original draft retained as parent version (diff view).
- **Data shape:** `style_application { id, run_id, bank_item_id|preset_id, parent_script_version_id, result_script_version_id, applied_at }`.
- **UX contract:** side-by-side before/after preview; apply/remove/re-apply without losing the underlying draft; style card shows provenance of the style template.
- **Doctrine constraints:** style changes voice/structure only — it must not introduce new factual claims (diff view highlights any sentence with no parent counterpart for review).
- **Dependencies:** SCA-003; SCA-006 versioning.
- **Acceptance checks:** removing a style restores the exact parent draft; diff view flags novel sentences; style presets work with an empty bank.

## SCA-006 — Script step: real editor, length control, precision edits

- **Source pattern:** "Edit live like a google doc, adjust scripts to any length, and layer on precision edits with the exact granularity you'd expect" (vaultlaunch).
- **Intent:** generation ends in an editor the user owns — not a chat bubble.
- **CVP adaptation:**
  - Step 5 of SCA-001 hosts the script editor surface; same component reusable wherever scripts appear.
  - Capabilities: direct text editing; explicit **length control** (target duration/word count slider mapped to speaking-rate estimate); **selection-scoped precision edits** ("tighten this paragraph", "make this line land harder") executed as bounded transformations with provenance notes.
  - Every save creates an immutable `script_version` (matches our immutable-version doctrine for media).
- **Data shape:** `script { id, project_id, run_id, title }`; `script_version { id, script_id, parent_version_id, body, target_length, provenance_map{sentence_range: refs[]}, created_by, created_at }`.
- **UX contract:** autosave with version toast; length readout (est. runtime at configurable WPM); precision-edit popover on selection with named job state; version history drawer with restore.
- **Doctrine constraints:** precision edits that require facts not in evidence are refused with an explanation, or applied and marked `unverified` per user choice — never silently invented.
- **Dependencies:** SCA-001 host; versioning storage.
- **Acceptance checks:** version chain is immutable and restorable; length control demonstrably changes draft length within tolerance on fixtures; precision edit on a selection leaves other text byte-identical.

## SCA-007 — Evidence step: research mining inside the project record

- **Source pattern:** Sandcastles "Research" mines external facts/angles (Original mode); per-video transcript + analysis objects (home; vaultlaunch).
- **Intent:** CVP's research step mines the **project's own record** — transcripts, selects, briefs, decisions, review comments — and binds everything it returns.
- **CVP adaptation:**
  - Step 2 of SCA-001 (`grounded` mode only; `develop`/`repair` show the honesty notice per SCA-002).
  - Retrieval: transcript segment search (keyword + speaker + reasoning score), selects bank, brief/proposal fields, prior scripts.
  - Output: an **evidence pack** — deduplicated, ranked fact/angle cards, each with segment citations; user includes/excludes cards before Hook.
- **Data shape:** `evidence_pack { id, run_id, items: [{ claim_text, segment_ids[], score, source_kind }] }`.
- **UX contract:** cards show provenance inline (click → segment in transcript workbench); include/exclude toggles; honest job state while mining ("Mining project transcripts → Evidence step").
- **Doctrine constraints:** no web scraping in v1; no claim without a citation enters the pack; excluded cards remain visible in the audit trail.
- **Dependencies:** E1 transcript workbench + reasoning pass 1 (segment features/scoring).
- **Acceptance checks:** every pack item resolves its citations; excluding a card removes it from downstream Hook/Script context (verified via step records).

## SCA-008 — Honest async state contract (cross-cutting)

- **Source pattern:** "Analysis started" toast names the job + where output lands ("added to Ideas Inbox when complete"); per-card "Analyzing…" state (stills 1:36 PM).
- **Intent:** every async job in the assistant announces itself, its destination, and its real duration — same discipline as our outbox/transcode states.
- **CVP adaptation:**
  - Shared `JobToast` + per-object pending card component used by all SCA surfaces (evidence mining, hook generation, style application, precision edits, report runs).
  - Toast contract: `{job_name, destination, started_at}`; completion toast links to the output object.
- **Data shape:** reuse existing job/outbox records; add `destination_label` + `result_href`.
- **UX contract:** no global spinners without job identity; pending cards are individually cancellable where the underlying job supports it; failures produce opaque `{error, code}` per `lib/api/responses.ts` with a retry affordance.
- **Doctrine constraints:** no fake progress bars; no "<60 seconds" promises — show measured durations from prior runs if anything.
- **Dependencies:** existing outbox/job infrastructure.
- **Acceptance checks:** every async path in SCA-001…007 emits start/complete toasts with destination links; failure path renders the standard opaque error.

## SCA-009 — Portability surface: Copy-As-Prompt, export, API-shaped access

- **Source pattern:** "Create Prompt" 4th action button (system + script instructions: topic, hook, structure, style, research facts); report Export; MCP server for Claude/ChatGPT/Codex with one-click "MCP code transfer" (newreleases-091425; hook-genius; mcp-chatgpt).
- **Intent:** let users carry CVP-grounded packets into their own AI tools without lock-in — while keeping auth boundaries and provenance intact.
- **CVP adaptation:**
  - **Copy-As-Prompt** on script runs, evidence packs, and insight reports: composes system instructions + structured payload (brief, chosen hook, style, evidence with citations).
  - **Export** (markdown/JSON) on the same objects.
  - External MCP-style server: **deferred** until the export contract is reviewed; if built, it is read-only, token-scoped per project, and never bypasses route authority.
- **Data shape:** export payload schema versioned: `cvp_script_packet_v1 { brief, mode, hook, style, evidence[], script_body, provenance_index[] }`.
- **UX contract:** copy/export buttons on the run header and report pages; honest caveat line (theirs: quick prompt "will not be better than" the full tool — ours: external tools can't see live provenance links).
- **Doctrine constraints:** exports include provenance index by default; no secrets, tokens, or cross-project data in any payload; server-side composition only.
- **Dependencies:** SCA-001…007 objects exist.
- **Acceptance checks:** exported packet round-trips through the schema validator; payload contains no fields outside the schema (snapshot-tested).

## SCA-010 — Project insight reports (Content Strategy Audit / Hook Genius analogs)

- **Source pattern:** Reports tab — parameterized, saved, schedulable, toggleable-with-history report objects; Content Strategy Audit (topics/hooks/formats/tactics of a channel; params: video count, sort, look-back, frequency, exclusions); Hook Genius (top 3–5 hook strategies with examples + source-video mapping + stop-doing list) (reports; hook-genius).
- **Intent:** recurring, parameterized analysis over the **project's own production history** — what topics/structures/hooks landed with this client's audience or review board.
- **CVP adaptation:**
  - Report object with params (scope: project/series/client; window; asset filter; frequency: manual|weekly) and run history.
  - v1 report types: **Deliverable Performance Audit** (which scripts/versions reached locked delivery fastest, revision-round counts by structure) and **Hook Review** (opening-segment strength across deliverables, mapped to source segments).
  - Scheduling uses the existing job harness; reports render as first-class pages with export (SCA-009).
- **Data shape:** `report { id, scope_json, type, params_json, schedule, enabled, created_by }`; `report_run { id, report_id, output_json, duration_ms, created_at }`.
- **UX contract:** Reports tab listing objects with last-run status; run detail shows parameters used + honest job states; disabling keeps history (their pattern, adopted verbatim).
- **Doctrine constraints:** reports describe *the project's own data*; no benchmarking against other tenants; no "viral" language.
- **Dependencies:** SCA-007 evidence retrieval; delivery/revision data (P19 spine).
- **Acceptance checks:** a scheduled report runs via the job harness on fixtures; toggling off preserves prior runs; every report claim links to underlying records.

## SCA-011 — Reasoning-scored evidence browser (outlier feed analog)

- **Source pattern:** Videos tab — outlier score (0.2×–100×) as default sort; rich filters; Saved Filters presets incl. two system defaults; "More Like This" on story shape not keywords; account-scoped personalization with explicit no-train promise (newreleases-091425; stills 4:47 AM).
- **Intent:** the assistant's browsing surface ranks *project evidence* by computed signal — the same shape as our reasoning v1 sound-bite score.
- **CVP adaptation:**
  - Evidence browser (used by SCA-007 and standalone): default sort = reasoning score; filters: speaker, keyword, duration, source asset, used/unused-in-scripts.
  - **Saved filter presets** per user per project; ship two system presets ("Strongest sound bites", "Unused strong segments").
  - "More like this" on a segment: similarity over structure/features (question/answer shape, pacing), not keyword overlap.
- **Data shape:** `segment_features { segment_id, duration_ms, speaker, qa_role, keyword_density, score }` (reasoning pass 1 output); `saved_filter { id, user_id, project_id, name, filter_json, is_system }`.
- **UX contract:** score badge with hover explanation of contributing features; filter presets renameable; personalization (if any) is account-scoped and inspectable.
- **Doctrine constraints:** score is explained, never a black box; no cross-tenant learning — architecturally enforced, not just promised.
- **Dependencies:** E1 reasoning pass 1.
- **Acceptance checks:** score explanation matches the deterministic feature formula on fixtures; saved presets round-trip; "more like this" returns structurally similar segments on fixture corpus.

## SCA-012 — Treatment composer (Content Success Formula analog)

- **Source pattern:** "Your Content Success Formula" widget — composes winning topic × format × hook into a recipe; shuffle for infinite combinations (dashboard).
- **Intent:** a composer that recombines the project's own proven elements into candidate briefs for new scripts/deliverables.
- **CVP adaptation:**
  - Composer card on the scripting home: slots = {audience/goal (from brief), format (Templates taxonomy), hook format (SCA-003), style (SCA-003)}; shuffle recombines from top-scored bank items.
  - "Use this formula" seeds SCA-001 step 1 with the combination pre-filled.
- **Data shape:** derived at read time from `bank_item` scores + project brief fields; no new persisted object until seeded into a run.
- **UX contract:** each slot shows provenance count ("from 6 banked hooks"); shuffle is instant and local; seeded runs record the combination in `script_run_step.input_json`.
- **Doctrine constraints:** combinations come only from the project's/team's own bank — no imported "viral" formulas.
- **Dependencies:** SCA-003 bank with enough items (empty-state: composer hidden with an explanatory hint).
- **Acceptance checks:** shuffle only draws from banked items; seeding pre-fills the run correctly; empty bank renders the honest empty state.

## SCA-013 — Metering honesty (credits / usage analog)

- **Source pattern:** one credits currency across research/analysis/hooks/scripts; balance + usage at Settings → Usage (vaultlaunch; home FAQ).
- **Intent:** if/when CVP meters reasoning/generation cost, the cost is visible before and after every action — server-authoritative.
- **CVP adaptation:**
  - Usage surface under project/team settings: balance, per-action cost table, run history with per-step costs (from `script_run_step.duration_ms`/model metering).
  - Pre-action cost hint on every metered button ("Generate hooks · ~N credits").
- **Data shape:** ledger table `usage_ledger { id, team_id, actor_id, action, units, run_id, created_at }`; server-authoritative deduction in the same transaction as job enqueue (mirrors the checkout/idempotency discipline in `lib/covideopro/checkout.server.ts`).
- **UX contract:** insufficient-balance state is a clear, non-dark pattern explanation with an upgrade path; no urgency copy.
- **Doctrine constraints:** no refund-refusal or scarcity marketing language; metering never blocks export of already-created work.
- **Dependencies:** SCA-001 step records; team billing settings.
- **Acceptance checks:** ledger entries reconcile with step records on fixture runs; insufficient-balance path fails closed with the standard opaque error shape.

---

## Explicitly deferred (do not build in this lane)

- **Collections-style inspiration taxonomy** → lands with the Templates surface (production templates: brand film / recap / podcast / social series), per `COVIDEOPRO_SCRIPTING_REFERENCES.md` queued adoption.
- **Dashboard / watchlists / social verification / external channel monitoring** → E4 research lane, after El Paso + edit/review depth (teardown §4).
- **External MCP server** → deferred per SCA-009 until export contract review.
- **Web-external research in the Evidence step** → v1 mines the project record only (SCA-007).

## Cross-repo touchpoints (when packets implement)

- `docs/COVIDEOPRO_SCRIPTING_REFERENCES.md` — prior screenshot-verified pattern notes (Hook Bank shape, processing honesty, templates mapping).
- `docs/COVIDEOPRO_COMPETITIVE_TEARDOWN.md` §2/§4 — Sandcastles benchmark + E1–E4 wave ordering.
- `docs/COVIDEOPRO_CCO_UNIVERSE_ADOPTION.md` — Surface H cockpit north star.
- Reasoning engine (Hermes) harness + vault/agent-run audit — SCA-001 step records must land there.
- `lib/api/responses.ts`, `lib/api/backend.ts` — opaque error contract for all new routes.
