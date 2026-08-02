import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const route = readFileSync(
  resolve(repositoryRoot, "app/api/intake/forms/[formKey]/route.ts"),
  "utf8",
);

const handlerStart = route.indexOf("export async function GET");
assert.notEqual(handlerStart, -1, "missing public intake form GET handler");
const handler = route.slice(handlerStart);

function assertOrdered(source: string, markers: readonly string[]) {
  let previous = -1;
  for (const marker of markers) {
    const current = source.indexOf(marker);
    assert.notEqual(current, -1, `missing route marker: ${marker}`);
    assert.ok(current > previous, `${marker} is out of fail-closed order`);
    previous = current;
  }
}

function selectedColumns(source: string): string[] {
  const match = /\.from\("intake_forms"\)[\s\S]*?\.select\(\s*"([^"]+)"/.exec(
    source,
  );
  assert.ok(match, "missing intake_forms select");
  return match[1].split(",").map((column) => column.trim());
}

test("form keys are normalized and strictly validated before authority or data access", () => {
  assert.match(route, /FORM_KEY_PATTERN = \/\^ifm_\[0-9a-f\]\{64\}\$\//);
  assertOrdered(handler, [
    "(await params).formKey.trim().toLowerCase()",
    "if (!FORM_KEY_PATTERN.test(formKey))",
    'getSupabaseDataSchema() !== "co_production"',
    "getSupabase()",
  ]);
  assert.match(
    handler,
    /if \(!FORM_KEY_PATTERN\.test\(formKey\)\) return formNotFound\(\)/,
  );
});

test("public metadata intentionally uses the service client behind co_production", () => {
  assert.match(route, /import \{ getSupabase \} from "@\/lib\/supabase"/);
  assert.match(
    handler,
    /getSupabaseDataSchema\(\) !== "co_production"[\s\S]*authorityUnavailable\(\)/,
  );
  assert.doesNotMatch(
    route,
    /requireStaffWithClient|createSupabaseBrowser|createServerClient|createClient\(/,
  );
});

test("lookup binds the opaque key and active status while selecting only public fields", () => {
  assert.deepEqual(selectedColumns(handler), ["name", "success_message"]);
  assert.match(
    handler,
    /\.from\("intake_forms"\)[\s\S]*\.eq\("opaque_key", formKey\)[\s\S]*\.eq\("status", "active"\)[\s\S]*\.maybeSingle\(\)/,
  );
});

test("success response is a narrow versioned form metadata DTO", () => {
  const successResponse = handler.slice(handler.lastIndexOf("return json({"));
  assert.match(
    successResponse,
    /schemaVersion: "cco\.public-intake-form-metadata\.v1"/,
  );
  assert.match(
    successResponse,
    /form: \{[\s\S]*name: data\.name,[\s\S]*successMessage: data\.success_message/,
  );
  assert.doesNotMatch(
    successResponse,
    /teamId|team_id|\bid\b|opaqueKey|opaque_key|rateLimit|rate_limit|authorityVersion|authority_version|createdBy|created_by|provider|details|hint/i,
  );
});

test("invalid, inactive, and missing forms share 404 while authority failures share 503", () => {
  assert.match(route, /function formNotFound\(\)[\s\S]*"Intake form not found"[\s\S]*404/);
  assert.match(
    route,
    /function authorityUnavailable\(\)[\s\S]*"Intake form metadata is temporarily unavailable"[\s\S]*503/,
  );
  assert.match(handler, /if \(!data\) return formNotFound\(\)/);
  assert.match(handler, /if \(error\) return authorityUnavailable\(\)/);
  assert.doesNotMatch(route, /error\.(?:message|details|hint|code)|console\./);
});

test("every metadata response disables caching and MIME sniffing", () => {
  assert.match(route, /"Cache-Control": "no-store"/);
  assert.match(route, /"X-Content-Type-Options": "nosniff"/);
  assert.match(
    route,
    /NextResponse\.json\(body, \{ status, headers: RESPONSE_HEADERS \}\)/,
  );
});
