# Co-Deliver Cockpit Visual Goal

Status: canonical visual authority

Date accepted: 2026-07-14

Source image: `content-coop-review-cockpit-goal-2026-07-14.png`

Source SHA-256: `c002311dd106a602d6bf3471a92533602d4926f680cf5aa4c265e944627d73c8`

## Product Goal

Reconstruct Co-Deliver as a Content Co-op-branded review and lightweight post-production cockpit. This reference is the governing desktop look-and-feel target. Existing product behavior should be brought into this information architecture instead of retaining a generic dark review shell.

## Desktop Acceptance Target

- Use a bright white operational workspace with cool-gray separators, near-black navy type, royal-blue actions, light-blue selected states, and restrained green/orange/red status colors.
- Keep a fixed project navigation rail with Overview, Media, Sequences, Reviews, Approvals, Tasks, Versions, Metadata, Settings, project shortcuts, and Team.
- Keep a compact top bar with project switcher, global search, Share, Upload, notifications, and account controls.
- Make the project overview the cockpit: review metrics, latest review player, timecoded comment composer, multitrack timeline, review status, comments, approval stages, details, and recent activity.
- Preserve a large inspectable video surface. Visible media must be a real supplied thumbnail, poster, proxy frame, or generated bitmap asset, never CSS or placeholder art.
- Use familiar icon-library symbols for controls and tooltips for unfamiliar controls.
- Keep panels flat and work-focused. Cards represent bounded operational modules only; do not nest cards or turn page sections into floating decoration.
- Match compact desktop density, modest radii, thin borders, and stable dimensions so dynamic text and states cannot shift the cockpit.

## Interaction Acceptance Target

- Every primary navigation item, top-bar action, review action, comment tab, approval step, timeline control, and metadata action must have a functional destination or state.
- Video time, comment timecodes, annotations, approval state, version state, and activity must derive from one shared persisted authority.
- Review links must preserve permission intent, selected assets, reviewer identity, branding, active/revoked state, and approval requirements.
- Archive, trash, restore, search, upload, sharing, sign-in, and sign-out must remain coherent across refreshes.
- Email, SMS, iMessage, Google Drive, and CCNAS controls remain fail-closed or local dry-run until explicit credentials and send/write authority are provided.

## Mobile Acceptance Target

- Validate at 390 x 844 with no horizontal scrolling, clipped labels, hidden primary actions, or overlapping controls.
- Replace the persistent desktop rail with an ergonomic navigation drawer or bottom-level navigation and expose review/approval details through tabs or sheets.
- Keep playback, timecoded commenting, annotation, approval, share, and asset/version switching immediately reachable.
- Collapse the multitrack cockpit without discarding information; use focused track and detail modes rather than shrinking the desktop layout.

## Visual QA Contract

- Compare implementation and this source at the same desktop viewport and interaction state.
- Record findings in `design-qa.md`; P0, P1, and P2 mismatches block visual completion.
- The implementation may add useful market-derived capabilities, but additions must preserve this reference's hierarchy, density, brand, and operational clarity.
