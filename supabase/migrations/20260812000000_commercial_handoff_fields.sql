-- Co-VideoPro — Migration: Commercial handoff fields
-- Task 4.1: CCO OS hands accepted commercial packages to Co-VideoPro by
-- writing co_production organizations/contacts/inquiries/projects through the
-- shared Supabase project's service role (mirrors the inquiry→project convert
-- route's writes). These nullable columns carry the commercial reference and
-- frozen totals across the seam. Co-VideoPro never mutates them — CCO OS
-- remains the commercial authority.
--
-- Conventions follow 20260715093300_fail_closed_co_production_authority.sql
-- and 20260716120000_project_operating_record.sql. This migration is
-- column-additive only: projects and inquiries already have FORCE ROW LEVEL
-- SECURITY enabled and table-level GRANT ALL TO service_role, both of which
-- cover new columns automatically, so no privilege or RLS changes are needed.
--
-- The partial unique indexes on cco_estimate_version_id are the database
-- backstop for the handoff's idempotency: two concurrent CCO OS handoff
-- requests for the same frozen estimate version cannot both insert a
-- project/inquiry — the loser gets a unique violation and recovers the
-- winner's row (see apps/home/lib/cvp-handoff.ts in the website repo).

BEGIN;

ALTER TABLE co_production.projects
  ADD COLUMN IF NOT EXISTS cco_estimate_id uuid,
  ADD COLUMN IF NOT EXISTS cco_estimate_version_id uuid,
  ADD COLUMN IF NOT EXISTS commercial_total_cents bigint CHECK (
    commercial_total_cents IS NULL OR commercial_total_cents >= 0
  ),
  ADD COLUMN IF NOT EXISTS commercial_ref jsonb;

ALTER TABLE co_production.inquiries
  ADD COLUMN IF NOT EXISTS cco_estimate_id uuid,
  ADD COLUMN IF NOT EXISTS cco_estimate_version_id uuid,
  ADD COLUMN IF NOT EXISTS commercial_total_cents bigint CHECK (
    commercial_total_cents IS NULL OR commercial_total_cents >= 0
  ),
  ADD COLUMN IF NOT EXISTS commercial_ref jsonb;

CREATE INDEX IF NOT EXISTS idx_projects_cco_estimate
  ON co_production.projects(cco_estimate_id)
  WHERE cco_estimate_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inquiries_cco_estimate
  ON co_production.inquiries(cco_estimate_id)
  WHERE cco_estimate_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_cco_estimate_version_unique
  ON co_production.projects(cco_estimate_version_id)
  WHERE cco_estimate_version_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_inquiries_cco_estimate_version_unique
  ON co_production.inquiries(cco_estimate_version_id)
  WHERE cco_estimate_version_id IS NOT NULL;

COMMIT;
