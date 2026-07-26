# Co-Deliver Storage And Access Control

Date: 2026-06-27
Status: L0 storage/access map.

## Storage

- NAS default root: `/volume1/media`.
- Local successful build root used in L0: `/tmp/codeliver-media`.
- TUS staging: `NAS_MEDIA_ROOT/.tus-uploads`.
- Supabase bucket: `deliverables`, created as public in migration 001.

## Internal Auth

- Private routes are guarded by `proxy.ts`.
- Auth comes from Supabase cookies via `createSupabaseAuth`.
- Many server data operations use the service-role client, so route-level ownership checks are the real application boundary.
- Some APIs use `requireAuthWithClient` to preserve RLS.

## Public Token Access

- External review users do not sign in.
- Public review API validates `review_invites.token`.
- Public comments are written with external visibility and review invite id.
- Approval-capable links rely on reviewer email matching.

## P0/P1 Gaps

- Public NAS media playback is not proven because `/api/media/stream` requires internal auth.
- Supabase bucket is public by migration, but route/code does not prove public asset policy is safe.
- Service-role use means every route needs explicit ownership/access proof.
- No hard media download-control proof exists; existing download flags are soft UI/response controls.
- No watermark enforcement proof exists.
- No cross-client storage isolation proof exists beyond folder/path convention and owner checks.
