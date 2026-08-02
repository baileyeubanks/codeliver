import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(
  resolve(
    repositoryRoot,
    "supabase/migrations/20260716023000_hermes_orchestration_authority.sql",
  ),
  "utf8",
);

function sqlSection(start: string, end: string): string {
  const startIndex = migration.indexOf(start);
  const endIndex = migration.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing SQL section start: ${start}`);
  assert.notEqual(endIndex, -1, `missing SQL section end: ${end}`);
  return migration.slice(startIndex, endIndex);
}

const tables = [
  "hermes_signing_keys",
  "hermes_attestation_nonce_claims",
  "hermes_orchestration_proposals",
  "hermes_notification_proposals",
  "hermes_private_operator_command_responses",
  "hermes_orchestration_proposal_decisions",
  "hermes_orchestration_proposal_events",
] as const;

test("migration is additive and installs no key, sender, or external side effect", () => {
  assert.match(migration, /BEGIN;/);
  assert.match(migration, /server_version_num[\s\S]*< 150000/);
  assert.match(
    migration,
    /to_regprocedure\([\s\S]*co_production_private\.has_team_role\(uuid,integer\)/,
  );
  assert.match(migration, /COMMIT;\s*$/);
  assert.doesNotMatch(migration, /\bDROP\s+(?:TABLE|SCHEMA|COLUMN)\b/i);
  assert.doesNotMatch(
    migration,
    /INSERT INTO co_production\.hermes_signing_keys/,
  );
  assert.doesNotMatch(
    migration,
    /enqueue_notification_outbox|INSERT INTO co_production\.notification_outbox|net\.http|http_post|pg_net|fetch\(|twilio|sendblue|bluebubbles/i,
  );
});

test("Ed25519 key authority stores public verification material and supports one-way revocation", () => {
  const keys = sqlSection(
    "CREATE TABLE co_production.hermes_signing_keys (",
    "CREATE TABLE co_production.hermes_attestation_nonce_claims (",
  );
  assert.match(keys, /algorithm text NOT NULL DEFAULT 'Ed25519'/);
  assert.match(keys, /public_key_pem text NOT NULL CHECK/);
  assert.match(keys, /BEGIN PUBLIC KEY/);
  assert.match(keys, /status text NOT NULL CHECK \(status IN \('active', 'revoked'\)\)/);
  assert.match(keys, /valid_until > valid_from/);
  assert.match(keys, /revoked_at IS NULL[\s\S]*status = 'revoked'[\s\S]*revoked_at IS NOT NULL/);
  assert.doesNotMatch(keys, /private_key|signing_secret|credential|access_token/i);
  assert.match(
    migration,
    /OLD\.status <> 'active'[\s\S]*NEW\.status <> 'revoked'[\s\S]*NEW\.public_key_pem IS DISTINCT FROM OLD\.public_key_pem/,
  );
  assert.match(
    migration,
    /BEFORE UPDATE OR DELETE ON co_production\.hermes_signing_keys/,
  );
  assert.match(
    migration,
    /BEFORE TRUNCATE ON co_production\.hermes_signing_keys/,
  );
});

test("active-key lookup is validity checked and service-role only", () => {
  const lookup = sqlSection(
    "CREATE OR REPLACE FUNCTION co_production.get_active_hermes_signing_key(",
    "CREATE OR REPLACE FUNCTION co_production.record_hermes_orchestration_proposal(",
  );
  assert.match(lookup, /p_key_id text/);
  assert.match(lookup, /RETURNS jsonb/);
  assert.match(lookup, /auth\.role\(\)[\s\S]*<> 'service_role'/);
  assert.match(lookup, /key\.algorithm = 'Ed25519'/);
  assert.match(lookup, /key\.status = 'active'/);
  assert.match(lookup, /key\.valid_from <= now\(\)/);
  assert.match(lookup, /key\.valid_until > now\(\)/);
  assert.match(lookup, /'key_id'[\s\S]*'public_key_pem'[\s\S]*'valid_from'[\s\S]*'valid_until'/);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION co_production\.get_active_hermes_signing_key\(text\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role;[\s\S]*GRANT EXECUTE ON FUNCTION co_production\.get_active_hermes_signing_key\(text\)[\s\S]*TO service_role;/,
  );
});

test("payload validator accepts only the exact reference-only proposal contract", () => {
  const validator = sqlSection(
    "CREATE OR REPLACE FUNCTION co_production_private.hermes_orchestration_payload_is_safe(",
    "CREATE TABLE co_production.hermes_signing_keys (",
  );
  for (const field of [
    "orchestrationMode",
    "communicationClass",
    "tenantId",
    "sourceRecord",
    "eventType",
    "template",
    "recipientContactIds",
    "candidateChannels",
    "purpose",
    "requestedSchedule",
    "idempotencyKey",
    "correlationId",
    "humanApprovalRequired",
    "audience",
  ]) {
    assert.match(validator, new RegExp(`'${field}'`));
  }
  assert.match(validator, /p_payload - ARRAY\[[\s\S]*IS DISTINCT FROM '\{\}'::jsonb/);
  assert.match(validator, /proposal_only/);
  assert.match(validator, /humanApprovalRequired'[\s\S]*'true'::jsonb/);
  assert.match(validator, /hermes_contact_ids_are_safe\(v_contact_ids\)/);
  assert.match(validator, /pg_column_size\(p_payload\) > 24576/);
  assert.match(validator, /expires_at - v_not_before > interval '7 days'/);
  assert.doesNotMatch(
    validator,
    /'subject'|'body'|'content'|'html'|'markdown'|'recipient'|'address'|'password'|'secret'|'token'|'amount'|'currency'|'price'|'payment'|'invoice'/i,
  );
});

test("customer and crew proposals cannot cross into the private operator iMessage path", () => {
  const notificationTable = sqlSection(
    "CREATE TABLE co_production.hermes_notification_proposals (",
    "CREATE TABLE co_production.hermes_private_operator_command_responses (",
  );
  const operatorTable = sqlSection(
    "CREATE TABLE co_production.hermes_private_operator_command_responses (",
    "CREATE TABLE co_production.hermes_orchestration_proposal_decisions (",
  );
  assert.match(notificationTable, /audience IN \('customer', 'crew'\)/);
  assert.match(notificationTable, /recipient_contact_ids text\[\]/);
  assert.match(notificationTable, /candidate_channels text\[\]/);
  assert.match(notificationTable, /hermes_channels_are_safe\([\s\S]*false,[\s\S]*false/);
  assert.match(operatorTable, /operator_contact_id text NOT NULL/);
  assert.match(operatorTable, /audience = 'operator'/);
  assert.match(operatorTable, /purpose = 'operational'/);
  assert.match(operatorTable, /private_channel = 'imessage'/);
  assert.doesNotMatch(operatorTable, /recipient_contact_ids|candidate_channels/);
  assert.match(
    migration,
    /IF v_communication_class = 'notification' THEN[\s\S]*INSERT INTO co_production\.hermes_notification_proposals[\s\S]*ELSE[\s\S]*INSERT INTO co_production\.hermes_private_operator_command_responses/,
  );
});

test("record RPC atomically claims attestation replay evidence and binds idempotency", () => {
  const record = sqlSection(
    "CREATE OR REPLACE FUNCTION co_production.record_hermes_orchestration_proposal(",
    "CREATE OR REPLACE FUNCTION co_production.decide_hermes_orchestration_proposal(",
  );
  assert.match(
    record,
    /p_key_id text,[\s\S]*p_nonce_hash text,[\s\S]*p_signature_hash text,[\s\S]*p_attestation_issued_at timestamptz,[\s\S]*p_attestation_expires_at timestamptz,[\s\S]*p_payload_hash text,[\s\S]*p_payload jsonb/,
  );
  assert.match(record, /auth\.role\(\)[\s\S]*<> 'service_role'/);
  assert.match(record, /key\.team_id = v_team_id/);
  assert.match(record, /FROM co_production\.teams[\s\S]*team\.id = v_team_id/);
  assert.match(record, /pg_advisory_xact_lock/);
  assert.match(record, /INSERT INTO co_production\.hermes_attestation_nonce_claims/);
  assert.match(record, /hermes_attestation_replay/);
  assert.match(record, /FOR UPDATE/);
  assert.match(record, /payload_hash IS DISTINCT FROM p_payload_hash/);
  assert.match(record, /payload_storage_hash IS DISTINCT FROM v_payload_storage_hash/);
  assert.match(record, /hermes_proposal_idempotency_conflict/);
  assert.match(record, /'proposal_replayed'/);
  assert.match(record, /hermes_proposal_snapshot\(v_proposal, true\)/);
  assert.match(
    migration,
    /UNIQUE \(key_id, nonce_hash\)/,
  );
  assert.match(
    migration,
    /UNIQUE \(team_id, idempotency_key\)/,
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION co_production\.record_hermes_orchestration_proposal\([\s\S]*FROM PUBLIC, anon, authenticated, service_role;[\s\S]*GRANT EXECUTE ON FUNCTION co_production\.record_hermes_orchestration_proposal\([\s\S]*TO service_role;/,
  );
});

test("proposal evidence and one human decision are immutable and append-only", () => {
  assert.match(
    migration,
    /UNIQUE \(proposal_id\)[\s\S]*hermes_orchestration_proposal_decisions_proposal_fk/,
  );
  assert.match(migration, /UNIQUE \(proposal_id, event_sequence\)/);
  assert.match(migration, /previous_event_fingerprint text NOT NULL/);
  assert.match(migration, /event_fingerprint text NOT NULL UNIQUE/);
  assert.match(migration, /append_hermes_proposal_event/);
  for (const table of [
    "hermes_attestation_nonce_claims",
    "hermes_orchestration_proposals",
    "hermes_notification_proposals",
    "hermes_private_operator_command_responses",
    "hermes_orchestration_proposal_decisions",
    "hermes_orchestration_proposal_events",
  ]) {
    assert.match(
      migration,
      new RegExp(`BEFORE UPDATE OR DELETE ON co_production\\.${table}`),
    );
    assert.match(
      migration,
      new RegExp(`BEFORE TRUNCATE ON co_production\\.${table}`),
    );
  }
});

test("human decision is hash-bound, staff-only, manager-ranked, and never sends", () => {
  const decision = sqlSection(
    "CREATE OR REPLACE FUNCTION co_production.decide_hermes_orchestration_proposal(",
    "REVOKE ALL ON TABLE co_production.hermes_signing_keys",
  );
  assert.match(
    decision,
    /p_proposal_id uuid,[\s\S]*p_expected_payload_hash text,[\s\S]*p_decision text,[\s\S]*p_reason_code text,[\s\S]*p_selected_channels text\[\]/,
  );
  assert.match(decision, /auth\.role\(\)[\s\S]*<> 'authenticated'/);
  assert.match(decision, /auth\.uid\(\)/);
  assert.match(decision, /content_coop_role'[\s\S]*<> 'staff'/);
  assert.match(decision, /has_team_role\(v_proposal\.team_id, 80\)/);
  assert.match(decision, /payload_hash IS DISTINCT FROM p_expected_payload_hash/);
  assert.match(decision, /v_selected_channels <@ v_candidate_channels/);
  assert.match(decision, /v_decision_value NOT IN \('approve', 'reject'\)/);
  assert.match(decision, /hermes_human_decision_conflict/);
  assert.doesNotMatch(
    decision,
    /notification_outbox|enqueue|provider|net\.http|http_post|pg_net/i,
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION co_production\.decide_hermes_orchestration_proposal\([\s\S]*FROM PUBLIC, anon, authenticated, service_role;[\s\S]*GRANT EXECUTE ON FUNCTION co_production\.decide_hermes_orchestration_proposal\([\s\S]*TO authenticated;/,
  );
});

test("every Hermes table is force-RLS, team-readable, and direct-write denied", () => {
  for (const table of tables) {
    assert.match(
      migration,
      new RegExp(
        `ALTER TABLE co_production\\.${table} ENABLE ROW LEVEL SECURITY;`,
      ),
    );
    assert.match(
      migration,
      new RegExp(
        `ALTER TABLE co_production\\.${table} FORCE ROW LEVEL SECURITY;`,
      ),
    );
    assert.match(
      migration,
      new RegExp(
        `REVOKE ALL ON TABLE co_production\\.${table}\\s+FROM PUBLIC, anon, authenticated, service_role;`,
      ),
    );
    assert.match(
      migration,
      new RegExp(
        `CREATE POLICY ${table.replace("hermes_", "hermes_")}_select[\\s\\S]*has_team_role\\(team_id, 10\\)`,
      ),
    );
  }
  assert.doesNotMatch(migration, /CREATE POLICY[^;]*FOR (?:INSERT|UPDATE|DELETE)/i);
  assert.doesNotMatch(migration, /GRANT (?:INSERT|UPDATE|DELETE|TRUNCATE) ON TABLE/i);
  assert.doesNotMatch(migration, /\bGRANT\b[^;]*\bTO\s+anon\b/i);
});

test("SQL blocks are closed and the migration contains no unresolved scaffold", () => {
  assert.equal((migration.match(/\$\$/g) ?? []).length % 2, 0);
  assert.equal((migration.match(/\$preflight\$/g) ?? []).length, 2);
  assert.doesNotMatch(migration, /TODO|FIXME|placeholder/i);
});
