import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(
  resolve(
    repositoryRoot,
    "supabase/migrations/20260715170500_proposal_handoff_authority.sql",
  ),
  "utf8",
);
const activationMigration = readFileSync(
  resolve(
    repositoryRoot,
    "supabase/migrations/20260716113000_proposal_activation_authorization_authority.sql",
  ),
  "utf8",
);
const route = readFileSync(
  resolve(
    repositoryRoot,
    "app/api/integrations/proposal-handoffs/route.ts",
  ),
  "utf8",
);
const contract = readFileSync(
  resolve(repositoryRoot, "lib/integrations/proposal-handoff.ts"),
  "utf8",
);
const environment = readFileSync(resolve(repositoryRoot, ".env.example"), "utf8");

test("only a mapped signed CCO OS integration can reach project activation", () => {
  assert.match(
    migration,
    /CREATE TABLE co_production\.proposal_integration_bindings/,
  );
  assert.match(migration, /public_key_pem text NOT NULL/);
  assert.match(migration, /active boolean NOT NULL DEFAULT false/);
  assert.match(migration, /activation_enabled boolean NOT NULL DEFAULT false/);
  assert.match(migration, /receiver_hmac_secret bytea NOT NULL/);
  assert.match(route, /proposal_integration_public_keys/);
  assert.match(route, /verifyProposalHandoffAttestation/);
  assert.match(route, /source_tenant_id/);
  assert.doesNotMatch(route, /requireTeamRole|requireAuthWithClient/);
});

test("direct authenticated or service-role access cannot bypass receiver authority", () => {
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION co_production\.activate_proposal_handoff\(text, text, text, jsonb, text, text\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION co_production\.activate_proposal_handoff\(text, text, text, jsonb, text, text\)[\s\S]*TO service_role/,
  );
  assert.match(
    migration,
    /REVOKE ALL ON TABLE co_production\.proposal_handoff_receipts[\s\S]*FROM PUBLIC, anon, authenticated, service_role/,
  );
  assert.match(migration, /invalid_receiver_proof/);
  assert.match(migration, /extensions\.hmac/);
  assert.match(
    activationMigration,
    /REVOKE ALL ON FUNCTION co_production\.activate_proposal_handoff\([\s\S]*?\) FROM PUBLIC, anon, authenticated, service_role;/,
  );
  assert.doesNotMatch(
    activationMigration,
    /GRANT EXECUTE ON FUNCTION co_production\.activate_proposal_handoff/,
  );
  assert.match(
    activationMigration,
    /GRANT EXECUTE ON FUNCTION co_production\.activate_authorized_proposal_handoff\([\s\S]*?\) TO service_role;/,
  );
  assert.match(route, /proposalHandoffReceiverProof/);
  assert.match(
    route,
    /process\.env\.PROPOSAL_HANDOFF_WRITES_ENABLED !== "true"/,
  );
  assert.match(environment, /PROPOSAL_HANDOFF_WRITES_ENABLED=false/);
  assert.match(environment, /PROPOSAL_HANDOFF_RECEIVER_HMAC_SECRET=/);
});

test("one accepted package can create only one transactionally audited project", () => {
  assert.match(migration, /UNIQUE \(source_tenant_id, idempotency_key\)/);
  assert.match(
    migration,
    /UNIQUE \(source_tenant_id, package_id, package_version\)/,
  );
  assert.match(migration, /UNIQUE \(source_tenant_id, proposal_version_id\)/);
  assert.match(migration, /UNIQUE \(source_tenant_id, quote_version_id\)/);
  assert.match(migration, /idempotency_binding_mismatch/);
  assert.match(migration, /INSERT INTO co_production\.projects/);
  assert.match(
    migration,
    /INSERT INTO co_production\.proposal_handoff_receipts/,
  );
  assert.match(migration, /INSERT INTO co_production\.activity_log/);
  assert.match(migration, /EXCEPTION WHEN unique_violation/);
  assert.match(migration, /idempotency_payload_conflict/);
  assert.match(migration, /extensions\.digest/);
});

test("handoff receipts are immutable and users see only a redacted projection", () => {
  assert.match(
    migration,
    /ALTER TABLE co_production\.proposal_handoff_receipts ENABLE ROW LEVEL SECURITY/,
  );
  assert.match(
    migration,
    /BEFORE UPDATE OR DELETE ON co_production\.proposal_handoff_receipts/,
  );
  assert.match(
    migration,
    /BEFORE TRUNCATE ON co_production\.proposal_handoff_receipts/,
  );
  assert.match(migration, /security_invoker = true/);
  assert.match(migration, /proposal_handoff_receipts are immutable/);
  assert.match(
    migration,
    /CREATE VIEW co_production\.proposal_handoff_receipt_summaries/,
  );
  const view = migration.slice(
    migration.indexOf("CREATE VIEW co_production.proposal_handoff_receipt_summaries"),
    migration.indexOf("CREATE OR REPLACE FUNCTION co_production.activate_proposal_handoff"),
  );
  assert.doesNotMatch(
    view,
    /decision_receipt|production_seed|project_seed|public_key_pem/,
  );
});

test("commercial data and proposal renders are rejected at both boundaries", () => {
  assert.match(contract, /commercial_field_forbidden/);
  assert.match(contract, /COMMERCIAL_DENYLIST/);
  assert.match(contract, /classification: "production_safe"/);
  assert.match(migration, /commercial_field_forbidden/);
  assert.match(migration, /unsafe_production_artifact/);
  assert.doesNotMatch(
    migration,
    /total_cents|subtotal_cents|deposit_cents|payment_intent|stripe_payment/i,
  );
});

test("the HTTP boundary is bounded, schema-isolated, attested, and default-off", () => {
  assert.match(route, /PROPOSAL_HANDOFF_MAX_BYTES/);
  assert.match(route, /getSupabaseDataSchema\(\) !== "co_production"/);
  assert.match(route, /parsed\.payload\.intent === "validate"/);
  assert.match(route, /supabase\.rpc\("activate_authorized_proposal_handoff"/);
  assert.doesNotMatch(route, /supabase\.rpc\("activate_proposal_handoff"/);
  assert.match(route, /p_canonical_payload: canonicalPayload/);
  assert.match(route, /p_receiver_proof: receiverProof/);
  assert.match(migration, /attestation_payload_mismatch/);
});
