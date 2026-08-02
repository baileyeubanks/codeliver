import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const route = readFileSync(
  resolve(repositoryRoot, "app/api/crm/inquiries/[id]/route.ts"),
  "utf8",
);

function selectedColumns(source: string): string[] {
  const match = /\.from\("public_inquiries"\)[\s\S]*?\.select\(\s*"([^"]+)"/.exec(
    source,
  );
  assert.ok(match, "missing public_inquiries select");
  return match[1].split(",").map((column) => column.trim());
}

function attachmentColumns(source: string): string[] {
  const match = /\.from\("public_inquiry_uploads"\)[\s\S]*?\.select\(\s*"([^"]+)"/.exec(
    source,
  );
  assert.ok(match, "missing public_inquiry_uploads select");
  return match[1].split(",").map((column) => column.trim());
}

test("inquiry detail is staff-only and uses the user-scoped CRM authority", () => {
  assert.match(route, /requireStaffWithClient\(\)/);
  assert.match(route, /if \(!user\)[\s\S]*"Unauthorized"[\s\S]*401/);
  assert.match(route, /if \(!staff\)[\s\S]*"Forbidden"[\s\S]*403/);
  assert.match(
    route,
    /getSupabaseDataSchema\(\) !== "co_production"[\s\S]*authorityUnavailable\(\)/,
  );
  assert.doesNotMatch(
    route,
    /service[_-]?role|SUPABASE_SERVICE_ROLE_KEY|createServiceRole|createClient\(/i,
  );
});

test("inquiry detail normalizes and binds both tenant and inquiry UUIDs", () => {
  assert.match(
    route,
    /normalizeCrmUuid\(\(await params\)\.id, "inquiry_id"\)/,
  );
  assert.match(
    route,
    /normalizeCrmUuid\([\s\S]*searchParams\.get\("team_id"\)[\s\S]*"team_id"/,
  );
  assert.match(
    route,
    /\.from\("public_inquiries"\)[\s\S]*\.eq\("id", inquiryId\)[\s\S]*\.eq\("team_id", teamId\)[\s\S]*\.maybeSingle\(\)/,
  );
  assert.doesNotMatch(route, /\.single\(\)/);
});

test("inquiry detail selects only qualification intake fields", () => {
  assert.deepEqual(selectedColumns(route), [
    "id",
    "team_id",
    "authority_version",
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
    "submitted_at",
  ]);
  assert.doesNotMatch(
    selectedColumns(route).join(" "),
    /payload|hash|fingerprint|idempotency|request_id|consent|opt_in|created_by/i,
  );
});

test("inquiry detail adapts the complete qualification source contract", () => {
  for (const contract of [
    /schemaVersion: "cco\.crm\.inquiry-detail\.v2"/,
    /authorityVersion: data\.authority_version/,
    /status: "received"/,
    /submittedAt: data\.submitted_at/,
    /contact: \{[\s\S]*name: data\.contact_name[\s\S]*email: data\.contact_email[\s\S]*phone: data\.contact_phone/,
    /company: \{[\s\S]*name: data\.company_name[\s\S]*website: data\.company_website/,
    /goals: data\.goals/,
    /audiences: data\.audiences/,
    /requestedDeliverables: data\.requested_deliverables/,
    /references: data\.reference_urls/,
    /constraints: data\.constraints/,
    /desiredStartDate: data\.desired_start_date/,
    /dueDate: data\.due_date/,
    /flexibility: data\.timeline_flexibility/,
    /source: "client_reported"/,
    /authority: "non_authoritative"/,
    /band: data\.budget_band/,
  ]) {
    assert.match(route, contract);
  }
});

test("inquiry detail forwards only safe bound attachment metadata", () => {
  assert.deepEqual(attachmentColumns(route), [
    "id",
    "filename",
    "declared_mime_type",
    "sniffed_mime_type",
    "size_bytes",
    "computed_sha256",
    "upload_state",
    "scan_verdict",
    "attachment_ordinal",
    "bound_at",
  ]);
  assert.match(
    route,
    /\.from\("public_inquiry_uploads"\)[\s\S]*\.eq\("bound_inquiry_id", inquiryId\)[\s\S]*\.eq\("team_id", teamId\)[\s\S]*\.order\("attachment_ordinal"/,
  );
  assert.match(route, /contentHash: attachment\.computed_sha256/);
  assert.match(route, /scanVerdict: attachment\.scan_verdict/);
  assert.doesNotMatch(
    attachmentColumns(route).join(" "),
    /object|path|capability|token|idempotency|receipt|source_fingerprint/i,
  );
});

test("all inquiry detail responses are private, nosniff, and generic on failure", () => {
  assert.match(route, /"Cache-Control": "private, no-store"/);
  assert.match(route, /"X-Content-Type-Options": "nosniff"/);
  assert.match(route, /"Inquiry not found"[\s\S]*404/);
  assert.match(route, /"CRM inquiry is temporarily unavailable"[\s\S]*503/);
  assert.doesNotMatch(route, /error\.message|error\.details|error\.hint|console\./);
});
