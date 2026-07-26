# Co-Deliver Proof Ledger

Date: 2026-07-14
Status: L0 proof ledger.

## Repo Identity

- Branch: `main`
- HEAD: `585a703d6bfbee6a2a6c0bd46f93b30a4dd7f298`
- Worktree: dirty before this packet
- Package manager: npm
- Node: `v22.23.1`
- npm: `10.9.8`

## Commands Run

```bash
sed -n '1,220p' /Users/baileyeubanks/.shared/STATE.md
sed -n '1,980p' /Users/baileyeubanks/.codex/attachments/8bd324d4-8b93-4622-8851-c3a4eb9f87a0/pasted-text.txt
rg -n "Co-Deliver|co-deliver|Codeliver|deliverable|review link" /Users/baileyeubanks/.codex/memories/MEMORY.md
find /Users/baileyeubanks/Desktop/Projects -maxdepth 5 \( -iname '*co*deliver*' -o -iname '*codeliver*' -o -iname '*deliver*' \)
git status --short --branch
git rev-parse HEAD
find app -maxdepth 7 -type f
find lib -maxdepth 4 -type f
find components -maxdepth 4 -type f
find supabase -maxdepth 4 -type f
rg -n "create table|alter table|create type|create policy|storage\.buckets" supabase/migrations
rg -n "approval_steps|approval_workflows|review_invites|share_intent|download_enabled|payment|stripe|checkout|invoice|contract" app lib supabase/migrations
npm ci
npm run typecheck
npm test
npm run lint
npx eslint . --format json --output-file /tmp/codeliver-eslint.json
npm run build
NAS_MEDIA_ROOT=/tmp/codeliver-media npm run build
NAS_MEDIA_ROOT=/tmp/codeliver-media PORT=4103 npm run start
curl -sS -i http://127.0.0.1:4103/api/health
curl -sS -i 'http://127.0.0.1:4103/review/demo?demo=1'
curl -sS -i 'http://127.0.0.1:4103/api/review/demo'
npm audit --json
```

## Results

| Check | Result | Notes |
| --- | --- | --- |
| `npm ci` | PASS | Installed 501 packages; audit reported vulnerabilities |
| `npm run typecheck` | PASS | TypeScript passed after the storage patch |
| `npm test` | PASS | 5 storage containment and lazy-initialization tests passed |
| `npm run lint` | FAIL | Restored ESLint gate found 25 errors and 52 warnings; no broad ignores added |
| `npm run build` | PASS | Default build generated all 47 app routes without a NAS mount after lazy storage initialization |
| `NAS_MEDIA_ROOT=/tmp/codeliver-media npm run build` | PASS | 47 app routes generated |
| built server start | PASS | Ready on port 4103 |
| `/api/health` | PASS | HTTP 200, body `{"status":"ok","service":"co-deliver","port":4103}` |
| `/review/demo?demo=1` | PARTIAL PASS | HTTP 200 HTML shell |
| `/api/review/demo` | FAIL | HTTP 500 from missing Supabase config |
| `npm audit --json` | FAIL | 10 vulnerabilities: 1 low, 5 moderate, 4 high |

## Certification Status

P0 BLOCKED.

No certified user path exists yet for upload-to-review, feedback-to-revision, approval, final delivery, or payment-gated delivery.

## 2026-07-14 Browser Audit Evidence

Current captures were made with the Codex in-app browser at fixed 1440x900 and
390x844 target viewports. Each accepted image has a matching current-run DOM
snapshot in `docs/design-evidence/co-deliver/full-audit/`.

| Surface | Desktop | Mobile | Result |
| --- | --- | --- | --- |
| Login | captured | captured | PARTIAL; desktop form geometry is broken |
| Signup | captured | not yet captured | PARTIAL; no local auth proof |
| Projects | captured | captured | PARTIAL; strongest internal library surface |
| New project | captured | not yet captured | FAIL; disconnected from demo authority |
| Project detail | captured | not yet captured | FAIL; demo project not found |
| Reviews | captured | captured | FAIL; locally created link not persisted |
| Library | captured | not yet captured | FAIL; populated demo assets absent |
| Activity | captured | not yet captured | FAIL; demo actions absent |
| Settings | captured | captured | FAIL; missing channel controls and mobile overflow |
| Public review | captured | captured | PARTIAL; fixture behavior only |

Interactions exercised in the current run:

- selected a deliverable
- opened the batch review-link dialog
- entered an identified reviewer
- changed access to approval
- enabled downloads
- created a local link
- created an inline local project
- opened profile and preference settings

The link and project actions reported success but did not survive navigation or
appear in the Reviews, Library, or Activity surfaces. These are product defects,
not certification proof.

Additional commands and checks run in this reconciliation include route/file/
schema inventories, environment reference scans, HTTP health and page probes,
Product Design context preflight, current official market-source research, and
fixed-viewport browser capture. Build, lint, and typecheck are rerun after the
authorized storage patch so the result binds to the changed tree.

## Protected Patch Result

The first authorized P0 containment patch is verified:

- importing upload and transcode modules no longer creates NAS directories
- upload IDs and media-relative paths are constrained before filesystem access
- upload staging and transcode output directories are created only at runtime
- a missing production mount no longer prevents a read-only production build

The next engineering gate is the 25-error ESLint backlog. The highest-impact
clusters are render-time ref access in player controls and annotations,
keyboard-handler declaration ordering in the review workspace, effect-driven
state resets, and two API `any` types. This ledger records those as existing
failures; they are not waived.

## 2026-07-14 Current Loop Addendum

The earlier audit above is retained as historical evidence. The current tree now
has a shared local demo authority across projects, media, review links, activity,
settings, comments, tasks, and approvals. The canonical ICA project route and
auth routes use the bright Content Co-op cockpit target.

Current command results:

| Check | Result | Notes |
| --- | --- | --- |
| `npm test` | PASS | 5 storage-root containment and lazy-initialization tests |
| `npm run typecheck` | PASS | No TypeScript errors |
| `npm run lint` | PASS WITH WARNINGS | 0 errors, 34 pre-existing warnings |
| `npm run build` | PASS | 49 static/dynamic routes generated |
| `git diff --check` | PASS | No whitespace errors |

Current in-app browser proof:

- signed out from settings and reached the local login route
- signed back in through `next=/projects/ica` and reached the ICA cockpit
- created a timecoded project comment and observed it in activity and the review rail
- created an identified approval-only review link and opened that exact link
- submitted public review feedback and an approve-with-changes decision
- persisted reviewer color, dark/light, reduced-motion, digest, SMS-number, and player-brand settings
- kept the M2 iMessage integration in local dry-run authority; no live message was sent
- verified login and cockpit mobile geometry without document-level horizontal overflow
- verified a clean rebuilt-login tab with no browser console warnings or errors

The upload path now exposes validating, transfer/register, proxy, indexing,
success, and error states. Demo videos are retained in browser-local IndexedDB
with an in-memory fallback and are resolved by both the cockpit player and demo
review route. Production ingest now guarantees an error state and cleanup if
configuration, transfer, or asset registration throws. The Codex in-app browser
does not support automated file selection, so the chooser-to-overlay transition
still requires a manual file selection in the visible preview.

Auth design evidence:

- `docs/design-evidence/co-deliver/reference/auth-login-viewport.png`
- `docs/design-evidence/co-deliver/reference/auth-login-mobile.png`
- `docs/design-evidence/co-deliver/reference/auth-interior-comparison.png`
