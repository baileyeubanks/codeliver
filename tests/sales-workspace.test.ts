import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(resolve(repositoryRoot, path), "utf8");
const page = read("app/(dashboard)/sales/page.tsx");
const styles = read("app/(dashboard)/sales/SalesPage.module.css");
const navigation = read("components/navigation/navigation-model.ts");
const proxy = read("proxy.ts");
const formsRoute = read("app/api/crm/intake-forms/route.ts");

test("sales workspace stays inside the shared shell and role capability model", () => {
  assert.match(navigation, /id: "sales"[\s\S]*href: "\/sales"[\s\S]*capability: "sales:read"/);
  assert.match(navigation, /owner:[\s\S]*"sales:read"[\s\S]*"sales:qualify"/);
  assert.match(navigation, /admin:[\s\S]*"sales:read"[\s\S]*"sales:qualify"/);
  assert.match(navigation, /producer:[\s\S]*"sales:read"[\s\S]*"sales:qualify"/);
  assert.doesNotMatch(page, /<Shell|CoProductionBrand|workspace-header/);
  assert.match(page, /roleCan\(role, "sales:read"\)/);
  assert.match(page, /roleCan\(role, "sales:qualify"\)/);
});

test("production pipeline and inquiry reads stay team-bound and demo mode stays local", () => {
  assert.match(page, /identity\.context\?\.activeTeamId/);
  assert.match(page, /if \(demoMode\) \{[\s\S]*DEMO_SALES_PIPELINE/);
  assert.match(page, /\/api\/crm\/pipeline\?team_id=\$\{encodeURIComponent\(teamId\)\}&limit=100/);
  assert.match(page, /\/api\/crm\/inquiries\/\$\{encodeURIComponent\(selectedInquiryId\)\}\?team_id=\$\{encodeURIComponent\(teamId\)\}/);
  assert.doesNotMatch(page, /createClient|service_role|SUPABASE_SERVICE_ROLE_KEY/);
});

test("qualification sends one versioned idempotent CRM mutation", () => {
  assert.match(page, /expectedVersion: detail\.inquiry\.authorityVersion/);
  assert.match(page, /requestId: crypto\.randomUUID\(\)/);
  assert.match(page, /account: \{[\s\S]*contact: \{[\s\S]*opportunity: \{[\s\S]*brief: \{/);
  assert.match(page, /\/qualify`[\s\S]*method: "POST"/);
  assert.match(page, /account, contact, opportunity, and first brief revision/);
  assert.match(page, /expectedCloseDate: ""/);
  assert.doesNotMatch(page, /expectedCloseDate: inquiry\.timeline\.dueDate/);
});

test("proposal handoff is readiness-gated and keeps commercial authority outside Co-VideoPro", () => {
  assert.match(page, /\/proposal-context/);
  assert.match(page, /Request proposal/);
  assert.match(page, /method: "POST"/);
  assert.match(page, /sourceBriefRevisionId: selected\.brief_revision_id/);
  assert.match(page, /sourceBriefContentHash: selected\.brief_content_hash/);
  assert.match(page, /selected\.brief_status === "ready_for_proposal"/);
  assert.match(page, /Pricing stays in Proposal Studio/);
  assert.match(page, /pricingIncluded \? "Included" : "Proposal Studio authority"/);
  assert.doesNotMatch(page, /activateProposal|acceptProposal|proposal-handoffs/);
  assert.match(page, /proposalStudioImport\?\.requestedProductionWindow/);
  assert.match(page, /Requested production/);
  assert.match(page, /Timing flexibility/);
  assert.match(page, /Awaiting production authorization/);
  assert.match(page, /Proposal Studio must clear every required policy gate/);
  assert.match(page, /Activation evidence unavailable/);
  assert.match(page, /activation_authorization_receipt_id/);
  assert.match(page, /activated_project_id/);
  assert.doesNotMatch(page, /Authorize production|Override gate|Mark paid/);
});

test("active intake forms expose usable public inquiry links and launch gates remain narrow", () => {
  assert.match(formsRoute, /id, team_id, opaque_key, name, status/);
  assert.match(page, /\/inquire\/\$\{encodeURIComponent\(formKey\)\}/);
  assert.match(page, /Open form/);
  assert.match(page, /Copy inquiry link/);
  assert.match(page, /new URL\(href, window\.location\.origin\)\.toString\(\)/);
  assert.match(page, /form\.status === "active"/);
  assert.doesNotMatch(page, /Copy form key/);
  assert.match(proxy, /"\/inquire"/);
  assert.match(proxy, /"\/api\/intake\/forms"/);
  assert.match(proxy, /FORM_KEY_PATH_SEGMENT = "ifm_\[0-9A-Fa-f\]\{64\}"/);
  assert.match(proxy, /api\/intake\/forms\/\$\{FORM_KEY_PATH_SEGMENT\}\$`\),[\s\S]*methods: \["GET"\]/);
  assert.match(
    proxy,
    /api\/crm\/inquiries\/\$\{UUID_PATH_SEGMENT\}\$`\),[\s\S]*methods: \["GET"\]/,
  );
});

test("desktop table, mobile list, and accessible drawer are separate responsive compositions", () => {
  assert.match(page, /className=\{styles\.tableSurface\}/);
  assert.match(page, /className=\{styles\.mobileList\}/);
  assert.match(page, /role="dialog" aria-modal="true"/);
  assert.match(page, /useDialogFocus\(Boolean\(drawerMode\)/);
  assert.match(styles, /@media \(max-width: 760px\)/);
  assert.match(styles, /\.tableSurface \{\s*display: none;/);
  assert.match(styles, /\.mobileList \{\s*display: grid;/);
  assert.doesNotMatch(styles, /border-radius:\s*(?:9|[1-9][0-9]+)px/);
});
