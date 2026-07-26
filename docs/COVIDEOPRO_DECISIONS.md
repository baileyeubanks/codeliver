# Co-VideoPro — Decision Log

Append-only. Newest last. Each entry: decision, context, consequence.

---

## D1 — Canonical worktree (2026-07-16)

**Decision:** `~/Desktop/Projects/contentco-op/cco-videopro-definitive-20260715` (branch `codex/co-videopro-definitive-20260715`) is the Co-VideoPro repository for this mission.
**Context:** Six worktrees share the co-deliver git repo. Only this one contains the prior session's Co-VideoPro transformation (112 modified + ~560 new files, previously uncommitted). `cco-videopro-ui-enrichment` is a clean worktree at the pre-transformation base and was considered and rejected as the starting point.
**Consequence:** All work builds on the prior transformation; nothing is restarted from raw co-deliver.

## D2 — Baseline checkpoint commit (2026-07-16)

**Decision:** Committed the prior session's entire uncommitted state unchanged as `e068ee8` ("checkpoint: preserve prior co-videopro transformation state") before any new work.
**Context:** 16.8k inserted lines sat uncommitted; building on top without a checkpoint would entangle prior work with new changes and risk silent loss.
**Consequence:** `git diff e068ee8..HEAD` always isolates this mission's changes. No push performed; local history only.

## D3 — Product name: Co-VideoPro (2026-07-16)

**Decision:** The product is Co-VideoPro. "Co-Production Pro", "Co-Produce", and "Co-Deliver" are retired in user-facing surfaces; internal identifiers migrate with back-compat shims where they are storage keys.
**Context:** Three names in flight (Current State §0). The mission defines Co-VideoPro as the unified successor to all former Co-* products.
**Consequence:** Rebrand touches `app/layout.tsx` metadata, `components/brand/*`, shell aria-labels, emails/help links, demo storage key (`co-deliver.demo-workspace.v1` → `co-videopro.workspace.v2` + migration shim), package name. `lib/co-produce/lifecycle-contract.ts` keeps its module path (load-bearing for tests) but is documented as the Co-VideoPro lifecycle contract.

## D4 — Project Operating Record delivered through cockpit sections, not a route-tree rewrite (2026-07-16)

**Decision:** Extend the existing cockpit section mechanism (`/projects/[id]?section=…`) into lifecycle-aware contextual navigation, instead of creating a parallel `/projects/[id]/*` route tree.
**Context:** The cockpit is a 2,392-line working surface with upload/review/approvals wired; the internal asset review route already nests differently. A route rewrite would fork working behavior for structural purity.
**Consequence:** One project chrome (new project context bar), tabs appear only for sections whose entities exist, URL-addressable sections, no dead destinations.

## D5 — Dual runtime kept; demo store becomes the full local record (2026-07-16)

**Decision:** Keep the production (Supabase API) + demo (localStorage workspace store) dual runtime. Entity shapes and state machines are defined once in framework-free `lib/` modules and consumed by both. New entities get: demo-store slice + Supabase migration + transition unit tests.
**Context:** No Supabase credentials exist locally; demo mode is the only locally-runnable runtime. The mission requires real persisted behavior — localStorage persistence plus validated transitions satisfies this locally while the migration keeps production schema-complete.
**Consequence:** Demo mode is a truthful runtime with realistic seed data — never mock-only screens. Production deploy still requires Supabase env (unchanged).

## D6 — Subagent quota exhausted → main-agent execution (2026-07-16)

**Decision:** After one successful exploration report, the subagent pool returned billing-quota 403s for all further agents. Exploration, planning, and implementation proceed in the main agent context with disciplined batching.
**Context:** Mission prefers explore/plan/coder agents; the environment cannot supply them this cycle.
**Consequence:** Scope is sequenced strictly by the phasing in the Target Architecture §7; context budget is managed by writing durable docs and diffs rather than re-reading.

## D7 — Contamination removal (2026-07-16)

**Decision:** Remove "Astro Cleaning Services"/ACS content from demo seed and mention suggestions (Current State §5); replace with production-relevant seed clients.
**Context:** Mission §1 hard boundary; contamination is seed-data level only (no ACS business logic exists in the worktree).
**Consequence:** Recorded in the upgrade log; seed v2 carries no ACS references.

## D8 — Nav honesty rule (2026-07-16)

**Decision:** Global nav and project tabs render only destinations whose behavior exists at merge time. Schedule/Resources/Finance/Insights/Hermes-surface entries land only with their slices.
**Context:** Mission's "sidebar sprawl" and "fake NLE/review behavior" failure modes.
**Consequence:** The tab set grows per slice; nothing decorative ships.

## D9 — Orphan sweep: delete superseded, stage intentional (2026-07-25)

**Decision:** Deleted all built-but-unimported components superseded by live surfaces (SearchModal, UploadMonitor, NotificationBell/List/Item, the Wipster-style ReviewWorkspace + its 7 panels, versions/ VersionList·VersionCompare·VersionUpload, MentionSuggestions, QRCodeGenerator). Two orphan sets are intentionally KEPT as staged components: `components/annotations/*` (Konva drawing toolset) and `components/sharing/WatermarkConfig.tsx`, because frame-drawing mode and watermark controls are named flagship capabilities in the owner's product direction; they are to be wired in the review-annotation and share-watermark slices, not rediscovered.
**Context:** Mega build prompt §7-A; every deletion verified zero importers across app/components/lib/tests before removal.
**Consequence:** Dead-code claims in older docs (e.g. "drawn annotations exist") are void until the annotation slice lands. Git history retains all deleted code.

## D10 — Placeholder controls removed, absence pinned by tests (2026-07-25)

**Decision:** Removed decorative controls that rendered but did nothing: Projects toolbar "Batch actions" and the disabled "Cloud import not connected" split menu; cockpit live-session "Start screen share" (disabled button). Regression tests now assert absence instead of pinning the placeholder.
**Context:** Nav honesty rule D8 extended to control level (mega prompt §7-B): a control exists only when its behavior is real.
**Consequence:** Bulk actions, cloud import, and screenshare return only with real implementations.

## D11 — Remote shell truth: session-derived identity and fail-closed role (2026-07-25)

**Decision:** `/api/auth/session` returns `display_name` + `workspace_role` mapped fail-closed from the provisioned auth role (`staff→owner`, `client→viewer`, unprovisioned→`viewer`). The shell consumes it in remote mode: no hard-coded identity, role fails closed to viewer until the session resolves, and the notifications popover reads `/api/notifications` instead of demo seed activity.
**Context:** Remote mode previously hard-coded role=owner and identity="Bailey Eubanks", and leaked demo notifications into production chrome (mega prompt §7-C-3/4).
**Consequence:** Capability gating is now real in production: clients see the viewer nav. A finer per-workspace role model (producer/editor/reviewer) still requires durable membership records — future slice.
