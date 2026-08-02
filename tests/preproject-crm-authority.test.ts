import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(resolve(repositoryRoot, path), "utf8");
const migration = read(
  "supabase/migrations/20260716020000_preproject_crm_authority.sql",
);
const parser = read("lib/crm/preproject.ts");
const publicRoute = read("app/api/intake/inquiries/route.ts");
const formsRoute = read("app/api/crm/intake-forms/route.ts");
const pipelineRoute = read("app/api/crm/pipeline/route.ts");
const qualificationRoute = read("app/api/crm/inquiries/[id]/qualify/route.ts");
const proposalContextRoute = read(
  "app/api/crm/opportunities/[id]/proposal-context/route.ts",
);

function section(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing section start: ${start}`);
  assert.notEqual(endIndex, -1, `missing section end: ${end}`);
  return source.slice(startIndex, endIndex);
}

function assertColumns(sql: string, columns: readonly string[]) {
  for (const column of columns) {
    assert.match(sql, new RegExp(`\\b${column}\\b`), `missing column ${column}`);
  }
}

function tableColumnNames(table: string, nextMarker: string): Set<string> {
  const ddl = section(
    migration,
    `CREATE TABLE co_production.${table} (`,
    nextMarker,
  );
  const columns = new Set<string>();
  for (const line of ddl.split("\n")) {
    const match = /^  (?:(?:"([a-z_]+)")|([a-z_][a-z0-9_]*))\s+[a-z]/i.exec(
      line,
    );
    const name = match?.[1] ?? match?.[2];
    if (name && name.toLowerCase() !== "constraint") columns.add(name);
  }
  return columns;
}

function selectedColumns(source: string, relation: string): string[] {
  const escaped = relation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(
    `\\.from\\("${escaped}"\\)[\\s\\S]*?\\.select\\(\\s*"([^"]+)"`,
  ).exec(source);
  assert.ok(match, `missing select for ${relation}`);
  return match[1].split(",").map((column) => column.trim());
}

function assertSelectedColumnsExist(
  source: string,
  relation: string,
  ddlColumns: Set<string>,
) {
  for (const column of selectedColumns(source, relation)) {
    assert.ok(ddlColumns.has(column), `${relation}.${column} is not in the migration`);
  }
}

const tables = [
  "intake_forms",
  "public_inquiry_rate_limits",
  "public_inquiries",
  "crm_accounts",
  "crm_contacts",
  "opportunities",
  "creative_brief_revisions",
  "crm_mutation_receipts",
  "crm_mutation_events",
] as const;

test("migration is additive PostgreSQL 15 pre-project authority", () => {
  assert.match(migration, /BEGIN;/);
  assert.match(migration, /server_version_num[\s\S]*< 150000/);
  assert.match(migration, /has_team_role\(uuid,integer\)/);
  assert.match(migration, /role_rank\(text\)/);
  for (const table of tables) {
    assert.match(migration, new RegExp(`CREATE TABLE co_production\\.${table} \\(`));
  }
  assert.match(migration, /COMMIT;\s*$/);
  assert.doesNotMatch(migration, /\bDROP\s+(?:TABLE|SCHEMA|COLUMN)\b/i);
});

test("parser and database share one rich public inquiry contract", () => {
  assert.match(parser, /PUBLIC_INQUIRY_SCHEMA_VERSION = "cco\.public-inquiry\.v1"/);
  assert.match(parser, /FORM_KEY_PATTERN = \/\^ifm_\[0-9a-f\]\{64\}\$\//);
  assert.match(migration, /p_payload ->> 'schemaVersion' IS DISTINCT FROM 'cco\.public-inquiry\.v1'/);
  assert.match(migration, /\(p_payload ->> 'formKey'\) !~ '\^ifm_\[0-9a-f\]\{64\}\$'/);
  assert.match(
    migration,
    /ARRAY\[[\s\S]*'schemaVersion'[\s\S]*'formKey'[\s\S]*'contact'[\s\S]*'company'[\s\S]*'project'[\s\S]*'timeline'[\s\S]*'budgetSignal'[\s\S]*'consent'/,
  );

  const inquiries = section(
    migration,
    "CREATE TABLE co_production.public_inquiries (",
    "CREATE TABLE co_production.crm_accounts (",
  );
  assertColumns(inquiries, [
    "contact_name",
    "contact_email",
    "contact_phone",
    "company_name",
    "company_website",
    "project_title",
    "goals",
    "audiences",
    "requested_deliverables",
    "reference_urls",
    "constraints",
    "notes",
    "desired_start_date",
    "due_date",
    "timeline_flexibility",
    "budget_band",
    "consent_policy_version",
    "marketing_email_opt_in",
    "operational_sms_opt_in",
    "operational_imessage_opt_in",
  ]);
  assert.match(migration, /#> '\{project,goals\}'/);
  assert.match(migration, /#> '\{project,requestedDeliverables\}'/);
  assert.match(migration, /#> '\{project,references\}'/);
  assert.match(migration, /#>> '\{timeline,desiredStartDate\}'/);
  assert.match(migration, /#>> '\{budgetSignal,band\}'/);
});

test("all routes call exact canonical RPC names and parameter lists", () => {
  assert.match(
    publicRoute,
    /\.rpc\("submit_public_inquiry", \{[\s\S]*p_form_key:[\s\S]*p_idempotency_key:[\s\S]*p_request_id:[\s\S]*p_request_fingerprint:[\s\S]*p_payload:/,
  );
  assert.doesNotMatch(publicRoute, /p_payload_hash|p_request_fingerprint:\s*edgeAddress/);
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION co_production\.submit_public_inquiry\(\s*p_form_key text,\s*p_idempotency_key text,\s*p_request_id uuid,\s*p_request_fingerprint text,\s*p_payload jsonb\s*\)/,
  );

  assert.match(
    formsRoute,
    /\.rpc\("create_public_intake_form", \{[\s\S]*p_team_id:[\s\S]*p_name:[\s\S]*p_success_message:[\s\S]*p_request_id:/,
  );
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION co_production\.create_public_intake_form\(\s*p_team_id uuid,\s*p_name text,\s*p_success_message text,\s*p_request_id uuid\s*\)/,
  );

  assert.match(
    qualificationRoute,
    /\.rpc\("qualify_inquiry", \{[\s\S]*p_inquiry_id:[\s\S]*p_expected_version:[\s\S]*p_request_id:[\s\S]*p_qualification:/,
  );
  assert.doesNotMatch(qualificationRoute, /qualify_public_inquiry|p_request_hash/);
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION co_production\.qualify_inquiry\(\s*p_inquiry_id uuid,\s*p_expected_version bigint,\s*p_request_id uuid,\s*p_qualification jsonb\s*\)/,
  );
});

test("public submission is generic, service-role-only, immutable, and idempotent", () => {
  const submission = section(
    migration,
    "CREATE OR REPLACE FUNCTION co_production.submit_public_inquiry(",
    "CREATE OR REPLACE FUNCTION co_production.qualify_inquiry(",
  );
  assert.match(submission, /auth\.jwt\(\) ->> 'role'[\s\S]*<> 'service_role'/);
  assert.match(submission, /pg_advisory_xact_lock/);
  assert.match(migration, /UNIQUE \(intake_form_id, idempotency_key\)/);
  assert.match(submission, /public_inquiry_idempotency_conflict/);
  assert.ok(
    submission.indexOf("FROM co_production.public_inquiries AS inquiry") <
      submission.indexOf("INSERT INTO co_production.public_inquiry_rate_limits"),
    "replay must be resolved before rate capacity is consumed",
  );
  assert.match(publicRoute, /status: receipt\.status,[\s\S]*requestId: receipt\.requestId[\s\S]*202/);
  const publicSuccess = section(
    publicRoute,
    "return json(\n    {\n      status: receipt.status",
    "\n  );\n}",
  );
  assert.doesNotMatch(publicSuccess, /inquiryId|replayed/);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON co_production\.public_inquiries/);
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION co_production\.submit_public_inquiry\(text, text, uuid, text, jsonb\)\s+TO service_role;/,
  );
});

test("fixed-window limiting stores only one purpose-specific HMAC", () => {
  const submission = section(
    migration,
    "CREATE OR REPLACE FUNCTION co_production.submit_public_inquiry(",
    "CREATE OR REPLACE FUNCTION co_production.qualify_inquiry(",
  );
  const purposePattern =
    /hmac-sha256:cco-public-inquiry-rate-limit:v1:\[0-9a-f\]\{64\}/;
  assert.match(migration, purposePattern);
  assert.match(parser, /cco-public-inquiry-rate-limit:v1\\0\$\{address\}/);
  assert.match(
    submission,
    /date_bin\([\s\S]*make_interval\(secs => v_form\.rate_limit_window_seconds\)[\s\S]*1970-01-01 00:00:00\+00/,
  );
  assert.match(
    submission,
    /ON CONFLICT \(intake_form_id, request_fingerprint, window_started_at\)[\s\S]*request_count = co_production\.public_inquiry_rate_limits\.request_count \+ 1[\s\S]*request_count[\s\S]*< co_production\.public_inquiry_rate_limits\.request_limit/,
  );
  assert.match(submission, /public_inquiry_rate_limited/);
  assert.doesNotMatch(
    migration,
    /\b(?:ip_address|remote_addr|client_addr|forwarded_for|inet|cidr|p_ip)\b/i,
  );
  assert.doesNotMatch(submission, /edgeAddress|cf-connecting-ip|x-real-ip/);
});

test("qualification preserves rich CRM facts and explicit channel consent", () => {
  const accounts = section(
    migration,
    "CREATE TABLE co_production.crm_accounts (",
    "CREATE TABLE co_production.crm_contacts (",
  );
  const contacts = section(
    migration,
    "CREATE TABLE co_production.crm_contacts (",
    "CREATE TABLE co_production.opportunities (",
  );
  const opportunities = section(
    migration,
    "CREATE TABLE co_production.opportunities (",
    "CREATE TABLE co_production.creative_brief_revisions (",
  );
  const briefs = section(
    migration,
    "CREATE TABLE co_production.creative_brief_revisions (",
    "ALTER TABLE co_production.opportunities",
  );
  assertColumns(accounts, ["display_name", "legal_name", "website"]);
  assertColumns(contacts, [
    "name",
    "title",
    "email",
    "phone",
    "marketing_email_consent_status",
    "marketing_email_consent_address",
    "operational_sms_consent_status",
    "operational_sms_consent_address",
    "operational_imessage_consent_status",
    "operational_imessage_consent_address",
    "consent_policy_version",
  ]);
  assertColumns(opportunities, [
    "account_id",
    "primary_contact_id",
    "source_inquiry_id",
    "current_brief_revision_id",
    "probability_basis_points",
    "expected_close_date",
    "owner_id",
  ]);
  assertColumns(briefs, [
    "title",
    "objectives",
    "audiences",
    "key_messages",
    "requested_deliverables",
    "constraints",
    "references",
    "success_criteria",
    "content_hash",
  ]);
  assert.match(migration, /v_inquiry\.marketing_email_opt_in[\s\S]*v_inquiry\.contact_email/);
  assert.match(migration, /v_inquiry\.operational_sms_opt_in[\s\S]*v_inquiry\.contact_phone/);
  assert.match(migration, /v_inquiry\.operational_imessage_opt_in[\s\S]*v_inquiry\.contact_phone/);
  assert.doesNotMatch(
    opportunities,
    /\b(?:amount|currency|deal_value|value_cents|price|subtotal|total_cents)\b/i,
  );
});

test("qualification is optimistic, producer-ranked, transactional, and replay-safe", () => {
  const qualification = section(
    migration,
    "CREATE OR REPLACE FUNCTION co_production.qualify_inquiry(",
    "CREATE VIEW co_production.preproject_pipeline",
  );
  assert.match(qualification, /has_team_role\(v_inquiry\.team_id, 70\)/);
  assert.match(qualification, /FROM co_production\.public_inquiries AS inquiry[\s\S]*FOR UPDATE/);
  assert.match(
    qualification,
    /max\(receipt\.mutation_version\)[\s\S]*v_current_version IS DISTINCT FROM p_expected_version[\s\S]*crm_version_conflict/,
  );
  assert.match(qualification, /crm_idempotency_conflict/);
  for (const table of [
    "crm_accounts",
    "crm_contacts",
    "opportunities",
    "creative_brief_revisions",
    "crm_mutation_receipts",
    "crm_mutation_events",
  ]) {
    assert.match(qualification, new RegExp(`INSERT INTO co_production\\.${table}`));
  }
  assert.match(qualification, /UPDATE co_production\.opportunities[\s\S]*current_brief_revision_id/);
  assert.doesNotMatch(qualification, /UPDATE co_production\.public_inquiries/);
  assert.doesNotMatch(
    qualification,
    /INSERT INTO co_production\.(?:projects|notification_outbox|webhooks|webhook_deliveries)/,
  );
  assert.doesNotMatch(qualification, /http_post|net\.http|pg_net/i);
  assert.match(migration, /UNIQUE \(team_id, request_id\)/);
  assert.match(migration, /UNIQUE \(inquiry_id, mutation_version\)/);
});

test("the exact current brief is hash-bound and append-only", () => {
  assert.match(
    migration,
    /FOREIGN KEY \(current_brief_revision_id, team_id, id\)[\s\S]*REFERENCES co_production\.creative_brief_revisions\(id, team_id, opportunity_id\)[\s\S]*DEFERRABLE INITIALLY DEFERRED/,
  );
  assert.match(
    migration,
    /verify_creative_brief_content_hash[\s\S]*preproject_sha256\(NEW\.content::text\)/,
  );
  for (const table of [
    "creative_brief_revisions",
    "crm_mutation_receipts",
    "crm_mutation_events",
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

test("pipeline route and security-invoker view share a stable unqualified cursor", () => {
  const view = section(
    migration,
    "CREATE VIEW co_production.preproject_pipeline",
    "REVOKE ALL ON TABLE co_production.intake_forms",
  );
  assert.match(view, /security_barrier = true, security_invoker = true/);
  assert.match(view, /inquiry\.id AS cursor_id/);
  assert.match(view, /coalesce\(opportunity\.stage, 'inquiry'\) AS stage/i);
  assert.match(view, /coalesce\(opportunity\.updated_at, inquiry\.submitted_at\) AS updated_at/i);
  assert.match(view, /has_team_role\(inquiry\.team_id, 70\)/);
  assert.doesNotMatch(view, /request_fingerprint|idempotency_key|payload_hash/);

  assert.match(pipelineRoute, /\.from\("preproject_pipeline"\)/);
  assert.match(pipelineRoute, /activation_status/);
  assert.match(pipelineRoute, /activation_authorization_receipt_id/);
  assert.match(pipelineRoute, /activated_project_id/);
  assert.match(pipelineRoute, /"inquiry"/);
  assert.match(pipelineRoute, /last\.cursor_id/);
  assert.match(pipelineRoute, /\.order\("cursor_id", \{ ascending: false \}\)/);
  assert.match(pipelineRoute, /cursor_id\.lt\.\$\{cursor\.id\}/);
  assert.doesNotMatch(pipelineRoute, /\.from\("crm_pipeline"\)|last\.opportunity_id/);

  const pipelineColumns = [
    "team_id",
    "cursor_id",
    "inquiry_id",
    "inquiry_submitted_at",
    "opportunity_id",
    "opportunity_name",
    "stage",
    "probability_basis_points",
    "expected_close_date",
    "owner_id",
    "authority_version",
    "account_id",
    "account_name",
    "primary_contact_id",
    "contact_name",
    "brief_revision_id",
    "brief_revision_number",
    "brief_status",
    "brief_content_hash",
    "proposal_request_receipt_id",
    "proposal_requested_at",
    "activation_status",
    "activation_authorization_receipt_id",
    "activated_project_id",
    "updated_at",
  ];
  assert.deepEqual(selectedColumns(pipelineRoute, "preproject_pipeline"), pipelineColumns);
  assertColumns(view, pipelineColumns.slice(0, -6).concat("updated_at"));
});

test("proposal context queries real columns and leaks no commercial values", () => {
  const accounts = section(
    migration,
    "CREATE TABLE co_production.crm_accounts (",
    "CREATE TABLE co_production.crm_contacts (",
  );
  const contacts = section(
    migration,
    "CREATE TABLE co_production.crm_contacts (",
    "CREATE TABLE co_production.opportunities (",
  );
  const opportunities = section(
    migration,
    "CREATE TABLE co_production.opportunities (",
    "CREATE TABLE co_production.creative_brief_revisions (",
  );
  const briefs = section(
    migration,
    "CREATE TABLE co_production.creative_brief_revisions (",
    "ALTER TABLE co_production.opportunities",
  );
  const inquiries = section(
    migration,
    "CREATE TABLE co_production.public_inquiries (",
    "CREATE TABLE co_production.crm_accounts (",
  );
  assertColumns(opportunities, [
    "account_id",
    "current_brief_revision_id",
    "probability_basis_points",
    "expected_close_date",
  ]);
  assertColumns(accounts, ["display_name", "legal_name", "website"]);
  assertColumns(contacts, ["name", "title", "email", "phone", "stakeholder_role"]);
  assertColumns(briefs, [
    "revision_number",
    "status",
    "title",
    "objectives",
    "audiences",
    "key_messages",
    "requested_deliverables",
    "constraints",
    "references",
    "success_criteria",
    "content_hash",
  ]);
  assertColumns(inquiries, [
    "goals",
    "audiences",
    "requested_deliverables",
    "reference_urls",
    "constraints",
    "notes",
    "desired_start_date",
    "due_date",
    "timeline_flexibility",
    "budget_band",
  ]);
  assert.match(proposalContextRoute, /pricingIncluded: false/);
  assert.match(proposalContextRoute, /const handoffOrigin = \{/);
  assert.match(proposalContextRoute, /authority: "co-videopro-crm"/);
  assert.match(
    proposalContextRoute,
    /opportunityAuthorityVersion: context\.opportunity_authority_version/,
  );
  assert.match(
    proposalContextRoute,
    /briefContentHash: context\.brief_content_hash/,
  );
  assert.match(proposalContextRoute, /authority: "non_authoritative"/);
  assert.match(proposalContextRoute, /contentHash: context\.brief_content_hash/);
  assert.match(proposalContextRoute, /revisionNumber: context\.brief_revision_number/);
  assert.match(proposalContextRoute, /createProposalStudioImportContext/);
  assert.match(proposalContextRoute, /proposalStudioImport/);
  assert.match(proposalContextRoute, /requestedProductionWindow/);
  assert.match(
    proposalContextRoute,
    /desiredStartDate: context\.inquiry_desired_start_date/,
  );
  assert.match(proposalContextRoute, /dueDate: context\.inquiry_due_date/);
  assert.match(
    proposalContextRoute,
    /flexibility: context\.inquiry_timeline_flexibility/,
  );
  assert.doesNotMatch(
    proposalContextRoute,
    /\b(?:amount|currency|dealValue|valueCents|totalCents|subtotalCents)\b/,
  );

  const ddlColumns = {
    intake_forms: tableColumnNames(
      "intake_forms",
      "CREATE TABLE co_production.public_inquiry_rate_limits (",
    ),
    public_inquiries: tableColumnNames(
      "public_inquiries",
      "CREATE TABLE co_production.crm_accounts (",
    ),
    crm_accounts: tableColumnNames(
      "crm_accounts",
      "CREATE TABLE co_production.crm_contacts (",
    ),
    crm_contacts: tableColumnNames(
      "crm_contacts",
      "CREATE TABLE co_production.opportunities (",
    ),
    opportunities: tableColumnNames(
      "opportunities",
      "CREATE TABLE co_production.creative_brief_revisions (",
    ),
    creative_brief_revisions: tableColumnNames(
      "creative_brief_revisions",
      "ALTER TABLE co_production.opportunities",
    ),
  };
  assertSelectedColumnsExist(formsRoute, "intake_forms", ddlColumns.intake_forms);
  assert.match(
    proposalContextRoute,
    /\.from\("proposal_studio_ready_context"\)[\s\S]*\.select\(READY_CONTEXT_COLUMNS\)/,
  );
  assert.doesNotMatch(
    proposalContextRoute,
    /\.from\("(?:crm_accounts|crm_contacts|creative_brief_revisions|public_inquiries)"\)/,
  );
});

test("every table is force-RLS with explicit non-anonymous, non-delete grants", () => {
  for (const table of tables) {
    assert.match(
      migration,
      new RegExp(`ALTER TABLE co_production\\.${table} ENABLE ROW LEVEL SECURITY;`),
    );
    assert.match(
      migration,
      new RegExp(`ALTER TABLE co_production\\.${table} FORCE ROW LEVEL SECURITY;`),
    );
    assert.match(
      migration,
      new RegExp(
        `REVOKE ALL ON TABLE co_production\\.${table}\\s+FROM PUBLIC, anon, authenticated, service_role;`,
      ),
    );
  }
  assert.doesNotMatch(migration, /CREATE POLICY[^;]*FOR DELETE/i);
  assert.doesNotMatch(migration, /\bGRANT\b[^;]*\bDELETE\b/i);
  assert.doesNotMatch(migration, /\bGRANT\b[^;]*\bTO\s+[^;]*\banon\b/i);
  assert.doesNotMatch(migration, /\bGRANT\b[^;]*public_inquiry_rate_limits[^;]*;/i);

  const authenticatedFormGrant = section(
    migration,
    "GRANT SELECT (\n  id,\n  team_id,\n  name,",
    "GRANT SELECT ON TABLE co_production.intake_forms TO service_role;",
  );
  assert.doesNotMatch(
    authenticatedFormGrant,
    /opaque_key|creation_request_id|creation_request_hash/,
  );
  assert.match(migration, /GRANT EXECUTE ON FUNCTION co_production\.create_public_intake_form[\s\S]*TO authenticated;/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION co_production\.qualify_inquiry[\s\S]*TO authenticated;/);
});
