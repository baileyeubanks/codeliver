import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  parseOpportunityProposalRequestMutation,
  parseOpportunityProposalRequestReceipt,
  PreProjectValidationError,
} from "../lib/crm/preproject.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(resolve(repositoryRoot, path), "utf8");
const migration = read(
  "supabase/migrations/20260716100000_opportunity_proposal_readiness_authority.sql",
);
const route = read(
  "app/api/crm/opportunities/[id]/proposal-context/route.ts",
);
const page = read("app/(dashboard)/sales/page.tsx");
const demo = read("lib/demo/sales-pipeline.ts");
const proxy = read("proxy.ts");

function section(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing section start: ${start}`);
  assert.notEqual(endIndex, -1, `missing section end: ${end}`);
  return source.slice(startIndex, endIndex);
}

const ids = {
  request: "11111111-1111-4111-8111-111111111111",
  opportunity: "22222222-2222-4222-8222-222222222222",
  inquiry: "33333333-3333-4333-8333-333333333333",
  sourceBrief: "44444444-4444-4444-8444-444444444444",
  readyBrief: "55555555-5555-4555-8555-555555555555",
  receipt: "66666666-6666-4666-8666-666666666666",
};

test("proposal request parser accepts only one versioned brief authority", () => {
  const parsed = parseOpportunityProposalRequestMutation({
    expectedVersion: 4,
    requestId: ids.request,
    sourceBriefRevisionId: ids.sourceBrief,
    sourceBriefContentHash: `sha256:${"a".repeat(64)}`,
  });
  assert.deepEqual(parsed, {
    expectedVersion: 4,
    requestId: ids.request,
    sourceBriefRevisionId: ids.sourceBrief,
    sourceBriefContentHash: `sha256:${"a".repeat(64)}`,
  });

  assert.throws(
    () => parseOpportunityProposalRequestMutation({
      ...parsed,
      sourceBriefContentHash: "sha256:short",
    }),
    (error: unknown) =>
      error instanceof PreProjectValidationError && error.code === "invalid_hash",
  );
  assert.throws(
    () => parseOpportunityProposalRequestMutation({ ...parsed, extra: true }),
    (error: unknown) => error instanceof PreProjectValidationError,
  );
});

test("proposal request receipt adapter rejects incomplete authority evidence", () => {
  const raw = {
    proposal_request_receipt_id: ids.receipt,
    opportunity_id: ids.opportunity,
    source_inquiry_id: ids.inquiry,
    source_brief_revision_id: ids.sourceBrief,
    source_brief_revision_number: 3,
    ready_brief_revision_id: ids.readyBrief,
    ready_brief_revision_number: 4,
    brief_content_hash: `sha256:${"b".repeat(64)}`,
    from_stage: "briefing",
    stage: "proposal_requested",
    authority_version: 5,
    request_id: ids.request,
    requested_at: "2026-07-16T10:00:00.000Z",
    replayed: false,
  };
  const receipt = parseOpportunityProposalRequestReceipt(raw);
  assert.equal(receipt?.proposalRequestReceiptId, ids.receipt);
  assert.equal(receipt?.readyBriefRevisionNumber, 4);
  assert.equal(receipt?.authorityVersion, 5);
  assert.equal(
    parseOpportunityProposalRequestReceipt({ ...raw, ready_brief_revision_number: 5 }),
    null,
  );
});

test("proposal readiness migration is additive, immutable, and team-authorized", () => {
  assert.match(migration, /^--[\s\S]*BEGIN;/);
  assert.match(migration, /CREATE TABLE co_production\.opportunity_proposal_request_receipts/);
  assert.match(migration, /CREATE TABLE co_production\.opportunity_proposal_request_events/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY[\s\S]*FORCE ROW LEVEL SECURITY/);
  assert.match(migration, /has_team_role\(team_id, 70\)/);
  assert.match(migration, /BEFORE UPDATE OR DELETE[\s\S]*prevent_preproject_immutable_mutation/);
  assert.match(migration, /BEFORE TRUNCATE[\s\S]*prevent_preproject_immutable_mutation/);
  assert.match(migration, /REVOKE ALL ON TABLE[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
  assert.doesNotMatch(migration, /\bDROP\s+(?:TABLE|SCHEMA|COLUMN)\b/i);
  assert.match(migration, /COMMIT;\s*$/);
});

test("proposal request RPC resolves replay before transition and clones the brief once", () => {
  const command = section(
    migration,
    "CREATE OR REPLACE FUNCTION co_production.request_opportunity_proposal(",
    "CREATE VIEW co_production.proposal_studio_ready_context",
  );
  assert.match(command, /SECURITY DEFINER[\s\S]*SET search_path = ''/);
  assert.match(command, /pg_advisory_xact_lock/);
  assert.ok(
    command.indexOf("FROM co_production.opportunity_proposal_request_receipts AS receipt") <
      command.indexOf("crm_proposal_invalid_transition"),
    "exact replay must resolve before current-state validation",
  );
  assert.match(command, /v_existing\.result \|\|[\s\S]*'replayed', true/);
  assert.match(command, /v_opportunity\.stage NOT IN \('qualification', 'discovery', 'briefing'\)/);
  assert.match(command, /v_source_brief\.status IS DISTINCT FROM 'draft'/);
  assert.match(command, /INSERT INTO co_production\.creative_brief_revisions[\s\S]*'ready_for_proposal'/);
  assert.doesNotMatch(command, /UPDATE co_production\.creative_brief_revisions/);
  assert.match(
    command,
    /UPDATE co_production\.opportunities[\s\S]*stage = 'proposal_requested'[\s\S]*authority_version = v_resulting_version[\s\S]*authority_version = p_expected_version/,
  );
  assert.match(command, /INSERT INTO co_production\.opportunity_proposal_request_receipts/);
  assert.match(command, /INSERT INTO co_production\.opportunity_proposal_request_events/);
  assert.doesNotMatch(command, /INSERT INTO co_production\.(?:projects|proposal_handoff_receipts)/);
});

test("Proposal Studio reads one receipt-backed canonical graph", () => {
  const view = section(
    migration,
    "CREATE VIEW co_production.proposal_studio_ready_context",
    "CREATE OR REPLACE FUNCTION\n  co_production_private.require_ready_internal_proposal_origin()",
  );
  for (const relation of [
    "opportunities",
    "crm_accounts",
    "crm_contacts",
    "creative_brief_revisions",
    "public_inquiries",
    "opportunity_proposal_request_receipts",
  ]) {
    assert.match(view, new RegExp(`co_production\\.${relation}`));
  }
  assert.match(view, /contact\.account_id = opportunity\.account_id/);
  assert.match(view, /contact\.source_inquiry_id = opportunity\.source_inquiry_id/);
  assert.match(view, /brief\.source_inquiry_id = opportunity\.source_inquiry_id/);
  assert.match(view, /receipt\.ready_brief_revision_id = opportunity\.current_brief_revision_id/);
  assert.match(view, /opportunity\.stage IN \('proposal_requested', 'proposal_sent'\)/);
  assert.match(view, /brief\.status = 'ready_for_proposal'/);
});

test("accepted internal handoffs require the same readiness receipt", () => {
  const guard = section(
    migration,
    "co_production_private.require_ready_internal_proposal_origin()",
    "CREATE TRIGGER proposal_handoff_require_ready_internal_origin",
  );
  assert.match(guard, /opportunity_proposal_request_receipts/);
  assert.match(guard, /opportunity\.stage IN \('proposal_requested', 'proposal_sent'\)/);
  assert.match(guard, /brief\.status = 'ready_for_proposal'/);
  assert.match(guard, /stale_or_mismatched_preproject_origin/);
  assert.match(migration, /BEFORE INSERT ON co_production\.proposal_handoff_receipts/);
});

test("one guarded proposal-context endpoint owns request and retrieval", () => {
  assert.match(route, /export async function POST/);
  assert.match(route, /export async function GET/);
  assert.match(route, /parseOpportunityProposalRequestMutation/);
  assert.match(route, /parseOpportunityProposalRequestReceipt/);
  assert.match(
    route,
    /\.rpc\("request_opportunity_proposal", \{[\s\S]*p_opportunity_id:[\s\S]*p_expected_version:[\s\S]*p_request_id:[\s\S]*p_source_brief_revision_id:[\s\S]*p_source_brief_content_hash:/,
  );
  assert.match(route, /receipt\.replayed \? 200 : 201/);
  assert.match(route, /\.from\("proposal_studio_ready_context"\)/);
  assert.doesNotMatch(route, /\.from\("(?:crm_accounts|crm_contacts|creative_brief_revisions|public_inquiries)"\)/);
  assert.match(route, /code: "PROPOSAL_NOT_REQUESTED"[\s\S]*409/);
  assert.match(route, /schemaVersion: "cco\.crm\.proposal-context\.v3"/);
  assert.match(
    proxy,
    /proposal-context\$`[\s\S]{0,120}methods: \["GET", "POST"\]/,
  );
});

test("Sales keeps one retry identity and separates errors from durable success", () => {
  assert.match(page, /proposalRequestRef = useRef/);
  assert.match(
    page,
    /selected\.opportunity_id,[\s\S]*selected\.authority_version,[\s\S]*selected\.brief_revision_id,[\s\S]*selected\.brief_content_hash/,
  );
  assert.match(page, /proposalRequestRef\.current\?\.fingerprint !== fingerprint/);
  assert.match(page, /requestId: proposalRequestRef\.current\.requestId/);
  assert.match(page, /method: "POST"/);
  assert.match(page, /Request proposal/);
  assert.match(page, /aria-busy=\{proposalRequestLoading\}/);
  assert.match(page, /drawerError \? <div className=\{styles\.alert\} role="alert"/);
  assert.match(page, /drawerNotice \? <div className=\{styles\.notice\} role="status"/);
  assert.match(page, /PROPOSAL_CONTEXT_STAGES\.has\(selected\.stage\)[\s\S]*selected\.brief_status === "ready_for_proposal"/);
});

test("demo data models real readiness instead of impossible brief states", () => {
  assert.doesNotMatch(demo, /brief_status: "approved"/);
  assert.doesNotMatch(demo, /sha256:demo-/);
  assert.doesNotMatch(demo, /dueDate: item\.expected_close_date/);
  assert.match(demo, /brief_status: "ready_for_proposal"/);
  assert.match(demo, /proposal_request_receipt_id:/);
  assert.match(demo, /cco\.proposal-studio\.import-context\.v3/);
});
