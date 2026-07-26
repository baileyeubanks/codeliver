# Co-Deliver As-Built Current

Date: 2026-07-14
Repo: `/Users/baileyeubanks/Desktop/Projects/contentco-op/cco-codeliver`
Branch: `main`
HEAD: `585a703d6bfbee6a2a6c0bd46f93b30a4dd7f298`
Status: L0 repository reality packet, not certification.

## 2026-07-14 Reconciliation

The June packet was rechecked against the same `main` HEAD and the current dirty
worktree before new protected-path work. The repository now also contains a
local reconstruction of the project library and public review surface. Those
changes are preserved and remain uncommitted.

Current modified paths include the dashboard/project/review UI, shell, approval
actions, shared types, proxy, global styles, and review fixtures. Current
untracked paths include the demo workspace, brand/UI packages, design evidence,
and this reality packet. Deleted `.turbo` logs are generated artifacts. No
pre-existing change was reverted.

Current live proof:

- Development server: HTTP 200 at `http://localhost:4103`.
- Health: HTTP 200 with `{"status":"ok","service":"co-deliver","port":4103}`.
- Project demo: HTTP 200 at `/projects?demo=1`.
- Browser evidence: desktop and mobile captures plus DOM snapshots under
  `docs/design-evidence/co-deliver/full-audit/`.
- Eleven desktop surfaces and five mobile surfaces were captured in the current
  audit run.

The attached directive itself was read in full. Its embedded placeholder for a
second pasted-text path remains unresolved; work continues under the directive's
explicit instruction to record the gap and inspect the repository rather than
invent context.

## What Was Read

- Attached directive: `17.0 Co-Deliver Current Baseline And Execution Authority - 2026-06-27`.
- Shared handoff: `/Users/baileyeubanks/.shared/STATE.md`.
- Repo context docs: `00_REPO_CONTEXT.md`, `DEPLOY_CONTRACT.md`, `STABILIZATION_PLAN.md`.
- Existing Co-Deliver docs under `docs/`.
- App routes under `app/`.
- Components under `components/`.
- Runtime helpers under `lib/`.
- Supabase migrations under `supabase/migrations/`.
- `package.json`, `package-lock.json`, `.env.example`, `Dockerfile`.

The directive references another "Co-Deliver pasted text file" path, but the placeholder path was not filled in. That missing source context is a P0 reality blocker until supplied or explicitly waived.

## Repo Instructions

No repo `AGENTS.md` or `CLAUDE.md` exists in this checkout. The shared global operating contract was followed.

## Dirty Worktree Before L0 Docs

The checkout was already dirty before this packet:

- Modified: `packages/types/src/index.ts`
- Modified: `tsconfig.json`
- Untracked: `packages/brand/`
- Untracked: `packages/ui/`
- Untracked: `packages/types/src/ontology.ts`
- Untracked: `packages/types/src/platform.ts`
- Untracked: `packages/types/src/workflow.ts`
- Untracked `.turbo` artifacts under `packages/api-client/` and `packages/types/`

Those changes were not reverted.

## App Shape

Co-Deliver is a standalone Next.js 16 review and delivery app on port `4103`.

Primary pages:

- `/` dashboard
- `/projects`
- `/projects/new`
- `/projects/[id]`
- `/projects/[id]/assets/[assetId]`
- `/review/[token]`
- `/reviews`
- `/library`
- `/activity`
- `/settings`
- `/login`
- `/signup`

Primary APIs:

- Auth: `/api/auth/login`, `/api/auth/logout`, `/api/auth/session`, `/api/auth/signup`
- Health: `/api/health`
- Projects/assets: `/api/projects`, `/api/projects/[id]`, `/api/projects/[id]/assets`, `/api/assets`, `/api/assets/[id]`
- Upload/media: `/api/media/upload`, `/api/media/tus`, `/api/media/tus/[uploadId]`, `/api/media/stream`, `/api/media/browse`, `/api/media/transcode`
- Versions: `/api/assets/[id]/versions`, `/api/versions/compare`
- Review links: `/api/assets/[id]/share`, `/api/review/[token]`
- Comments: `/api/assets/[id]/comments`, `/api/review/[token]/comments`, `/api/comments/attachments`, `/api/comments/reactions`
- Approvals: `/api/assets/[id]/approvals`, `/api/approvals/workflow`, `/api/approvals/notify`, `/api/review/[token]/approvals`
- Notifications: `/api/notifications`, `/api/notifications/preferences`, `/api/notifications/send`
- Analytics/AI: `/api/analytics/*`, `/api/ai/*`
- Teams/webhooks: `/api/teams`, `/api/teams/invites`, `/api/teams/audit`, `/api/webhooks`
- Sharing helpers: `/api/sharing/analytics`, `/api/sharing/watermark`

## Runtime Assumptions

- Package manager: npm, lockfile present.
- Node declared: `>=20.9.0`; observed node: `v22.23.1`.
- Build command: `npm run build`.
- Start command: `npm run start` or `next start --port ${PORT:-4103}`.
- Dev command: `npm run dev`.
- Typecheck command: `npm run typecheck`.
- Lint command: `npm run lint`, currently broken because `next lint` is not valid for this Next version.
- Test command: absent.
- Default storage root: `/volume1/media`.
- Local successful build needed `NAS_MEDIA_ROOT=/tmp/codeliver-media`.

## Current Proof Classification

- Current route inventory: CERTIFIED PROOF for build route list with `NAS_MEDIA_ROOT=/tmp/codeliver-media`.
- Typecheck: CERTIFIED PROOF for `npm run typecheck` passing.
- Lint: P0 BLOCKED because the declared lint script fails.
- Build: PARTIAL PROOF because build passes only with explicit local `NAS_MEDIA_ROOT`; default build fails on missing `/volume1/media`.
- Boot: PARTIAL PROOF because built server starts and `/api/health` returns 200 with local `NAS_MEDIA_ROOT`.
- Public demo page: PARTIAL PROOF because `/review/demo?demo=1` returns HTML 200.
- Public review API: NO PROOF without Supabase env; `/api/review/demo` returned 500 from missing Supabase config.
- Real upload-to-review, feedback-to-revision, approval, final delivery, and payment-gated paths: NO PROOF in this L0.

### Current Surface Findings

- `/projects?demo=1`: functional local library, selection, inline project
  creation, and share dialog; created projects and review links are not durable.
- `/reviews?demo=1`, `/library?demo=1`, and `/activity?demo=1`: disconnected
  empty states despite populated demo projects and a locally created share link.
- `/projects/ica?demo=1`: `Project not found`; the demo library links and project
  detail authority are not connected.
- `/projects/archive` and `/projects/trash`: shell links exist without matching
  page routes.
- `/settings?demo=1`: profile and two coarse preferences only. Notification
  controls are not the repository's richer notification preference component;
  mobile clips the name fields and action row horizontally.
- `/login`: desktop composition places the form outside the accepted 1440px
  capture while mobile stacks both panels; geometry needs correction and an
  end-to-end local auth proof path.
- `/review/demo?demo=1`: the strongest current surface. It includes branded
  media, timeline markers, comments, approval actions, and responsive controls,
  but its state is fixture-local and not proof of the Supabase-backed path.
- Shell icon buttons include unlabeled controls, which blocks reliable keyboard
  and assistive-technology use.

## First Safe Patch Recommendation

Patch the build/runtime storage side effect first:

- Move TUS upload directory creation out of module evaluation in `lib/tus/store.ts`.
- Add explicit `NAS_MEDIA_ROOT` validation and startup/build-safe behavior.
- Add a small test or script guard that proves default build does not fail because of a missing NAS mount.
- Update `DEPLOY_CONTRACT.md` and `docs/reality/co-deliver/proof-ledger.md`.

This patch is safer than touching schema, approval state, or migrations first because it does not change persisted data and it unblocks reliable build certification.
