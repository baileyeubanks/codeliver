# Co-Deliver Protected Files

Date: 2026-07-14
Status: L0 protected-file registry.

Do not edit these files casually. Before changes, document owner, reason, risk, and rollback.

## Migration And Schema

- `supabase/migrations/*.sql`
- `lib/types/codeliver.ts`
- `packages/types/src/index.ts`
- `packages/types/src/ontology.ts`
- `packages/types/src/platform.ts`
- `packages/types/src/workflow.ts`

## Auth, Access, RBAC

- `proxy.ts`
- `lib/auth.ts`
- `lib/auth-client.ts`
- `lib/supabase-auth.ts`
- `lib/supabase.ts`
- `lib/access-control.ts`
- `lib/middleware/rbac.ts`
- `lib/utils/permissions.ts`

## File, Storage, Upload, Delivery

- `app/api/media/upload/route.ts`
- `app/api/media/tus/route.ts`
- `app/api/media/tus/[uploadId]/route.ts`
- `app/api/media/stream/route.ts`
- `lib/tus/store.ts`
- `lib/workers/queue.ts`
- `lib/workers/transcode.ts`
- `lib/workers/cleanup.ts`
- `app/api/assets/[id]/export/route.ts`
- `app/api/assets/[id]/versions/route.ts`

## Review, Sharing, Approval

- `app/api/assets/[id]/share/route.ts`
- `app/api/review/[token]/route.ts`
- `app/api/review/[token]/comments/route.ts`
- `app/api/review/[token]/approvals/route.ts`
- `app/api/assets/[id]/approvals/route.ts`
- `app/api/approvals/workflow/route.ts`
- `lib/review-invites.ts`
- `lib/approval-decisions.ts`
- `lib/sharing/share-intent.ts`

## Notification And Webhooks

- `lib/email.ts`
- `app/api/notifications/send/route.ts`
- `app/api/approvals/notify/route.ts`
- `app/api/webhooks/route.ts`

## Environment And Deployment

- `.env.example`
- `DEPLOY_CONTRACT.md`
- `Dockerfile`
- `next.config.ts`
- `package.json`
- `package-lock.json`

## Current Ownership

Owner was not explicitly identified in repo docs. Default owner is Content Co-op / Co-Deliver repo owner per `DEPLOY_CONTRACT.md`.

## Authorized First Patch

Owner: Content Co-op / Co-Deliver repository owner.

Proposed paths:

- `lib/tus/store.ts`
- `lib/storage/media-root.ts` (new focused helper)
- `lib/workers/transcode.ts`
- `tests/media-root.test.ts` (new)
- `package.json`
- `eslint.config.mjs` (new, only if required to restore the declared lint gate)
- `DEPLOY_CONTRACT.md`
- `docs/reality/co-deliver/proof-ledger.md`
- `docs/reality/co-deliver/reboot-snapshot.md`

Reason:

- Remove filesystem mutation during module evaluation.
- Keep transcode output directories lazy and contained beneath the configured
  media root so importing an API route cannot write to the NAS.
- Make a missing NAS mount an explicit runtime error only when storage is used.
- Establish the first repeatable unit-test command.
- Restore a valid lint entry point for Next.js 16.

Risk:

- A lazy storage initializer can move the point at which configuration errors
  appear. Every upload/finalization call site must still fail closed with a
  clear error before accepting bytes or reporting success.
- A transcode job must create its output directories before invoking FFmpeg;
  module import and production build must remain read-only.
- A new lint configuration may expose pre-existing errors; those failures must
  be recorded rather than hidden with broad ignores.

Rollback:

- Revert only the patch-specific helper/import/worker/test/config changes. Do not touch
  migrations, existing dirty UI work, media contents, or Supabase data.
- Restore the previous `lib/tus/store.ts` initializer only if the NAS mount is
  guaranteed at build and runtime; otherwise leave the product blocked.
