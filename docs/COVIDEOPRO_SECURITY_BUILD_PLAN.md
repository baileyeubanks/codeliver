# Co-VideoPro — Hack-Skills Security Build Plan

**Date:** 2026-07-17 · **Source:** `yaklang/hack-skills` (102 distilled offensive-security skills, cloned to `~/Desktop/Projects/hack-skills`, installed to `~/.agents/skills`) · **Trust model (binding):** authorized targets only — these playbooks are used **defensively against our own system**. Third-party products (Wipster, Sandcastles, Frame.io) are analyzed from public information only, never tested.

---

## 1. What this gives the build

The repo is a distilled offensive-security knowledge base (PayloadsAllTheThings, HackTricks, bug-bounty methodology) organized as: master router (`hack`) → 6 category routers → ~95 deep playbooks. Its own guidance: route by observed surface, test the boundaries AI misses (BOLA #1 finding, business logic highest impact, race conditions on one-time actions, reused filter logic). We convert each relevant playbook into (a) a self-review checklist and (b) executable `node:test` security tests in our existing suite pattern (stub-hook routes, A/B identity tests).

## 2. Surface → skill → action map

| Our surface | Skills to apply | Concrete actions |
|---|---|---|
| Object IDs everywhere — `/api/assets/[id]/*`, `/api/projects/[id]/*`, bulk ops, comments, versions, proposals, milestones, share links | `idor-broken-object-authorization`, `api-authorization-and-bola` | S1: A/B-identity tests on every object route (user A's project must 404/403 for user B — body, query, header id variants). Extend existing tenant-security suite to all new record routes when written (G1 parity loop pairs with this) |
| Auth: Supabase cookie auth, role→surface proxy, invite tokens, signup/reset | `auth-sec`, `authbypass-authentication-flaws`, `jwt-oauth-token-attacks`, `oauth-oidc-misconfiguration` | S2: token-confusion tests (review token ≠ session), invite single-use + expiry, role escalation via metadata claims, signup enumeration policy stays generic |
| Public review portal — `/review/[token]`, share links, watermark, downloads, max_views, expiry | `business-logic-vulnerabilities`, `auth-sec`, `race-condition` | S3: permission-escalation attempts (comment→approve), revoked-link replay, expiry/max-views enforcement under concurrent views (race), watermark presence on download-permitted shares |
| Uploads + NAS — tus, legacy multipart, stream endpoint, path sanitize | `file-access-vuln`, `upload-insecure-files`, `path-traversal-lfi` | S4: extend legacy-media tests with their checklist: extension/content-type confusion, traversal encodings, symlink rejection, no-overwrite race (covered), oversized/zip content |
| Business state machines — proposal gates, payment milestones, stage advance, revision verify, one-time actions (approve-once, invite accept, convert-once) | `business-logic-vulnerabilities`, `race-condition` | S5: state-machine abuse tests — double-approval race, milestone double-pay, verify-while-comments-mutate, stage double-advance, replayed transitions. Our validators are pure — property-test them with adversarial sequences |
| CSV/comment export (future G-feature) | `csv-formula-injection` | S6 (pre-registered requirement): all spreadsheet exports escape leading `= + - @` and tabs — write the test BEFORE the feature |
| XSS — comments, notification bodies, AI summaries (`marked`) | `xss-cross-site-scripting` | S7: stored-XSS tests through comment bodies → review portal render; markdown HTML-injection through AI summary renderer; CSP header check on review portal |
| Webhooks + outbound fetch | `ssrf-server-side-request-forgery` | S8: webhook target allowlist/egress rules test; no user-controlled absolute URLs reaching fetch |
| JSON bodies (estimate_lines, meta jsonb) | `prototype-pollution` | S9: `__proto__`/`constructor` key rejection on all JSON-accepting routes |
| Framing — CORS, CSRF, clickjacking | `cors-cross-origin-misconfiguration`, `csrf-cross-site-request-forgery`, `clickjacking` | S10: `frame-ancestors` CSP on review portal, SameSite cookie audit, no wildcard CORS on API |
| Supply chain | `dependency-confusion` | S11: lockfile integrity in CI, no unpinned internal-sounding package names |

## 3. Loop integration (updates `COVIDEOPRO_IMPROVEMENT_LOOP.md`)

- **Every 5th loop is a security loop** consuming S1–S11 in order, then re-scanning. Each item ships as executable tests in the existing security-test pattern (stub hooks, A/B identities) — not checklist theater.
- **G1 (production runtime parity) pairs with S1/S2**: new API routes land WITH their IDOR/auth tests in the same commit — this is now the required pattern.
- **Feature-trigger rule:** any new surface touching tokens, payments, uploads, exports, or markdown triggers its mapped S-item in the same slice.

## 4. What's installed where

- `~/.agents/skills/` — all 102 hack-skills (router + deep playbooks) loadable in future sessions via the skills system.
- `~/Desktop/Projects/hack-skills/` — full repo for deep reading (kept out of the Co-VideoPro worktree; no vendoring into the product repo).
- Existing related skills already active: `competitive-analysis`, superpowers set, `stripe-best-practices`, `twilio-communications`.

## 5. Boundaries (restated plainly)

- These playbooks run **only against this repository's own routes and surfaces** (local/staging).
- No offensive testing of any third-party system — competitive work stays public-information analysis.
- Payment/auth/provider actions remain in mock/test lanes per the mission's safety boundaries.
