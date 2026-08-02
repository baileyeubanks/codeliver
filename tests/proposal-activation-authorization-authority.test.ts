import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(
  resolve(
    repositoryRoot,
    "supabase/migrations/20260716113000_proposal_activation_authorization_authority.sql",
  ),
  "utf8",
);

function section(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing section start: ${start}`);
  assert.notEqual(endIndex, -1, `missing section end: ${end}`);
  return source.slice(startIndex, endIndex);
}

const validator = section(
  migration,
  "co_production_private.production_authorization_v1_is_valid(",
  "CREATE TABLE co_production.proposal_activation_authorization_receipts",
);
const table = section(
  migration,
  "CREATE TABLE co_production.proposal_activation_authorization_receipts",
  "CREATE OR REPLACE FUNCTION co_production.activate_authorized_proposal_handoff(",
);
const wrapper = section(
  migration,
  "CREATE OR REPLACE FUNCTION co_production.activate_authorized_proposal_handoff(",
  "CREATE OR REPLACE VIEW co_production.preproject_pipeline",
);
const pipeline = section(
  migration,
  "CREATE OR REPLACE VIEW co_production.preproject_pipeline",
  "REVOKE ALL ON TABLE co_production.proposal_activation_authorization_receipts",
);

test("authorization receipts are immutable FORCE-RLS authority records", () => {
  assert.match(
    table,
    /CREATE TABLE co_production\.proposal_activation_authorization_receipts/,
  );
  assert.match(
    table,
    /ALTER TABLE co_production\.proposal_activation_authorization_receipts\s+ENABLE ROW LEVEL SECURITY;/,
  );
  assert.match(
    table,
    /ALTER TABLE co_production\.proposal_activation_authorization_receipts\s+FORCE ROW LEVEL SECURITY;/,
  );
  assert.match(table, /FOR SELECT TO authenticated[\s\S]*?has_team_role\(team_id, 70\)/);
  assert.match(
    table,
    /BEFORE UPDATE OR DELETE[\s\S]*?prevent_preproject_immutable_mutation/,
  );
  assert.match(
    table,
    /BEFORE TRUNCATE[\s\S]*?prevent_preproject_immutable_mutation/,
  );
  assert.match(
    migration,
    /REVOKE ALL ON TABLE co_production\.proposal_activation_authorization_receipts\s+FROM PUBLIC, anon, authenticated, service_role;/,
  );
  assert.doesNotMatch(
    migration,
    /GRANT\s+(?:INSERT|UPDATE|DELETE|TRUNCATE)[\s\S]*?proposal_activation_authorization_receipts/i,
  );
});

test("productionAuthorization matches the exact authoritative v1 shape", () => {
  assert.match(
    validator,
    /ARRAY\[\s*'schemaVersion', 'receiptId', 'status', 'policyVersion', 'authorizedAt',[\s\S]*?'subject', 'gates'\s*\]/,
  );
  assert.match(
    validator,
    /schemaVersion'[\s\S]*?cco\.proposal-studio\.production-authorization\.v1/,
  );
  assert.match(validator, /status'[\s\S]*?IS DISTINCT FROM 'authorized'/);
  assert.match(
    validator,
    /ARRAY\[\s*'proposalRequestReceiptId', 'packageId', 'packageVersion',[\s\S]*?'proposalVersionId', 'proposalContentHash', 'quoteVersionId',[\s\S]*?'quoteContentHash', 'decisionReceiptId', 'opportunityId', 'readyBriefId',[\s\S]*?'readyBriefContentHash'\s*\]/,
  );
  assert.match(validator, /jsonb_typeof\(v_subject -> 'packageVersion'\)[\s\S]*?'number'/);
  assert.match(validator, /packageVersion'\)::bigint > 2147483647/);
  assert.doesNotMatch(validator, /p_authorization ->> 'proposalRequestReceiptId'/);
  assert.doesNotMatch(validator, /p_authorization ->> 'payloadHash'/);
});

test("exactly five unique completed gates carry bounded opaque evidence IDs", () => {
  assert.match(validator, /jsonb_array_length\(p_authorization -> 'gates'\) <> 5/);
  assert.match(validator, /ARRAY\['gate', 'status', 'evidenceReceiptId'\]/);
  assert.match(
    validator,
    /v_gate_name NOT IN \('acceptance', 'contract', 'invoice', 'deposit', 'payment'\)/,
  );
  assert.match(validator, /v_gate_name = ANY\(v_seen\)/);
  assert.match(validator, /v_gate_status NOT IN \('satisfied', 'not_required'\)/);
  assert.match(
    validator,
    /v_gate_name = 'acceptance'[\s\S]*?v_gate_status IS DISTINCT FROM 'satisfied'/,
  );
  assert.match(
    validator,
    /v_evidence_receipt_id[\s\S]*?btrim\(v_evidence_receipt_id\)[\s\S]*?length\(v_evidence_receipt_id\) NOT BETWEEN 1 AND 240/,
  );
  assert.match(
    validator,
    /v_evidence_receipt_id[\s\S]*?IS DISTINCT FROM v_subject ->> 'decisionReceiptId'/,
  );
  assert.doesNotMatch(
    validator,
    /v_evidence_receipt_id[\s\S]{0,240}?!~\*?\s*'\^\[0-9a-f\]/,
  );
});

test("receipt storage binds external authority metadata and the complete subject", () => {
  for (const column of [
    "external_authorization_receipt_id text NOT NULL",
    "authorization_policy_version text NOT NULL",
    "authorization_authorized_at text NOT NULL",
    "package_id text NOT NULL",
    "package_version integer NOT NULL",
    "proposal_version_id text NOT NULL",
    "proposal_content_hash text NOT NULL",
    "quote_version_id text NOT NULL",
    "quote_content_hash text NOT NULL",
    "decision_receipt_id text NOT NULL",
    "production_authorization jsonb NOT NULL",
    "canonical_payload_hash text NOT NULL",
    "authorization_payload_hash text NOT NULL",
  ]) {
    assert.ok(table.includes(column), column);
  }

  const storedBindings = [
    ["external_authorization_receipt_id", "receiptId"],
    ["authorization_policy_version", "policyVersion"],
    ["authorization_authorized_at", "authorizedAt"],
    ["proposal_request_receipt_id::text", "proposalRequestReceiptId"],
    ["package_id", "packageId"],
    ["package_version::text", "packageVersion"],
    ["proposal_version_id", "proposalVersionId"],
    ["proposal_content_hash", "proposalContentHash"],
    ["quote_version_id", "quoteVersionId"],
    ["quote_content_hash", "quoteContentHash"],
    ["decision_receipt_id", "decisionReceiptId"],
    ["opportunity_id::text", "opportunityId"],
    ["ready_brief_revision_id::text", "readyBriefId"],
    ["ready_brief_content_hash", "readyBriefContentHash"],
  ] as const;
  for (const [column, key] of storedBindings) {
    assert.match(table, new RegExp(`${column.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?'${key}'`));
  }

  assert.match(
    table,
    /authorization_schema_version[\s\S]*?cco\.proposal-studio\.production-authorization\.v1/,
  );
  assert.match(
    table,
    /UNIQUE \(source_tenant_id, external_authorization_receipt_id\)/,
  );
  assert.doesNotMatch(
    table,
    /\b(?:amount|currency|payment_instrument|invoice_content|contract_document|contract_body|invoice_body)\b/i,
  );
});

test("the service wrapper keeps the route's six arguments and extracts authorization", () => {
  assert.match(
    wrapper,
    /activate_authorized_proposal_handoff\(\s*p_source_tenant_id text,\s*p_signing_key_id text,\s*p_schema_version text,\s*p_attestation jsonb,\s*p_canonical_payload text,\s*p_receiver_proof text\s*\)\s*RETURNS jsonb/,
  );
  assert.doesNotMatch(wrapper, /\bp_production_authorization\b/);
  assert.match(
    wrapper,
    /v_authorization := v_handoff -> 'productionAuthorization';/,
  );
  assert.match(
    wrapper,
    /production_authorization_v1_is_valid\(\s*v_authorization\s*\)/,
  );
  assert.match(wrapper, /p_schema_version IS DISTINCT FROM '2\.0\.0'/);
  assert.match(
    wrapper,
    /convert_to\(p_canonical_payload, 'UTF8'\)[\s\S]*?'sha256'/,
  );
  assert.match(
    wrapper,
    /p_attestation ->> 'payloadHash' IS DISTINCT FROM v_database_payload_hash/,
  );
  assert.match(wrapper, /extensions\.hmac\([\s\S]*?p_canonical_payload/);
  assert.match(
    wrapper,
    /preproject_sha256\(\s*v_authorization::text\s*\)/,
  );
});

test("authorization is exactly bound to the outer payload and current CRM readiness", () => {
  const payloadSubjectBindings = [
    "proposalRequestReceiptId",
    "packageId",
    "packageVersion",
    "proposalVersionId",
    "proposalContentHash",
    "quoteVersionId",
    "quoteContentHash",
    "decisionReceiptId",
    "opportunityId",
    "readyBriefId",
    "readyBriefContentHash",
  ];
  for (const key of payloadSubjectBindings) {
    assert.match(wrapper, new RegExp(`v_authorization_subject ->>? '${key}'`), key);
  }
  assert.match(
    wrapper,
    /v_acceptance_gate ->> 'evidenceReceiptId'[\s\S]*?v_authorization_subject ->> 'decisionReceiptId'/,
  );
  assert.match(
    wrapper,
    /v_handoff -> 'decisionReceipt' ->> 'id'[\s\S]*?v_authorization_subject ->> 'decisionReceiptId'/,
  );
  assert.match(wrapper, /production_authorization_binding_conflict/);
  assert.match(wrapper, /v_opportunity\.stage NOT IN \('proposal_requested', 'proposal_sent'\)/);
  assert.match(wrapper, /v_opportunity\.current_brief_revision_id/);
  assert.match(wrapper, /v_brief\.status IS DISTINCT FROM 'ready_for_proposal'/);
  assert.match(wrapper, /v_request\.ready_brief_revision_id IS DISTINCT FROM v_brief\.id/);
  assert.match(wrapper, /v_request\.ready_brief_content_hash IS DISTINCT FROM v_brief\.content_hash/);
  assert.match(wrapper, /FROM co_production\.project_preproject_origins AS origin/);
  assert.match(wrapper, /v_handoff_receipt\.schema_version IS DISTINCT FROM '1\.0\.0'/);
});

test("exact replay returns original IDs and any authorization drift fails", () => {
  assert.match(wrapper, /pg_advisory_xact_lock/);
  assert.match(
    wrapper,
    /receipt\.activation_idempotency_key = v_idempotency_key[\s\S]*?receipt\.external_authorization_receipt_id[\s\S]*?receipt\.proposal_request_receipt_id[\s\S]*?receipt\.opportunity_id/,
  );
  const replayLookup = wrapper.indexOf(
    "FROM co_production.proposal_activation_authorization_receipts AS receipt",
  );
  const currentReadiness = wrapper.indexOf(
    "FROM co_production.opportunity_proposal_request_receipts AS receipt",
  );
  const innerActivation = wrapper.indexOf(
    "v_handoff_result := co_production.activate_proposal_handoff(",
  );
  assert.ok(replayLookup >= 0 && replayLookup < currentReadiness);
  assert.ok(currentReadiness < innerActivation);
  assert.match(wrapper, /canonical_payload_hash IS DISTINCT FROM v_database_payload_hash/);
  assert.match(
    wrapper,
    /authorization_payload_hash[\s\S]*?IS DISTINCT FROM v_authorization_payload_hash/,
  );
  assert.match(wrapper, /production_authorization[\s\S]*?IS DISTINCT FROM v_authorization/);
  assert.match(
    wrapper,
    /external_authorization_receipt_id[\s\S]*?authorization_policy_version[\s\S]*?authorization_authorized_at/,
  );
  assert.match(
    wrapper,
    /RETURN v_existing\.result[\s\S]*?jsonb_build_object\('replayed', true\)/,
  );
  for (const id of [
    "projectId",
    "proposalHandoffReceiptId",
    "authorizationReceiptId",
    "productionAuthorizationReceiptId",
  ]) {
    assert.match(wrapper, new RegExp(`'${id}'`));
  }
});

test("legacy activation and authorization insertion share one rollback boundary", () => {
  assert.match(
    wrapper,
    /co_production\.activate_proposal_handoff\(\s*v_binding\.source_tenant_id,\s*v_binding\.signing_key_id,\s*'1\.0\.0',\s*p_attestation,\s*p_canonical_payload,\s*p_receiver_proof\s*\)/,
  );
  assert.doesNotMatch(wrapper, /p_canonical_payload::jsonb\s*-/);
  assert.doesNotMatch(wrapper, /-\s*'productionAuthorization'/);
  const legacyCall = wrapper.indexOf(
    "v_handoff_result := co_production.activate_proposal_handoff(",
  );
  const authorizationInsert = wrapper.indexOf(
    "INSERT INTO co_production.proposal_activation_authorization_receipts",
  );
  assert.ok(legacyCall >= 0 && legacyCall < authorizationInsert);
  assert.doesNotMatch(wrapper.slice(legacyCall), /EXCEPTION\s+WHEN/i);
  assert.match(migration, /^--[\s\S]*?BEGIN;/);
  assert.match(migration, /COMMIT;\s*$/);
});

test("only service_role executes the six-argument wrapper and the old RPC is sealed", () => {
  assert.match(wrapper, /SECURITY DEFINER[\s\S]*?SET search_path = ''/);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION co_production\.activate_proposal_handoff\(\s*text,\s*text,\s*text,\s*jsonb,\s*text,\s*text\s*\) FROM PUBLIC, anon, authenticated, service_role;/,
  );
  assert.doesNotMatch(
    migration,
    /GRANT EXECUTE ON FUNCTION co_production\.activate_proposal_handoff/,
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION co_production\.activate_authorized_proposal_handoff\(\s*text,\s*text,\s*text,\s*jsonb,\s*text,\s*text\s*\) FROM PUBLIC, anon, authenticated, service_role;/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION co_production\.activate_authorized_proposal_handoff\(\s*text,\s*text,\s*text,\s*jsonb,\s*text,\s*text\s*\) TO service_role;/,
  );
  assert.doesNotMatch(
    migration,
    /activate_authorized_proposal_handoff\(\s*text,\s*text,\s*text,\s*jsonb,\s*text,\s*text,\s*jsonb/,
  );
});

test("preproject pipeline preserves old columns and adds only redacted state", () => {
  assert.match(pipeline, /security_barrier = true, security_invoker = true/);
  const existingColumns = [
    "inquiry.team_id",
    "inquiry.id AS cursor_id",
    "inquiry.id AS inquiry_id",
    "inquiry.submitted_at AS inquiry_submitted_at",
    "opportunity.id AS opportunity_id",
    "COALESCE(opportunity.name, inquiry.project_title) AS opportunity_name",
    "COALESCE(opportunity.stage, 'inquiry') AS stage",
    "opportunity.probability_basis_points",
    "opportunity.expected_close_date",
    "opportunity.owner_id",
    ") AS authority_version",
    "account.id AS account_id",
    "COALESCE(account.display_name, inquiry.company_name) AS account_name",
    "contact.id AS primary_contact_id",
    "COALESCE(contact.name, inquiry.contact_name) AS contact_name",
    "brief.id AS brief_revision_id",
    "brief.revision_number AS brief_revision_number",
    "brief.status AS brief_status",
    "brief.content_hash AS brief_content_hash",
    "COALESCE(opportunity.updated_at, inquiry.submitted_at) AS updated_at",
  ];
  for (const column of existingColumns) assert.ok(pipeline.includes(column), column);

  const appendedColumns = [
    "proposal_request_receipt_id",
    "proposal_requested_at",
    "activation_status",
    "activation_authorization_receipt_id",
    "activated_project_id",
  ];
  let previousPosition = pipeline.indexOf("AS updated_at");
  for (const column of appendedColumns) {
    const position = pipeline.indexOf(`AS ${column}`, previousPosition + 1);
    assert.ok(position > previousPosition, column);
    previousPosition = position;
  }
  assert.match(
    pipeline,
    /activation_authorization\.id IS NOT NULL AND activated_project\.id IS NOT NULL[\s\S]*?THEN 'project_active'/,
  );
  assert.match(
    pipeline,
    /opportunity\.stage IN \('proposal_requested', 'proposal_sent'\)[\s\S]*?activation_authorization\.id IS NULL[\s\S]*?THEN 'awaiting_authorization'/,
  );
  assert.match(pipeline, /has_team_role\(inquiry\.team_id, 70\)/);
  assert.doesNotMatch(
    pipeline,
    /production_authorization|authorization_payload_hash|canonical_payload_hash|receipt_hash|activation_idempotency_key|evidenceReceiptId|policyVersion|authorizedAt/,
  );
  assert.match(
    migration,
    /GRANT SELECT ON TABLE co_production\.preproject_pipeline\s+TO authenticated, service_role;/,
  );
});
