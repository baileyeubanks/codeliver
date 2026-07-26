# Co-Produce Goal Extension

Date: 2026-07-14
Status: Active long-form goal extension; contract-first, not a production-readiness claim.

## Authority

This document extends the active Co-Deliver objective into the unified Co-Produce
product direction. It does not replace the repository reality packet or the
Co-Suite commerce blueprint. Where they differ, current repository and runtime
evidence controls implementation claims, while the commerce blueprint controls
suite packaging and project-access intent.

Source blueprint:
`/Users/baileyeubanks/Desktop/Projects/contentco-op/cco-suite-commerce-plan/docs/strategy/co-suite-mega-app-blueprint.md`

Co-Produce is the project-scoped production workspace. Co-Deliver remains the
shell, identity, permissions, version, review, approval, delivery, billing, and
audit authority. Co-Script and Co-Edit become modules inside the same project,
not separate account systems.

## Goal Extension

The active goal now includes:

1. A simple Wipster-inspired point-comment workflow with no freehand drawing
   requirement for public video review.
2. Keyboard-first review: Space toggles playback, Left and Right seek by a
   selected whole-second interval, and Down records a non-destructive cut
   decision.
3. A synchronized transcript workspace with speaker repair, search,
   click-to-seek, word confidence, review states, comments, and exports.
4. Reversible filler, pause, silence, and breath candidates backed by transcript
   timing plus acoustic evidence. No detector may mutate source media.
5. A source-time edit-decision model that can preview, accept, reject, adjust,
   undo, redo, render, and explicitly publish a new version.
6. A project and brand knowledge vault that harnesses agents with provenance,
   permissions, confidence, and durable decision history.
7. Transparent Co-Credit metering for paid compute, with free reviewers,
   free collaboration actions, explicit estimates, overage default-off, and no
   paywall on commissioned approved deliverables.

## Implemented Review Contract

The current review checkpoint implements the first item:

- A frame click pauses the real media, captures one point and the exact source
  timestamp, and focuses one compact inline composer.
- Enter or the send icon posts one comment and resumes playback.
- Point coordinates are relative to the rendered media, not letterbox space.
- The public review page does not mount the repository's freehand annotation
  canvas or shape toolbar.
- Space toggles playback from the focusable player.
- Left and Right use a persisted `1s`, `2s`, `5s`, or `10s` interval.
- Down adds one visible cut decision without pausing or changing source media.
- Inputs, textareas, selects, buttons, links, contenteditable regions,
  composition events, modifiers, and repeat-sensitive commands are isolated
  from player shortcuts.
- The comment API rejects invalid timestamps and unpaired, non-finite, or
  out-of-range point coordinates.

Demo cut decisions persist in the local demo workspace and survive refresh.
The repository now includes a version-bound edit-decision migration, owner and
review-token APIs, idempotent request IDs, version-bound comments and links, and
public/internal cut controls. Production durability is not certified until the
migration is applied to a staged Supabase project and the authenticated path is
verified against real version data.

## Enterprise Operating Horizon

Co-Produce is being built as an enterprise media operating system, not a set of
loosely connected creator tools. Every pillar must preserve the same identity,
tenant, project, version, permission, billing, and audit authorities while it
evolves through three horizons:

1. **Horizon 1: coherent production core.** Real end-to-end workflows, safe
   local/demo adapters, explicit external boundaries, durable version data,
   and complete mobile/desktop interaction paths.
2. **Horizon 2: enterprise scale.** Multi-tenant policy, delegated admin,
   queues and backpressure, provider portability, observability, SLOs,
   idempotency, disaster recovery, data lifecycle, and large-project
   performance.
3. **Horizon 3: governed media intelligence.** Residency and legal hold,
   auditable agents, model and prompt lineage, calibrated evaluations,
   policy-driven automation, global delivery, and deterministic replay.

The enterprise pillars are:

- identity, organizations, policy, preferences, and white-label branding
- project, asset, version, comment, approval, and audit authority
- upload, storage placement, media processing, derivatives, and continuity
- sharing manifests, recipient permissions, notifications, and delivery
- transcript, waveform, captions, analysis candidates, and reversible editing
- creator workspace, mobile review, desktop cockpit, and collaboration
- Co-Credit metering, budgets, usage receipts, and commercial controls
- vault knowledge, provenance, rights, agents, and human approval
- certification, security, accessibility, resilience, and release governance

Each pillar runs the same recursive loop:

```text
inventory current evidence
-> select the highest-risk missing capability
-> implement one coherent improvement
-> attack-test behavior, permissions, failure, scale, and accessibility
-> measure and save proof
-> update the capability map and residual risks
-> select the next highest-risk gap
```

An agent may not claim a pillar complete because its isolated tests pass. The
conductor integrates each contribution into the shared product, verifies its
cross-pillar contracts, and keeps the long-form goal active until the full
requirement-by-requirement completion audit is proven.

## Transcript Truth Model

Rev's current public documentation confirms a three-region transcript editor,
speaker repair, comments, search and replace, timestamp playback, low-confidence
word display, read-along highlighting, clips, and transcript exports. Rev AI
JSON includes per-word start, end, and confidence values. Rev documents
transcript text editing and clipping, but the reviewed public documentation does
not establish a Descript-style composition engine where transcript edits
reversibly change media playback.

Co-Produce must therefore keep these objects separate:

```text
SourceArtifact        immutable uploaded media and checksum
SourceToken           immutable source word timing and provider confidence
TranscriptRevision    corrected display text and speaker assignments
AnalysisCandidate     proposed filler, pause, silence, breath, or confidence issue
Composition           ordered source spans used for edited playback
EditDecision          reversible command against source-time ranges
RenderArtifact        derived preview or final output for one exact revision
PublishedVersion      explicit promotion of a verified render
```

The user-facing commands must remain distinct:

- Correct transcript: changes reviewed text only.
- Exclude from cut: changes composition playback but preserves source and text
  history.
- Remove from transcript: changes display text while audio remains.
- Ripple delete: removes a source range from composition and shifts later time.
- Lift: preserves duration and requires an explicit video and audio fill policy.
- Mute audio: preserves video and timeline duration.

Comments, transcript tokens, waveform peaks, candidates, and operations use
source time as the canonical coordinate. Edited playback and caption exports use
a derived source-to-composition time map.

## Audio Intelligence Contract

Analysis runs are immutable and pinned to source version, source checksum,
pipeline version, configuration hash, provider, model, language, and stream.

Job graph:

```text
probe -> extract audio -> waveform + STT + VAD + silence analysis
      -> candidate fusion -> human preview/review
      -> draft edit decision -> preview render -> QC
      -> explicit publish as new version
```

Required behavior:

- Request verbatim transcription so `um` and `uh` remain timed evidence.
- Treat transcript word gaps and acoustic silence as separate signals.
- Require waveform/VAD evidence before a pause becomes a cut candidate.
- Store candidate states as `pending`, `accepted`, `rejected`, or `adjusted`.
- Preview each candidate in source context and adjusted-boundary context.
- Favor natural joins and suppress candidates that clip adjacent speech.
- Never run an irreversible cleanup command or overwrite `assets.file_url`.
- Acceptance appends an audit event and a draft EDL revision only.
- Only explicit `publish_as_new_version` may create a new media version and
  trigger approval/comment remapping rules.

Initial thresholds are calibration hypotheses, not product promises. No
candidate may receive a high-confidence label until a labeled Content Co-op
corpus proves at least 95 percent precision for that detector and profile.

## Transcript Workspace UX

Desktop:

- Resizable transcript dock beside the player, with the timeline always visible.
- Virtualized, semantic DOM transcript for long files.
- Word-follow playback, click-to-seek, speaker controls, search, confidence and
  review state, candidate filters, and source/composition time display.
- Candidate review drawer with preview, accept, reject, adjust, and undo.

Mobile:

- Player-first review with transcript as a full-height sheet.
- Large word and speaker targets, sticky playback controls, search, and one
  candidate action at a time.
- No desktop timeline compression into unreadable controls.

Accessibility target: WCAG 2.2 AA, including semantic transcript text,
keyboard-operable playback, visible and unobscured focus, non-color-only review
states, and an accessible comment-at-current-time alternative to spatial pinning.

## Vault-Backed Knowledge System

The editing database is a project-scoped knowledge vault, not an unstructured
folder of prompts. An Obsidian-compatible Markdown export may be offered, but
Markdown files are not the transactional authority.

Canonical node families:

```text
SourceArtifact         URL, document, transcript, media, brief, guideline
Claim                  atomic factual or strategic assertion
Evidence               source span supporting or challenging a claim
Pattern                hook, structure, visual, pacing, or production pattern
BrandRule              must-say, must-avoid, voice, visual, legal, rights rule
PerformanceObservation measured result with platform, cohort, and date
ScriptDecision         why a source or pattern affected a draft
EditDecision           why a source-time operation was proposed or accepted
DeliveryDecision       approval, package, permission, retention, or handoff choice
AgentRun               inputs, retrieved evidence, policy, model, output, reviewer
UsageReceipt           quote, reservation, native usage, Co-Units, funding source
```

Every knowledge object requires:

- organization and project scope
- stable ID and schema version
- source URI or artifact ID
- captured timestamp and content checksum
- author or agent identity
- provenance type: primary, secondary, user assertion, inference, or hypothesis
- confidence and review status as separate fields
- permissions and visibility
- supersedes/superseded-by links
- citations to exact source spans where available
- retention and deletion policy

The supplied "Architecture of Attention" research is useful as a pattern map,
but its neuroscience and causal-performance language is not automatically an
empirical fact. The vault must classify claims from that document as sourced
facts, attributed creator methodologies, marketing claims, inferences, or
hypotheses. Agents may use lower-confidence patterns to propose experiments,
but may not present them to clients as proven science without primary evidence.

## Agent Harness

Every agent run must be scoped by project, role, capability, budget, and source
set. The harness follows this sequence:

1. Resolve server-side entitlement, project permission, and budget.
2. Build a retrieval plan from explicitly allowed vault collections.
3. Return source IDs and exact evidence spans with retrieved context.
4. Generate a proposal with assumptions, confidence, and expected usage.
5. Validate citations, brand rules, rights, privacy, and output schema.
6. Save the proposal as a versioned artifact; do not overwrite approved work.
7. Require human acceptance for factual claims, expensive operations, and edit
   decisions that affect deliverables.
8. Record the final decision, resulting artifact, and usage receipt.

The harness must fail closed on missing source authority, cross-project context,
budget exhaustion, stale revisions, or unsupported claims. Agent memory is a
retrieval aid; the project vault and append-only audit history are authority.

## Co-Credit And Usage Contract

`1 Co-Credit = 1,000 Co-Units (CU)`. CU is an integer product-accounting unit,
not currency, an LLM token, or stored value.

Billable compute includes AI research/generation, transcription, translation,
media analysis, generated media, new transcodes, preview renders, and exports.
Manual editing, comments, approvals, metadata, sharing, and playback of existing
proxies are free collaboration. Project-grant review history and commissioned
approved-final downloads are service obligations and never consume client
credits.

Every expensive operation follows:

```text
estimate -> reserve maximum -> start -> commit actual or release -> receipt
```

Rules:

- A quote shows min, likely, and max CU, remaining balance, assumptions, rate
  version, possible overage, and expiration.
- Overage is off by default and requires explicit owner-set CU and currency caps.
- The system may not exceed the confirmed maximum; platform overruns are
  absorbed.
- Failures, duplicates, unusable output, safety rejection, cache hits, and
  platform retries do not debit the customer.
- Native measures remain available for audit: model tokens, search calls, audio
  milliseconds, analyzed-media milliseconds, output pixel-time, byte-hours, and
  egress bytes.
- Storage and egress remain separate meters instead of silently draining AI
  credits.
- Reviewer and client roles never consume creator seats or see overage prompts.
- Stripe receives only settled, undisputed, explicitly enabled overage totals.
  Internal usage and entitlement state remain the real-time authority because
  Stripe meter aggregation is asynchronous.
- No product request directly creates payment activity.

## Permanent Client Access

The `service_project_grant` remains subscription-independent and project-scoped.
It permits review history, approved exports, standard playback, and a Continuity
Pack. It does not permit unrelated projects, raw/internal media, new AI, or new
renders.

The Continuity Pack includes approved masters, review proxy, captions/transcript,
thumbnails, version identifiers, checksums, delivery record, and licensing/source
manifest where applicable. Billing state is never a reason to revoke a
commissioned client's approved deliverables.

## Ownership Boundaries

Co-Deliver owns:

- shell, identity, organizations, projects, RBAC, links, versions, comments,
  approvals, notifications, delivery, project grants, usage receipts, and audit

Co-Script owns:

- briefs, research ledger, claims, outlines, script versions, production notes,
  and script exports, all under Co-Deliver project authority

Co-Edit owns:

- transcript review, analysis candidates, composition revisions, edit decisions,
  preview/final renders, and NLE handoff, all under Co-Deliver version authority

The project vault is shared infrastructure with module-specific schemas and
capability grants. No module creates a second identity, permission, billing,
project, or audit authority.

## Phased Execution

0. Preserve current work and add shared contracts/fixtures only. No payment
   enforcement, migration, or auth change in the first suite patch.
1. Finish version-bound review authority, durable point comments, and durable cut
   decisions.
2. Add read-only transcript, speaker repair, search, confidence review,
   click-to-seek, and waveform artifacts.
3. Add filler, pause, silence, and breath candidates with preview/reject audit.
4. Add immutable composition revisions, source time maps, undo/redo, and NLE
   export before enabling automated cleanup.
5. Add vault schemas, provenance ingestion, brand rules, source-ledger retrieval,
   and agent-run audit.
6. Add Co-Credit quotes, reservations, receipts, budgets, and internal ledger;
   keep Stripe export disabled until reconciliation tests pass.
7. Add server-side rendering, QC, explicit publication, approval reset, and
   comment/transcript remapping.
8. Certify permissions, idempotency, privacy, accessibility, recovery, media
   integrity, usage disputes, and Continuity Pack export.

## Release Gates

- Source checksum is unchanged before explicit publication.
- No draft action mutates the current asset URL, version, or approval state.
- Comments and decisions bind to exact source version and time.
- Retries are idempotent and customer usage commits at most once.
- A/V sync remains within one frame and output duration matches the compiled EDL.
- AI suggestions expose evidence, confidence, and a reversible human decision.
- No cross-project vault retrieval is possible.
- No client final is paywalled by a producer subscription state.
- No paid operation begins without entitlement and budget reservation.
- Desktop and mobile proof paths pass with keyboard and screen-reader semantics.

## Primary Sources Reviewed

- Rev transcription editor: https://support.rev.com/hc/en-us/articles/29824992702989-Transcription-Editor
- Rev AI word timing, confidence, and disfluency behavior: https://docs.rev.ai/api/features
- Descript filler review choices and harsh-cut avoidance: https://help.descript.com/hc/en-us/articles/10164806394509-Remove-filler-words
- Descript configurable word-gap review: https://help.descript.com/hc/en-us/articles/10164807277453-Shorten-word-gaps
- Stripe usage recording and asynchronous aggregation: https://docs.stripe.com/billing/subscriptions/usage-based/recording-usage-api
- Stripe meter configuration: https://docs.stripe.com/billing/subscriptions/usage-based/meters/configure
