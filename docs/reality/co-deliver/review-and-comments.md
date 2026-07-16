# Co-Deliver Review And Comments

Date: 2026-06-27
Status: L0 review/comment map.

## Review Paths

- Public route: `/review/[token]`
- Public API: `/api/review/[token]`
- Internal route: `/projects/[id]/assets/[assetId]`
- Internal comments API: `/api/assets/[id]/comments`
- External comments API: `/api/review/[token]/comments`

## Review Link Authority

`review_invites` is the current client-facing review-link authority. Token lookup checks:

- token exists
- `expires_at` not passed
- view limit not exceeded

It does not prove password use, active/revoked state, or media access consistency.

## Comment Authority

External comments are inserted with:

- `asset_id`
- `review_id = null`
- `review_invite_id = invite.id`
- `visibility = external`
- optional `timecode_seconds`
- optional `pin_x` and `pin_y`

Internal comments use `visibility = internal`.

## Annotation Authority

`annotations` can point to:

- `comment_id`
- `asset_id`
- `version_id`
- `frame_number`
- typed annotation JSON

Gap: not all comment paths prove `version_id` binding. Comments can attach to assets without a version id.

## P0/P1 Gaps

- Comments are not guaranteed to attach to the exact version they reference.
- Review media playback through NAS stream is not proven for token users.
- Comment notification email bypasses `/api/notifications/send` and central send idempotency.
- Attachment/reaction public/private audience policies need proof.

