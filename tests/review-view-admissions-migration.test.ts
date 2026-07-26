import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(
  resolve(
    repositoryRoot,
    "supabase/migrations/20260726120000_review_view_admissions.sql",
  ),
  "utf8",
);

test("review admissions are private, exact-version records with a bounded lifetime", () => {
  assert.match(migration, /\bBEGIN\s*;/i);
  assert.match(migration, /\bCOMMIT\s*;/i);
  assert.match(
    migration,
    /CREATE TABLE co_production\.review_view_admissions/i,
  );
  assert.match(migration, /invite_id uuid NOT NULL/i);
  assert.match(migration, /asset_id uuid NOT NULL/i);
  assert.match(migration, /version_id uuid NOT NULL/i);
  assert.match(migration, /expires_at timestamptz NOT NULL/i);
  assert.match(
    migration,
    /FOREIGN KEY \(invite_id, asset_id, version_id, token_hash\)[\s\S]*REFERENCES co_production\.review_invites\(\s*id,\s*asset_id,\s*version_id,\s*token_hash\s*\)/i,
  );
  assert.match(
    migration,
    /review_view_admissions_lifetime_check CHECK \([\s\S]*expires_at > admitted_at[\s\S]*expires_at <= admitted_at \+ interval '8 hours'[\s\S]*\)/i,
  );
  assert.match(
    migration,
    /ALTER TABLE co_production\.review_view_admissions ENABLE ROW LEVEL SECURITY/i,
  );
  assert.match(
    migration,
    /ALTER TABLE co_production\.review_view_admissions FORCE ROW LEVEL SECURITY/i,
  );
  assert.match(
    migration,
    /REVOKE ALL ON TABLE co_production\.review_view_admissions\s+FROM PUBLIC, anon, authenticated/i,
  );
  assert.match(
    migration,
    /CREATE TABLE co_production\.review_admission_rate_limits/i,
  );
  assert.match(
    migration,
    /bucket_kind text NOT NULL CHECK \(\s*bucket_kind IN \('network', 'invite', 'action'\)\s*\)/i,
  );
  assert.match(
    migration,
    /ALTER TABLE co_production\.review_admission_rate_limits[\s\S]*FORCE ROW LEVEL SECURITY/i,
  );
});

test("admission atomically rechecks link authority and consumes at most one view per admission id", () => {
  assert.match(
    migration,
    /FUNCTION co_production\.admit_review_invite\(\s*p_token_hash text,\s*p_admission_id uuid,\s*p_network_bucket text\s*\)/i,
  );
  assert.match(migration, /LANGUAGE plpgsql/i);
  assert.match(migration, /SECURITY INVOKER/i);
  assert.match(migration, /SET search_path = ''/i);
  assert.match(
    migration,
    /FROM co_production\.review_invites AS invite[\s\S]*FOR UPDATE/i,
  );
  assert.match(migration, /invite\.active = true/i);
  assert.match(
    migration,
    /\(invite\.expires_at IS NULL OR invite\.expires_at > now\(\)\)/i,
  );
  assert.match(migration, /invite\.password_hash IS NULL/i);
  assert.match(migration, /invite\.watermark_enabled = false/i);
  assert.match(migration, /asset\.deleted_at IS NULL/i);
  assert.match(
    migration,
    /version\.id = invite\.version_id[\s\S]*version\.asset_id = invite\.asset_id/i,
  );
  for (const field of [
    "source_upload_id",
    "file_size",
    "storage_provider",
    "storage_object_key",
    "storage_sha256",
    "storage_provider_version_id",
    "storage_committed_at",
    "original_filename",
    "mime_type",
  ]) {
    assert.match(migration, new RegExp(`admitted_invite\\.${field}`));
  }
  assert.match(migration, /admission_status text/i);
  for (const status of [
    "admitted",
    "unavailable",
    "password_required",
    "view_limit",
    "media_unavailable",
    "admission_limit",
  ]) {
    assert.match(migration, new RegExp(`'${status}'`));
  }
  assert.match(
    migration,
    /existing_admission\.expires_at <= now\(\)[\s\S]*RETURN;[\s\S]*UPDATE co_production\.review_view_admissions[\s\S]*admission_status := 'admitted'[\s\S]*admission_id := existing_admission\.id[\s\S]*RETURN NEXT/i,
  );
  assert.match(
    migration,
    /admitted_invite\.max_views IS NOT NULL[\s\S]*admitted_invite\.view_count >= admitted_invite\.max_views/i,
  );
  assert.match(
    migration,
    /existing_admission\.id IS NOT NULL[\s\S]*admitted_invite\.max_views IS NOT NULL[\s\S]*admitted_invite\.view_count > admitted_invite\.max_views[\s\S]*RETURN NEXT/i,
  );
  assert.match(migration, /admitted_invite\.storage_provider IS NULL/i);
  assert.match(migration, /admitted_invite\.storage_sha256 IS NULL/i);
  assert.match(
    migration,
    /pg_advisory_xact_lock\([\s\S]*p_admission_id/i,
  );
  assert.match(
    migration,
    /INSERT INTO co_production\.review_view_admissions/i,
  );
  assert.match(
    migration,
    /new_expires_at < now\(\) \+ interval '5 minutes'[\s\S]*admission_status := 'unavailable'[\s\S]*RETURN NEXT/i,
  );
  assert.match(
    migration,
    /WITH expired_admissions AS \([\s\S]*expires_at <= now\(\)[\s\S]*LIMIT 128[\s\S]*DELETE FROM co_production\.review_view_admissions/i,
  );
  assert.match(
    migration,
    /FROM co_production\.review_view_admissions AS admission[\s\S]*admission\.invite_id = admitted_invite\.id[\s\S]*admission\.expires_at > now\(\)[\s\S]*>= 32/i,
  );
  assert.match(
    migration,
    /UPDATE co_production\.review_invites[\s\S]*view_count = review_invites\.view_count \+ 1/i,
  );
  assert.doesNotMatch(
    migration,
    /SET\s+view_count\s*=\s*p_view_count/i,
  );
});

test("admission throttles both the network and live invite and bounds retained authority state", () => {
  assert.match(
    migration,
    /VALUES \(\s*'network',\s*p_network_bucket/i,
  );
  assert.match(
    migration,
    /VALUES \(\s*'invite',\s*invite_bucket/i,
  );
  assert.match(
    migration,
    /ON CONFLICT \(bucket_kind, bucket_hash, window_start\)[\s\S]*attempt_count < 120/i,
  );
  assert.match(
    migration,
    /ON CONFLICT \(bucket_kind, bucket_hash, window_start\)[\s\S]*attempt_count < 32/i,
  );
  assert.match(migration, /'rate_limited'/i);
  assert.match(
    migration,
    /WITH expired_rate_limits AS \([\s\S]*window_start < now\(\) - interval '1 day'[\s\S]*LIMIT 128[\s\S]*DELETE FROM co_production\.review_admission_rate_limits/i,
  );
});

test("admitted review actions recheck the same live invite without consuming another view", () => {
  assert.match(
    migration,
    /FUNCTION co_production\.authorize_review_admission\(\s*p_admission_id uuid,\s*p_token_hash text\s*\)/i,
  );
  assert.match(migration, /admission\.expires_at > now\(\)/i);
  assert.match(migration, /invite\.token_hash = p_token_hash/i);
  assert.match(migration, /invite\.active = true/i);
  assert.match(migration, /invite\.password_hash IS NULL/i);
  assert.match(migration, /invite\.watermark_enabled = false/i);
  assert.match(migration, /asset\.deleted_at IS NULL/i);
  assert.match(
    migration,
    /version\.id = admission\.version_id[\s\S]*version\.asset_id = admission\.asset_id/i,
  );
  for (const field of [
    "reviewer_name",
    "permissions",
    "asset_title",
    "project_name",
  ]) {
    assert.match(migration, new RegExp(`\\b${field}\\b`));
  }
});

test("review mutations have an atomic per-admission action throttle", () => {
  assert.match(
    migration,
    /FUNCTION co_production\.reserve_review_action_rate_limit\(\s*p_admission_id uuid,\s*p_token_hash text,\s*p_action text\s*\)/i,
  );
  assert.match(
    migration,
    /p_action NOT IN \('comment', 'approval', 'edit_decision'\)/i,
  );
  assert.match(
    migration,
    /admission\.id = p_admission_id[\s\S]*admission\.token_hash = p_token_hash[\s\S]*admission\.expires_at > now\(\)/i,
  );
  assert.match(
    migration,
    /invite\.active = true[\s\S]*invite\.password_hash IS NULL[\s\S]*invite\.watermark_enabled = false/i,
  );
  assert.match(
    migration,
    /VALUES \(\s*'action',\s*action_bucket/i,
  );
  assert.match(
    migration,
    /ON CONFLICT \(bucket_kind, bucket_hash, window_start\)[\s\S]*attempt_count\s*< action_limit/i,
  );
  assert.match(migration, /'rate_limited'/i);
});

test("authority retention has a bounded service-only pruning entrypoint", () => {
  assert.match(
    migration,
    /FUNCTION co_production\.prune_review_admission_authority\(\s*p_limit integer DEFAULT 512\s*\)/i,
  );
  assert.match(
    migration,
    /LIMIT least\(greatest\(coalesce\(p_limit, 512\), 1\), 5000\)/i,
  );
  assert.match(
    migration,
    /DELETE FROM co_production\.review_view_admissions/i,
  );
  assert.match(
    migration,
    /DELETE FROM co_production\.review_admission_rate_limits/i,
  );
});

test("media authorization rechecks revocation, expiry, admission, exact version, download permission, and the full storage receipt", () => {
  assert.match(
    migration,
    /FUNCTION co_production\.authorize_review_media\(\s*p_admission_id uuid,\s*p_token_hash text\s*\)/i,
  );
  assert.match(migration, /admission\.expires_at > now\(\)/i);
  assert.match(migration, /invite\.active = true/i);
  assert.match(migration, /invite\.password_hash IS NULL/i);
  assert.match(migration, /invite\.watermark_enabled = false/i);
  assert.match(
    migration,
    /\(invite\.max_views IS NULL OR invite\.view_count <= invite\.max_views\)/i,
  );
  assert.match(migration, /asset\.deleted_at IS NULL/i);
  assert.match(
    migration,
    /version\.id = admission\.version_id[\s\S]*version\.asset_id = admission\.asset_id/i,
  );
  for (const field of [
    "download_enabled",
    "watermark_enabled",
    "file_size",
    "source_upload_id",
    "storage_provider",
    "storage_object_key",
    "storage_sha256",
    "storage_provider_version_id",
    "storage_committed_at",
    "original_filename",
    "mime_type",
  ]) {
    assert.match(migration, new RegExp(`\\b${field}\\b`));
  }
});

test("all RPCs are service-only and direct authority-table access stays closed", () => {
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION co_production\.admit_review_invite\(text, uuid, text\)[\s\S]*FROM PUBLIC, anon, authenticated/i,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION co_production\.admit_review_invite\(text, uuid, text\)[\s\S]*TO service_role/i,
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION co_production\.authorize_review_admission\(uuid, text\)[\s\S]*FROM PUBLIC, anon, authenticated/i,
  );
  assert.match(
    migration,
    /GRANT EXECUTE[\s\S]*ON FUNCTION co_production\.authorize_review_admission\(uuid, text\)[\s\S]*TO service_role/i,
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION co_production\.authorize_review_media\(uuid, text\)[\s\S]*FROM PUBLIC, anon, authenticated/i,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION co_production\.authorize_review_media\(uuid, text\)[\s\S]*TO service_role/i,
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION\s+co_production\.reserve_review_action_rate_limit\(uuid, text, text\)[\s\S]*FROM PUBLIC, anon, authenticated/i,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION\s+co_production\.reserve_review_action_rate_limit\(uuid, text, text\)[\s\S]*TO service_role/i,
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION\s+co_production\.prune_review_admission_authority\(integer\)[\s\S]*FROM PUBLIC, anon, authenticated/i,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION\s+co_production\.prune_review_admission_authority\(integer\)[\s\S]*TO service_role/i,
  );
  assert.match(
    migration,
    /GRANT SELECT, INSERT, UPDATE, DELETE[\s\S]*ON TABLE co_production\.review_view_admissions TO service_role/i,
  );
  assert.match(
    migration,
    /GRANT SELECT, INSERT, UPDATE, DELETE[\s\S]*ON TABLE co_production\.review_admission_rate_limits TO service_role/i,
  );
});
