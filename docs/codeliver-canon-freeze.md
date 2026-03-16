# Co-Deliver Canon Freeze

This note freezes the current Co-Deliver product truth after the stabilization passes.

It does **not** invent a future-state product. It defines what is canonical now, what is explicitly transitional, and what still needs a later stabilization pass.

## Canonical now

### Product identity

- Co-Deliver is a standalone review product.
- Its core job is to let internal operators and external reviewers watch media, leave review feedback, and record approval decisions inside one review surface.
- The product should read as one review workspace, not as a homepage shell, admin dashboard, or platform wrapper.

### Core review surface

- The canonical review surface is:
  - one compact top bar
  - one dominant media stage
  - one adjacent review rail
- The player is the primary object.
- Comments and approvals live beside the player, not above it and not in disconnected tabs.
- Version context is supporting context, not a second major surface.
- Review state should be expressed once at the correct hierarchy level, not repeated in stacked summary panels.

### Public review model

- External review happens at `/review/[token]`.
- External reviewers do not sign in.
- Token review is the canonical client-facing review path.
- Public review links can be framed as:
  - client review
  - approval-needed review
  - final delivery
- Those frames change the language and expectations of the surface, but they still reuse the same core review workspace.

### Comment model

- Comments are part of the review workspace, not a secondary feature.
- Comments can be time-based and pin-based.
- External comments are stored as `visibility = 'external'` and linked to `review_invite_id`.
- Internal comments are stored as `visibility = 'internal'`.
- Internal and external audiences are distinct and should not silently collapse into one another.

### Approval model

- Approval is part of review, not a separate tool.
- Approval state belongs in the review rail beside comments.
- Approval-capable public links are deliberate review links, not generic public links with an extra approval button.
- Internal review can also record approval decisions inside the same review workspace.

### Sharing model

- Sharing is part of the Co-Deliver product model.
- Sharing config belongs in modal or secondary workflow UI, not above the player on review routes.
- Share links represent recipient outcomes, not generic raw access.
- The currently recognized recipient outcomes are:
  - internal review
  - client review
  - approval-needed review
  - final delivery

### Auth / access model

- Internal operators use authenticated dashboard routes.
- External reviewers use token review routes.
- Route-level authorization is the real access boundary.
- Co-Deliver runtime authority lives in this repo plus Supabase, not in ROOT or CCO HOME.

## Transitional

These behaviors are active now, but they should be treated as transitional rather than fully settled canon.

### Share intent durability

- `share_intent` is currently a real product concept in the UI and sharing flow.
- It is still partly inferred from invite properties rather than fully hardened as a durable stored contract everywhere.

### Approval identity binding

- Approval-capable links currently bind authority through reviewer email plus active workflow-step matching.
- This is active behavior now, but it is still a transitional implementation rather than a fully explicit approval-step contract.

### Final delivery framing

- Final delivery currently reuses the same token review surface and reframes it as delivery.
- That is canonical for now, but still transitional if the product later chooses a stricter delivery-only contract.

### Internal collaboration scope

- The internal authenticated model is currently owner-scoped.
- That means the product truth is more stable for a single internal operator plus external reviewers than for a fully resolved multi-operator internal collaboration model.

### Soft media controls

- `download_enabled` and watermark behavior are currently presentation and flow controls.
- They are active product behavior, but they are not yet a full hard-protection media model.

## Still needs later stabilization

These are the remaining structural/product-model areas that should be handled in later stabilization work rather than re-opened ambiguously inside normal UI iteration.

### Sharing contract stabilization

- Persist and enforce `share_intent` as a first-class durable contract.
- Decide whether final delivery remains on the shared token review surface or graduates into its own stricter contract.

### Approval contract stabilization

- Bind approval authority to an explicit approval-step contract instead of relying only on reviewer email plus active-step matching.
- Clarify stronger identity requirements for approval-needed links if product trust needs to rise further.

### Auth / data stabilization

- Verify production migration alignment for the current comment/invite model.
- Close edge cases around reactions, attachments, and same-email multi-reviewer approval scenarios.
- Finish authenticated end-to-end QA on the internal asset review route.

## Freeze rule

Until another deliberate stabilization pass changes the canon:

- treat the current player-first stage-and-rail review workspace as canonical
- treat sharing intent, approval email binding, and final-delivery reuse as transitional
- do not reintroduce dashboard shells, stacked explainer panels, or share-management sections into the main review surface
