# Sharing follow-ups

## Data model

- Persist a first-class `share_intent` on `review_invites`.
  The current pass derives intent from `permissions`, `download_enabled`, and `watermark_enabled` so the UI can separate internal review, client review, approval, and delivery without a schema change. That keeps this pass inside the documented contracts, but the intent is still inferred rather than stored.

- Decide whether final delivery should remain on the same token surface as review history.
  Right now final delivery intentionally reuses the review page and reframes the experience, which preserves context and avoids schema work. If the product needs a cleaner delivery-only experience or stricter separation from comments, that will need an explicit delivery contract.

## Auth and identity

- Approval links are still identity-light.
  Approval-needed links require a reviewer email and only unlock active approval steps assigned to that email, but the recipient still identifies themselves by entering a display name on the public page. If the approval model needs stronger assurance, this should move to authenticated recipient identity or signed recipient claims.

## Comments and approvals

- Approval and comment policy are still permission-led, not intent-led.
  The UI now frames these as separate states, but comments and approvals still inherit from the raw invite permission. If the product later needs finer controls such as delivery links with acknowledgment, client review without historical thread visibility, or approval-only decision capture, that will need new contracts.
