import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(
  resolve(
    repositoryRoot,
    "supabase/migrations/20260716030000_preproject_project_origin_authority.sql",
  ),
  "utf8",
);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tableDefinitions(): Array<{ name: string; sql: string }> {
  const definitions: Array<{ name: string; sql: string }> = [];
  for (const match of migration.matchAll(
    /CREATE TABLE co_production\.([a-z_][a-z0-9_]*) \(/g,
  )) {
    const start = match.index;
    const end = migration.indexOf("\n);", start + match[0].length);
    assert.notEqual(end, -1, `unterminated table ${match[1]}`);
    definitions.push({ name: match[1], sql: migration.slice(start, end + 3) });
  }
  return definitions;
}

function tableWithColumns(label: string, columns: readonly string[]) {
  const definition = tableDefinitions().find(({ sql }) =>
    columns.every((column) =>
      new RegExp(`\\b${escapeRegExp(column)}\\b`).test(sql),
    ),
  );
  assert.ok(definition, `missing ${label} table`);
  return definition;
}

function triggerBinding() {
  const trigger = /CREATE TRIGGER [a-z_][a-z0-9_]*\s+AFTER INSERT ON co_production\.proposal_handoff_receipts\s+FOR EACH ROW\s+EXECUTE FUNCTION co_production_private\.([a-z_][a-z0-9_]*)\(\);/.exec(
    migration,
  );
  assert.ok(trigger, "missing proposal handoff origin trigger");

  const marker = `CREATE OR REPLACE FUNCTION co_production_private.${trigger[1]}(`;
  const start = migration.indexOf(marker);
  assert.notEqual(start, -1, `missing trigger function ${trigger[1]}`);
  const end = migration.indexOf("\n$$;", start + marker.length);
  assert.notEqual(end, -1, `unterminated trigger function ${trigger[1]}`);
  return {
    name: trigger[1],
    sql: migration.slice(start, end + 4),
  };
}

function assertImmutable(table: string) {
  const escaped = escapeRegExp(table);
  assert.match(
    migration,
    new RegExp(`BEFORE UPDATE OR DELETE ON co_production\\.${escaped}`),
  );
  assert.match(
    migration,
    new RegExp(`BEFORE TRUNCATE ON co_production\\.${escaped}`),
  );
}

function assertProjectScopedRead(table: string) {
  const escaped = escapeRegExp(table);
  assert.match(
    migration,
    new RegExp(
      `ALTER TABLE co_production\\.${escaped} ENABLE ROW LEVEL SECURITY;`,
    ),
  );
  assert.match(
    migration,
    new RegExp(
      `ALTER TABLE co_production\\.${escaped} FORCE ROW LEVEL SECURITY;`,
    ),
  );

  const policy = new RegExp(
    `CREATE POLICY [a-z_][a-z0-9_]*\\s+ON co_production\\.${escaped}` +
      `([\\s\\S]*?);`,
    "i",
  ).exec(migration)?.[0];
  assert.ok(policy, `missing SELECT policy for ${table}`);
  assert.match(policy, /FOR SELECT TO authenticated/i);
  assert.match(policy, /has_project_role\(project_id, [0-9]+\)/);

  assert.match(
    migration,
    new RegExp(
      `REVOKE ALL ON TABLE co_production\\.${escaped}` +
        `[\\s\\S]*?FROM PUBLIC, anon, authenticated, service_role;`,
      "i",
    ),
  );
  assert.match(
    migration,
    new RegExp(
      `GRANT SELECT ON TABLE co_production\\.${escaped} TO authenticated;`,
      "i",
    ),
  );
}

const originTable = () =>
  tableWithColumns("project-to-preproject origin", [
    "project_id",
    "team_id",
    "proposal_handoff_receipt_id",
    "inquiry_id",
    "account_id",
    "primary_contact_id",
    "opportunity_id",
    "brief_revision_id",
    "brief_content_hash",
    "origin_context_hash",
    "link_hash",
  ]);

const lifecycleTable = () =>
  tableWithColumns("opportunity lifecycle event", [
    "event_sequence",
    "event_type",
    "from_stage",
    "to_stage",
    "from_authority_version",
    "to_authority_version",
    "proposal_handoff_receipt_id",
    "previous_event_hash",
    "event_hash",
  ]);

test("explicit project origin is immutable and tenant-safe without a synthetic row id", () => {
  const { name, sql: origin } = originTable();
  assert.match(
    migration,
    /UNIQUE \(id, team_id, project_id\)/,
  );
  assert.match(origin, /project_id uuid PRIMARY KEY/);
  assert.doesNotMatch(origin, /\n\s+id uuid\b/);
  for (const column of [
    "team_id",
    "proposal_handoff_receipt_id",
    "inquiry_id",
    "account_id",
    "primary_contact_id",
    "opportunity_id",
    "brief_revision_id",
  ]) {
    assert.match(origin, new RegExp(`\\b${column} uuid NOT NULL\\b`));
  }
  assert.match(origin, /proposal_handoff_receipt_id uuid NOT NULL UNIQUE/);
  assert.match(origin, /opportunity_id uuid NOT NULL UNIQUE/);

  for (const relationship of [
    /FOREIGN KEY \(project_id, team_id\)\s+REFERENCES co_production\.projects\(id, team_id\)/,
    /FOREIGN KEY \(proposal_handoff_receipt_id, team_id, project_id\)\s+REFERENCES co_production\.proposal_handoff_receipts\(id, team_id, project_id\)/,
    /FOREIGN KEY \(inquiry_id, team_id\)\s+REFERENCES co_production\.public_inquiries\(id, team_id\)/,
    /FOREIGN KEY \(account_id, team_id\)\s+REFERENCES co_production\.crm_accounts\(id, team_id\)/,
    /FOREIGN KEY \(primary_contact_id, team_id\)\s+REFERENCES co_production\.crm_contacts\(id, team_id\)/,
    /FOREIGN KEY \(opportunity_id, team_id\)\s+REFERENCES co_production\.opportunities\(id, team_id\)/,
    /FOREIGN KEY \(brief_revision_id, team_id, opportunity_id\)\s+REFERENCES co_production\.creative_brief_revisions\(id, team_id, opportunity_id\)/,
  ]) {
    assert.match(origin, relationship);
  }
  assert.equal((origin.match(/ON DELETE RESTRICT/g) ?? []).length, 7);
  assertImmutable(name);
});

test("legacy handoffs stay unlinked unless payload.origin is explicitly asserted", () => {
  const { sql: binding } = triggerBinding();
  assert.match(binding, /v_origin jsonb := NEW\.production_seed -> 'origin'/);
  assert.match(
    binding,
    /IF v_origin IS NULL OR pg_catalog\.jsonb_typeof\(v_origin\) = 'null' THEN\s+RETURN NEW;/,
  );

  const unlinkedReturn = binding.indexOf("IF v_origin IS NULL");
  const originValidation = binding.indexOf("invalid_internal_preproject_origin");
  const originInsert = binding.indexOf("INSERT INTO co_production.");
  assert.ok(
    unlinkedReturn >= 0 &&
      originValidation > unlinkedReturn &&
      originInsert > originValidation,
  );
  assert.doesNotMatch(
    binding,
    /\(NEW\.production_seed\s*->>\s*'(?:clientId|opportunityId|briefId)'\)::uuid/,
  );

  const view = /CREATE OR REPLACE VIEW co_production\.project_operating_sources[\s\S]*?FROM co_production\.proposal_handoff_receipts AS receipt[\s\S]*?WHERE co_production_private\.has_project_role\(receipt\.project_id, 10\);/.exec(
    migration,
  )?.[0];
  assert.ok(view, "missing project-scoped operating-source projection");
  assert.match(view, /security_invoker = true/);
  assert.match(view, /LEFT JOIN co_production\.[a-z_][a-z0-9_]* AS origin/);
  assert.match(view, /origin\.project_id IS NOT NULL AS preproject_origin_linked/);
  assert.match(
    view,
    /COALESCE\(origin\.account_id::text, receipt\.production_seed ->> 'clientId'\)/,
  );
  assert.match(view, /origin\.inquiry_id::text AS source_inquiry_id/);
  assert.match(view, /origin\.brief_content_hash AS canonical_brief_content_hash/);
});

test("asserted CRM origins require an exact authority, shape, UUIDs, versions, and hash", () => {
  const { sql: binding } = triggerBinding();
  const validationStart = binding.indexOf(
    "IF pg_catalog.jsonb_typeof(v_origin) <> 'object'",
  );
  const validationEnd = binding.indexOf("v_inquiry_id :=");
  assert.ok(validationStart >= 0 && validationEnd > validationStart);
  const validation = binding.slice(validationStart, validationEnd);

  const exactKeys = /preproject_exact_json_keys\(\s*v_origin,\s*ARRAY\[([\s\S]*?)\]\s*\)/.exec(
    validation,
  )?.[1];
  assert.ok(exactKeys, "origin must use an exact JSON key set");
  const keys = [...exactKeys.matchAll(/'([^']+)'/g)]
    .map((match) => match[1])
    .sort();
  assert.deepEqual(keys, [
    "accountAuthorityVersion",
    "accountId",
    "authority",
    "briefContentHash",
    "briefRevisionId",
    "briefRevisionNumber",
    "contactAuthorityVersion",
    "inquiryId",
    "opportunityAuthorityVersion",
    "opportunityId",
    "primaryContactId",
  ]);
  assert.match(
    validation,
    /v_origin ->> 'authority' IS DISTINCT FROM 'co-videopro-crm'/,
  );

  for (const key of [
    "inquiryId",
    "accountId",
    "primaryContactId",
    "opportunityId",
    "briefRevisionId",
  ]) {
    assert.match(validation, new RegExp(`v_origin ->> '${key}'`));
  }
  const uuidPattern =
    "^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$";
  assert.equal(
    (validation.match(new RegExp(escapeRegExp(uuidPattern), "g")) ?? []).length,
    5,
  );

  for (const key of [
    "accountAuthorityVersion",
    "contactAuthorityVersion",
    "opportunityAuthorityVersion",
    "briefRevisionNumber",
  ]) {
    assert.match(validation, new RegExp(`v_origin ->> '${key}'`));
  }
  assert.equal((validation.match(/\^\[1-9\]\[0-9\]\{0,9\}\$/g) ?? []).length, 4);
  assert.match(
    validation,
    /v_origin ->> 'briefContentHash'\) !~ '\^sha256:\[0-9a-f\]\{64\}\$'/,
  );
  assert.match(validation, /MESSAGE = 'invalid_internal_preproject_origin'/);

  const firstUuidCast = binding.search(/\(v_origin ->> '[^']+'\)::uuid/);
  assert.ok(firstUuidCast > binding.indexOf("invalid_internal_preproject_origin"));
});

test("asserted origin references and the canonical CRM graph fail closed on mismatch", () => {
  const { sql: binding } = triggerBinding();
  for (const reference of [
    /NEW\.production_seed ->> 'clientId' IS DISTINCT FROM v_account_id::text/,
    /NEW\.production_seed ->> 'opportunityId' IS DISTINCT FROM v_opportunity_id::text/,
    /NEW\.production_seed ->> 'briefId' IS DISTINCT FROM v_brief_id::text/,
  ]) {
    assert.match(binding, reference);
  }
  assert.match(binding, /MESSAGE = 'preproject_origin_reference_mismatch'/);

  assert.match(
    binding,
    /FROM co_production\.opportunities AS opportunity[\s\S]*?FOR UPDATE OF opportunity/,
  );
  assert.match(
    binding,
    /JOIN co_production\.crm_accounts AS account[\s\S]*?account\.id = opportunity\.account_id[\s\S]*?account\.team_id = opportunity\.team_id/,
  );
  assert.match(
    binding,
    /JOIN co_production\.crm_contacts AS contact[\s\S]*?contact\.id = opportunity\.primary_contact_id[\s\S]*?contact\.team_id = opportunity\.team_id[\s\S]*?contact\.account_id = account\.id/,
  );
  assert.match(
    binding,
    /JOIN co_production\.creative_brief_revisions AS brief[\s\S]*?brief\.id = opportunity\.current_brief_revision_id[\s\S]*?brief\.team_id = opportunity\.team_id[\s\S]*?brief\.opportunity_id = opportunity\.id/,
  );
  assert.match(
    binding,
    /JOIN co_production\.public_inquiries AS inquiry[\s\S]*?inquiry\.id = opportunity\.source_inquiry_id[\s\S]*?brief\.source_inquiry_id = inquiry\.id[\s\S]*?account\.source_inquiry_id = inquiry\.id[\s\S]*?contact\.source_inquiry_id = inquiry\.id/,
  );
  for (const predicate of [
    /opportunity\.team_id = NEW\.team_id/,
    /opportunity\.id = v_opportunity_id/,
    /account\.id = v_account_id/,
    /contact\.id = v_contact_id/,
    /inquiry\.id = v_inquiry_id/,
    /brief\.id = v_brief_id/,
  ]) {
    assert.match(binding, predicate);
  }

  for (const originVersion of [
    "accountAuthorityVersion",
    "contactAuthorityVersion",
    "opportunityAuthorityVersion",
    "briefRevisionNumber",
    "briefContentHash",
  ]) {
    assert.match(binding, new RegExp(`v_origin ->> '${originVersion}'`));
  }
  assert.match(binding, /v_opportunity\.stage IN \('won', 'lost'\)/);
  assert.match(binding, /MESSAGE = 'stale_or_mismatched_preproject_origin'/);
});

test("current brief evidence must match identity, hash, and production-safe classification", () => {
  const { sql: binding } = triggerBinding();
  const evidence = /IF NOT EXISTS \([\s\S]*?FROM pg_catalog\.jsonb_array_elements\([\s\S]*?\n  \) THEN/.exec(
    binding,
  )?.[0];
  assert.ok(evidence, "missing canonical brief evidence check");
  assert.match(evidence, /NEW\.production_seed -> 'artifactRefs'/);
  assert.match(evidence, /artifact\.value ->> 'kind' = 'brief'/);
  assert.match(evidence, /artifact\.value ->> 'artifactId' = v_brief_id::text/);
  assert.match(
    evidence,
    /'sha256:' \|\| lower\(artifact\.value ->> 'sha256'\)\s+= v_opportunity\.brief_content_hash/,
  );
  assert.match(
    evidence,
    /artifact\.value ->> 'classification' = 'production_safe'/,
  );
  assert.match(binding, /MESSAGE = 'canonical_brief_evidence_missing'/);
});

test("accepted origin activation wins the opportunity monotonically and appends a hash-chained event", () => {
  const { sql: binding } = triggerBinding();
  const { name: eventTableName, sql: events } = lifecycleTable();

  assert.match(
    migration,
    /ALTER TABLE co_production\.opportunities\s+DROP CONSTRAINT IF EXISTS opportunities_authority_version_check/,
  );
  assert.match(
    migration,
    /CHECK \(authority_version BETWEEN 1 AND 2147483647\)/,
  );
  assert.match(binding, /v_to_version := v_from_version \+ 1/);
  assert.match(
    binding,
    /UPDATE co_production\.opportunities\s+SET\s+stage = 'won',[\s\S]*?authority_version = v_to_version[\s\S]*?WHERE id = v_opportunity_id[\s\S]*?team_id = NEW\.team_id[\s\S]*?authority_version = v_from_version/,
  );
  assert.match(binding, /MESSAGE = 'preproject_origin_version_conflict'/);

  const eventType = /event_type text NOT NULL CHECK \(event_type = '([^']+)'\)/.exec(
    events,
  )?.[1];
  assert.ok(eventType);
  assert.match(eventType, /accepted.*proposal|proposal.*accepted/);
  assert.match(events, /to_stage text NOT NULL CHECK \(to_stage = 'won'\)/);
  assert.match(
    events,
    /to_authority_version bigint NOT NULL CHECK \(\s*to_authority_version = from_authority_version \+ 1\s*\)/,
  );
  assert.match(events, /UNIQUE \(opportunity_id, event_sequence\)/);
  assert.match(events, /proposal_handoff_receipt_id uuid NOT NULL UNIQUE/);
  assert.match(events, /previous_event_hash text NOT NULL/);
  assert.match(events, /event_hash text NOT NULL UNIQUE/);
  assert.match(
    binding,
    new RegExp(`INSERT INTO co_production\\.${escapeRegExp(eventTableName)}`),
  );
  assert.ok(
    binding.indexOf("UPDATE co_production.opportunities") <
      binding.indexOf(`INSERT INTO co_production.${eventTableName}`),
  );
  assertImmutable(eventTableName);
});

test("origin authority is FORCE-RLS, project-scoped, and has no direct write surface", () => {
  const origin = originTable();
  const events = lifecycleTable();
  for (const table of [origin.name, events.name]) {
    assertProjectScopedRead(table);
  }

  assert.doesNotMatch(
    migration,
    /GRANT\s+(?:INSERT|UPDATE|DELETE|TRUNCATE|ALL)(?:\s*\([^)]*\))?\s+ON TABLE/i,
  );
  const binding = triggerBinding();
  assert.match(binding.sql, /SECURITY DEFINER/);
  assert.match(binding.sql, /SET search_path = ''/);
  assert.match(
    migration,
    new RegExp(
      `REVOKE ALL ON FUNCTION co_production_private\\.${escapeRegExp(binding.name)}` +
        `\\(\\)[\\s\\S]*?FROM PUBLIC, anon, authenticated, service_role;`,
    ),
  );
  assert.doesNotMatch(migration, /GRANT EXECUTE ON FUNCTION/);
});

test("origin linking cannot create projects, commerce, outbound delivery, or a public RPC", () => {
  assert.doesNotMatch(
    migration,
    /\b(?:amount|currency|deal_value|price|unit_price|subtotal|total_cents|budget|deposit|payment|invoice|charge|stripe)\b/i,
  );
  assert.doesNotMatch(
    migration,
    /notification_outbox|outbound|send_(?:message|email|sms)|dispatch_(?:message|notification)|enqueue_(?:message|notification)|provider|webhook|pg_net|net\.http|http_post|http_get/i,
  );
  assert.doesNotMatch(
    migration,
    /(?:INSERT INTO|CREATE TABLE) co_production\.projects\b/i,
  );

  const functions = [
    ...migration.matchAll(
      /CREATE OR REPLACE FUNCTION ([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)\(/g,
    ),
  ].map((match) => match[1]);
  assert.ok(functions.length > 0);
  assert.ok(
    functions.every((name) => name.startsWith("co_production_private.")),
  );
  assert.doesNotMatch(migration, /GRANT EXECUTE ON FUNCTION/);
});
