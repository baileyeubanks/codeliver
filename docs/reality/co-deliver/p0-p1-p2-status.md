# Co-Deliver P0/P1/P2 Status

Date: 2026-07-14
Status: L0 blocker ledger.

## P0

1. Missing referenced Co-Deliver pasted text file path in the directive.
2. Default build fails when `/volume1/media` is absent because TUS upload directory creation runs during module evaluation.
3. Declared lint command fails: `next lint` is invalid under current Next version.
4. No declared test command exists.
5. `app/api/assets/[id]/versions/route.ts` resets `approval_steps`, but current schema/code authority is `approvals` plus `approval_workflows`.
6. Analytics/export routes also reference `approval_steps`, which is not created by current migrations.
7. Public token review is not certified for NAS-backed media because `/api/media/stream` requires internal auth.
8. Version upload and export do not prove approved-version authority.
9. Multiple upload paths can create files/assets without one canonical file gate.
10. Multiple notification paths bypass a single idempotent send ledger.
11. The populated demo library, review links, reviews index, library index,
    activity feed, settings, and project details do not share one durable demo
    authority; successful actions disappear or remain invisible on the next
    surface.
12. No sign-in-to-sign-out proof exists with the currently available local
    environment, and real auth cannot be exercised without Supabase credentials.

## P1

1. `share_intent` is derived instead of persisted as a durable contract.
2. Approval links bind by reviewer email rather than explicit approval-step id.
3. Final delivery is a share-link framing, not a durable package model.
4. Audit logging is scattered and not chain-integrity based.
5. Webhook delivery is fire-and-forget without retry/idempotency proof.
6. Dependency audit reports 10 vulnerabilities: 1 low, 5 moderate, 4 high.
7. No proof of real Supabase migration alignment.
8. Internal team RBAC is not proven end-to-end across assets/projects.
9. Archive and trash navigation target routes that do not exist.
10. Project creation exists in two disconnected UI paths; the dedicated form
    does not participate in local demo mode.
11. Share-link creation can present success without producing a durable review
    record visible in `/reviews`.
12. User settings omit workspace branding, team defaults, notification channel
    policy, link defaults, storage selection, accessibility, and session/device
    controls.
13. Email is the only implemented external notification transport. SMS and
    iMessage are absent; no real send may be added without a canonical audited
    adapter and explicit credential/account approval.

## P2

1. Client portal polish and empty states need later review after P0/P1 containment.
2. Email template polish needs later review after canonical send logging exists.
3. Handoff checklist UX is absent.
4. Sample projects and proof fixtures are not established.
5. Mobile settings overflow and hide critical actions.
6. Several compact shell controls have no accessible names.
7. Desktop utility surfaces use large unstructured empty areas and inconsistent
   spacing instead of the dense operational layout established by Projects.

## First Safe Patch Target

Fix the TUS storage module side effect and build-time storage dependency first. This enables repeatable build proof without touching migrations or production data.

After that patch passes default build and focused tests, the next safe product
slice is a single local-development data adapter behind the existing canonical
API boundaries. It must not create a second production auth, share, or storage
path.
