# Co-Deliver Auth / Data / Access Note

## Product boundary

- Co-Deliver is a standalone product. Runtime authority lives in this repo plus Supabase.
- ROOT and CCO HOME are not part of Co-Deliver’s runtime auth or persistence boundary.
- Supabase is the durable backend for auth state and review data.

## Who signs in

- Signed-in users are internal Co-Deliver operators.
- The current authenticated dashboard model is owner-scoped. If you are not the owner of a project or asset, the internal API should treat that resource as unavailable.
- Session state comes from Supabase auth cookies. `proxy.ts` protects private routes and `requireAuth()` is the API-level gate for internal surfaces.

## Who uses token review

- External reviewers do not sign in.
- External review uses `review_invites` tokens at `/review/[token]` and `/api/review/[token]/*`.
- A token can grant `view`, `comment`, or `approve`.
- An `approve` token is only valid when it was created for a specific reviewer email and that reviewer owns an active approval step.

## Current access model

| Surface | Access model | Authority source |
| --- | --- | --- |
| Dashboard pages and internal APIs | Signed-in internal operator only | Supabase session cookie + route-level ownership checks |
| Projects / assets / versions | Internal-only | Project or asset ownership |
| Internal comments | Internal-only | Authenticated internal route writes `visibility = 'internal'` |
| External review page | Token only | `review_invites` lookup by token |
| External comments | Client-facing | Token validation + `visibility = 'external'` |
| External approvals | Client-facing but constrained | Token permission + reviewer-email match + active workflow step |
| Sharing analytics read | Internal-only | Invite ownership through the linked asset |

## Durable data model

- `projects`, `assets`, `versions`, `comments`, `approvals`, `approval_workflows`, `review_invites`, `approval_history`, `activity_log`, and `share_analytics` are durable Supabase records.
- `comments.review_id` is not the external review authority. External review comments are explicitly stored with:
  - `comments.visibility = 'external'`
  - `comments.review_invite_id = review_invites.id`
- Internal comments are explicitly stored with:
  - `comments.visibility = 'internal'`
  - `comments.review_invite_id = null`
- External review history remains durable even if the invite is later revoked, because external comments no longer depend on the invite row continuing to exist.

## Important enforcement rules

- The server uses the Supabase service role for most data access, so row-level security is not the runtime safety net. Route-level authorization is the real authority boundary.
- Internal routes must verify ownership before querying or mutating durable records.
- Public review routes must never infer approval access from UI state or “first pending step” logic. They must compute access from the token, the reviewer email, and the active workflow step.
- Reply chains should not silently cross audiences. Internal and external comments are separate review audiences.

## Sharing assumptions

- Share links are part of the product model, not an external platform shell.
- Approve-capable links are deliberate review links, not generic public links with extra buttons.
- `download_enabled` and watermark flags are currently soft controls. They shape the UI and response payloads, but they are not yet full media-protection guarantees.

## Transitional edges still left

- Approval-link binding is by reviewer email, not by explicit approval-step foreign key yet.
- Production Supabase still needs migration verification, especially for any historical environments that wrote invite ids into `comments.review_id`.
- Reactions, attachments, and same-email multi-reviewer workflows still need a final audience policy so internal and external behavior stays consistent.
