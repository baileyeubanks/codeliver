# Co-Deliver Product Intent

Date: 2026-06-27
Status: L0 intent baseline.

Co-Deliver is intended to be a durable delivery, review, approval, publishing handoff, archive, and client-facing fulfillment system for video production teams, agencies, editors, and creators.

The product must move a real creative deliverable from internal-ready state to client-visible review, structured feedback, revision resolution, approval, final delivery, and archive while preserving:

- project and client scope
- file correctness
- version authority
- review-link permissions
- comment attachment to file/version/timecode/frame
- approval actor/time/version
- notification integrity
- final package correctness
- auditability

## Current Product Spine In Code

- Project: `projects`
- Client/recipient: reviewer fields on `review_invites`, team members/invites for internal users
- Deliverable: `assets`
- File: `assets.file_url`, `assets.nas_path`, Supabase `deliverables` bucket, local NAS media paths
- Version: `versions`
- Review link: `review_invites`
- Comment/annotation: `comments`, `annotations`, `comment_reactions`, `comment_attachments`
- Approval: `approval_workflows`, `approvals`, `approval_history`
- Final package/delivery: partially represented by share intent `final_delivery` and asset export route
- Delivery event: partially represented by `activity_log` entries and webhook deliveries
- Archive record: project status and soft-delete fields exist in parts, but no canonical archive record is proven

## Current Product Reality

The repo is a coherent review product surface, but not a certified delivery system. The strongest current surface is player-first review with comments and approvals. The weakest areas are file/version authority, final delivery authority, notification idempotency, and proof-pack coverage.

## Do Not Claim Yet

Do not claim beta or production readiness. Do not claim payment-gated delivery. Do not claim final delivery certification. Do not claim public NAS media playback is proven.

## 2026-07-14 Co-Produce Goal Extension

The active product objective now includes a unified Co-Produce workspace with:

- one-point video comments and keyboard-first review
- synchronized transcript review and word-level source timing
- reversible filler, pause, silence, and breath candidates
- immutable composition/edit decisions before any derived render is published
- a provenance-first project and brand knowledge vault for agent retrieval
- transparent Co-Credit estimates, reservations, receipts, and project budgets
- permanent project-grant access to commissioned approved deliverables

Co-Deliver remains the shell, project, permission, version, review, approval,
billing, delivery, and audit authority. Co-Script and Co-Edit may add module
objects but must not create parallel identity, project, permission, billing, or
audit systems.

Controlling extension:
`docs/strategy/co-produce-goal-extension-2026-07-14.md`
