import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "..");
const migration = readFileSync(
  resolve(
    repositoryRoot,
    "supabase/migrations/20260716123000_project_brief_projection_authority.sql",
  ),
  "utf8",
);
const operatingRecordRoute = readFileSync(
  resolve(repositoryRoot, "app/api/projects/[id]/operating-record/route.ts"),
  "utf8",
);

function section(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing section start: ${start}`);
  assert.notEqual(endIndex, -1, `missing section end: ${end}`);
  return source.slice(startIndex, endIndex);
}

const contentValidator = section(
  migration,
  "CREATE OR REPLACE FUNCTION co_production_private.project_brief_content_is_valid(",
  "CREATE TABLE co_production.project_brief_revisions",
);
const table = section(
  migration,
  "CREATE TABLE co_production.project_brief_revisions",
  "ALTER TABLE co_production.project_brief_revisions ENABLE ROW LEVEL SECURITY",
);
const triggerFunction = section(
  migration,
  "co_production_private.project_brief_from_activation_authorization()\nRETURNS trigger",
  "CREATE TRIGGER proposal_activation_authorization_project_brief",
);
const safePayloadFunction = section(
  migration,
  "co_production_private.project_operating_source_safe_payload(",
  "-- Preserve every origin-aware operating-source column in place.",
);
const projection = section(
  migration,
  "CREATE OR REPLACE VIEW co_production.project_operating_sources",
  "REVOKE ALL ON TABLE co_production.project_brief_revisions",
);
const baseTablePolicy = section(
  migration,
  "CREATE POLICY project_brief_revisions_internal_select",
  "CREATE TRIGGER project_brief_revisions_immutable",
);
const operatingSourceRouteColumnList = section(
  operatingRecordRoute,
  "const OPERATING_SOURCE_COLUMNS = [",
  "].join(\", \");",
);
const operatingSourceRouteColumns = Array.from(
  operatingSourceRouteColumnList.matchAll(/"([a-z][a-z0-9_]*)"/g),
  (match) => match[1],
);

test("project brief authority stores only immutable revision 1 records", () => {
  assert.match(table, /revision_number integer NOT NULL DEFAULT 1 CHECK \(revision_number = 1\)/);
  assert.match(table, /UNIQUE \(project_id, revision_number\)/);
  assert.match(
    migration,
    /ALTER TABLE co_production\.project_brief_revisions FORCE ROW LEVEL SECURITY;/,
  );
  assert.match(
    migration,
    /BEFORE UPDATE OR DELETE ON co_production\.project_brief_revisions[\s\S]*?prevent_preproject_immutable_mutation/,
  );
  assert.match(
    migration,
    /BEFORE TRUNCATE ON co_production\.project_brief_revisions[\s\S]*?prevent_preproject_immutable_mutation/,
  );
});

test("revision 1 contains the exact bounded production-safe brief semantics", () => {
  for (const column of [
    "title text NOT NULL",
    "objectives text[] NOT NULL",
    "audiences text[] NOT NULL",
    "key_messages text[] NOT NULL",
    "requested_deliverables text[] NOT NULL",
    "constraints text[] NOT NULL",
    '"references" text[] NOT NULL',
    "success_criteria text[] NOT NULL",
    "content jsonb NOT NULL",
    "content_hash text NOT NULL",
  ]) {
    assert.ok(table.includes(column), column);
  }

  for (const bounds of [
    /p_objectives\), 1, 20, 1000/,
    /p_audiences\), 0, 20, 500/,
    /p_key_messages\), 0, 20, 1000/,
    /p_requested_deliverables\), 0, 32, 500/,
    /p_constraints\), 0, 24, 1000/,
    /p_references\), 0, 12, 2048, true/,
    /p_success_criteria\), 0, 20, 1000/,
  ]) {
    assert.match(contentValidator, bounds);
  }
  assert.match(contentValidator, /pg_column_size\(p_content\) <= 65536/);
  assert.match(
    contentValidator,
    /p_content = pg_catalog\.jsonb_build_object\([\s\S]*?'title', p_title[\s\S]*?'successCriteria', pg_catalog\.to_jsonb\(p_success_criteria\)/,
  );
  assert.match(
    contentValidator,
    /p_content_hash\s+= co_production_private\.preproject_sha256\(p_content::text\)/,
  );
});

test("project, brief, request, handoff, and authorization use exact composite bindings", () => {
  for (const binding of [
    /FOREIGN KEY \(project_id, team_id\)\s+REFERENCES co_production\.projects\(id, team_id\)/,
    /FOREIGN KEY \(source_brief_revision_id, team_id, opportunity_id\)\s+REFERENCES co_production\.creative_brief_revisions\(\s*id,\s*team_id,\s*opportunity_id\s*\)/,
    /FOREIGN KEY \(\s*proposal_request_receipt_id,\s*team_id,\s*opportunity_id,\s*proposal_request_authority_version\s*\)\s+REFERENCES co_production\.opportunity_proposal_request_receipts\(\s*id,\s*team_id,\s*opportunity_id,\s*resulting_authority_version\s*\)/,
    /FOREIGN KEY \(proposal_handoff_receipt_id, team_id, project_id\)\s+REFERENCES co_production\.proposal_handoff_receipts\(id, team_id, project_id\)/,
    /FOREIGN KEY \(\s*proposal_activation_authorization_receipt_id,\s*team_id,\s*project_id\s*\)\s+REFERENCES co_production\.proposal_activation_authorization_receipts\(\s*id,\s*team_id,\s*project_id\s*\)/,
  ]) {
    assert.match(table, binding);
  }
  assert.equal((table.match(/ON DELETE RESTRICT/g) ?? []).length, 5);
});

test("only an authorization receipt atomically projects a linked ready brief", () => {
  assert.match(
    migration,
    /CREATE TRIGGER proposal_activation_authorization_project_brief\s+AFTER INSERT ON co_production\.proposal_activation_authorization_receipts\s+FOR EACH ROW/,
  );
  assert.equal(
    (migration.match(/INSERT INTO co_production\.project_brief_revisions/g) ?? [])
      .length,
    1,
  );
  assert.match(
    triggerFunction,
    /JOIN co_production\.opportunity_proposal_request_receipts AS request_receipt/,
  );
  assert.match(
    triggerFunction,
    /JOIN co_production\.project_preproject_origins AS project_origin/,
  );
  assert.match(triggerFunction, /brief\.status = 'ready_for_proposal'/);
  assert.match(
    triggerFunction,
    /request_receipt\.ready_brief_revision_id = brief\.id/,
  );
  assert.match(
    triggerFunction,
    /project_origin\.proposal_handoff_receipt_id\s+= NEW\.proposal_handoff_receipt_id/,
  );
  assert.doesNotMatch(triggerFunction, /EXCEPTION\s+WHEN/i);
  assert.doesNotMatch(migration, /INSERT INTO co_production\.project_brief_revisions\s+SELECT/i);
});

test("the trigger copies exact source columns and the exact source hash", () => {
  const insert = section(
    triggerFunction,
    "INSERT INTO co_production.project_brief_revisions",
    "RETURN NEW;",
  );
  for (const sourceColumn of [
    "v_source_brief.title",
    "v_source_brief.objectives",
    "v_source_brief.audiences",
    "v_source_brief.key_messages",
    "v_source_brief.requested_deliverables",
    "v_source_brief.constraints",
    'v_source_brief."references"',
    "v_source_brief.success_criteria",
    "v_source_brief.content",
    "v_source_brief.content_hash",
  ]) {
    assert.ok(insert.includes(sourceColumn), sourceColumn);
  }
  assert.doesNotMatch(insert, /jsonb_build_object|digest|preproject_sha256/);
});

test("exact replay is a no-op and any binding or semantic drift fails closed", () => {
  assert.match(triggerFunction, /pg_advisory_xact_lock/);
  const replayLookup = triggerFunction.indexOf(
    "FROM co_production.project_brief_revisions AS projection",
  );
  const insert = triggerFunction.indexOf(
    "INSERT INTO co_production.project_brief_revisions",
  );
  assert.ok(replayLookup >= 0 && replayLookup < insert);
  for (const field of [
    "project_id",
    "team_id",
    "source_brief_revision_id",
    "proposal_request_receipt_id",
    "proposal_handoff_receipt_id",
    "proposal_activation_authorization_receipt_id",
    "title",
    "objectives",
    "requested_deliverables",
    '"references"',
    "content",
    "content_hash",
  ]) {
    assert.match(
      triggerFunction,
      new RegExp(`v_existing\\.${field.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}[\\s\\S]*?IS DISTINCT FROM`),
      field,
    );
  }
  assert.match(triggerFunction, /MESSAGE = 'project_brief_projection_conflict'/);
  assert.match(triggerFunction, /IF FOUND THEN[\s\S]*?RETURN NEW;[\s\S]*?END IF;/);
  assert.match(table, /UNIQUE \(proposal_request_receipt_id\)/);
  assert.match(table, /UNIQUE \(proposal_handoff_receipt_id\)/);
  assert.match(table, /UNIQUE \(proposal_activation_authorization_receipt_id\)/);
});

test("base-table reads require an internal contributor at project rank 50", () => {
  assert.match(
    migration,
    /CREATE POLICY project_brief_revisions_internal_select[\s\S]*?FOR SELECT TO authenticated[\s\S]*?has_project_role\(project_id, 50\)/,
  );
  assert.match(
    migration,
    /REVOKE ALL ON TABLE co_production\.project_brief_revisions\s+FROM PUBLIC, anon, authenticated, service_role;/,
  );
  assert.match(
    migration,
    /GRANT SELECT ON TABLE co_production\.project_brief_revisions TO authenticated;/,
  );
  assert.doesNotMatch(
    migration,
    /GRANT\s+(?:INSERT|UPDATE|DELETE|TRUNCATE)[\s\S]*?project_brief_revisions/i,
  );
  assert.doesNotMatch(
    baseTablePolicy,
    /FOR (?:INSERT|UPDATE|DELETE|ALL)/i,
  );
  assert.equal(
    (migration.match(/CREATE POLICY project_brief_revisions_/g) ?? []).length,
    1,
  );
});

test("operating rows remain rank 10 while brief columns join only at rank 50", () => {
  assert.match(
    projection,
    /WITH \(security_barrier = true, security_invoker = true\)/,
  );
  assert.match(
    projection,
    /LEFT JOIN co_production\.project_brief_revisions AS project_brief/,
  );
  assert.match(
    projection,
    /has_project_role\(project_brief\.project_id, 50\)/,
  );
  assert.match(
    projection,
    /WHERE co_production_private\.has_project_role\(receipt\.project_id, 10\)/,
  );
  assert.match(
    projection,
    /LEFT JOIN LATERAL co_production_private\.project_operating_source_safe_payload\(\s*receipt\.id,\s*receipt\.project_id\s*\) AS safe_payload ON true/,
  );
  assert.doesNotMatch(projection, /COALESCE\([^\n]*project_brief/);
  for (const [sourceColumn, projectedColumn] of [
    ["title", "project_brief_title"],
    ["objectives", "project_brief_objectives"],
    ["audiences", "project_brief_audiences"],
    ["key_messages", "project_brief_key_messages"],
    ["requested_deliverables", "project_brief_requested_deliverables"],
    ["constraints", "project_brief_constraints"],
    ['"references"', "project_brief_references"],
    ["success_criteria", "project_brief_success_criteria"],
    ["content", "project_brief_content"],
    ["content_hash", "project_brief_content_hash"],
    ["created_at", "project_brief_created_at"],
    ["proposal_request_receipt_id", "source_proposal_request_receipt_id"],
    [
      "proposal_activation_authorization_receipt_id",
      "source_activation_authorization_receipt_id",
    ],
  ] as const) {
    const escapedSource = sourceColumn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(
      projection,
      new RegExp(`project_brief\\.${escapedSource}\\s+AS ${projectedColumn}`),
    );
  }
});

test("the invoker view reads only role-filtered safe handoff payload fields", () => {
  assert.match(safePayloadFunction, /SECURITY DEFINER/);
  assert.match(
    safePayloadFunction,
    /has_project_role\(receipt\.project_id, 10\)/,
  );
  for (const safeField of [
    "production_start_date text",
    "production_due_date text",
    "production_constraints jsonb",
    "client_id text",
    "opportunity_id text",
    "brief_id text",
    "scope_item_ids jsonb",
    "deliverables jsonb",
    "production_modules jsonb",
  ]) {
    assert.ok(safePayloadFunction.includes(safeField), safeField);
  }
  assert.doesNotMatch(
    migration,
    /GRANT SELECT\s*\([\s\S]*?\b(?:project_seed|production_seed)\b[\s\S]*?\)\s+ON co_production\.proposal_handoff_receipts/i,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION\s+co_production_private\.project_operating_source_safe_payload\(uuid, uuid\)\s+TO authenticated;/,
  );
});

test("project and source creative brief revision identities remain distinct", () => {
  assert.match(
    projection,
    /project_brief\.id AS project_brief_revision_id/,
  );
  assert.match(
    projection,
    /project_brief\.source_brief_revision_id AS source_creative_brief_revision_id/,
  );
  assert.doesNotMatch(
    projection,
    /project_brief\.source_brief_revision_id AS project_brief_revision_id/,
  );
  assert.doesNotMatch(
    projection,
    /project_brief\.id AS source_creative_brief_revision_id/,
  );
});

test("the new authority and appended projection contain no commercial fields", () => {
  const appendedProjection = projection.slice(
    projection.indexOf("project_brief.id AS project_brief_revision_id"),
    projection.indexOf("FROM co_production.proposal_handoff_receipts"),
  );
  for (const forbidden of [
    "amount",
    "currency",
    "price",
    "subtotal",
    "discount",
    "tax",
    "payment",
    "deposit",
    "invoice",
    "contract",
    "billing",
    "bank",
    "card",
  ]) {
    assert.doesNotMatch(table, new RegExp(`\\b${forbidden}\\b`, "i"), forbidden);
    assert.doesNotMatch(
      appendedProjection,
      new RegExp(`\\b${forbidden}\\b`, "i"),
      forbidden,
    );
  }
});

test("the operating-source replacement preserves every prior column and grant", () => {
  const priorColumns = [
    "receipt.id AS receipt_id",
    "receipt.team_id",
    "receipt.project_id",
    "receipt.display_number",
    "receipt.package_id",
    "receipt.package_version",
    "receipt.proposal_version_id",
    "receipt.quote_version_id",
    "receipt.created_at AS activated_at",
    "safe_payload.production_start_date",
    "safe_payload.production_due_date",
    "safe_payload.production_constraints",
    "AS client_id",
    "AS opportunity_id",
    "AS brief_id",
    "safe_payload.scope_item_ids",
    "safe_payload.deliverables",
    "safe_payload.production_modules",
    "AS preproject_origin_linked",
    "AS source_inquiry_id",
    "AS primary_contact_id",
    "AS canonical_brief_content_hash",
    "origin.opportunity_authority_version",
    "AS preproject_origin_link_hash",
  ];
  let previousPosition = -1;
  for (const column of priorColumns) {
    const position = projection.indexOf(column, previousPosition + 1);
    assert.ok(position > previousPosition, column);
    previousPosition = position;
  }
  assert.ok(
    projection.indexOf("AS project_brief_revision_id") > previousPosition,
  );

  const expectedRouteColumns = [
    "receipt_id",
    "display_number",
    "package_id",
    "package_version",
    "proposal_version_id",
    "quote_version_id",
    "activated_at",
    "production_start_date",
    "production_due_date",
    "production_constraints",
    "client_id",
    "opportunity_id",
    "brief_id",
    "scope_item_ids",
    "deliverables",
    "production_modules",
    "preproject_origin_linked",
    "source_inquiry_id",
    "primary_contact_id",
    "canonical_brief_content_hash",
    "opportunity_authority_version",
    "preproject_origin_link_hash",
    "project_brief_revision_id",
    "source_creative_brief_revision_id",
    "project_brief_revision_number",
    "project_brief_title",
    "project_brief_objectives",
    "project_brief_audiences",
    "project_brief_key_messages",
    "project_brief_requested_deliverables",
    "project_brief_constraints",
    "project_brief_references",
    "project_brief_success_criteria",
    "project_brief_content",
    "project_brief_content_hash",
    "project_brief_created_at",
    "source_proposal_request_receipt_id",
    "source_activation_authorization_receipt_id",
  ];
  assert.deepEqual(operatingSourceRouteColumns, expectedRouteColumns);

  const appendedProjection = projection.slice(
    projection.indexOf("project_brief.id AS project_brief_revision_id"),
    projection.indexOf("FROM co_production.proposal_handoff_receipts"),
  );
  const projectedBriefAliases = Array.from(
    appendedProjection.matchAll(/\bAS\s+([a-z][a-z0-9_]*)/g),
    (match) => match[1],
  );
  const expectedBriefAliases = expectedRouteColumns.slice(
    expectedRouteColumns.indexOf("project_brief_revision_id"),
  );
  assert.deepEqual(
    [...projectedBriefAliases].sort(),
    [...expectedBriefAliases].sort(),
  );

  assert.match(
    migration,
    /REVOKE ALL ON TABLE co_production\.project_operating_sources\s+FROM PUBLIC, anon, authenticated, service_role;/,
  );
  assert.match(
    migration,
    /GRANT SELECT ON TABLE co_production\.project_operating_sources TO authenticated;/,
  );
});
