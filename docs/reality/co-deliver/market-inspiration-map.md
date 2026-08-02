# Co-Deliver Market Inspiration Map

Date: 2026-07-14
Status: L0 current market scan.

Internet access was available. This map is strategic inspiration only. Do not copy proprietary code, protected copy, private assets, templates, brand identity, or exact UI.

## Market Map

| Source | URL | Observed pattern | Co-Deliver adaptation | Priority | Complexity | Equivalent today |
| --- | --- | --- | --- | --- | --- | --- |
| Frame.io | https://frame.io/ | video review links, frame/time comments, versions, approvals | strengthen version-bound comments and approval proof | P0/P1 | Medium | Partial |
| Vimeo Review | https://vimeo.com/features/video-collaboration | private review pages and feedback around video | keep player-first public review page | P1 | Low | Partial |
| Dropbox Replay | https://replay.dropbox.com/ | media review with comments and version comparison | version compare plus clear review state | P1 | Medium | Partial |
| Wipster | https://wipster.io/ | client review, comments, approval workflows | simple approval-focused client links | P1 | Medium | Partial |
| Rev | https://www.rev.com/ | synchronized transcript review, word timing, speakers, comments, search, confidence, and export | source-timed transcript dock with durable review states | P1 | High | Placeholder only |
| Descript | https://www.descript.com/ | transcript-linked media edits, filler review, word-gap cleanup, reversible composition patterns | candidate review plus distinct transcript and composition commands | P1 | High | Absent |
| Filestage | https://filestage.io/ | proofing workflows, reviewer decisions, approvals | durable review rounds and decision states | P1 | Medium | Partial |
| Ziflow | https://www.ziflow.com/ | online proofing, stages, decisions, audit trails | staged approval and audit visibility | P1 | Medium/High | Partial |
| Hightail | https://www.hightail.com/ | file sharing, feedback, approval | delivery link plus comment context | P2 | Low | Partial |
| WeTransfer Portals/Reviews | https://wetransfer.com/ | branded portal, reviews, simple transfer | final delivery portal and package clarity | P2 | Medium | Weak |
| Air | https://air.inc/ | creative asset library, approvals, sharing | asset-library clarity and client-safe links | P2 | Medium | Partial |
| Iconik | https://www.iconik.io/ | media asset management, review, metadata, storage integrations | metadata-rich asset and archive authority | P2 | High | Weak |
| Bynder | https://www.bynder.com/ | DAM workflow approvals, versions, brand control | archive/package governance | P2 | High | Weak |
| Buffer | https://buffer.com/ | social publishing planning and approval flows | publishing handoff checklist, not direct clone | P2 | Medium | Absent |
| Sprout Social | https://sproutsocial.com/ | message approval workflows and publishing governance | platform handoff status and approval guard | P2 | Medium | Absent |
| YouTube Studio | https://support.google.com/youtube/answer/57407 | upload details, visibility, captions, checks | final package metadata checklist | P1/P2 | Medium | Absent |
| Google Drive sharing | https://support.google.com/drive/answer/2494822 | link permissions and scoped sharing | clearer link expiration/revocation model | P1 | Low | Partial |
| Dropbox sharing | https://help.dropbox.com/share/create-and-share-link | share links, permissions, expiration/password concepts | explicit link capability model | P1 | Low | Partial |
| Stripe Payment Links | https://docs.stripe.com/payment-links | payment links, webhook-backed fulfillment patterns | only if payment-gated delivery is added | Conditional | Medium | Absent |

## 2026-07-14 Current Pattern Refresh

The current official Wipster product surface adds several concrete requirements
to the generic map: one link can contain multiple review items; comments become
checkable tasks; versions retain their own feedback; reviewers can signal that
they are finished; mobile review is first-class; and editor integrations bring
timecodes and task completion into Premiere, After Effects, and Final Cut.

Current official Frame.io V4 patterns add range comments, comment links,
reactions, completion state, internal/public comment visibility, share lists,
passphrases, expiry, watermarking, bulk download, and comparison modes with
linked playback, overlay, and pixel differences.

Current Dropbox Replay patterns add synchronized live review, shared playback
control, live drawing, browser-based guest review, NLE integrations, and
version-scoped markups.

Google Drive is viable as an origin or delivery adapter, not as Co-Deliver's
review-state authority. Drive supplies viewer/commenter/editor roles,
organization restrictions, visitor sharing, download/copy/print controls, and
expiring access. Co-Deliver must store the provider file id, permission id,
capability snapshot, and revocation result in its own audit ledger.

## Content Co-op Brand Extraction

Current source: `https://www.contentco-op.com/`, captured 2026-07-14.

- Primary sans: Plus Jakarta Sans.
- Editorial display: Fraunces, with italic emphasis for the signal phrase.
- Core colors observed: ink `#121d2a`, action blue `#4c8ef5`, warm header
  `rgba(243,237,226,.98)`, and pale page field `#edf1f4`.
- Navigation: compact uppercase labels, medium weight, generous positive letter
  spacing.
- Media direction: real industrial/field-production footage, clear subject,
  minimal obstruction, and restrained overlays.
- Product adaptation: keep the operational app dark and dense, but use the blue
  spiral/lockup, warm-white client delivery moments, Fraunces only for sparse
  editorial accents, and Plus Jakarta Sans for controls and metadata.

Evidence:

- `docs/design-evidence/co-deliver/full-audit/contentco-op-home-raw.png`
- `docs/design-evidence/co-deliver/full-audit/contentco-op-home.dom.txt`

## Pattern Library

- Review links should expose only intended assets and versions.
- Comments should bind to exact version, timecode, frame, page, or asset.
- Approval should bind to a version and actor.
- Final delivery should be a package with contents, metadata, and delivery event.
- Link controls should include permission, expiration, revocation, and download policy.
- Notifications should be logged and idempotent.
- Publishing handoff should look like a checklist with metadata, captions, thumbnail, visibility, and status.
- Transcript corrections, composition exclusions, and source-media publication must be separate commands.
- Filler and pause automation should create review candidates, not irreversible edits.
- Paid AI and media compute should show an estimate and reservation before work begins.
- Agent outputs should cite project-vault evidence and preserve source provenance.

## Strategic Borrow List

- Frame/time comment anchoring.
- Review-round and reviewer-decision model.
- Version comparison and previous-version preservation.
- Approval stage sequencing.
- Delivery package manifest.
- Link capability matrix.
- Upload/publishing checklist.
- Audit timeline visibility.

## Anti-Copy/IP Guardrails

- Borrow workflow structure and generic UX conventions only.
- Do not copy source code, exact UI screens, proprietary copy, paid templates, private assets, or brand identity.
- Do not imply integration or endorsement by reference products.

## Build Recommendations

1. Fix build/storage proof first.
2. Make version/comment/approval authority durable before polish.
3. Store share intent or equivalent capability contract.
4. Create a final package/delivery event model before marketing final delivery.
5. Add link expiration/revocation/download-control tests.

## Product Implications

- P0: version-bound comments, approved-version delivery, and public media access must be proven.
- P1: review-round state, notification idempotency, and audit visibility.
- P2: client portal polish, publishing checklist, branded package handoff.
