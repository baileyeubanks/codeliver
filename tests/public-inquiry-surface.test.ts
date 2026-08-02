import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(resolve(repositoryRoot, path), "utf8");
const page = read("app/inquire/[formKey]/page.tsx");
const form = read("app/inquire/[formKey]/InquiryForm.tsx");
const attachments = read("app/inquire/[formKey]/IntakeAttachments.tsx");
const styles = read("app/inquire/[formKey]/InquiryPage.module.css");
const proxy = read("proxy.ts");

test("public inquiry uses the supplied Co-VideoPro brand without importing the internal shell", () => {
  assert.match(page, /Co-VideoPro/);
  assert.match(form, /CoProductionBrand/);
  assert.match(form, /Secure inquiry/);
  assert.match(form, /Co-VideoPro by Content Co-op/);
  assert.doesNotMatch(form, /from "@\/components\/Shell"|<Shell/);
  assert.doesNotMatch(styles, /border-radius:\s*(?:9|[1-9][0-9]+)px/);
});

test("three-step surface validates contact, brief, timing, and explicit communication consent", () => {
  assert.match(form, /type Step = 1 \| 2 \| 3/);
  assert.match(form, /Contact and company/);
  assert.match(form, /Production brief/);
  assert.match(form, /Timing and permissions/);
  assert.match(form, /privacyAccepted/);
  assert.match(form, /operationalSmsOptIn/);
  assert.match(form, /operationalImessageOptIn/);
  assert.match(form, /disabled=\{!hasPhone\}/);
  assert.match(form, /dueDate < values\.desiredStartDate/);
  assert.match(form, /\^\\\+\[1-9\]\\d\{7,14\}\$/);
});

test("submission matches the immutable public inquiry contract and reuses identity only for identical content", () => {
  assert.match(form, /schemaVersion: "cco\.public-inquiry\.v1"/);
  assert.match(form, /formKey: normalizedKey/);
  assert.match(form, /budgetSignal: \{ band: values\.budgetBand \}/);
  assert.match(form, /policyVersion: PRIVACY_POLICY_VERSION/);
  assert.match(form, /schemaVersion: "cco\.public-inquiry-request\.v2"/);
  assert.match(form, /inquiry: submissionBase/);
  assert.match(form, /attachments: attachmentClaim\.attachments/);
  assert.match(form, /attachmentClaim,/);
  assert.match(form, /requestIdentity\.current\.fingerprint !== fingerprint/);
  assert.match(form, /idempotencyKey: requestIdentity\.current\.key/);
  assert.match(form, /fetch\("\/api\/intake\/inquiries"/);
  assert.match(form, /method: "POST"/);
  assert.match(form, /requestId: payload\.requestId/);
  assert.match(form, /typeof payload\.attachmentCount === "number"/);
});

test("reference files are hashed, resumable, bounded, and block progression while unresolved", () => {
  assert.match(form, /<IntakeAttachments/);
  assert.match(form, /attachmentGate\.busy/);
  assert.match(form, /attachmentGate\.hasErrors/);
  assert.match(attachments, /sha256\.create\(\)/);
  assert.match(attachments, /new Upload\(item\.file/);
  assert.match(attachments, /endpoint: "\/api\/intake\/uploads\/tus"/);
  assert.match(attachments, /"X-Intake-Upload-Capability": batchToken/);
  assert.match(attachments, /PUBLIC_INQUIRY_UPLOAD_MAX_FILES/);
  assert.match(attachments, /PUBLIC_INQUIRY_UPLOAD_MAX_TOTAL_BYTES/);
  assert.match(attachments, /Upload\.terminate/);
  assert.match(attachments, /CLAIMABLE_UPLOAD_STATES\.has\(uploadState\)/);
  assert.match(attachments, /uploadState === "rejected"/);
  assert.match(attachments, /status: "removing"/);
  assert.match(attachments, /getStatus\(\) === 404/);
  assert.match(attachments, /role="progressbar"/);
  assert.match(attachments, /Stored in quarantine/);
});

test("metadata and page routes are public only through exact form-key launch rules", () => {
  assert.match(form, /fetch\(`\/api\/intake\/forms\/\$\{encodeURIComponent\(normalizedKey\)\}`/);
  assert.match(form, /FORM_KEY_PATTERN = \/\^ifm_\[0-9a-f\]\{64\}\$\//);
  assert.match(proxy, /"\/inquire"/);
  assert.match(proxy, /"\/api\/intake\/forms"/);
  assert.match(proxy, /new RegExp\(`\^\/api\/intake\/forms\/\$\{FORM_KEY_PATH_SEGMENT\}\$`\)/);
  assert.match(proxy, /methods: \["GET"\]/);
  assert.doesNotMatch(proxy, /\^\\\/api\\\/intake\\\/forms\\\/\.\+/);
});

test("public inquiry keeps stable desktop and mobile compositions", () => {
  assert.match(styles, /grid-template-columns:\s*280px minmax\(0, 1fr\)/);
  assert.match(styles, /width:\s*min\(1120px, calc\(100% - 32px\)\)/);
  assert.match(styles, /@media \(max-width:\s*760px\)/);
  assert.match(styles, /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(max-width:\s*390px\)/);
  assert.match(styles, /grid-template-columns:\s*1fr/);
});
