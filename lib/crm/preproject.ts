import { createHash, createHmac } from "node:crypto";

export const PUBLIC_INQUIRY_SCHEMA_VERSION = "cco.public-inquiry.v1" as const;
export const PUBLIC_INQUIRY_MAX_BYTES = 16 * 1024;
export const PUBLIC_INQUIRY_REQUEST_SCHEMA_VERSION =
  "cco.public-inquiry-request.v2" as const;
export const PUBLIC_INQUIRY_REQUEST_MAX_BYTES = 24 * 1024;
export const CRM_MUTATION_MAX_BYTES = 64 * 1024;

export const CLIENT_REPORTED_BUDGET_BANDS = [
  "unknown",
  "under_10k",
  "10k_25k",
  "25k_50k",
  "50k_100k",
  "over_100k",
] as const;

export const INQUIRY_TIMELINE_FLEXIBILITY = [
  "fixed",
  "somewhat_flexible",
  "flexible",
  "unknown",
] as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FORM_KEY_PATTERN = /^ifm_[0-9a-f]{64}$/;
const IDEMPOTENCY_PATTERN = /^[a-z0-9][a-z0-9._:-]{15,127}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;
const POLICY_VERSION_PATTERN = /^[a-z0-9][a-z0-9._:-]{2,79}$/;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const RATE_LIMIT_HMAC_PREFIX =
  "hmac-sha256:cco-public-inquiry-rate-limit:v1:" as const;
const INTAKE_ATTACHMENT_BATCH_TOKEN_PATTERN = /^iatb_[0-9a-f]{64}$/;

type JsonObject = Record<string, unknown>;

export class PreProjectValidationError extends Error {
  readonly code: string;
  readonly field?: string;

  constructor(code: string, message: string, field?: string) {
    super(message);
    this.name = "PreProjectValidationError";
    this.code = code;
    this.field = field;
  }
}

export interface PublicInquirySubmission {
  schemaVersion: typeof PUBLIC_INQUIRY_SCHEMA_VERSION;
  formKey: string;
  idempotencyKey: string;
  contact: {
    name: string;
    email: string;
    phone: string | null;
  };
  company: {
    name: string;
    website: string | null;
  };
  project: {
    title: string;
    goals: string[];
    audiences: string[];
    requestedDeliverables: string[];
    references: string[];
    constraints: string[];
    notes: string | null;
  };
  timeline: {
    desiredStartDate: string | null;
    dueDate: string | null;
    flexibility: (typeof INQUIRY_TIMELINE_FLEXIBILITY)[number];
  };
  budgetSignal: {
    source: "client_reported";
    authority: "non_authoritative";
    band: (typeof CLIENT_REPORTED_BUDGET_BANDS)[number];
  };
  consent: {
    privacyAccepted: true;
    policyVersion: string;
    marketingEmailOptIn: boolean;
    operationalSmsOptIn: boolean;
    operationalImessageOptIn: boolean;
  };
}

export interface PublicInquiryAttachmentClaim {
  batchToken: string | null;
  attachments: Array<{
    attachmentId: string;
    contentHash: `sha256:${string}`;
  }>;
}

export interface PublicInquiryRequest {
  schemaVersion: typeof PUBLIC_INQUIRY_REQUEST_SCHEMA_VERSION;
  inquiry: PublicInquirySubmission;
  attachmentClaim: PublicInquiryAttachmentClaim;
}

export interface IntakeFormMutation {
  teamId: string;
  name: string;
  successMessage: string | null;
  requestId: string;
}

export interface InquiryQualificationMutation {
  expectedVersion: number;
  requestId: string;
  account: {
    displayName: string;
    legalName: string | null;
    website: string | null;
  };
  contact: {
    name: string;
    email: string;
    phone: string | null;
    title: string | null;
  };
  opportunity: {
    name: string;
    ownerId: string | null;
    probabilityBasisPoints: number;
    expectedCloseDate: string | null;
  };
  brief: {
    title: string;
    objectives: string[];
    audiences: string[];
    keyMessages: string[];
    requestedDeliverables: string[];
    constraints: string[];
    references: string[];
    successCriteria: string[];
  };
}

export interface OpportunityProposalRequestMutation {
  expectedVersion: number;
  requestId: string;
  sourceBriefRevisionId: string;
  sourceBriefContentHash: `sha256:${string}`;
}

export interface PublicInquiryReceipt {
  requestId: string;
  status: "received";
  replayed: boolean;
  attachmentCount: number;
}

export interface IntakeFormReceipt {
  formId: string;
  teamId: string;
  formKey: string;
  name: string;
  status: "active" | "disabled";
  successMessage: string | null;
  authorityVersion: number;
  requestId: string;
  createdAt: string;
  replayed: boolean;
}

export interface InquiryQualificationReceipt {
  mutationReceiptId: string;
  inquiryId: string;
  accountId: string;
  contactId: string;
  opportunityId: string;
  creativeBriefRevisionId: string;
  briefRevisionNumber: number;
  briefContentHash: string;
  mutationVersion: number;
  requestId: string;
  replayed: boolean;
}

export interface OpportunityProposalRequestReceipt {
  proposalRequestReceiptId: string;
  opportunityId: string;
  sourceInquiryId: string;
  sourceBriefRevisionId: string;
  sourceBriefRevisionNumber: number;
  readyBriefRevisionId: string;
  readyBriefRevisionNumber: number;
  briefContentHash: `sha256:${string}`;
  fromStage: "qualification" | "discovery" | "briefing";
  stage: "proposal_requested";
  authorityVersion: number;
  requestId: string;
  requestedAt: string;
  replayed: boolean;
}

function fail(code: string, message: string, field?: string): never {
  throw new PreProjectValidationError(code, message, field);
}

function objectValue(value: unknown, field: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("invalid_object", `${field} must be an object`, field);
  }
  return value as JsonObject;
}

function assertAllowedKeys(
  value: JsonObject,
  field: string,
  allowed: readonly string[],
) {
  const allowlist = new Set(allowed);
  const unknown = Object.keys(value).find((key) => !allowlist.has(key));
  if (unknown) {
    fail(
      "unknown_field",
      `${field}.${unknown} is not accepted`,
      `${field}.${unknown}`,
    );
  }
}

function boundedString(
  value: unknown,
  field: string,
  maxLength: number,
): string {
  if (typeof value !== "string") {
    fail("invalid_string", `${field} must be a string`, field);
  }
  const normalized = value.trim().replace(/\r\n?/g, "\n");
  if (
    !normalized ||
    normalized.length > maxLength ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(normalized)
  ) {
    fail(
      "invalid_string",
      `${field} must contain between 1 and ${maxLength} safe characters`,
      field,
    );
  }
  return normalized;
}

function optionalString(
  value: unknown,
  field: string,
  maxLength: number,
): string | null {
  if (value === undefined || value === null || value === "") return null;
  return boundedString(value, field, maxLength);
}

function booleanValue(value: unknown, field: string, fallback = false): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") {
    fail("invalid_boolean", `${field} must be a boolean`, field);
  }
  return value;
}

function exactUuid(value: unknown, field: string): string {
  const normalized = boundedString(value, field, 36).toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    fail("invalid_uuid", `${field} must be a UUID`, field);
  }
  return normalized;
}

export function normalizeCrmUuid(value: unknown, field: string): string {
  return exactUuid(value, field);
}

function emailValue(value: unknown, field: string): string {
  const normalized = boundedString(value, field, 254).toLowerCase();
  if (!EMAIL_PATTERN.test(normalized)) {
    fail("invalid_email", `${field} must be a valid email address`, field);
  }
  return normalized;
}

function phoneValue(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    fail("invalid_phone", `${field} must use E.164 format`, field);
  }
  const normalized = value.trim().replace(/[\s().-]/g, "");
  if (!E164_PATTERN.test(normalized)) {
    fail("invalid_phone", `${field} must use E.164 format`, field);
  }
  return normalized;
}

function httpsUrl(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  const raw = boundedString(value, field, 2_048);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    fail("invalid_url", `${field} must be an HTTPS URL`, field);
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    !parsed.hostname
  ) {
    fail("invalid_url", `${field} must be an HTTPS URL without credentials or a fragment`, field);
  }
  return parsed.toString();
}

function calendarDate(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  const normalized = boundedString(value, field, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (!match) fail("invalid_date", `${field} must use YYYY-MM-DD`, field);
  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== normalized) {
    fail("invalid_date", `${field} must be a real calendar date`, field);
  }
  return normalized;
}

function boundedStringArray(
  value: unknown,
  field: string,
  options: { min?: number; max: number; itemMax: number },
): string[] {
  if (!Array.isArray(value)) {
    fail("invalid_array", `${field} must be an array`, field);
  }
  const min = options.min ?? 0;
  if (value.length < min || value.length > options.max) {
    fail(
      "invalid_array",
      `${field} must contain between ${min} and ${options.max} items`,
      field,
    );
  }
  const normalized = value.map((item, index) =>
    boundedString(item, `${field}[${index}]`, options.itemMax),
  );
  if (new Set(normalized.map((item) => item.toLowerCase())).size !== normalized.length) {
    fail("duplicate_items", `${field} cannot contain duplicates`, field);
  }
  return normalized;
}

function referenceArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length > 12) {
    fail("invalid_array", `${field} must contain no more than 12 items`, field);
  }
  const normalized = value.map((item, index) => {
    const parsed = httpsUrl(item, `${field}[${index}]`);
    if (!parsed) fail("invalid_url", `${field}[${index}] is required`, `${field}[${index}]`);
    return parsed;
  });
  if (new Set(normalized).size !== normalized.length) {
    fail("duplicate_items", `${field} cannot contain duplicates`, field);
  }
  return normalized;
}

function enumValue<T extends readonly string[]>(
  value: unknown,
  field: string,
  allowed: T,
): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) {
    fail("invalid_enum", `${field} is invalid`, field);
  }
  return value as T[number];
}

function normalizeInquiryProject(value: unknown): PublicInquirySubmission["project"] {
  const project = objectValue(value, "submission.project");
  assertAllowedKeys(project, "submission.project", [
    "title",
    "goals",
    "audiences",
    "requestedDeliverables",
    "references",
    "constraints",
    "notes",
  ]);
  return {
    title: boundedString(project.title, "submission.project.title", 240),
    goals: boundedStringArray(project.goals, "submission.project.goals", {
      min: 1,
      max: 12,
      itemMax: 1_000,
    }),
    audiences: boundedStringArray(project.audiences, "submission.project.audiences", {
      max: 12,
      itemMax: 500,
    }),
    requestedDeliverables: boundedStringArray(
      project.requestedDeliverables,
      "submission.project.requestedDeliverables",
      { max: 24, itemMax: 500 },
    ),
    references: referenceArray(project.references, "submission.project.references"),
    constraints: boundedStringArray(
      project.constraints,
      "submission.project.constraints",
      { max: 20, itemMax: 1_000 },
    ),
    notes: optionalString(project.notes, "submission.project.notes", 4_000),
  };
}

export function parsePublicInquirySubmission(value: unknown): PublicInquirySubmission {
  const submission = objectValue(value, "submission");
  assertAllowedKeys(submission, "submission", [
    "schemaVersion",
    "formKey",
    "idempotencyKey",
    "contact",
    "company",
    "project",
    "timeline",
    "budgetSignal",
    "consent",
    "website",
  ]);

  if (submission.schemaVersion !== PUBLIC_INQUIRY_SCHEMA_VERSION) {
    fail("invalid_schema", "submission.schemaVersion is not supported", "submission.schemaVersion");
  }

  if (submission.website !== undefined && submission.website !== "") {
    fail("automated_submission", "Submission was not accepted");
  }

  const formKey = boundedString(submission.formKey, "submission.formKey", 68).toLowerCase();
  if (!FORM_KEY_PATTERN.test(formKey)) {
    fail("invalid_form_key", "submission.formKey is invalid", "submission.formKey");
  }
  const idempotencyKey = boundedString(
    submission.idempotencyKey,
    "submission.idempotencyKey",
    128,
  ).toLowerCase();
  if (!IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
    fail(
      "invalid_idempotency_key",
      "submission.idempotencyKey must be 16-128 lowercase safe characters",
      "submission.idempotencyKey",
    );
  }

  const contact = objectValue(submission.contact, "submission.contact");
  assertAllowedKeys(contact, "submission.contact", ["name", "email", "phone"]);

  const company = objectValue(submission.company, "submission.company");
  assertAllowedKeys(company, "submission.company", ["name", "website"]);

  const timeline = objectValue(submission.timeline, "submission.timeline");
  assertAllowedKeys(timeline, "submission.timeline", [
    "desiredStartDate",
    "dueDate",
    "flexibility",
  ]);
  const desiredStartDate = calendarDate(
    timeline.desiredStartDate,
    "submission.timeline.desiredStartDate",
  );
  const dueDate = calendarDate(timeline.dueDate, "submission.timeline.dueDate");
  if (desiredStartDate && dueDate && dueDate < desiredStartDate) {
    fail(
      "invalid_date_range",
      "submission.timeline.dueDate cannot precede desiredStartDate",
      "submission.timeline.dueDate",
    );
  }

  const budgetSignal = objectValue(
    submission.budgetSignal,
    "submission.budgetSignal",
  );
  assertAllowedKeys(budgetSignal, "submission.budgetSignal", ["band"]);

  const consent = objectValue(submission.consent, "submission.consent");
  assertAllowedKeys(consent, "submission.consent", [
    "privacyAccepted",
    "policyVersion",
    "marketingEmailOptIn",
    "operationalSmsOptIn",
    "operationalImessageOptIn",
  ]);
  if (consent.privacyAccepted !== true) {
    fail(
      "privacy_consent_required",
      "Privacy consent is required",
      "submission.consent.privacyAccepted",
    );
  }
  const policyVersion = boundedString(
    consent.policyVersion,
    "submission.consent.policyVersion",
    80,
  ).toLowerCase();
  if (!POLICY_VERSION_PATTERN.test(policyVersion)) {
    fail(
      "invalid_policy_version",
      "submission.consent.policyVersion is invalid",
      "submission.consent.policyVersion",
    );
  }

  const phone = phoneValue(contact.phone, "submission.contact.phone");
  const operationalSmsOptIn = booleanValue(
    consent.operationalSmsOptIn,
    "submission.consent.operationalSmsOptIn",
  );
  const operationalImessageOptIn = booleanValue(
    consent.operationalImessageOptIn,
    "submission.consent.operationalImessageOptIn",
  );
  if (!phone && (operationalSmsOptIn || operationalImessageOptIn)) {
    fail(
      "phone_consent_requires_phone",
      "A phone number is required for SMS or iMessage consent",
      "submission.contact.phone",
    );
  }

  return {
    schemaVersion: PUBLIC_INQUIRY_SCHEMA_VERSION,
    formKey,
    idempotencyKey,
    contact: {
      name: boundedString(contact.name, "submission.contact.name", 240),
      email: emailValue(contact.email, "submission.contact.email"),
      phone,
    },
    company: {
      name: boundedString(company.name, "submission.company.name", 240),
      website: httpsUrl(company.website, "submission.company.website"),
    },
    project: normalizeInquiryProject(submission.project),
    timeline: {
      desiredStartDate,
      dueDate,
      flexibility: enumValue(
        timeline.flexibility,
        "submission.timeline.flexibility",
        INQUIRY_TIMELINE_FLEXIBILITY,
      ),
    },
    budgetSignal: {
      source: "client_reported",
      authority: "non_authoritative",
      band: enumValue(
        budgetSignal.band,
        "submission.budgetSignal.band",
        CLIENT_REPORTED_BUDGET_BANDS,
      ),
    },
    consent: {
      privacyAccepted: true,
      policyVersion,
      marketingEmailOptIn: booleanValue(
        consent.marketingEmailOptIn,
        "submission.consent.marketingEmailOptIn",
      ),
      operationalSmsOptIn,
      operationalImessageOptIn,
    },
  };
}

function parsePublicInquiryAttachmentClaim(value: unknown): PublicInquiryAttachmentClaim {
  const claim = objectValue(value, "request.attachmentClaim");
  assertAllowedKeys(claim, "request.attachmentClaim", ["batchToken", "attachments"]);
  if (!Array.isArray(claim.attachments) || claim.attachments.length > 8) {
    fail(
      "invalid_attachment_claim",
      "request.attachmentClaim.attachments must contain no more than 8 items",
      "request.attachmentClaim.attachments",
    );
  }

  if (claim.attachments.length === 0) {
    if (claim.batchToken !== null) {
      fail(
        "invalid_attachment_claim",
        "An empty attachment claim cannot include a batch token",
        "request.attachmentClaim.batchToken",
      );
    }
    return { batchToken: null, attachments: [] };
  }

  const batchToken = boundedString(
    claim.batchToken,
    "request.attachmentClaim.batchToken",
    69,
  ).toLowerCase();
  if (!INTAKE_ATTACHMENT_BATCH_TOKEN_PATTERN.test(batchToken)) {
    fail(
      "invalid_attachment_claim",
      "request.attachmentClaim.batchToken is invalid",
      "request.attachmentClaim.batchToken",
    );
  }

  const attachmentIds = new Set<string>();
  const attachments = claim.attachments.map((entry, index) => {
    const attachment = objectValue(
      entry,
      `request.attachmentClaim.attachments[${index}]`,
    );
    assertAllowedKeys(attachment, `request.attachmentClaim.attachments[${index}]`, [
      "attachmentId",
      "contentHash",
    ]);
    const attachmentId = exactUuid(
      attachment.attachmentId,
      `request.attachmentClaim.attachments[${index}].attachmentId`,
    );
    const contentHash = boundedString(
      attachment.contentHash,
      `request.attachmentClaim.attachments[${index}].contentHash`,
      71,
    ).toLowerCase();
    if (!SHA256_PATTERN.test(contentHash) || attachmentIds.has(attachmentId)) {
      fail(
        "invalid_attachment_claim",
        "Attachment claims require unique IDs and SHA-256 content hashes",
        `request.attachmentClaim.attachments[${index}]`,
      );
    }
    attachmentIds.add(attachmentId);
    return {
      attachmentId,
      contentHash: contentHash as `sha256:${string}`,
    };
  });

  return { batchToken, attachments };
}

export function parsePublicInquiryRequest(value: unknown): PublicInquiryRequest {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as JsonObject).schemaVersion === PUBLIC_INQUIRY_SCHEMA_VERSION
  ) {
    return {
      schemaVersion: PUBLIC_INQUIRY_REQUEST_SCHEMA_VERSION,
      inquiry: parsePublicInquirySubmission(value),
      attachmentClaim: { batchToken: null, attachments: [] },
    };
  }

  const request = objectValue(value, "request");
  assertAllowedKeys(request, "request", ["schemaVersion", "inquiry", "attachmentClaim"]);
  if (request.schemaVersion !== PUBLIC_INQUIRY_REQUEST_SCHEMA_VERSION) {
    fail("invalid_schema", "request.schemaVersion is not supported", "request.schemaVersion");
  }
  return {
    schemaVersion: PUBLIC_INQUIRY_REQUEST_SCHEMA_VERSION,
    inquiry: parsePublicInquirySubmission(request.inquiry),
    attachmentClaim: parsePublicInquiryAttachmentClaim(request.attachmentClaim),
  };
}

export function parseIntakeFormMutation(value: unknown): IntakeFormMutation {
  const body = objectValue(value, "request");
  assertAllowedKeys(body, "request", ["teamId", "name", "successMessage", "requestId"]);
  return {
    teamId: exactUuid(body.teamId, "request.teamId"),
    name: boundedString(body.name, "request.name", 160),
    successMessage: optionalString(body.successMessage, "request.successMessage", 500),
    requestId: exactUuid(body.requestId, "request.requestId"),
  };
}

function probabilityBasisPoints(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 10_000) {
    fail(
      "invalid_probability",
      "request.opportunity.probabilityBasisPoints must be an integer from 0 to 10000",
      "request.opportunity.probabilityBasisPoints",
    );
  }
  return Number(value);
}

export function parseInquiryQualificationMutation(
  value: unknown,
): InquiryQualificationMutation {
  const body = objectValue(value, "request");
  assertAllowedKeys(body, "request", [
    "expectedVersion",
    "requestId",
    "account",
    "contact",
    "opportunity",
    "brief",
  ]);
  if (
    !Number.isInteger(body.expectedVersion) ||
    Number(body.expectedVersion) < 1 ||
    Number(body.expectedVersion) > 2_147_483_647
  ) {
    fail(
      "invalid_version",
      "request.expectedVersion must be a positive integer",
      "request.expectedVersion",
    );
  }

  const account = objectValue(body.account, "request.account");
  assertAllowedKeys(account, "request.account", ["displayName", "legalName", "website"]);
  const contact = objectValue(body.contact, "request.contact");
  assertAllowedKeys(contact, "request.contact", ["name", "email", "phone", "title"]);
  const opportunity = objectValue(body.opportunity, "request.opportunity");
  assertAllowedKeys(opportunity, "request.opportunity", [
    "name",
    "ownerId",
    "probabilityBasisPoints",
    "expectedCloseDate",
  ]);
  const brief = objectValue(body.brief, "request.brief");
  assertAllowedKeys(brief, "request.brief", [
    "title",
    "objectives",
    "audiences",
    "keyMessages",
    "requestedDeliverables",
    "constraints",
    "references",
    "successCriteria",
  ]);

  return {
    expectedVersion: Number(body.expectedVersion),
    requestId: exactUuid(body.requestId, "request.requestId"),
    account: {
      displayName: boundedString(account.displayName, "request.account.displayName", 240),
      legalName: optionalString(account.legalName, "request.account.legalName", 240),
      website: httpsUrl(account.website, "request.account.website"),
    },
    contact: {
      name: boundedString(contact.name, "request.contact.name", 240),
      email: emailValue(contact.email, "request.contact.email"),
      phone: phoneValue(contact.phone, "request.contact.phone"),
      title: optionalString(contact.title, "request.contact.title", 160),
    },
    opportunity: {
      name: boundedString(opportunity.name, "request.opportunity.name", 240),
      ownerId:
        opportunity.ownerId === undefined || opportunity.ownerId === null
          ? null
          : exactUuid(opportunity.ownerId, "request.opportunity.ownerId"),
      probabilityBasisPoints: probabilityBasisPoints(opportunity.probabilityBasisPoints),
      expectedCloseDate: calendarDate(
        opportunity.expectedCloseDate,
        "request.opportunity.expectedCloseDate",
      ),
    },
    brief: {
      title: boundedString(brief.title, "request.brief.title", 240),
      objectives: boundedStringArray(brief.objectives, "request.brief.objectives", {
        min: 1,
        max: 20,
        itemMax: 1_000,
      }),
      audiences: boundedStringArray(brief.audiences, "request.brief.audiences", {
        max: 20,
        itemMax: 500,
      }),
      keyMessages: boundedStringArray(brief.keyMessages, "request.brief.keyMessages", {
        max: 20,
        itemMax: 1_000,
      }),
      requestedDeliverables: boundedStringArray(
        brief.requestedDeliverables,
        "request.brief.requestedDeliverables",
        { max: 32, itemMax: 500 },
      ),
      constraints: boundedStringArray(brief.constraints, "request.brief.constraints", {
        max: 24,
        itemMax: 1_000,
      }),
      references: referenceArray(brief.references, "request.brief.references"),
      successCriteria: boundedStringArray(
        brief.successCriteria,
        "request.brief.successCriteria",
        { max: 20, itemMax: 1_000 },
      ),
    },
  };
}

export function parseOpportunityProposalRequestMutation(
  value: unknown,
): OpportunityProposalRequestMutation {
  const body = objectValue(value, "request");
  assertAllowedKeys(body, "request", [
    "expectedVersion",
    "requestId",
    "sourceBriefRevisionId",
    "sourceBriefContentHash",
  ]);
  if (
    !Number.isInteger(body.expectedVersion) ||
    Number(body.expectedVersion) < 1 ||
    Number(body.expectedVersion) > 2_147_483_646
  ) {
    fail(
      "invalid_version",
      "request.expectedVersion must be an incrementable positive integer",
      "request.expectedVersion",
    );
  }
  if (
    typeof body.sourceBriefContentHash !== "string" ||
    !SHA256_PATTERN.test(body.sourceBriefContentHash)
  ) {
    fail(
      "invalid_hash",
      "request.sourceBriefContentHash must be a complete SHA-256 reference",
      "request.sourceBriefContentHash",
    );
  }
  return {
    expectedVersion: Number(body.expectedVersion),
    requestId: exactUuid(body.requestId, "request.requestId"),
    sourceBriefRevisionId: exactUuid(
      body.sourceBriefRevisionId,
      "request.sourceBriefRevisionId",
    ),
    sourceBriefContentHash:
      body.sourceBriefContentHash as `sha256:${string}`,
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as JsonObject)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson((value as JsonObject)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function hashPreProjectPayload(value: unknown): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(stableJson(value), "utf8").digest("hex")}`;
}

export function createInquiryFingerprint(input: {
  secret: string;
  edgeAddress: string;
}): `${typeof RATE_LIMIT_HMAC_PREFIX}${string}` {
  if (Buffer.byteLength(input.secret, "utf8") < 32) {
    fail("fingerprint_authority_unavailable", "Inquiry fingerprint authority is unavailable");
  }
  const address = input.edgeAddress.trim();
  if (!address || address.length > 128 || /[\u0000-\u001f\u007f]/.test(address)) {
    fail("untrusted_edge_address", "Trusted edge address is unavailable");
  }
  return `${RATE_LIMIT_HMAC_PREFIX}${createHmac("sha256", input.secret)
    .update(`cco-public-inquiry-rate-limit:v1\0${address}`, "utf8")
    .digest("hex")}`;
}

function rpcRecord(value: unknown): Record<string, unknown> | null {
  const row = Array.isArray(value) ? value[0] : value;
  return row && typeof row === "object" && !Array.isArray(row)
    ? (row as Record<string, unknown>)
    : null;
}

function rpcUuid(value: unknown): string | null {
  return typeof value === "string" && UUID_PATTERN.test(value)
    ? value.toLowerCase()
    : null;
}

function rpcPositiveInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : null;
}

export function parsePublicInquiryReceipt(
  value: unknown,
): PublicInquiryReceipt | null {
  const row = rpcRecord(value);
  if (
    !row ||
    row.status !== "received" ||
    typeof row.request_id !== "string" ||
    !UUID_PATTERN.test(row.request_id) ||
    typeof row.replayed !== "boolean"
  ) {
    return null;
  }
  return {
    requestId: row.request_id.toLowerCase(),
    status: "received",
    replayed: row.replayed,
    attachmentCount:
      Number.isSafeInteger(row.attachment_count) && Number(row.attachment_count) >= 0
        ? Number(row.attachment_count)
        : 0,
  };
}

export function parseIntakeFormReceipt(value: unknown): IntakeFormReceipt | null {
  const row = rpcRecord(value);
  const formId = rpcUuid(row?.form_id);
  const teamId = rpcUuid(row?.team_id);
  const requestId = rpcUuid(row?.request_id);
  const authorityVersion = rpcPositiveInteger(row?.authority_version);
  if (
    !row ||
    !formId ||
    !teamId ||
    !requestId ||
    !authorityVersion ||
    typeof row.form_key !== "string" ||
    !FORM_KEY_PATTERN.test(row.form_key) ||
    typeof row.name !== "string" ||
    (row.status !== "active" && row.status !== "disabled") ||
    (row.success_message !== null && typeof row.success_message !== "string") ||
    typeof row.created_at !== "string" ||
    !Number.isFinite(Date.parse(row.created_at)) ||
    typeof row.replayed !== "boolean"
  ) {
    return null;
  }
  return {
    formId,
    teamId,
    formKey: row.form_key,
    name: row.name,
    status: row.status,
    successMessage: row.success_message,
    authorityVersion,
    requestId,
    createdAt: new Date(row.created_at).toISOString(),
    replayed: row.replayed,
  };
}

export function parseInquiryQualificationReceipt(
  value: unknown,
): InquiryQualificationReceipt | null {
  const row = rpcRecord(value);
  const mutationReceiptId = rpcUuid(row?.mutation_receipt_id);
  const inquiryId = rpcUuid(row?.inquiry_id);
  const accountId = rpcUuid(row?.account_id);
  const contactId = rpcUuid(row?.contact_id);
  const opportunityId = rpcUuid(row?.opportunity_id);
  const creativeBriefRevisionId = rpcUuid(row?.creative_brief_revision_id);
  const requestId = rpcUuid(row?.request_id);
  const briefRevisionNumber = rpcPositiveInteger(row?.brief_revision_number);
  const mutationVersion = rpcPositiveInteger(row?.mutation_version);
  if (
    !row ||
    !mutationReceiptId ||
    !inquiryId ||
    !accountId ||
    !contactId ||
    !opportunityId ||
    !creativeBriefRevisionId ||
    !requestId ||
    !briefRevisionNumber ||
    !mutationVersion ||
    typeof row.brief_content_hash !== "string" ||
    !SHA256_PATTERN.test(row.brief_content_hash) ||
    typeof row.replayed !== "boolean"
  ) {
    return null;
  }
  return {
    mutationReceiptId,
    inquiryId,
    accountId,
    contactId,
    opportunityId,
    creativeBriefRevisionId,
    briefRevisionNumber,
    briefContentHash: row.brief_content_hash,
    mutationVersion,
    requestId,
    replayed: row.replayed,
  };
}

export function parseOpportunityProposalRequestReceipt(
  value: unknown,
): OpportunityProposalRequestReceipt | null {
  const row = rpcRecord(value);
  const proposalRequestReceiptId = rpcUuid(row?.proposal_request_receipt_id);
  const opportunityId = rpcUuid(row?.opportunity_id);
  const sourceInquiryId = rpcUuid(row?.source_inquiry_id);
  const sourceBriefRevisionId = rpcUuid(row?.source_brief_revision_id);
  const readyBriefRevisionId = rpcUuid(row?.ready_brief_revision_id);
  const requestId = rpcUuid(row?.request_id);
  const sourceBriefRevisionNumber = rpcPositiveInteger(
    row?.source_brief_revision_number,
  );
  const readyBriefRevisionNumber = rpcPositiveInteger(
    row?.ready_brief_revision_number,
  );
  const authorityVersion = rpcPositiveInteger(row?.authority_version);
  if (
    !row ||
    !proposalRequestReceiptId ||
    !opportunityId ||
    !sourceInquiryId ||
    !sourceBriefRevisionId ||
    !readyBriefRevisionId ||
    !requestId ||
    !sourceBriefRevisionNumber ||
    !readyBriefRevisionNumber ||
    readyBriefRevisionNumber !== sourceBriefRevisionNumber + 1 ||
    !authorityVersion ||
    (row.from_stage !== "qualification" &&
      row.from_stage !== "discovery" &&
      row.from_stage !== "briefing") ||
    row.stage !== "proposal_requested" ||
    typeof row.brief_content_hash !== "string" ||
    !SHA256_PATTERN.test(row.brief_content_hash) ||
    typeof row.requested_at !== "string" ||
    !Number.isFinite(Date.parse(row.requested_at)) ||
    typeof row.replayed !== "boolean"
  ) {
    return null;
  }
  return {
    proposalRequestReceiptId,
    opportunityId,
    sourceInquiryId,
    sourceBriefRevisionId,
    sourceBriefRevisionNumber,
    readyBriefRevisionId,
    readyBriefRevisionNumber,
    briefContentHash: row.brief_content_hash as `sha256:${string}`,
    fromStage: row.from_stage,
    stage: "proposal_requested",
    authorityVersion,
    requestId,
    requestedAt: new Date(row.requested_at).toISOString(),
    replayed: row.replayed,
  };
}

export function isSameOriginPublicIntake(request: Request): boolean {
  const origin = request.headers.get("origin")?.trim();
  if (!origin) return process.env.NODE_ENV !== "production";
  try {
    const requestUrl = new URL(request.url);
    const originUrl = new URL(origin);
    return (
      originUrl.protocol === requestUrl.protocol &&
      originUrl.hostname.toLowerCase() === requestUrl.hostname.toLowerCase() &&
      originUrl.port === requestUrl.port
    );
  } catch {
    return false;
  }
}

export function trustedPublicIntakeEdgeAddress(request: Request): string | null {
  if (process.env.NODE_ENV === "production") {
    if (process.env.INTAKE_TRUSTED_EDGE !== "cloudflare") return null;
    return request.headers.get("cf-connecting-ip")?.trim() || null;
  }
  return (
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "local-development"
  );
}
