import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(
  resolve(
    repositoryRoot,
    "supabase/migrations/20260716033000_co_credit_settlement_authority.sql",
  ),
  "utf8",
);

// These tests inspect SQL source. They do not apply the migration and are not
// runtime PostgreSQL proof of locking, constraints, privileges, or race safety.
const sourceContractScope =
  "source-contract tests only; not runtime PostgreSQL proof";
const runtimeConcurrencyProofRequired =
  "runtime two-session PostgreSQL proof remains required for lock and race behavior";

function section(start: string, end: string): string {
  const startIndex = migration.indexOf(start);
  const endIndex = migration.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing SQL section start: ${start}`);
  assert.notEqual(endIndex, -1, `missing SQL section end: ${end}`);
  return migration.slice(startIndex, endIndex);
}

function expectAll(value: string, patterns: readonly RegExp[]): void {
  for (const pattern of patterns) assert.match(value, pattern);
}

function tableSection(table: string): string {
  const start = `CREATE TABLE co_production.${table} (`;
  const startIndex = migration.indexOf(start);
  assert.notEqual(startIndex, -1, `missing table ${table}`);
  const nextTable = migration.indexOf("CREATE TABLE co_production.", startIndex + start.length);
  return migration.slice(startIndex, nextTable === -1 ? migration.length : nextTable);
}

const commercialTables = [
  "co_credit_rate_catalog_snapshots",
  "co_credit_pricing_terms_snapshots",
  "co_credit_commercial_bundle_activations",
  "co_credit_budget_grants",
  "co_credit_entitlement_states",
  "co_credit_operation_executions",
  "co_credit_quotes",
  "co_credit_reservations",
  "co_credit_worker_execution_leases",
  "co_credit_worker_execution_bindings",
  "co_credit_worker_execution_attestations",
  "co_credit_terminal_receipts",
  "co_credit_idempotency_rows",
  "co_credit_ledger_events",
] as const;

const ownerOnlyMutationRoutines = [
  "co_production.approve_co_credit_rate_catalog(text,timestamptz,jsonb,text,text)",
  "co_production.approve_co_credit_pricing_terms(text,timestamptz,uuid,text,bigint,jsonb,text,text)",
  "co_production_private.provision_co_credit_worker_signing_key(uuid,text,bytea,timestamptz,timestamptz)",
  "co_production_private.append_co_credit_ledger_event(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,bigint,bigint,uuid,text,text,uuid,text,text,text,jsonb)",
  "co_production_private.save_co_credit_idempotency(uuid,uuid,uuid,text,text,text,text,text,uuid)",
] as const;

const serviceRoleMutationRoutines = [
  "co_production.approve_and_activate_co_credit_commercial_bundle(text,timestamptz,jsonb,text,text,timestamptz,text,bigint,jsonb,text,timestamptz)",
  "co_production.grant_co_credit_budget(uuid,uuid,text,uuid,text,timestamptz,timestamptz,bigint,bigint,bigint,text[],text,text)",
  "co_production.record_co_credit_entitlement_state(uuid,text,text[],text,boolean)",
  "co_production.reserve_co_credit(uuid,uuid,uuid,text,jsonb,text,timestamptz,uuid,uuid)",
  "co_production.issue_co_credit_worker_execution_lease(uuid,uuid,uuid,uuid,uuid,uuid,text,text,integer,timestamptz)",
  "co_production.settle_co_credit(uuid,uuid,uuid,uuid,uuid,text,text)",
  "co_production.release_co_credit(uuid,uuid,uuid,uuid,text,text)",
  "co_production.reap_expired_co_credit_reservations(uuid,integer)",
  "co_production.reverse_or_dispute_co_credit_settlement(uuid,uuid,uuid,uuid,text,text,text)",
] as const;

const workerAttestorMutationRoutines = [
  "co_production.record_co_credit_worker_execution_attestation(uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,text,timestamptz,text,jsonb)",
] as const;

const mutationAuthorityRoutines = [
  ...ownerOnlyMutationRoutines,
  ...serviceRoleMutationRoutines,
  ...workerAttestorMutationRoutines,
] as const;

test("suite is explicitly source-contract only, not runtime PostgreSQL proof", () => {
  assert.equal(
    sourceContractScope,
    "source-contract tests only; not runtime PostgreSQL proof",
  );
  assert.equal(
    runtimeConcurrencyProofRequired,
    "runtime two-session PostgreSQL proof remains required for lock and race behavior",
  );
  assert.match(migration, /emits no certification proof artifact/);
});

test("migration is additive, transaction wrapped, and PostgreSQL 15 preflighted", () => {
  assert.match(migration, /^-- Durable Co-Credit[\s\S]*\nBEGIN;/);
  assert.match(migration, /server_version_num[\s\S]*< 150000/);
  for (const prerequisite of [
    "co_production.teams",
    "co_production.projects",
    "co_production_private.has_team_role(uuid,integer)",
    "co_production_private.has_project_role(uuid,integer)",
    "extensions.digest(bytea,text)",
    "extensions.hmac(bytea,bytea,text)",
  ]) {
    assert.ok(migration.includes(prerequisite), `missing preflight ${prerequisite}`);
  }
  assert.match(migration, /COMMIT;\s*$/);
  expectAll(migration, [
    /rolname = current_user[\s\S]*role\.rolsuper OR role\.rolbypassrls/,
    /SECURITY DEFINER owner must be superuser or BYPASSRLS for FORCE RLS writes/,
    /to_regrole\('co_credit_worker_attestor'\)/,
    /worker_attestor_is_privileged/,
    /pg_has_role\([\s\S]*'service_role',[\s\S]*'co_credit_worker_attestor',[\s\S]*'MEMBER'/,
    /pg_has_role\([\s\S]*'authenticated',[\s\S]*'co_credit_worker_attestor'/,
    /pg_has_role\([\s\S]*'anon',[\s\S]*'co_credit_worker_attestor'/,
    /pg_has_role\([\s\S]*'co_credit_worker_attestor',[\s\S]*'service_role'/,
    /privileged_role\.rolsuper[\s\S]*privileged_role\.rolbypassrls[\s\S]*privileged_role\.rolcreaterole[\s\S]*privileged_role\.rolcreatedb[\s\S]*privileged_role\.rolreplication[\s\S]*pg_has_role\([\s\S]*'co_credit_worker_attestor',[\s\S]*privileged_role\.oid/,
    /relation\.relname LIKE 'co_credit_%'[\s\S]*routine\.proname LIKE '%co_credit%'[\s\S]*AS object_owner/,
  ]);
  for (const escalationAttribute of [
    "rolcreaterole",
    "rolcreatedb",
    "rolreplication",
  ]) {
    assert.equal(
      (migration.match(new RegExp(`\\b${escalationAttribute}\\b`, "g")) ?? [])
        .length,
      4,
      `${escalationAttribute} must be rejected at install, runtime, and owner preflight`,
    );
  }
  assert.doesNotMatch(migration, /\bDROP\s+(?:TABLE|SCHEMA|COLUMN|FUNCTION)\b/i);
  assert.doesNotMatch(migration, /CREATE\s+EXTENSION/i);
  assert.doesNotMatch(migration, /co_production\.usage_events|['"]usage_events['"]/);
});

test("approved catalogs and pricing are immutable, hashed, priced snapshots", () => {
  const catalog = section(
    "CREATE TABLE co_production.co_credit_rate_catalog_snapshots (",
    "CREATE TABLE co_production.co_credit_pricing_terms_snapshots (",
  );
  const pricing = section(
    "CREATE TABLE co_production.co_credit_pricing_terms_snapshots (",
    "CREATE TABLE co_production.co_credit_commercial_bundle_activations (",
  );

  expectAll(catalog, [
    /status text NOT NULL DEFAULT 'approved' CHECK \(status = 'approved'\)/,
    /catalog_sha256 text NOT NULL UNIQUE/,
    /predecessor_catalog_sha256 text REFERENCES/,
    /UNIQUE NULLS NOT DISTINCT \(predecessor_catalog_sha256\)/,
    /integrity_sha256 text NOT NULL UNIQUE/,
    /catalog_sha256 = co_production_private\.co_credit_sha256\(catalog\)/,
  ]);
  expectAll(pricing, [
    /status text NOT NULL DEFAULT 'approved' CHECK \(status = 'approved'\)/,
    /effective_at timestamptz NOT NULL/,
    /overage_micros_per_co_unit bigint NOT NULL CHECK \([\s\S]*overage_micros_per_co_unit > 0/,
    /terms_sha256 text NOT NULL UNIQUE/,
    /predecessor_terms_sha256 text REFERENCES/,
    /UNIQUE NULLS NOT DISTINCT \(predecessor_terms_sha256\)/,
    /integrity_sha256 text NOT NULL UNIQUE/,
    /FOREIGN KEY \(rate_catalog_id, rate_catalog_version, rate_catalog_sha256\)/,
    /terms_sha256 = co_production_private\.co_credit_sha256\(terms\)/,
  ]);
  assert.match(
    migration,
    /p_overage_micros_per_co_unit IS NULL[\s\S]*p_overage_micros_per_co_unit <= 0/,
  );
});

test("commercial bundles activate catalog and pricing atomically without chain forks", () => {
  const activations = tableSection("co_credit_commercial_bundle_activations");
  const catalogWriter = section(
    "CREATE OR REPLACE FUNCTION co_production.approve_co_credit_rate_catalog(",
    "CREATE OR REPLACE FUNCTION co_production.approve_co_credit_pricing_terms(",
  );
  const pricingWriter = section(
    "CREATE OR REPLACE FUNCTION co_production.approve_co_credit_pricing_terms(",
    "-- Catalog and pricing become selectable only through this serialized bundle",
  );
  const guard = section(
    "CREATE OR REPLACE FUNCTION\n  co_production_private.guard_co_credit_commercial_activation_insert()",
    "CREATE TRIGGER co_credit_commercial_activation_guard_insert",
  );
  const bundle = section(
    "co_production.approve_and_activate_co_credit_commercial_bundle(",
    "CREATE OR REPLACE FUNCTION co_production.grant_co_credit_budget(",
  );

  expectAll(activations, [
    /activation_sequence bigint NOT NULL UNIQUE/,
    /predecessor_activation_sha256 text REFERENCES/,
    /UNIQUE NULLS NOT DISTINCT \(predecessor_activation_sha256\)/,
    /UNIQUE \(rate_catalog_id, pricing_terms_id\)/,
    /FOREIGN KEY \(rate_catalog_id, rate_catalog_version, rate_catalog_sha256\)/,
    /FOREIGN KEY \(pricing_terms_id, pricing_version, pricing_terms_sha256\)/,
    /activation_sha256 = co_production_private\.co_credit_sha256/,
  ]);
  expectAll(guard, [
    /lock_co_credit_commercial_authority/,
    /NEW\.activation_sequence <> v_previous\.activation_sequence \+ 1/,
    /NEW\.predecessor_activation_sha256 IS DISTINCT FROM/,
    /NEW\.effective_at < v_previous\.effective_at/,
    /pricing\.rate_catalog_id = NEW\.rate_catalog_id/,
    /co_credit_commercial_activation_pair_invalid/,
  ]);
  expectAll(catalogWriter, [
    /lock_co_credit_commercial_authority\(\)/,
    /WHERE NOT EXISTS \([\s\S]*successor\.predecessor_catalog_sha256 = catalog\.catalog_sha256/,
    /p_predecessor_catalog_sha256 IS DISTINCT FROM[\s\S]*v_previous\.catalog_sha256/,
  ]);
  expectAll(pricingWriter, [
    /lock_co_credit_commercial_authority\(\)/,
    /WHERE NOT EXISTS \([\s\S]*successor\.predecessor_terms_sha256 = pricing\.terms_sha256/,
    /p_predecessor_terms_sha256 IS DISTINCT FROM[\s\S]*v_previous\.terms_sha256/,
  ]);
  expectAll(bundle, [
    /require_co_credit_service_role\(\)/,
    /lock_co_credit_commercial_authority\(\)/,
    /approve_co_credit_rate_catalog\(/,
    /approve_co_credit_pricing_terms\(/,
    /INSERT INTO co_production\.co_credit_commercial_bundle_activations/,
    /v_previous_activation\.activation_sha256/,
  ]);
  assert.doesNotMatch(
    migration,
    /GRANT EXECUTE ON FUNCTION co_production\.approve_co_credit_rate_catalog/,
  );
  assert.doesNotMatch(
    migration,
    /GRANT EXECUTE ON FUNCTION co_production\.approve_co_credit_pricing_terms/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION[\s\S]*approve_and_activate_co_credit_commercial_bundle\([\s\S]*\) TO service_role;/,
  );
});

test("stable budget periods span revisions and overlapping periods are rejected", () => {
  const grants = section(
    "CREATE TABLE co_production.co_credit_budget_grants (",
    "CREATE TABLE co_production.co_credit_entitlement_states (",
  );
  const guard = section(
    "CREATE OR REPLACE FUNCTION co_production_private.guard_co_credit_budget_grant_insert()",
    "CREATE TRIGGER co_credit_budget_grants_guard_insert",
  );

  expectAll(grants, [
    /budget_period_key uuid NOT NULL/,
    /revision_sequence bigint NOT NULL CHECK \(revision_sequence > 0\)/,
    /UNIQUE NULLS NOT DISTINCT \([\s\S]*budget_period_key,[\s\S]*grant_version/,
    /UNIQUE NULLS NOT DISTINCT \([\s\S]*budget_period_key,[\s\S]*revision_sequence/,
    /UNIQUE NULLS NOT DISTINCT \([\s\S]*budget_period_key,[\s\S]*predecessor_grant_sha256/,
    /'budgetPeriodKey', budget_period_key/,
    /'revisionSequence', revision_sequence/,
    /predecessor_grant_sha256 text REFERENCES/,
    /UNIQUE \(id, budget_period_key, grant_sha256\)/,
  ]);
  expectAll(guard, [
    /lock_co_credit_budget_scope/,
    /NOT EXISTS \([\s\S]*successor\.predecessor_grant_sha256 = grant_row\.grant_sha256/,
    /v_head_count > 1[\s\S]*co_credit_budget_multiple_heads/,
    /NEW\.revision_sequence <> v_head\.revision_sequence \+ 1/,
    /NEW\.revision_sequence <> 1/,
    /v_predecessor\.team_id IS DISTINCT FROM NEW\.team_id/,
    /v_predecessor\.budget_scope IS DISTINCT FROM NEW\.budget_scope/,
    /v_predecessor\.project_id IS DISTINCT FROM NEW\.project_id/,
    /v_predecessor\.budget_period_key IS DISTINCT FROM NEW\.budget_period_key/,
    /v_predecessor\.period_start IS DISTINCT FROM NEW\.period_start/,
    /v_predecessor\.period_end IS DISTINCT FROM NEW\.period_end/,
    /existing\.budget_period_key <> NEW\.budget_period_key/,
    /tstzrange\([\s\S]*\) && pg_catalog\.tstzrange/,
    /co_credit_budget_period_overlap/,
  ]);
  assert.doesNotMatch(guard, /ORDER BY grant_row\.(?:created_at|id)/);
});

test("budget accounting uses authoritative scope plus stable period identity", () => {
  const reserve = section(
    "CREATE OR REPLACE FUNCTION co_production.reserve_co_credit(",
    "CREATE OR REPLACE FUNCTION co_production.settle_co_credit(",
  );
  const settle = section(
    "CREATE OR REPLACE FUNCTION co_production.settle_co_credit(",
    "CREATE OR REPLACE FUNCTION co_production.release_co_credit(",
  );

  for (const rpc of [reserve, settle]) {
    assert.match(
      rpc,
      /event\.team_id = p_team_id[\s\S]*event\.tenant_budget_period_key/,
    );
    assert.match(
      rpc,
      /event\.team_id = p_team_id[\s\S]*event\.project_id = p_project_id[\s\S]*event\.project_budget_period_key/,
    );
  }
  assert.match(
    migration,
    /CREATE INDEX co_credit_ledger_tenant_budget_balance_idx[\s\S]*team_id,[\s\S]*tenant_budget_period_key/,
  );
  assert.match(
    migration,
    /CREATE INDEX co_credit_ledger_project_budget_balance_idx[\s\S]*team_id,[\s\S]*project_id,[\s\S]*project_budget_period_key/,
  );
});

test("reserve resolves one stable active commercial pair inside PostgreSQL", () => {
  const reserve = section(
    "CREATE OR REPLACE FUNCTION co_production.reserve_co_credit(",
    "CREATE OR REPLACE FUNCTION co_production.settle_co_credit(",
  );

  expectAll(reserve, [
    /p_expected_rate_catalog_id uuid DEFAULT NULL/,
    /p_expected_pricing_terms_id uuid DEFAULT NULL/,
    /lock_co_credit_commercial_authority\(\)/,
    /FROM co_production\.co_credit_commercial_bundle_activations AS activation/,
    /activation\.effective_at <= v_now/,
    /ORDER BY\s+activation\.effective_at DESC,\s+activation\.activation_sequence DESC\s+LIMIT 1\s+FOR SHARE/,
    /catalog\.id = v_activation\.rate_catalog_id/,
    /catalog\.catalog_version = v_activation\.rate_catalog_version/,
    /catalog\.catalog_sha256 = v_activation\.rate_catalog_sha256/,
    /co_credit_expected_catalog_is_stale/,
    /pricing\.id = v_activation\.pricing_terms_id/,
    /pricing\.pricing_version = v_activation\.pricing_version/,
    /pricing\.terms_sha256 = v_activation\.pricing_terms_sha256/,
    /pricing\.rate_catalog_id = v_catalog\.id/,
    /pricing\.rate_catalog_version = v_catalog\.catalog_version/,
    /pricing\.rate_catalog_sha256 = v_catalog\.catalog_sha256/,
    /co_credit_expected_pricing_is_stale/,
  ]);
  assert.doesNotMatch(reserve, /ORDER BY\s+catalog\.effective_at DESC/);
  assert.doesNotMatch(reserve, /ORDER BY\s+pricing\.effective_at DESC/);
});

test("catalog rollover cannot change the snapshots pinned by reservation", () => {
  const settle = section(
    "CREATE OR REPLACE FUNCTION co_production.settle_co_credit(",
    "CREATE OR REPLACE FUNCTION co_production.release_co_credit(",
  );
  expectAll(settle, [
    /catalog\.id = v_reservation\.rate_catalog_id/,
    /catalog\.catalog_version = v_reservation\.rate_catalog_version/,
    /catalog\.catalog_sha256 = v_reservation\.rate_catalog_sha256/,
    /pricing\.id = v_reservation\.pricing_terms_id/,
    /pricing\.pricing_version = v_reservation\.pricing_version/,
    /pricing\.terms_sha256 = v_reservation\.pricing_terms_sha256/,
    /co_credit_calculate_units\(\s*v_catalog\.catalog,\s*v_reservation\.operation,\s*v_native_usage/,
  ]);
  assert.doesNotMatch(settle, /ORDER BY\s+catalog\.effective_at DESC/);
  assert.doesNotMatch(settle, /ORDER BY\s+pricing\.effective_at DESC/);
});

test("execution identity and debit uniqueness enforce at-most-once settlement", () => {
  const executions = section(
    "CREATE TABLE co_production.co_credit_operation_executions (",
    "CREATE TABLE co_production.co_credit_quotes (",
  );
  expectAll(executions, [
    /operation_execution_id uuid PRIMARY KEY/,
    /UNIQUE \(operation_execution_id, team_id, project_id, operation\)/,
  ]);
  assert.match(
    migration,
    /CREATE UNIQUE INDEX co_credit_at_most_one_customer_debit_per_execution[\s\S]*\(operation_execution_id\)[\s\S]*WHERE event_kind = 'settlement_debit'/,
  );
  assert.match(migration, /UNIQUE \(team_id, action, idempotency_key\)/);
  assert.match(migration, /co_credit_operation_execution_conflict/);
});

test("composite foreign keys bind execution, scope, operation, and lineage", () => {
  const attestations = tableSection("co_credit_worker_execution_attestations");
  expectAll(migration, [
    /FOREIGN KEY \(operation_execution_id, team_id, project_id, operation\)[\s\S]*REFERENCES co_production\.co_credit_operation_executions/,
    /FOREIGN KEY \(\s*quote_id,\s*operation_execution_id,\s*team_id,\s*project_id,\s*operation\s*\)[\s\S]*REFERENCES co_production\.co_credit_quotes/,
    /FOREIGN KEY \(\s*reservation_id,\s*operation_execution_id,\s*team_id,\s*project_id,\s*operation\s*\)[\s\S]*REFERENCES co_production\.co_credit_reservations/,
    /FOREIGN KEY \(\s*settlement_receipt_id,\s*operation_execution_id,\s*team_id,\s*project_id,\s*operation\s*\)[\s\S]*REFERENCES co_production\.co_credit_terminal_receipts/,
    /CREATE TABLE co_production\.co_credit_worker_execution_bindings[\s\S]*FOREIGN KEY \(\s*worker_lease_id,\s*reservation_id,\s*operation_execution_id,\s*team_id,\s*project_id,\s*operation,\s*lease_sequence,\s*lease_token_sha256\s*\)[\s\S]*REFERENCES co_production\.co_credit_worker_execution_leases/,
    /CREATE TABLE co_production\.co_credit_worker_execution_attestations[\s\S]*FOREIGN KEY \(\s*worker_binding_id,[\s\S]*worker_execution_id,[\s\S]*worker_key_id,[\s\S]*worker_lease_id,[\s\S]*source_sha256,[\s\S]*pipeline_job_id,[\s\S]*pipeline_attempt[\s\S]*REFERENCES co_production\.co_credit_worker_execution_bindings/,
    /FOREIGN KEY \(\s*worker_attestation_id,\s*reservation_id,\s*operation_execution_id,\s*team_id,\s*project_id,\s*operation,\s*worker_evidence_sha256,\s*output_receipt_sha256,\s*outcome\s*\)[\s\S]*REFERENCES co_production\.co_credit_worker_execution_attestations\([\s\S]*settlement_outcome/,
    /FOREIGN KEY \(team_id, previous_event_sequence, previous_event_sha256\)[\s\S]*REFERENCES co_production\.co_credit_ledger_events/,
  ]);
  expectAll(attestations, [
    /FOREIGN KEY \(\s*worker_binding_id,[\s\S]*pipeline_attempt\s*\)[\s\S]*REFERENCES co_production\.co_credit_worker_execution_bindings/,
    /FOREIGN KEY \(\s*worker_lease_id,\s*reservation_id,\s*operation_execution_id,\s*team_id,\s*project_id,\s*operation,\s*lease_sequence,\s*lease_token_sha256\s*\)[\s\S]*REFERENCES co_production\.co_credit_worker_execution_leases/,
  ]);
});

test("ledger hashes are recomputable and predecessor-linked", () => {
  const ledger = section(
    "CREATE TABLE co_production.co_credit_ledger_events (",
    "CREATE UNIQUE INDEX co_credit_at_most_one_customer_debit_per_execution",
  );
  expectAll(ledger, [
    /UNIQUE \(team_id, event_sequence, event_sha256\)/,
    /previous_event_sequence = event_sequence - 1/,
    /event_sha256 = co_production_private\.co_credit_sha256\(/,
    /'previousEventSequence', previous_event_sequence/,
    /'previousEventSha256', previous_event_sha256/,
    /'occurredAtEpochMicros'/,
  ]);
  assert.match(
    migration,
    /pg_advisory_xact_lock[\s\S]*ORDER BY event\.event_sequence DESC[\s\S]*FOR UPDATE/,
  );
});

test("commercial JSON rejects normalized sensitive keys and embedded PAN-like strings", () => {
  const panHelpers = section(
    "CREATE OR REPLACE FUNCTION\n  co_production_private.co_credit_decimal_digit_to_ascii(",
    "CREATE OR REPLACE FUNCTION\n  co_production_private.co_credit_text_contains_pan(",
  );
  const panGuard = section(
    "CREATE OR REPLACE FUNCTION\n  co_production_private.co_credit_text_contains_pan(",
    "CREATE OR REPLACE FUNCTION co_production_private.co_credit_commercial_json_is_safe(",
  );
  const safety = section(
    "CREATE OR REPLACE FUNCTION co_production_private.co_credit_commercial_json_is_safe(",
    "CREATE OR REPLACE FUNCTION co_production_private.require_co_credit_service_role()",
  );
  const receipts = section(
    "CREATE TABLE co_production.co_credit_terminal_receipts (",
    "CREATE UNIQUE INDEX co_credit_one_terminal_outcome_per_reservation",
  );
  const attestation = section(
    "co_production.record_co_credit_worker_execution_attestation(",
    "CREATE OR REPLACE FUNCTION co_production.settle_co_credit(",
  );
  const settle = section(
    "CREATE OR REPLACE FUNCTION co_production.settle_co_credit(",
    "CREATE OR REPLACE FUNCTION co_production.release_co_credit(",
  );

  expectAll(safety, [
    /pg_catalog\.jsonb_each\(p_value\)/,
    /co_credit_commercial_json_is_safe\(v_child\)/,
    /pg_catalog\.jsonb_array_elements\(p_value\)/,
    /pg_catalog\.lower\(v_key\)/,
    /co_credit_text_contains_pan\(v_key\)/,
    /'\[\^a-z0-9\]'/,
    /'card'/,
    /'cardnumber'/,
    /'cardpan'/,
    /'creditcard'/,
    /'debitcard'/,
    /'bankaccount'/,
    /'bankroutingnumber'/,
    /'routingnumber'/,
    /'iban'/,
    /'swift'/,
    /'paymentmethodsecret'/,
    /'clientsecret'/,
    /'privatekey'/,
    /'cardexpiration'/,
    /'cardverificationvalue'/,
  ]);
  expectAll(panGuard, [
    /co_credit_pan_separator_is_allowed/,
    /co_credit_pan_is_valid/,
    /'4242 4242 4242 4242'/,
    /'4242\.4242\.4242\.4242'/,
    /'4242\/4242\/4242\/4242'/,
    /'4242_4242_4242_4242'/,
    /U&'4242\\00A04242\\00A04242\\00A04242'/,
    /U&'4242\\20144242\\20144242\\20144242'/,
    /U&'4242\\200B4242\\200B4242\\200B4242'/,
    /U&'\\FF14\\FF12\\FF14\\FF12/,
    /U&'\\0664\\0662\\0664\\0662/,
    /'evidence: 4242\.\.4242\/\/\/4242___4242'/,
    /'0-4242-4242-4242-4242'/,
    /'4242-4242-4242-4242-0000'/,
    /co_credit_pan_guard_rejection_vector_failed/,
    /'release 2026\/07\/15 revision 42'/,
    /'4242 4242 4242 4241'/,
    /co_credit_pan_guard_allow_vector_failed/,
  ]);
  expectAll(panHelpers, [
    /v_codepoint BETWEEN v_zero_codepoint AND v_zero_codepoint \+ 9/,
    /1632, 1776, 1984/,
    /44016, 65296/,
    /p_character !~ '\^\[\[:alnum:\]\]\$'/,
    /p_digits !~ '\^\[0-9\]\{13,19\}\$'/,
    /v_sum % 10 = 0/,
  ]);
  expectAll(panGuard, [
    /pg_catalog\.right\(v_digits \|\| v_digit, 19\)/,
    /FOR v_candidate_length IN 13\.\./,
    /pg_catalog\.right\(v_digits, v_candidate_length\)/,
  ]);
  assert.match(safety, /co_credit_text_contains_pan\(v_text\)/);
  expectAll(safety, [
    /co_credit_text_contains_pan\(\s*co_production_private\.co_credit_json_digit_fragments\(p_value\)/,
    /WHEN 'number' THEN[\s\S]*co_credit_text_contains_pan\(p_value #>> '\{\}'\)/,
    /pg_catalog\.to_jsonb\(4242424242424242::numeric\)/,
    /'transcoded_media_milliseconds'[\s\S]*4242424242424242::numeric/,
    /pg_catalog\.jsonb_build_object\('4242-4242-4242-4242', true\)/,
    /'parts'[\s\S]*pg_catalog\.jsonb_build_array\('4242', '4242', '4242', '4242'\)/,
    /'durationMilliseconds', 60000/,
    /'shot_4242', true/,
    /'dimensions'[\s\S]*pg_catalog\.jsonb_build_array\(1920, 1080, 30\)/,
    /co_credit_pan_guard_numeric_vector_failed/,
  ]);
  assert.ok(
    safety.includes(
      "'(^|[^A-Za-z0-9])(?:sk|rk|pk)_live_[A-Za-z0-9]+([^A-Za-z0-9]|$)'",
    ),
  );
  assert.doesNotMatch(safety, /'\^\[0-9\]\[0-9 -\]\{11,23\}\[0-9\]\$'/);
  assert.match(
    receipts,
    /pg_catalog\.pg_column_size\(worker_evidence\) <= 32768/,
  );
  assert.match(
    attestation,
    /pg_catalog\.pg_column_size\(p_worker_evidence\) > 32768/,
  );
  assert.match(settle, /pg_catalog\.pg_column_size\(v_worker_evidence\) > 32768/);
  for (const value of [receipts, attestation, settle]) {
    assert.match(value, /co_credit_commercial_json_is_safe\([\s\S]*worker_evidence/);
  }
  expectAll(migration, [
    /REVOKE ALL ON FUNCTION\s+co_production_private\.co_credit_decimal_digit_to_ascii\(text\)\s+FROM PUBLIC, anon, authenticated, service_role,\s+co_credit_worker_attestor;/,
    /REVOKE ALL ON FUNCTION\s+co_production_private\.co_credit_pan_separator_is_allowed\(text\)\s+FROM PUBLIC, anon, authenticated, service_role,\s+co_credit_worker_attestor;/,
    /REVOKE ALL ON FUNCTION\s+co_production_private\.co_credit_pan_is_valid\(text\)\s+FROM PUBLIC, anon, authenticated, service_role,\s+co_credit_worker_attestor;/,
    /REVOKE ALL ON FUNCTION\s+co_production_private\.co_credit_text_contains_pan\(text\)\s+FROM PUBLIC, anon, authenticated, service_role,\s+co_credit_worker_attestor;/,
    /REVOKE ALL ON FUNCTION\s+co_production_private\.co_credit_decimal_fragment\(text\)\s+FROM PUBLIC, anon, authenticated, service_role,\s+co_credit_worker_attestor;/,
    /REVOKE ALL ON FUNCTION\s+co_production_private\.co_credit_json_digit_fragments\(jsonb\)\s+FROM PUBLIC, anon, authenticated, service_role,\s+co_credit_worker_attestor;/,
  ]);
});

test("settled receipts close evidence and provider NULL escape paths", () => {
  const receipts = section(
    "CREATE TABLE co_production.co_credit_terminal_receipts (",
    "CREATE UNIQUE INDEX co_credit_one_terminal_outcome_per_reservation",
  );
  expectAll(receipts, [
    /receipt_kind = 'settled'[\s\S]*worker_attestation_id IS NOT NULL[\s\S]*worker_evidence IS NOT NULL[\s\S]*worker_evidence_sha256 IS NOT NULL[\s\S]*output_receipt_sha256 IS NOT NULL[\s\S]*co_credit_hash_is_valid\([\s\S]*output_receipt_sha256/,
    /worker_evidence_sha256 =\s*co_production_private\.co_credit_sha256\(worker_evidence\)/,
    /FOREIGN KEY \(\s*worker_attestation_id,[\s\S]*worker_evidence_sha256,[\s\S]*output_receipt_sha256,[\s\S]*outcome[\s\S]*REFERENCES co_production\.co_credit_worker_execution_attestations\([\s\S]*settlement_outcome/,
    /provider_name IS NULL[\s\S]*provider_model IS NULL[\s\S]*provider_rate_evidence_sha256 IS NULL[\s\S]*provider_receipt_sha256 IS NULL/,
    /provider_name IS NOT NULL[\s\S]*provider_model IS NOT NULL[\s\S]*provider_rate_evidence_sha256 IS NOT NULL[\s\S]*provider_receipt_sha256 IS NOT NULL/,
    /source_sha256 IS NOT DISTINCT FROM\s*worker_evidence ->> 'sourceSha256'/,
    /native_usage IS NOT DISTINCT FROM worker_evidence -> 'nativeUsage'/,
  ]);
});

test("new_transcode evidence is registered by the trusted worker authority", () => {
  const attestation = section(
    "co_production.record_co_credit_worker_execution_attestation(",
    "CREATE OR REPLACE FUNCTION co_production.settle_co_credit(",
  );
  const settle = section(
    "CREATE OR REPLACE FUNCTION co_production.settle_co_credit(",
    "CREATE OR REPLACE FUNCTION co_production.release_co_credit(",
  );
  assert.match(attestation, /require_co_credit_worker_attestor_role\(\)/);
  assert.match(attestation, /v_reservation\.operation = 'new_transcode'/);
  for (const field of [
    "sourceSha256",
    "pipelineJobId",
    "pipelineAttempt",
    "outputReceiptSha256",
    "durationMilliseconds",
    "nativeUsage",
    "settlementOutcome",
    "transcoded_media_milliseconds",
    "provider",
    "model",
    "providerRateEvidenceSha256",
    "providerReceiptSha256",
  ]) {
    assert.match(attestation, new RegExp(`'${field}'`));
  }
  assert.match(attestation, /co_credit_transcode_native_usage_mismatch/);
  assert.match(attestation, /co_credit_provider_evidence_incomplete/);
  expectAll(settle, [
    /attestation\.id = p_worker_attestation_id/,
    /v_worker_evidence := v_attestation\.worker_evidence/,
    /v_evidence_sha256 := v_attestation\.worker_evidence_sha256/,
    /v_attestation\.settlement_outcome IS DISTINCT FROM p_outcome/,
    /co_credit_worker_attested_outcome_mismatch/,
    /v_worker_evidence ->> 'settlementOutcome' IS DISTINCT FROM p_outcome/,
    /NOT v_worker_evidence \?& ARRAY\[[^\]]*'settlementOutcome'[^\]]*\]/,
    /v_worker_evidence - ARRAY\[[^\]]*'settlementOutcome'[^\]]*\]\s+IS DISTINCT FROM/,
    /co_credit_registered_worker_attestation_invalid/,
  ]);
  assert.doesNotMatch(settle, /p_worker_evidence/);
});

test("worker signing keys are owner-provisioned, private, and HMAC-capable", () => {
  const keys = section(
    "CREATE TABLE co_production_private.co_credit_worker_signing_keys (",
    "CREATE OR REPLACE FUNCTION\n  co_production_private.assert_co_credit_operation_authority(",
  );
  const provision = section(
    "CREATE OR REPLACE FUNCTION\n  co_production_private.provision_co_credit_worker_signing_key(",
    "CREATE TABLE co_production.co_credit_rate_catalog_snapshots (",
  );
  const constantTime = section(
    "co_production_private.co_credit_constant_time_bytea_equal(",
    "CREATE OR REPLACE FUNCTION co_production_private.co_credit_identifier_is_valid(",
  );

  expectAll(keys, [
    /worker_key_id uuid PRIMARY KEY/,
    /worker_principal text NOT NULL CHECK/,
    /hmac_secret bytea NOT NULL CHECK/,
    /octet_length\(hmac_secret\) BETWEEN 32 AND 128/,
    /key_fingerprint_sha256 text NOT NULL UNIQUE/,
    /extensions\.digest\(hmac_secret, 'sha256'\)/,
    /not_before timestamptz NOT NULL/,
    /not_after timestamptz NOT NULL/,
    /provisioned_by text NOT NULL CHECK/,
  ]);
  expectAll(provision, [
    /session_user::text IS DISTINCT FROM v_metadata\.expected_owner_name::text/,
    /current_user::text IS DISTINCT FROM v_metadata\.expected_owner_name::text/,
    /co_credit_authority_owner_required/,
    /INSERT INTO co_production_private\.co_credit_worker_signing_keys/,
    /RETURN pg_catalog\.jsonb_build_object\([\s\S]*'keyFingerprintSha256'/,
  ]);
  expectAll(constantTime, [
    /octet_length\(p_left\) <> 32/,
    /FOR v_index IN 0\.\.31 LOOP/,
    /get_byte\(p_left, v_index\)[\s\S]*#[\s\S]*get_byte\(p_right, v_index\)/,
    /RETURN v_difference = 0/,
  ]);
  assert.match(migration, /extensions\.hmac\(bytea,bytea,text\)/);
  assert.match(
    migration,
    /REVOKE ALL ON TABLE[\s\S]*co_production_private\.co_credit_worker_signing_keys[\s\S]*FROM PUBLIC, anon, authenticated, service_role, co_credit_worker_attestor/,
  );
  expectAll(migration, [
    /ALTER TABLE co_production_private\.co_credit_worker_signing_keys[\s\S]*ENABLE ROW LEVEL SECURITY/,
    /ALTER TABLE co_production_private\.co_credit_worker_signing_keys[\s\S]*FORCE ROW LEVEL SECURITY/,
    /CREATE TRIGGER co_credit_worker_signing_keys_immutable[\s\S]*reject_co_credit_mutation/,
    /CREATE TRIGGER co_credit_worker_signing_keys_no_truncate[\s\S]*reject_co_credit_truncate/,
  ]);
  assert.doesNotMatch(
    migration,
    /GRANT (?:SELECT|ALL)[\s\S]{0,200}co_production_private\.co_credit_worker_signing_keys/,
  );
  assert.doesNotMatch(
    migration,
    /GRANT EXECUTE ON FUNCTION[\s\S]{0,200}provision_co_credit_worker_signing_key/,
  );
});

test("lease issuance atomically pre-registers worker source, job, and key identity", () => {
  const leases = tableSection("co_credit_worker_execution_leases");
  const bindings = tableSection("co_credit_worker_execution_bindings");
  const issueLease = section(
    "CREATE OR REPLACE FUNCTION co_production.issue_co_credit_worker_execution_lease(",
    "CREATE OR REPLACE FUNCTION\n  co_production.record_co_credit_worker_execution_attestation(",
  );

  expectAll(leases, [
    /UNIQUE \(operation_execution_id, lease_sequence\)/,
    /lease_token_sha256 text NOT NULL UNIQUE/,
    /'leaseSequence', lease_sequence/,
    /'leaseTokenSha256', lease_token_sha256/,
  ]);
  expectAll(bindings, [
    /worker_execution_id uuid NOT NULL UNIQUE/,
    /worker_key_id uuid NOT NULL/,
    /worker_principal text NOT NULL CHECK/,
    /worker_key_fingerprint_sha256 text NOT NULL CHECK/,
    /worker_key_fingerprint_sha256 text NOT NULL CHECK/,
    /worker_lease_id uuid NOT NULL UNIQUE/,
    /source_sha256 text NOT NULL CHECK/,
    /pipeline_job_id text NOT NULL CHECK/,
    /pipeline_attempt integer NOT NULL CHECK \(pipeline_attempt > 0\)/,
    /REFERENCES co_production_private\.co_credit_worker_signing_keys/,
    /REFERENCES co_production\.co_credit_worker_execution_leases/,
    /'registeredAtEpochMicros'/,
  ]);
  expectAll(issueLease, [
    /require_co_credit_service_role\(\)/,
    /lock_co_credit_lifecycle_scope\(/,
    /FROM co_production_private\.co_credit_worker_signing_keys AS signing_key/,
    /v_worker_key\.not_before > v_issued_at/,
    /v_worker_key\.not_after <= v_issued_at/,
    /NOT EXISTS \([\s\S]*newer\.lease_sequence > lease\.lease_sequence/,
    /v_sequence := pg_catalog\.coalesce\(v_previous\.lease_sequence, 0\) \+ 1/,
    /co_credit_sha256\(\s*pg_catalog\.to_jsonb\(v_lease_token\)/,
    /INSERT INTO co_production\.co_credit_worker_execution_leases/,
    /INSERT INTO co_production\.co_credit_worker_execution_bindings/,
    /'workerExecutionBinding', pg_catalog\.to_jsonb\(v_binding\)/,
    /'leaseToken', v_lease_token/,
  ]);
  assert.ok(
    issueLease.indexOf("INSERT INTO co_production.co_credit_worker_execution_leases") <
      issueLease.indexOf("'leaseToken', v_lease_token"),
  );
  assert.ok(
    issueLease.indexOf("INSERT INTO co_production.co_credit_worker_execution_bindings") <
      issueLease.indexOf("'leaseToken', v_lease_token"),
  );
});

test("worker attestations require a detached HMAC over the registered fenced execution", () => {
  const attestations = tableSection("co_credit_worker_execution_attestations");
  const attest = section(
    "CREATE OR REPLACE FUNCTION\n  co_production.record_co_credit_worker_execution_attestation(",
    "CREATE OR REPLACE FUNCTION co_production.settle_co_credit(",
  );
  const settle = section(
    "CREATE OR REPLACE FUNCTION co_production.settle_co_credit(",
    "CREATE OR REPLACE FUNCTION co_production.release_co_credit(",
  );

  expectAll(attestations, [
    /worker_binding_id uuid NOT NULL UNIQUE/,
    /worker_execution_id uuid NOT NULL UNIQUE/,
    /worker_key_id uuid NOT NULL/,
    /worker_principal text NOT NULL CHECK/,
    /worker_lease_id uuid NOT NULL UNIQUE/,
    /operation_execution_id uuid NOT NULL UNIQUE/,
    /settlement_outcome text NOT NULL CHECK/,
    /output_receipt_sha256 text NOT NULL UNIQUE/,
    /actor_principal = 'worker:' \|\| worker_principal/,
    /co_credit_identifier_is_valid\(\s*actor_principal,\s*240/,
    /worker_evidence_sha256 =\s*co_production_private\.co_credit_sha256\(worker_evidence\)/,
    /signed_payload_sha256 text NOT NULL UNIQUE/,
    /signature_hmac_sha256 text NOT NULL UNIQUE/,
    /co_credit_hmac_is_valid\(signature_hmac_sha256\)/,
    /REFERENCES co_production\.co_credit_worker_execution_bindings/,
    /REFERENCES co_production\.co_credit_worker_execution_leases/,
    /output_receipt_sha256 IS NOT DISTINCT FROM\s*worker_evidence ->> 'outputReceiptSha256'/,
    /settlement_outcome IS NOT DISTINCT FROM\s*worker_evidence ->> 'settlementOutcome'/,
    /'settlementOutcome', settlement_outcome/,
  ]);
  expectAll(attest, [
    /require_co_credit_worker_attestor_role\(\)/,
    /p_worker_binding_id uuid/,
    /p_attested_at timestamptz/,
    /p_signature_hmac_sha256 text/,
    /lock_co_credit_lifecycle_scope\(/,
    /lease\.lease_token_sha256 = v_lease_token_sha256/,
    /binding\.id = p_worker_binding_id/,
    /binding\.worker_execution_id = p_worker_execution_id/,
    /signing_key\.worker_key_id = v_binding\.worker_key_id/,
    /v_actor_principal := 'worker:' \|\| v_binding\.worker_principal/,
    /newer\.lease_sequence > v_lease\.lease_sequence/,
    /v_lease\.expires_at <= v_now/,
    /co_credit_worker_lease_fence_invalid/,
    /co-credit-worker-receipt-signature\.v1/,
    /'workerBindingId', v_binding\.id/,
    /'workerExecutionId', v_binding\.worker_execution_id/,
    /'workerKeyId', v_binding\.worker_key_id/,
    /'workerPrincipal', v_binding\.worker_principal/,
    /'workerLeaseId', v_binding\.worker_lease_id/,
    /'reservationId', v_binding\.reservation_id/,
    /'operationExecutionId', v_binding\.operation_execution_id/,
    /'teamId', v_binding\.team_id/,
    /'projectId', v_binding\.project_id/,
    /'operation', v_binding\.operation/,
    /'leaseSequence', v_binding\.lease_sequence/,
    /'leaseTokenSha256', v_binding\.lease_token_sha256/,
    /'sourceSha256', v_binding\.source_sha256/,
    /'pipelineJobId', v_binding\.pipeline_job_id/,
    /'outputReceiptSha256', v_output_receipt_sha256/,
    /'nativeUsage', p_worker_evidence -> 'nativeUsage'/,
    /'settlementOutcome', v_settlement_outcome/,
    /'attestedAtEpochMicros'/,
    /extensions\.hmac\([\s\S]*v_worker_key\.hmac_secret[\s\S]*'sha256'/,
    /co_credit_constant_time_bytea_equal\([\s\S]*v_expected_hmac,[\s\S]*v_provided_hmac/,
    /co_credit_worker_attestation_signature_invalid/,
    /co_credit_worker_preregistration_binding_mismatch/,
    /co_credit_worker_attestation_replay_conflict/,
    /INSERT INTO co_production\.co_credit_worker_execution_attestations/,
  ]);
  assert.doesNotMatch(attest, /p_signed_payload|p_signed_payload_sha256/);
  expectAll(settle, [
    /lease\.lease_sequence = v_attestation\.lease_sequence/,
    /newer\.lease_sequence > lease\.lease_sequence/,
    /v_attestation\.settlement_outcome IS DISTINCT FROM p_outcome/,
    /co_credit_sha256\(v_signed_payload\) IS DISTINCT FROM\s*v_attestation\.signed_payload_sha256/,
    /extensions\.hmac\([\s\S]*v_worker_key\.hmac_secret/,
    /co_credit_registered_worker_signature_invalid/,
    /'workerAttestationId', p_worker_attestation_id/,
  ]);
  const attestationGrant = section(
    "GRANT EXECUTE ON FUNCTION\n  co_production.record_co_credit_worker_execution_attestation(",
    "GRANT EXECUTE ON FUNCTION co_production.settle_co_credit(",
  );
  assert.match(attestationGrant, /\) TO co_credit_worker_attestor;/);
  assert.doesNotMatch(attestationGrant, /TO service_role/);
});

test("every timestamp participating in a hash uses immutable epoch canonicalization", () => {
  const canonicalizer = section(
    "CREATE OR REPLACE FUNCTION co_production_private.co_credit_epoch_microseconds(",
    "CREATE OR REPLACE FUNCTION co_production_private.co_credit_hash_is_valid(",
  );
  expectAll(canonicalizer, [/RETURNS bigint/, /IMMUTABLE/, /extract\(epoch FROM p_value\)/]);
  assert.match(migration, /effectiveAtEpochMicros/);
  assert.match(migration, /approvedAtEpochMicros/);
  assert.match(migration, /activatedAtEpochMicros/);
  assert.match(migration, /periodStartEpochMicros/);
  assert.match(migration, /recordedAtEpochMicros/);
  assert.match(migration, /createdAtEpochMicros/);
  assert.match(migration, /quotedAtEpochMicros/);
  assert.match(migration, /reservedAtEpochMicros/);
  assert.match(migration, /occurredAtEpochMicros/);
  assert.match(migration, /expiresAtEpochMicros/);
  assert.match(migration, /issuedAtEpochMicros/);
  assert.match(migration, /registeredAtEpochMicros/);
  assert.match(migration, /attestedAtEpochMicros/);
  assert.match(migration, /provisionedAtEpochMicros/);
  assert.doesNotMatch(
    migration,
    /'(?:effectiveAt|approvedAt|activatedAt|periodStart|periodEnd|recordedAt|createdAt|quotedAt|reservedAt|occurredAt|issuedAt|attestedAt|expiresAt)'/,
  );
});

test("reserve validates expiry, entitlements, locks, and caps", () => {
  const reserve = section(
    "CREATE OR REPLACE FUNCTION co_production.reserve_co_credit(",
    "CREATE OR REPLACE FUNCTION co_production.settle_co_credit(",
  );
  expectAll(reserve, [
    /p_expires_at > v_now \+ interval '24 hours'/,
    /lock_co_credit_lifecycle_scope\(\s*p_team_id,\s*p_project_id,\s*p_operation_execution_id/,
    /budget_scope = 'tenant'[\s\S]*NOT EXISTS \([\s\S]*successor\.predecessor_grant_sha256 = grant_row\.grant_sha256[\s\S]*FOR UPDATE/,
    /budget_scope = 'project'[\s\S]*NOT EXISTS \([\s\S]*successor\.predecessor_grant_sha256 = grant_row\.grant_sha256[\s\S]*FOR UPDATE/,
    /entitlement_status <> 'active'/,
    /maximum_reservation_co_units/,
    /effective_limit_co_units[\s\S]*co_credit_budget_cap_exceeded/,
    /INSERT INTO co_production\.co_credit_quotes/,
    /INSERT INTO co_production\.co_credit_reservations/,
    /v_now := pg_catalog\.clock_timestamp\(\)/,
    /co_credit_commercial_activation_advanced_retry/,
  ]);
  assert.doesNotMatch(reserve, /p_expires_at[^;]*catalog\.effective_at/);
  assert.doesNotMatch(reserve, /ORDER BY grant_row\.(?:created_at|id)/);
});

test("settlement locks pinned grants and rechecks current grants and entitlements", () => {
  const settle = section(
    "CREATE OR REPLACE FUNCTION co_production.settle_co_credit(",
    "CREATE OR REPLACE FUNCTION co_production.release_co_credit(",
  );
  expectAll(settle, [
    /grant_row\.id = v_reservation\.tenant_budget_grant_id[\s\S]*grant_row\.budget_period_key =[\s\S]*v_reservation\.tenant_budget_period_key[\s\S]*FOR UPDATE/,
    /grant_row\.id = v_reservation\.project_budget_grant_id[\s\S]*grant_row\.budget_period_key =[\s\S]*v_reservation\.project_budget_period_key[\s\S]*FOR UPDATE/,
    /INTO STRICT v_current_tenant_grant[\s\S]*grant_row\.budget_period_key =[\s\S]*v_reservation\.tenant_budget_period_key[\s\S]*NOT EXISTS \([\s\S]*successor\.predecessor_grant_sha256 = grant_row\.grant_sha256[\s\S]*FOR UPDATE/,
    /INTO STRICT v_current_project_grant[\s\S]*grant_row\.budget_period_key =[\s\S]*v_reservation\.project_budget_period_key[\s\S]*NOT EXISTS \([\s\S]*successor\.predecessor_grant_sha256 = grant_row\.grant_sha256[\s\S]*FOR UPDATE/,
    /state\.budget_grant_id = v_current_tenant_grant\.id[\s\S]*ORDER BY state\.entitlement_sequence DESC/,
    /state\.budget_grant_id = v_current_project_grant\.id[\s\S]*ORDER BY state\.entitlement_sequence DESC/,
    /IF v_current_tenant_entitlement\.entitlement_status <> 'active'\s+OR v_current_project_entitlement\.entitlement_status <> 'active'/,
    /NOT v_current_tenant_entitlement\.settlement_grandfathered/,
    /NOT v_current_project_entitlement\.settlement_grandfathered/,
    /co_credit_settlement_entitlement_denied/,
    /v_tenant_reserved - v_reservation\.reserved_co_units/,
    /v_project_reserved - v_reservation\.reserved_co_units/,
    /co_credit_budget_cap_exceeded/,
    /> v_current_tenant_grant\.effective_limit_co_units/,
    /> v_current_project_grant\.effective_limit_co_units/,
    /'settlement_debit'/,
    /co_credit_settlement_clock_recheck_failed/,
  ]);
  assert.doesNotMatch(settle, /ORDER BY grant_row\.(?:created_at|id)/);
  const entitlements = tableSection("co_credit_entitlement_states");
  expectAll(entitlements, [
    /settlement_grandfathered boolean NOT NULL DEFAULT false/,
    /NOT settlement_grandfathered OR entitlement_status = 'active'/,
    /'settlementGrandfathered', settlement_grandfathered/,
  ]);
  const recordEntitlement = section(
    "CREATE OR REPLACE FUNCTION co_production.record_co_credit_entitlement_state(",
    "-- Reserve creates the quote and hold in one database transaction.",
  );
  assert.match(
    recordEntitlement,
    /p_settlement_grandfathered\s+AND p_entitlement_status <> 'active'/,
  );
  assert.doesNotMatch(
    settle,
    /IF \(\s*v_current_tenant_entitlement\.entitlement_status <> 'active'[\s\S]*?\)\s+AND NOT v_current_tenant_entitlement\.settlement_grandfathered/,
  );
});

test("internally computed fingerprints reject changed replay material", () => {
  const reserve = section(
    "CREATE OR REPLACE FUNCTION co_production.reserve_co_credit(",
    "CREATE OR REPLACE FUNCTION co_production.settle_co_credit(",
  );
  const settle = section(
    "CREATE OR REPLACE FUNCTION co_production.settle_co_credit(",
    "CREATE OR REPLACE FUNCTION co_production.release_co_credit(",
  );
  const release = section(
    "CREATE OR REPLACE FUNCTION co_production.release_co_credit(",
    "CREATE OR REPLACE FUNCTION co_production.reverse_or_dispute_co_credit_settlement(",
  );
  const compensate = section(
    "CREATE OR REPLACE FUNCTION co_production.reverse_or_dispute_co_credit_settlement(",
    "CREATE OR REPLACE FUNCTION co_production.read_co_credit_settlement_audit(",
  );

  expectAll(reserve, [
    /co-credit-reserve-request\.v1/,
    /'nativeUsageCeiling', p_native_usage_ceiling/,
    /'expiresAtEpochMicros'/,
    /v_existing_quote\.native_usage_ceiling IS DISTINCT FROM/,
    /co_credit_reservation_replay_material_conflict/,
  ]);
  expectAll(settle, [
    /co-credit-settle-request\.v1/,
    /'workerAttestationId', p_worker_attestation_id/,
    /'outcome', p_outcome/,
    /'workerEvidenceSha256', v_evidence_sha256/,
    /worker_attestation_id IS DISTINCT FROM\s+p_worker_attestation_id/,
    /co_credit_settlement_replay_material_conflict/,
  ]);
  expectAll(release, [
    /co-credit-release-request\.v1/,
    /'reasonCode', p_reason_code/,
    /v_existing_receipt\.reason_code IS DISTINCT FROM p_reason_code/,
  ]);
  expectAll(compensate, [
    /co-credit-compensation-request\.v1/,
    /'action', p_action/,
    /'reasonCode', p_reason_code/,
    /v_existing_compensation\.receipt_kind IS DISTINCT FROM p_action/,
  ]);
  for (const rpc of [reserve, settle, release, compensate]) {
    assert.doesNotMatch(rpc, /p_request_sha256/);
    assert.match(
      rpc,
      /v_request_fingerprint := co_production_private\.co_credit_sha256\(/,
    );
    assert.match(
      rpc,
      /request_sha256 IS DISTINCT FROM\s+v_request_fingerprint/,
    );
    assert.match(rpc, /co_credit_idempotency_conflict|co_credit_operation_execution_conflict/);
  }
});

test("exact reserve and worker-attestation replays precede mutable state gates", () => {
  const reserve = section(
    "CREATE OR REPLACE FUNCTION co_production.reserve_co_credit(",
    "CREATE OR REPLACE FUNCTION co_production.issue_co_credit_worker_execution_lease(",
  );
  const attest = section(
    "CREATE OR REPLACE FUNCTION\n  co_production.record_co_credit_worker_execution_attestation(",
    "CREATE OR REPLACE FUNCTION co_production.settle_co_credit(",
  );

  const reserveReplay = reserve.lastIndexOf("'replayed', true");
  const reserveExpiryGate = reserve.indexOf(
    "MESSAGE = 'co_credit_reservation_expiry_invalid'",
  );
  const commercialLock = reserve.indexOf(
    "lock_co_credit_commercial_authority()",
  );
  assert.ok(reserveReplay >= 0);
  assert.ok(reserveReplay < reserveExpiryGate);
  assert.ok(reserveReplay < commercialLock);
  assert.match(reserve, /co_credit_reservation_replay_material_conflict/);

  const signatureFailure = attest.indexOf(
    "MESSAGE = 'co_credit_worker_attestation_signature_invalid'",
  );
  const replayLookup = attest.indexOf(
    "FROM co_production.co_credit_worker_execution_attestations AS attestation",
  );
  const replayConflict = attest.indexOf(
    "MESSAGE = 'co_credit_worker_attestation_replay_conflict'",
  );
  const attestationReplay = attest.indexOf("'replayed', true");
  const currentFenceGate = attest.indexOf(
    "MESSAGE = 'co_credit_worker_lease_fence_invalid'",
  );
  const terminalStateGate = attest.indexOf(
    "receipt.receipt_kind IN ('settled', 'released')",
  );
  assert.ok(signatureFailure >= 0 && signatureFailure < replayLookup);
  assert.ok(replayLookup < replayConflict && replayConflict < attestationReplay);
  assert.ok(attestationReplay < currentFenceGate);
  assert.ok(attestationReplay < terminalStateGate);
  assert.match(attest, /v_existing\.signature_hmac_sha256 IS DISTINCT FROM/);
  assert.match(attest, /v_existing\.attested_at IS DISTINCT FROM p_attested_at/);
});

test("lifecycle RPCs are app-callable without a request hash or hashing oracle", () => {
  const lifecycleSignatures = [
    {
      name: "reserve_co_credit",
      sqlTypes: "uuid, uuid, uuid, text, jsonb, text, timestamptz, uuid, uuid",
      parameterTail:
        /p_idempotency_key text,\s+p_expires_at timestamptz,\s+p_expected_rate_catalog_id uuid DEFAULT NULL/,
    },
    {
      name: "settle_co_credit",
      sqlTypes: "uuid, uuid, uuid, uuid, uuid, text, text",
      parameterTail:
        /p_worker_attestation_id uuid,\s+p_outcome text,\s+p_idempotency_key text\s*\)/,
    },
    {
      name: "release_co_credit",
      sqlTypes: "uuid, uuid, uuid, uuid, text, text",
      parameterTail: /p_reason_code text,\s+p_idempotency_key text\s*\)/,
    },
    {
      name: "reverse_or_dispute_co_credit_settlement",
      sqlTypes: "uuid, uuid, uuid, uuid, text, text, text",
      parameterTail:
        /p_action text,\s+p_reason_code text,\s+p_idempotency_key text\s*\)/,
    },
  ] as const;

  assert.doesNotMatch(migration, /p_request_sha256/);

  for (const { name, sqlTypes, parameterTail } of lifecycleSignatures) {
    const functionStart = `CREATE OR REPLACE FUNCTION co_production.${name}(`;
    const startIndex = migration.indexOf(functionStart);
    const declarationEnd = migration.indexOf("\nRETURNS jsonb", startIndex);
    assert.notEqual(startIndex, -1, `missing ${name}`);
    assert.notEqual(declarationEnd, -1, `missing ${name} return type`);
    const declaration = migration.slice(startIndex, declarationEnd);
    assert.match(declaration, parameterTail);
    assert.doesNotMatch(declaration, /p_request_sha256|request_hash/);

    for (const authority of ["REVOKE ALL ON FUNCTION", "GRANT EXECUTE ON FUNCTION"]) {
      assert.ok(
        migration.includes(
          `${authority} co_production.${name}(\n  ${sqlTypes}\n)`,
        ),
        `missing updated ${authority.toLowerCase()} signature for ${name}`,
      );
    }
    assert.ok(
      migration.includes(
        `COMMENT ON FUNCTION co_production.${name}(\n  ${sqlTypes}\n)`,
      ),
      `missing updated comment signature for ${name}`,
    );
  }

  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION co_production_private\.co_credit_sha256\(jsonb\)\s+FROM PUBLIC, anon, authenticated, service_role;/,
  );
  assert.doesNotMatch(
    migration,
    /GRANT EXECUTE ON FUNCTION\s+co_production_private\.co_credit_sha256/,
  );
  assert.doesNotMatch(
    migration,
    /CREATE OR REPLACE FUNCTION co_production\.co_credit_sha256/,
  );
});

test("early input validation rejects NULL keys, reasons, and stale expiry", () => {
  const reserve = section(
    "CREATE OR REPLACE FUNCTION co_production.reserve_co_credit(",
    "CREATE OR REPLACE FUNCTION co_production.settle_co_credit(",
  );
  const settle = section(
    "CREATE OR REPLACE FUNCTION co_production.settle_co_credit(",
    "CREATE OR REPLACE FUNCTION co_production.release_co_credit(",
  );
  const release = section(
    "CREATE OR REPLACE FUNCTION co_production.release_co_credit(",
    "CREATE OR REPLACE FUNCTION co_production.reverse_or_dispute_co_credit_settlement(",
  );
  const compensate = section(
    "CREATE OR REPLACE FUNCTION co_production.reverse_or_dispute_co_credit_settlement(",
    "CREATE OR REPLACE FUNCTION co_production.read_co_credit_settlement_audit(",
  );

  for (const rpc of [reserve, settle, release, compensate]) {
    assert.match(rpc, /p_idempotency_key IS NULL/);
    assert.match(rpc, /co_credit_identifier_is_valid\([\s\S]*p_idempotency_key/);
    assert.doesNotMatch(rpc, /p_request_sha256/);
  }
  assert.match(release, /p_reason_code IS NULL/);
  assert.match(compensate, /p_reason_code IS NULL/);
  assert.match(compensate, /p_action IS NULL/);
  assert.match(settle, /p_worker_attestation_id IS NULL/);
  assert.match(reserve, /p_expires_at <= v_now/);
  assert.match(reserve, /p_expires_at > v_now \+ interval '24 hours'/);
});

test("expired holds are transactionally reaped and excluded from accounting", () => {
  const reserve = section(
    "CREATE OR REPLACE FUNCTION co_production.reserve_co_credit(",
    "CREATE OR REPLACE FUNCTION co_production.settle_co_credit(",
  );
  const settle = section(
    "CREATE OR REPLACE FUNCTION co_production.settle_co_credit(",
    "CREATE OR REPLACE FUNCTION co_production.release_co_credit(",
  );
  const reaper = section(
    "CREATE OR REPLACE FUNCTION\n  co_production.reap_expired_co_credit_reservations(",
    "CREATE OR REPLACE FUNCTION co_production.reverse_or_dispute_co_credit_settlement(",
  );

  expectAll(reaper, [
    /VOLATILE/,
    /SECURITY DEFINER/,
    /require_co_credit_service_role\(\)/,
    /p_limit NOT BETWEEN 1 AND 1000/,
    /reservation\.expires_at <= v_now/,
    /receipt\.receipt_kind IN \('settled', 'released'\)/,
    /co_production\.release_co_credit\(/,
    /'reservation_expired'/,
    /'expiry-reaper:' \|\| v_candidate\.id::text/,
    /EXCEPTION WHEN unique_violation[\s\S]*IF NOT EXISTS \([\s\S]*receipt\.reservation_id = v_candidate\.id[\s\S]*receipt\.receipt_kind IN \('settled', 'released'\)[\s\S]*THEN\s+RAISE;/,
  ]);
  for (const rpc of [reserve, settle]) {
    assert.doesNotMatch(
      rpc,
      /reap_expired_co_credit_reservations\(p_team_id, 256\)/,
    );
    expectAll(rpc, [
      /WHEN event\.event_kind = 'reservation_hold'/,
      /balance_reservation\.expires_at <= v_now/,
      /NOT EXISTS \([\s\S]*terminal\.receipt_kind IN \('settled', 'released'\)/,
      /THEN 0\s+ELSE event\.reserved_delta_co_units/,
    ]);
  }
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION co_production\.reap_expired_co_credit_reservations\(\s*uuid, integer\s*\) TO service_role;/,
  );
});

test("release and compensation races are serialized and idempotent", () => {
  const settle = section(
    "CREATE OR REPLACE FUNCTION co_production.settle_co_credit(",
    "CREATE OR REPLACE FUNCTION co_production.release_co_credit(",
  );
  const release = section(
    "CREATE OR REPLACE FUNCTION co_production.release_co_credit(",
    "CREATE OR REPLACE FUNCTION co_production.reverse_or_dispute_co_credit_settlement(",
  );
  const compensate = section(
    "CREATE OR REPLACE FUNCTION co_production.reverse_or_dispute_co_credit_settlement(",
    "CREATE OR REPLACE FUNCTION co_production.read_co_credit_settlement_audit(",
  );

  for (const rpc of [settle, release, compensate]) {
    assert.match(rpc, /lock_co_credit_lifecycle_scope/);
    assert.match(rpc, /FOR UPDATE/);
    assert.match(rpc, /save_co_credit_idempotency/);
  }
  assert.match(
    migration,
    /CREATE UNIQUE INDEX co_credit_one_terminal_outcome_per_reservation[\s\S]*WHERE receipt_kind IN \('settled', 'released'\)/,
  );
  assert.match(
    migration,
    /CREATE UNIQUE INDEX co_credit_one_compensation_per_settlement[\s\S]*WHERE receipt_kind IN \('reversed', 'disputed'\)/,
  );
  assert.match(release, /co_credit_reservation_already_terminal/);
  assert.match(compensate, /co_credit_settlement_already_compensated/);
  assert.match(compensate, /-v_settlement\.committed_co_units/);
});

test("write RPC authority is transactional, service-only, and explicitly granted", () => {
  const rpcBoundaries = [
    ["reserve_co_credit", "settle_co_credit"],
    ["settle_co_credit", "release_co_credit"],
    ["release_co_credit", "reverse_or_dispute_co_credit_settlement"],
    ["reverse_or_dispute_co_credit_settlement", "read_co_credit_settlement_audit"],
  ] as const;

  for (const [name, next] of rpcBoundaries) {
    const rpc = section(
      `CREATE OR REPLACE FUNCTION co_production.${name}(`,
      `CREATE OR REPLACE FUNCTION co_production.${next}(`,
    );
    expectAll(rpc, [
      /LANGUAGE plpgsql/,
      /VOLATILE/,
      /SECURITY DEFINER/,
      /SET search_path = ''/,
      /require_co_credit_service_role\(\)/,
      /assert_co_credit_operation_authority\(/,
      /lock_co_credit_lifecycle_scope\(/,
      /FOR UPDATE/,
    ]);
    assert.match(
      migration,
      new RegExp(
        `REVOKE ALL ON FUNCTION co_production\\.${name}\\([\\s\\S]*?\\) FROM PUBLIC, anon, authenticated, service_role;`,
      ),
    );
    assert.match(
      migration,
      new RegExp(
        `GRANT EXECUTE ON FUNCTION co_production\\.${name}\\([\\s\\S]*?\\) TO service_role;`,
      ),
    );
  }
});

test("write RPCs derive project ownership and reject cross-tenant scope", () => {
  const rpcBoundaries = [
    ["reserve_co_credit", "settle_co_credit"],
    ["settle_co_credit", "release_co_credit"],
    ["release_co_credit", "reverse_or_dispute_co_credit_settlement"],
    ["reverse_or_dispute_co_credit_settlement", "read_co_credit_settlement_audit"],
  ] as const;

  for (const [name, next] of rpcBoundaries) {
    const rpc = section(
      `CREATE OR REPLACE FUNCTION co_production.${name}(`,
      `CREATE OR REPLACE FUNCTION co_production.${next}(`,
    );
    expectAll(rpc, [
      /FROM co_production\.projects AS project/,
      /project\.id = p_project_id/,
      /v_authoritative_team_id IS DISTINCT FROM p_team_id/,
      /co_credit_cross_tenant_scope_denied/,
      /SECURITY DEFINER/,
      /SET search_path = ''/,
    ]);
  }
});

test("all commercial rows have mandatory validated principal attribution", () => {
  for (const table of commercialTables) {
    const ddl = tableSection(table);
    const principalCheck =
      table === "co_credit_worker_execution_attestations"
        ? /actor_principal text NOT NULL CHECK \([\s\S]*actor_principal = 'worker:' \|\| worker_principal[\s\S]*co_credit_identifier_is_valid\([\s\S]*actor_principal,[\s\S]*240/
        : /actor_principal text NOT NULL CHECK \([\s\S]*co_credit_identifier_is_valid\(actor_principal, 240\)/;
    assert.match(ddl, principalCheck, `missing mandatory principal on ${table}`);
    assert.match(
      ddl,
      /'actorPrincipal', actor_principal/,
      `principal is not integrity-bound on ${table}`,
    );
  }
  const actor = section(
    "CREATE OR REPLACE FUNCTION co_production_private.co_credit_actor_principal()",
    "CREATE OR REPLACE FUNCTION\n  co_production_private.lock_co_credit_commercial_authority()",
  );
  expectAll(actor, [
    /auth_user:/,
    /jwt_role:/,
    /db_session:/,
    /co_credit_actor_principal_invalid/,
  ]);
  assert.match(
    tableSection("co_credit_worker_execution_attestations"),
    /actor_principal = 'worker:' \|\| worker_principal/,
  );
  assert.match(
    tableSection("co_credit_terminal_receipts"),
    /actor_user_id uuid REFERENCES auth\.users/,
  );

  const insertedCommercialTables = new Set<string>();
  const insertPattern =
    /INSERT INTO\s+co_production\.(co_credit_[a-z_]+)\s*\(([\s\S]*?)\)\s*VALUES/g;
  for (const match of migration.matchAll(insertPattern)) {
    const [, table, columns] = match;
    insertedCommercialTables.add(table);
    assert.match(
      columns,
      /(?:^|,)\s*actor_principal\s*(?:,|$)/,
      `insert into ${table} omits actor_principal`,
    );
  }
  for (const table of commercialTables) {
    assert.ok(
      insertedCommercialTables.has(table),
      `no attributed insert path found for ${table}`,
    );
  }
});

test("all new commercial tables are append-only and deny direct writes", () => {
  for (const table of commercialTables) {
    assert.match(
      migration,
      new RegExp(`ALTER TABLE co_production\\.${table}\\s+ENABLE ROW LEVEL SECURITY;`),
    );
    assert.match(
      migration,
      new RegExp(`ALTER TABLE co_production\\.${table}\\s+FORCE ROW LEVEL SECURITY;`),
    );
    assert.match(migration, new RegExp(`'${table}'`));
    assert.match(
      migration,
      new RegExp(`co_production\\.${table}(?:,|\\s)`),
    );
  }
  assert.match(
    migration,
    /CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON co_production\.%I[\s\S]*reject_co_credit_mutation/,
  );
  assert.match(
    migration,
    /CREATE TRIGGER %I BEFORE TRUNCATE ON co_production\.%I[\s\S]*reject_co_credit_truncate/,
  );
  assert.match(
    migration,
    /REVOKE ALL ON TABLE[\s\S]*FROM PUBLIC, anon, authenticated, service_role, co_credit_worker_attestor;/,
  );
  assert.doesNotMatch(
    migration,
    /GRANT\s+(?:INSERT|UPDATE|DELETE|TRUNCATE|ALL)\s+ON TABLE/i,
  );
  assert.doesNotMatch(migration, /CREATE POLICY[^;]*FOR (?:INSERT|UPDATE|DELETE)/i);
});

test("FORCE RLS writer ownership has a fail-closed post-creation contract", () => {
  const ownership = section(
    "DO $authority_preflight$",
    "CREATE POLICY co_credit_rate_catalog_service_select",
  );

  expectAll(ownership, [
    /metadata\.expected_owner_oid/,
    /metadata\.expected_owner_name/,
    /role\.rolsuper OR role\.rolbypassrls/,
    /v_current_owner IS DISTINCT FROM v_expected_owner/,
    /current_user IN \('service_role', 'co_credit_worker_attestor'\)/,
    /pg_has_role\([\s\S]*'co_credit_worker_attestor',[\s\S]*role\.oid,[\s\S]*'MEMBER'/,
    /AS object_owner/,
    /pg_catalog\.to_regclass\(v_object_name\)/,
    /relation\.relowner/,
    /relation\.relrowsecurity/,
    /relation\.relforcerowsecurity/,
    /v_actual_owner IS DISTINCT FROM v_expected_owner[\s\S]*NOT v_rls_enabled[\s\S]*NOT v_rls_forced/,
    /pg_catalog\.to_regprocedure\(v_object_name\)/,
    /routine\.proowner, routine\.prosecdef/,
    /co_credit_force_rls_owner_contract_invalid/,
    /co_credit_force_rls_table_contract_invalid/,
    /co_credit_security_definer_owner_contract_invalid/,
  ]);

  for (const table of commercialTables) {
    assert.ok(
      ownership.includes(`'co_production.${table}'`),
      `owner preflight omits ${table}`,
    );
  }
  for (const table of [
    "co_production_private.co_credit_authority_metadata",
    "co_production_private.co_credit_worker_signing_keys",
  ]) {
    assert.ok(ownership.includes(`'${table}'`), `owner preflight omits ${table}`);
  }

  for (const routine of [
    "approve_co_credit_rate_catalog",
    "approve_co_credit_pricing_terms",
    "approve_and_activate_co_credit_commercial_bundle",
    "grant_co_credit_budget",
    "record_co_credit_entitlement_state",
    "reserve_co_credit",
    "issue_co_credit_worker_execution_lease",
    "record_co_credit_worker_execution_attestation",
    "settle_co_credit",
    "release_co_credit",
    "reap_expired_co_credit_reservations",
    "reverse_or_dispute_co_credit_settlement",
    "read_co_credit_settlement_audit",
  ]) {
    assert.match(
      ownership,
      new RegExp(`co_production\\.${routine}\\(`),
      `owner preflight omits ${routine}`,
    );
  }

  for (const routine of [
    "lock_co_credit_commercial_authority",
    "reject_co_credit_mutation",
    "reject_co_credit_truncate",
    "guard_co_credit_commercial_activation_insert",
    "lock_co_credit_budget_scope",
    "lock_co_credit_lifecycle_scope",
    "guard_co_credit_budget_grant_insert",
    "assert_co_credit_operation_authority",
    "provision_co_credit_worker_signing_key",
    "append_co_credit_ledger_event",
    "save_co_credit_idempotency",
  ]) {
    assert.match(
      ownership,
      new RegExp(`co_production_private\\.${routine}\\(`),
      `owner preflight omits ${routine}`,
    );
  }
});

test("budget revisions use one strict monotonic non-forking head authority", () => {
  const grants = tableSection("co_credit_budget_grants");
  const guard = section(
    "CREATE OR REPLACE FUNCTION co_production_private.guard_co_credit_budget_grant_insert()",
    "CREATE TRIGGER co_credit_budget_grants_guard_insert",
  );
  const grant = section(
    "CREATE OR REPLACE FUNCTION co_production.grant_co_credit_budget(",
    "CREATE OR REPLACE FUNCTION co_production.record_co_credit_entitlement_state(",
  );
  const entitlement = section(
    "CREATE OR REPLACE FUNCTION co_production.record_co_credit_entitlement_state(",
    "-- Reserve creates the quote and hold in one database transaction.",
  );
  const authority = section(
    "CREATE OR REPLACE FUNCTION\n  co_production_private.assert_co_credit_operation_authority(",
    "CREATE OR REPLACE FUNCTION\n  co_production_private.provision_co_credit_worker_signing_key(",
  );
  const reserve = section(
    "CREATE OR REPLACE FUNCTION co_production.reserve_co_credit(",
    "CREATE OR REPLACE FUNCTION co_production.issue_co_credit_worker_execution_lease(",
  );
  const settle = section(
    "CREATE OR REPLACE FUNCTION co_production.settle_co_credit(",
    "CREATE OR REPLACE FUNCTION co_production.release_co_credit(",
  );

  expectAll(grants, [
    /revision_sequence bigint NOT NULL CHECK \(revision_sequence > 0\)/,
    /UNIQUE NULLS NOT DISTINCT \([\s\S]*budget_period_key,[\s\S]*revision_sequence/,
    /UNIQUE NULLS NOT DISTINCT \([\s\S]*budget_period_key,[\s\S]*predecessor_grant_sha256/,
  ]);
  expectAll(guard, [
    /lock_co_credit_budget_scope\(/,
    /v_head_count > 1[\s\S]*co_credit_budget_multiple_heads/,
    /NEW\.predecessor_grant_sha256 IS DISTINCT FROM v_head\.grant_sha256/,
    /NEW\.revision_sequence <> v_head\.revision_sequence \+ 1/,
    /NEW\.revision_sequence <> 1/,
  ]);

  expectAll(grant, [
    /lock_co_credit_budget_scope\(/,
    /v_grant_created_at := pg_catalog\.clock_timestamp\(\)/,
    /NOT EXISTS \([\s\S]*successor\.predecessor_grant_sha256 = grant_row\.grant_sha256/,
    /p_predecessor_grant_sha256 IS DISTINCT FROM\s*v_current_head\.grant_sha256/,
    /v_revision_sequence := v_current_head\.revision_sequence \+ 1/,
    /v_revision_sequence := 1/,
    /'revisionSequence', v_revision_sequence/,
    /INSERT INTO co_production\.co_credit_budget_grants \([\s\S]*revision_sequence/,
  ]);
  assert.doesNotMatch(grant, /ORDER BY grant_row\.(?:created_at|id)/);
  for (const reader of [reserve, settle]) {
    assert.ok(
      (reader.match(
        /successor\.predecessor_grant_sha256 = grant_row\.grant_sha256/g,
      ) ?? []).length >= 2,
      "tenant and project readers must derive the sole revision head",
    );
    assert.doesNotMatch(reader, /ORDER BY grant_row\.(?:created_at|id)/);
  }
  expectAll(entitlement, [
    /lock_co_credit_budget_scope\([\s\S]*'tenant'/,
    /IF v_grant\.budget_scope = 'project'[\s\S]*lock_co_credit_budget_scope\([\s\S]*'project'/,
    /successor\.predecessor_grant_sha256 = v_grant\.grant_sha256/,
    /co_credit_entitlement_requires_budget_head/,
    /v_recorded_at := pg_catalog\.clock_timestamp\(\)/,
  ]);
  expectAll(authority, [
    /current_setting\('transaction_isolation'\) <> 'read committed'/,
    /co_credit_operation_authority_context_invalid/,
  ]);
});

test("all lifecycle mutations use one tenant-project-operation lock order", () => {
  const helper = section(
    "CREATE OR REPLACE FUNCTION\n  co_production_private.lock_co_credit_lifecycle_scope(",
    "CREATE OR REPLACE FUNCTION co_production_private.guard_co_credit_budget_grant_insert()",
  );
  const tenantLock = helper.indexOf("'tenant'");
  const projectLock = helper.indexOf("'project'", tenantLock + 1);
  const operationLock = helper.indexOf("pg_catalog.pg_advisory_xact_lock", projectLock);
  assert.ok(tenantLock >= 0 && tenantLock < projectLock && projectLock < operationLock);
  expectAll(helper, [
    /Universal lifecycle order: tenant budget scope, project budget scope/,
    /p_operation_execution_id::text,[\s\S]*20260716033001/,
  ]);
  assert.equal((migration.match(/20260716033001/g) ?? []).length, 1);

  const lifecycleSections = [
    section(
      "CREATE OR REPLACE FUNCTION co_production.reserve_co_credit(",
      "CREATE OR REPLACE FUNCTION co_production.issue_co_credit_worker_execution_lease(",
    ),
    section(
      "CREATE OR REPLACE FUNCTION co_production.issue_co_credit_worker_execution_lease(",
      "CREATE OR REPLACE FUNCTION\n  co_production.record_co_credit_worker_execution_attestation(",
    ),
    section(
      "CREATE OR REPLACE FUNCTION\n  co_production.record_co_credit_worker_execution_attestation(",
      "CREATE OR REPLACE FUNCTION co_production.settle_co_credit(",
    ),
    section(
      "CREATE OR REPLACE FUNCTION co_production.settle_co_credit(",
      "CREATE OR REPLACE FUNCTION co_production.release_co_credit(",
    ),
    section(
      "CREATE OR REPLACE FUNCTION co_production.release_co_credit(",
      "CREATE OR REPLACE FUNCTION\n  co_production.reap_expired_co_credit_reservations(",
    ),
    section(
      "CREATE OR REPLACE FUNCTION co_production.reverse_or_dispute_co_credit_settlement(",
      "CREATE OR REPLACE FUNCTION co_production.read_co_credit_settlement_audit(",
    ),
  ];
  for (const rpc of lifecycleSections) {
    assert.match(rpc, /lock_co_credit_lifecycle_scope\(/);
    assert.doesNotMatch(rpc, /20260716033001/);
  }

  const reaper = section(
    "CREATE OR REPLACE FUNCTION\n  co_production.reap_expired_co_credit_reservations(",
    "CREATE OR REPLACE FUNCTION co_production.reverse_or_dispute_co_credit_settlement(",
  );
  assert.ok(
    reaper.indexOf("lock_co_credit_budget_scope") < reaper.indexOf("FOR v_candidate IN"),
  );
  expectAll(reaper, [
    /'tenant'/,
    /release_co_credit\(/,
    /no[\s\S]*transaction can hold an operation lock while waiting for this team lock/i,
  ]);
  assert.match(runtimeConcurrencyProofRequired, /two-session PostgreSQL proof/);
});

test("commercial and expiry decisions use post-lock wall clocks with mutation rechecks", () => {
  const reserve = section(
    "CREATE OR REPLACE FUNCTION co_production.reserve_co_credit(",
    "CREATE OR REPLACE FUNCTION co_production.issue_co_credit_worker_execution_lease(",
  );
  const lease = section(
    "CREATE OR REPLACE FUNCTION co_production.issue_co_credit_worker_execution_lease(",
    "CREATE OR REPLACE FUNCTION\n  co_production.record_co_credit_worker_execution_attestation(",
  );
  const attest = section(
    "CREATE OR REPLACE FUNCTION\n  co_production.record_co_credit_worker_execution_attestation(",
    "CREATE OR REPLACE FUNCTION co_production.settle_co_credit(",
  );
  const settle = section(
    "CREATE OR REPLACE FUNCTION co_production.settle_co_credit(",
    "CREATE OR REPLACE FUNCTION co_production.release_co_credit(",
  );

  for (const rpc of [reserve, lease, attest, settle]) {
    assert.ok(
      rpc.indexOf("lock_co_credit_lifecycle_scope") <
        rpc.indexOf("pg_catalog.clock_timestamp()"),
    );
    assert.doesNotMatch(rpc, /:= now\(\)/);
  }
  expectAll(reserve, [
    /v_now := pg_catalog\.clock_timestamp\(\)/,
    /already-registered future activation can become effective in a long tx/,
    /co_credit_commercial_activation_advanced_retry/,
  ]);
  expectAll(lease, [
    /v_issued_at := pg_catalog\.clock_timestamp\(\)/,
    /Recheck wall clock immediately before writing the lease/,
    /co_credit_worker_lease_clock_recheck_failed/,
  ]);
  expectAll(attest, [
    /p_attested_at < v_now - interval '5 minutes'/,
    /co_credit_worker_lease_fence_invalid/,
    /co_credit_worker_attestation_mutation_recheck_failed/,
  ]);
  const attestationWallClockChecks = [
    ...attest.matchAll(/v_now := pg_catalog\.clock_timestamp\(\)/g),
  ].map((match) => match.index ?? -1);
  assert.ok(attestationWallClockChecks.length >= 2);
  assert.ok(
    attestationWallClockChecks.at(-1)! <
      attest.indexOf(
        "INSERT INTO co_production.co_credit_worker_execution_attestations",
      ),
  );
  expectAll(settle, [
    /v_now := pg_catalog\.clock_timestamp\(\)/,
    /co_credit_settlement_clock_recheck_failed/,
  ]);

  const commercialBundle = section(
    "co_production.approve_and_activate_co_credit_commercial_bundle(",
    "CREATE OR REPLACE FUNCTION co_production.grant_co_credit_budget(",
  );
  assert.ok(
    commercialBundle.indexOf("lock_co_credit_commercial_authority") <
      commercialBundle.lastIndexOf("v_activated_at := pg_catalog.clock_timestamp()"),
  );
});

test("trusted ledger and idempotency mutators enforce operation-time authority", () => {
  const helpers = [
    {
      start:
        "CREATE OR REPLACE FUNCTION co_production_private.append_co_credit_ledger_event(",
      end:
        "CREATE OR REPLACE FUNCTION co_production_private.save_co_credit_idempotency(",
      signature:
        "co_production_private.append_co_credit_ledger_event(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,bigint,bigint,uuid,text,text,uuid,text,text,text,jsonb)",
      mutation: "INSERT INTO co_production.co_credit_ledger_events",
    },
    {
      start:
        "CREATE OR REPLACE FUNCTION co_production_private.save_co_credit_idempotency(",
      end:
        "CREATE OR REPLACE FUNCTION co_production.approve_co_credit_rate_catalog(",
      signature:
        "co_production_private.save_co_credit_idempotency(uuid,uuid,uuid,text,text,text,text,text,uuid)",
      mutation: "INSERT INTO co_production.co_credit_idempotency_rows",
    },
  ] as const;

  for (const helper of helpers) {
    const helperSource = section(helper.start, helper.end);
    const roleAssertion =
      "PERFORM co_production_private.require_co_credit_service_role();";
    const authorityAssertion =
      "PERFORM co_production_private.assert_co_credit_operation_authority(\n" +
      `    '${helper.signature}'`;
    const roleIndex = helperSource.indexOf(roleAssertion);
    const authorityIndex = helperSource.indexOf(authorityAssertion);
    const mutationIndex = helperSource.indexOf(helper.mutation);

    expectAll(helperSource, [/SECURITY DEFINER/, /SET search_path = ''/]);
    assert.ok(roleIndex >= 0, `missing role assertion for ${helper.signature}`);
    assert.ok(
      authorityIndex >= 0,
      `missing owner/ACL assertion for ${helper.signature}`,
    );
    assert.ok(
      ownerOnlyMutationRoutines.includes(helper.signature),
      `helper is not classified as owner-only: ${helper.signature}`,
    );
    assert.ok(
      roleIndex < authorityIndex && authorityIndex < mutationIndex,
      `authority assertions must precede mutation for ${helper.signature}`,
    );
  }
});

test("operation authority exhaustively enumerates exact routine ACLs", () => {
  const authority = section(
    "CREATE OR REPLACE FUNCTION\n  co_production_private.assert_co_credit_operation_authority(",
    "CREATE OR REPLACE FUNCTION\n  co_production_private.provision_co_credit_worker_signing_key(",
  );
  const classStart = authority.indexOf("  IF p_routine_name IN (");
  const classEnd = authority.indexOf(
    "\n\n  IF v_allowed_execute_role_name IS NULL THEN",
    classStart,
  );
  assert.ok(classStart >= 0 && classEnd > classStart);
  const classMatrix = authority.slice(classStart, classEnd);
  const ownerOnlyClass = classMatrix.match(
    /IF p_routine_name IN \(([\s\S]*?)\) THEN\s+v_allowed_execute_role_name := NULL;/,
  );
  const serviceRoleClass = classMatrix.match(
    /ELSIF p_routine_name IN \(([\s\S]*?)\) THEN\s+v_allowed_execute_role_name := 'service_role';/,
  );
  const workerAttestorClass = classMatrix.match(
    /ELSIF p_routine_name =\s*'([^']+)'\s*THEN\s+v_allowed_execute_role_name := 'co_credit_worker_attestor';/,
  );
  assert.ok(ownerOnlyClass);
  assert.ok(serviceRoleClass);
  assert.ok(workerAttestorClass);

  const extractRoutines = (value: string): string[] =>
    [...value.matchAll(/'(co_production(?:_private)?\.[^']+)'/g)].map(
      (match) => match[1],
    );
  assert.deepEqual(
    extractRoutines(ownerOnlyClass[1]),
    [...ownerOnlyMutationRoutines],
  );
  assert.deepEqual(
    extractRoutines(serviceRoleClass[1]),
    [...serviceRoleMutationRoutines],
  );
  assert.deepEqual(workerAttestorClass[1], workerAttestorMutationRoutines[0]);

  const assertedRoutines = [
    ...migration.matchAll(
      /PERFORM co_production_private\.assert_co_credit_operation_authority\(\s*'([^']+)'\s*\);/g,
    ),
  ].map((match) => match[1]);
  assert.equal(new Set(assertedRoutines).size, assertedRoutines.length);
  assert.deepEqual(
    assertedRoutines.toSorted(),
    [...mutationAuthorityRoutines].toSorted(),
  );

  expectAll(authority, [
    /routine\.proacl IS NOT NULL/,
    /CROSS JOIN LATERAL pg_catalog\.aclexplode\(routine\.proacl\) AS acl/,
    /acl\.grantee <> v_expected_owner/,
    /acl\.grantee = 0::oid/,
    /v_allowed_execute_grantee IS NULL/,
    /acl\.grantee IS DISTINCT FROM v_allowed_execute_grantee/,
    /acl\.grantor IS DISTINCT FROM v_expected_owner/,
    /acl\.privilege_type IS DISTINCT FROM 'EXECUTE'/,
    /acl\.is_grantable/,
    /NOT v_routine_acl_is_explicit/,
    /v_non_owner_acl_count <> v_expected_non_owner_acl_count/,
    /v_invalid_non_owner_acl_count <> 0/,
    /co_credit_operation_authority_routine_class_invalid/,
    /co_credit_operation_authority_function_acl_drift/,
  ]);
  assert.doesNotMatch(authority, /has_function_privilege/);
  assert.match(
    authority,
    /owner keeps implicit EXECUTE[\s\S]*acl\.grantee <> v_expected_owner/i,
  );
});

test("every commercial mutation performs the pinned owner ACL and FORCE-RLS assertion", () => {
  const authority = section(
    "CREATE OR REPLACE FUNCTION\n  co_production_private.assert_co_credit_operation_authority(",
    "CREATE OR REPLACE FUNCTION\n  co_production_private.provision_co_credit_worker_signing_key(",
  );
  expectAll(authority, [
    /co_credit_authority_metadata/,
    /routine\.proowner,[\s\S]*routine\.prosecdef,[\s\S]*routine\.proacl IS NOT NULL/,
    /v_owner IS DISTINCT FROM v_expected_owner OR NOT v_security_definer/,
    /pg_catalog\.aclexplode\(routine\.proacl\)/,
    /co_credit_operation_authority_function_acl_drift/,
    /relation\.relowner,[\s\S]*relation\.relrowsecurity,[\s\S]*relation\.relforcerowsecurity/,
    /has_table_privilege\(v_role_name, v_table, 'INSERT'\)/,
    /has_table_privilege\(v_role_name, v_table, 'UPDATE'\)/,
    /has_table_privilege\(v_role_name, v_table, 'DELETE'\)/,
    /has_table_privilege\(v_role_name, v_table, 'TRUNCATE'\)/,
    /co_credit_operation_authority_acl_drift/,
    /co_credit_worker_attestor_privilege_drift/,
    /co_credit_worker_signing_key_acl_drift/,
  ]);

  for (const signature of mutationAuthorityRoutines) {
    assert.ok(
      migration.includes(
        `assert_co_credit_operation_authority(\n    '${signature}'`,
      ),
      `missing operation-time authority assertion for ${signature}`,
    );
  }
});

test("audit export includes snapshots, periods, revisions, replay, receipts, and chain head", () => {
  const audit = section(
    "CREATE OR REPLACE FUNCTION co_production.read_co_credit_settlement_audit(",
    "ALTER TABLE co_production.co_credit_rate_catalog_snapshots",
  );
  for (const field of [
    "authoritativeScope",
    "operationExecution",
    "quote",
    "reservation",
    "commercialBundleActivation",
    "rateCatalogSnapshot",
    "pricingTermsSnapshot",
    "budgetPeriodKeys",
    "budgetGrantReferences",
    "budgetGrantRevisions",
    "entitlementStates",
    "terminalReceipts",
    "workerExecutionLeases",
    "workerExecutionBindings",
    "workerExecutionAttestations",
    "idempotencyRows",
    "ledgerEvents",
    "ledgerHead",
    "eventSequence",
    "eventSha256",
    "previousEventSequence",
    "previousEventSha256",
  ]) {
    assert.match(audit, new RegExp(`'${field}'`));
  }
  assert.match(audit, /grant_row\.budget_period_key =[\s\S]*v_reservation\.tenant_budget_period_key/);
  assert.match(audit, /grant_row\.budget_period_key =[\s\S]*v_reservation\.project_budget_period_key/);
  assert.match(audit, /ORDER BY grant_row\.revision_sequence/);
  assert.match(audit, /has_team_role\(p_team_id, 80\)/);
  assert.match(audit, /auth\.role\(\)\), ''\) <> 'authenticated'/);
  assert.match(audit, /auth\.uid\(\)\) IS NULL/);
  assert.doesNotMatch(audit, /has_project_role\(p_project_id, 80\)/);
  assert.doesNotMatch(audit, /<> 'service_role'/);
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION co_production\.read_co_credit_settlement_audit\(\s*uuid, uuid, uuid\s*\) TO authenticated;/,
  );
  assert.doesNotMatch(
    migration,
    /GRANT EXECUTE ON FUNCTION co_production\.read_co_credit_settlement_audit\([\s\S]*?TO service_role;/,
  );
});

test("kernel stores no plaintext payment data and performs no payment mutation", () => {
  assert.match(migration, /payment_mutation text NOT NULL DEFAULT 'none'/);
  assert.doesNotMatch(
    migration,
    /^\s*(?:card_number|cardholder|bank_account|routing_number|payment_method_secret|client_secret|cvv|cvc|pan)\s+(?:text|varchar|jsonb?|bytea)\b/im,
  );
  assert.doesNotMatch(
    migration,
    /INSERT INTO\s+[^;]*(?:payment|invoice|charge)|UPDATE\s+[^;]*(?:payment|invoice|charge)/i,
  );
  assert.doesNotMatch(
    migration,
    /net\.http|http_post|pg_net|stripe|fetch\(|webhook|notification_outbox/i,
  );
  assert.doesNotMatch(
    migration,
    /(?:certification_proof|proof_json)\s+(?:json|jsonb)|CREATE TABLE[^;]*certification/i,
  );
});

test("SQL blocks are closed and contain no unresolved scaffold", () => {
  assert.equal((migration.match(/\$\$/g) ?? []).length % 2, 0);
  assert.equal((migration.match(/\$preflight\$/g) ?? []).length, 2);
  assert.equal((migration.match(/\$authority_preflight\$/g) ?? []).length, 2);
  assert.equal((migration.match(/\$triggers\$/g) ?? []).length, 2);
  assert.doesNotMatch(migration, /TODO|FIXME|placeholder/i);
});
