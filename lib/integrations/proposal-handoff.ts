import {
  createHash,
  createHmac,
  createPublicKey,
  verify as verifySignature,
} from "node:crypto";

export const PROPOSAL_HANDOFF_SCHEMA_VERSION = "1.0.0" as const;
export const PROPOSAL_HANDOFF_ACTIVATION_SCHEMA_VERSION = "2.0.0" as const;
export const PROPOSAL_PRODUCTION_AUTHORIZATION_SCHEMA_VERSION =
  "cco.proposal-studio.production-authorization.v1" as const;
export const PROPOSAL_HANDOFF_MAX_BYTES = 512 * 1024;
export const PROPOSAL_ATTESTATION_MAX_TTL_MS = 15 * 60 * 1000;
export const PROPOSAL_RECEIVER_SECRET_BYTES = 32;
export const REQUIRED_PRODUCTION_MODULES = [
  "Co-Script",
  "Co-Edit",
  "Co-Deliver",
] as const;
export const REQUIRED_PRODUCTION_AUTHORIZATION_GATES = [
  "acceptance",
  "contract",
  "invoice",
  "deposit",
  "payment",
] as const;

export type ProposalHandoffIntent = "validate" | "activate";
export type ProposalHandoffSchemaVersion =
  | typeof PROPOSAL_HANDOFF_SCHEMA_VERSION
  | typeof PROPOSAL_HANDOFF_ACTIVATION_SCHEMA_VERSION;
export type ProductionModule = (typeof REQUIRED_PRODUCTION_MODULES)[number];
export type ProductionArtifactKind =
  | "production_manifest"
  | "brief"
  | "evidence_register"
  | "source";
export type ProductionAuthorizationGateName =
  (typeof REQUIRED_PRODUCTION_AUTHORIZATION_GATES)[number];
export type ProductionAuthorizationGateStatus = "satisfied" | "not_required";

export interface ProposalProductionAuthorization {
  schemaVersion: typeof PROPOSAL_PRODUCTION_AUTHORIZATION_SCHEMA_VERSION;
  receiptId: string;
  status: "authorized";
  policyVersion: string;
  authorizedAt: string;
  subject: {
    proposalRequestReceiptId: string;
    packageId: string;
    packageVersion: number;
    proposalVersionId: string;
    proposalContentHash: `sha256:${string}`;
    quoteVersionId: string;
    quoteContentHash: `sha256:${string}`;
    decisionReceiptId: string;
    opportunityId: string;
    readyBriefId: string;
    readyBriefContentHash: `sha256:${string}`;
  };
  gates: Array<{
    gate: ProductionAuthorizationGateName;
    status: ProductionAuthorizationGateStatus;
    evidenceReceiptId: string;
  }>;
}

export interface ProposalHandoffAttestation {
  keyId: string;
  issuedAt: string;
  expiresAt: string;
  nonce: string;
  payloadHash: `sha256:${string}`;
  signature: string;
}

export interface ProposalHandoffPayload {
  intent: ProposalHandoffIntent;
  sourceTenantId: string;
  idempotencyKey: string;
  packageId: string;
  packageVersion: number;
  proposalVersionId: string;
  proposalContentHash: `sha256:${string}`;
  quoteVersionId: string;
  quoteContentHash: `sha256:${string}`;
  displayNumber: string;
  approvalReceiptIds: string[];
  decisionReceipt: {
    id: string;
    decision: "accepted";
    actorId: string;
    decidedAt: string;
    consentTextVersion: string;
    viewReceiptId: string;
    requestId: string;
  };
  clientId: string;
  opportunityId: string;
  briefId: string;
  proposalRequestReceiptId?: string;
  origin?: {
    authority: "co-videopro-crm";
    inquiryId: string;
    accountId: string;
    accountAuthorityVersion: number;
    primaryContactId: string;
    contactAuthorityVersion: number;
    opportunityId: string;
    opportunityAuthorityVersion: number;
    briefRevisionId: string;
    briefRevisionNumber: number;
    briefContentHash: `sha256:${string}`;
  };
  project: {
    title: string;
    description: string | null;
    productionWindow: {
      startDate: string;
      dueDate: string;
      constraints: string[];
    };
  };
  scopeItemIds: string[];
  deliverables: Array<{
    id: string;
    title: string;
    acceptanceCriteria: string[];
  }>;
  productionModules: ProductionModule[];
  artifactRefs: Array<{
    kind: ProductionArtifactKind;
    artifactId: string;
    sha256: string;
    classification: "production_safe";
  }>;
  coCreditBudget: null | {
    credits: number;
    policyVersion: string;
  };
  productionAuthorization?: ProposalProductionAuthorization;
}

export interface ProposalHandoffRequest {
  schemaVersion: ProposalHandoffSchemaVersion;
  attestation: ProposalHandoffAttestation;
  payload: ProposalHandoffPayload;
}

export class ProposalHandoffValidationError extends Error {
  readonly code: string;
  readonly field?: string;

  constructor(code: string, message: string, field?: string) {
    super(message);
    this.name = "ProposalHandoffValidationError";
    this.code = code;
    this.field = field;
  }
}

type JsonObject = Record<string, unknown>;

const COMMERCIAL_DENYLIST = new Set(
  [
    "totalCents",
    "currency",
    "lineItems",
    "quantity",
    "unitPriceCents",
    "lineTotalCents",
    "subtotalCents",
    "adjustmentTotalCents",
    "preTaxTotalCents",
    "taxCents",
    "adjustments",
    "depositMilestones",
    "rateCardVersionId",
    "internalUnitCostCents",
    "internalCostCents",
    "grossMarginCents",
    "grossMarginBasisPoints",
    "sourceDeclaredTotalCents",
    "budget_cents",
    "value_cents",
    "invoice",
    "invoiceId",
    "payment",
    "paymentIntent",
    "deposit",
    "charge",
    "stripe",
  ].map((key) => key.toLowerCase()),
);

function objectValue(value: unknown, field: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProposalHandoffValidationError(
      "invalid_object",
      `${field} must be an object`,
      field,
    );
  }
  return value as JsonObject;
}

function assertAllowedKeys(
  value: JsonObject,
  field: string,
  allowed: readonly string[],
) {
  const allowedKeys = new Set(allowed);
  const unknown = Object.keys(value).find((key) => !allowedKeys.has(key));
  if (unknown) {
    throw new ProposalHandoffValidationError(
      "unknown_field",
      `${field}.${unknown} is not part of the Proposal Studio handoff contract`,
      `${field}.${unknown}`,
    );
  }
}

function rejectCommercialOrDeepFields(
  value: unknown,
  field = "request",
  depth = 0,
) {
  if (depth > 16) {
    throw new ProposalHandoffValidationError(
      "payload_too_deep",
      "Proposal handoff nesting exceeds the allowed depth",
      field,
    );
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      rejectCommercialOrDeepFields(value[index], `${field}[${index}]`, depth + 1);
    }
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value as JsonObject)) {
    if (COMMERCIAL_DENYLIST.has(key.toLowerCase())) {
      throw new ProposalHandoffValidationError(
        "commercial_field_forbidden",
        `${field}.${key} belongs to CCO OS and cannot enter Co-VideoPro`,
        `${field}.${key}`,
      );
    }
    rejectCommercialOrDeepFields(item, `${field}.${key}`, depth + 1);
  }
}

function stringValue(
  value: unknown,
  field: string,
  maxLength = 240,
): string {
  if (typeof value !== "string") {
    throw new ProposalHandoffValidationError(
      "invalid_string",
      `${field} must be a string`,
      field,
    );
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new ProposalHandoffValidationError(
      "invalid_string",
      `${field} must contain between 1 and ${maxLength} characters`,
      field,
    );
  }
  return normalized;
}

function optionalStringValue(
  value: unknown,
  field: string,
  maxLength: number,
): string | null {
  if (value === undefined || value === null || value === "") return null;
  return stringValue(value, field, maxLength);
}

function positiveInteger(
  value: unknown,
  field: string,
  max = Number.MAX_SAFE_INTEGER,
): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > max) {
    throw new ProposalHandoffValidationError(
      "invalid_integer",
      `${field} must be a positive integer no greater than ${max}`,
      field,
    );
  }
  return Number(value);
}

function stringArray(
  value: unknown,
  field: string,
  options: { min: number; max: number; itemMax?: number; unique?: boolean },
): string[] {
  if (!Array.isArray(value) || value.length < options.min || value.length > options.max) {
    throw new ProposalHandoffValidationError(
      "invalid_array",
      `${field} must contain between ${options.min} and ${options.max} items`,
      field,
    );
  }
  const items = value.map((item, index) =>
    stringValue(item, `${field}[${index}]`, options.itemMax ?? 240),
  );
  if (options.unique && new Set(items).size !== items.length) {
    throw new ProposalHandoffValidationError(
      "duplicate_items",
      `${field} cannot contain duplicate values`,
      field,
    );
  }
  return items;
}

function sha256Reference(value: unknown, field: string): `sha256:${string}` {
  const hash = stringValue(value, field, 135).toLowerCase();
  if (!/^sha256:[a-f0-9]{64}$/.test(hash)) {
    throw new ProposalHandoffValidationError(
      "invalid_sha256_reference",
      `${field} must contain a complete SHA-256 reference`,
      field,
    );
  }
  return hash as `sha256:${string}`;
}

function uuidReference(value: unknown, field: string): string {
  const id = stringValue(value, field, 36).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) {
    throw new ProposalHandoffValidationError(
      "invalid_uuid_reference",
      `${field} must be a UUID`,
      field,
    );
  }
  return id;
}

function parseOrigin(
  value: unknown,
): NonNullable<ProposalHandoffPayload["origin"]> {
  const origin = objectValue(value, "payload.origin");
  assertAllowedKeys(origin, "payload.origin", [
    "authority",
    "inquiryId",
    "accountId",
    "accountAuthorityVersion",
    "primaryContactId",
    "contactAuthorityVersion",
    "opportunityId",
    "opportunityAuthorityVersion",
    "briefRevisionId",
    "briefRevisionNumber",
    "briefContentHash",
  ]);
  if (origin.authority !== "co-videopro-crm") {
    throw new ProposalHandoffValidationError(
      "invalid_origin_authority",
      "payload.origin must be issued by Co-VideoPro CRM",
      "payload.origin.authority",
    );
  }
  return {
    authority: "co-videopro-crm",
    inquiryId: uuidReference(origin.inquiryId, "payload.origin.inquiryId"),
    accountId: uuidReference(origin.accountId, "payload.origin.accountId"),
    accountAuthorityVersion: positiveInteger(
      origin.accountAuthorityVersion,
      "payload.origin.accountAuthorityVersion",
      2_147_483_647,
    ),
    primaryContactId: uuidReference(
      origin.primaryContactId,
      "payload.origin.primaryContactId",
    ),
    contactAuthorityVersion: positiveInteger(
      origin.contactAuthorityVersion,
      "payload.origin.contactAuthorityVersion",
      2_147_483_647,
    ),
    opportunityId: uuidReference(
      origin.opportunityId,
      "payload.origin.opportunityId",
    ),
    opportunityAuthorityVersion: positiveInteger(
      origin.opportunityAuthorityVersion,
      "payload.origin.opportunityAuthorityVersion",
      2_147_483_647,
    ),
    briefRevisionId: uuidReference(
      origin.briefRevisionId,
      "payload.origin.briefRevisionId",
    ),
    briefRevisionNumber: positiveInteger(
      origin.briefRevisionNumber,
      "payload.origin.briefRevisionNumber",
      2_147_483_647,
    ),
    briefContentHash: sha256Reference(
      origin.briefContentHash,
      "payload.origin.briefContentHash",
    ),
  };
}

function artifactSha256(value: unknown, field: string): string {
  const hash = stringValue(value, field, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    throw new ProposalHandoffValidationError(
      "invalid_artifact_hash",
      `${field} must be a 64-character SHA-256 digest`,
      field,
    );
  }
  return hash;
}

function validCalendarDate(value: unknown, field: string): string {
  const date = stringValue(value, field, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    throw new ProposalHandoffValidationError(
      "invalid_date",
      `${field} must use YYYY-MM-DD`,
      field,
    );
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new ProposalHandoffValidationError(
      "invalid_date",
      `${field} is not a real calendar date`,
      field,
    );
  }
  return date;
}

function isoTimestamp(value: unknown, field: string): string {
  const timestamp = stringValue(value, field, 64);
  if (Number.isNaN(Date.parse(timestamp))) {
    throw new ProposalHandoffValidationError(
      "invalid_timestamp",
      `${field} must be an ISO timestamp`,
      field,
    );
  }
  return timestamp;
}

function parseDecision(value: unknown): ProposalHandoffPayload["decisionReceipt"] {
  const decision = objectValue(value, "payload.decisionReceipt");
  assertAllowedKeys(decision, "payload.decisionReceipt", [
    "id",
    "decision",
    "actorId",
    "decidedAt",
    "consentTextVersion",
    "viewReceiptId",
    "requestId",
  ]);
  if (decision.decision !== "accepted") {
    throw new ProposalHandoffValidationError(
      "proposal_not_accepted",
      "Co-VideoPro activation requires an accepted client decision",
      "payload.decisionReceipt.decision",
    );
  }
  return {
    id: stringValue(decision.id, "payload.decisionReceipt.id"),
    decision: "accepted",
    actorId: stringValue(decision.actorId, "payload.decisionReceipt.actorId"),
    decidedAt: isoTimestamp(decision.decidedAt, "payload.decisionReceipt.decidedAt"),
    consentTextVersion: stringValue(
      decision.consentTextVersion,
      "payload.decisionReceipt.consentTextVersion",
    ),
    viewReceiptId: stringValue(
      decision.viewReceiptId,
      "payload.decisionReceipt.viewReceiptId",
    ),
    requestId: stringValue(
      decision.requestId,
      "payload.decisionReceipt.requestId",
    ),
  };
}

type ProductionAuthorizationBinding = {
  proposalRequestReceiptId: string;
  packageId: string;
  packageVersion: number;
  proposalVersionId: string;
  proposalContentHash: `sha256:${string}`;
  quoteVersionId: string;
  quoteContentHash: `sha256:${string}`;
  decisionReceiptId: string;
  opportunityId: string;
  readyBriefId: string;
  readyBriefContentHash: `sha256:${string}`;
};

function parseProductionAuthorizationGates(
  value: unknown,
): ProposalProductionAuthorization["gates"] {
  const field = "payload.productionAuthorization.gates";
  if (
    !Array.isArray(value) ||
    value.length !== REQUIRED_PRODUCTION_AUTHORIZATION_GATES.length
  ) {
    throw new ProposalHandoffValidationError(
      "invalid_production_authorization_gates",
      "Production authorization requires exactly five gates",
      field,
    );
  }

  const allowedGates = new Set<ProductionAuthorizationGateName>(
    REQUIRED_PRODUCTION_AUTHORIZATION_GATES,
  );
  const seen = new Set<ProductionAuthorizationGateName>();
  const gates = value.map((raw, index) => {
    const gateField = `${field}[${index}]`;
    const item = objectValue(raw, gateField);
    assertAllowedKeys(item, gateField, [
      "gate",
      "status",
      "evidenceReceiptId",
    ]);
    if (
      typeof item.gate !== "string" ||
      !allowedGates.has(item.gate as ProductionAuthorizationGateName)
    ) {
      throw new ProposalHandoffValidationError(
        "invalid_production_authorization_gate",
        "Authorization gates must be acceptance, contract, invoice, deposit, or payment",
        `${gateField}.gate`,
      );
    }
    const gate = item.gate as ProductionAuthorizationGateName;
    if (seen.has(gate)) {
      throw new ProposalHandoffValidationError(
        "duplicate_production_authorization_gate",
        "Production authorization gate names must be unique",
        `${gateField}.gate`,
      );
    }
    seen.add(gate);
    if (item.status !== "satisfied" && item.status !== "not_required") {
      throw new ProposalHandoffValidationError(
        "production_authorization_gate_not_complete",
        "Every production authorization gate must be satisfied or not_required",
        `${gateField}.status`,
      );
    }
    const status = item.status as ProductionAuthorizationGateStatus;
    return {
      gate,
      status,
      evidenceReceiptId: stringValue(
        item.evidenceReceiptId,
        `${gateField}.evidenceReceiptId`,
      ),
    };
  });

  if (
    REQUIRED_PRODUCTION_AUTHORIZATION_GATES.some((gate) => !seen.has(gate))
  ) {
    throw new ProposalHandoffValidationError(
      "invalid_production_authorization_gates",
      "Production authorization must include each required gate exactly once",
      field,
    );
  }

  const acceptanceIndex = gates.findIndex((gate) => gate.gate === "acceptance");
  if (
    acceptanceIndex < 0 ||
    gates[acceptanceIndex].status !== "satisfied"
  ) {
    throw new ProposalHandoffValidationError(
      "acceptance_gate_not_satisfied",
      "The acceptance production gate must be satisfied",
      `${field}[${acceptanceIndex}].status`,
    );
  }
  return gates;
}

function parseProductionAuthorization(
  value: unknown,
  binding: ProductionAuthorizationBinding,
): ProposalProductionAuthorization {
  const field = "payload.productionAuthorization";
  const authorization = objectValue(value, field);
  assertAllowedKeys(authorization, field, [
    "schemaVersion",
    "receiptId",
    "status",
    "policyVersion",
    "authorizedAt",
    "subject",
    "gates",
  ]);
  if (
    authorization.schemaVersion !==
    PROPOSAL_PRODUCTION_AUTHORIZATION_SCHEMA_VERSION
  ) {
    throw new ProposalHandoffValidationError(
      "invalid_production_authorization_schema",
      `productionAuthorization.schemaVersion must be ${PROPOSAL_PRODUCTION_AUTHORIZATION_SCHEMA_VERSION}`,
      `${field}.schemaVersion`,
    );
  }
  if (authorization.status !== "authorized") {
    throw new ProposalHandoffValidationError(
      "production_authorization_not_authorized",
      "Production activation requires an authorized production receipt",
      `${field}.status`,
    );
  }

  const subjectField = `${field}.subject`;
  const rawSubject = objectValue(authorization.subject, subjectField);
  assertAllowedKeys(rawSubject, subjectField, [
    "proposalRequestReceiptId",
    "packageId",
    "packageVersion",
    "proposalVersionId",
    "proposalContentHash",
    "quoteVersionId",
    "quoteContentHash",
    "decisionReceiptId",
    "opportunityId",
    "readyBriefId",
    "readyBriefContentHash",
  ]);
  const subject: ProposalProductionAuthorization["subject"] = {
    proposalRequestReceiptId: uuidReference(
      rawSubject.proposalRequestReceiptId,
      `${subjectField}.proposalRequestReceiptId`,
    ),
    packageId: stringValue(rawSubject.packageId, `${subjectField}.packageId`),
    packageVersion: positiveInteger(
      rawSubject.packageVersion,
      `${subjectField}.packageVersion`,
      2_147_483_647,
    ),
    proposalVersionId: stringValue(
      rawSubject.proposalVersionId,
      `${subjectField}.proposalVersionId`,
    ),
    proposalContentHash: sha256Reference(
      rawSubject.proposalContentHash,
      `${subjectField}.proposalContentHash`,
    ),
    quoteVersionId: stringValue(
      rawSubject.quoteVersionId,
      `${subjectField}.quoteVersionId`,
    ),
    quoteContentHash: sha256Reference(
      rawSubject.quoteContentHash,
      `${subjectField}.quoteContentHash`,
    ),
    decisionReceiptId: stringValue(
      rawSubject.decisionReceiptId,
      `${subjectField}.decisionReceiptId`,
    ),
    opportunityId: uuidReference(
      rawSubject.opportunityId,
      `${subjectField}.opportunityId`,
    ),
    readyBriefId: uuidReference(
      rawSubject.readyBriefId,
      `${subjectField}.readyBriefId`,
    ),
    readyBriefContentHash: sha256Reference(
      rawSubject.readyBriefContentHash,
      `${subjectField}.readyBriefContentHash`,
    ),
  };

  for (const [key, expected] of Object.entries(binding)) {
    if (subject[key as keyof typeof subject] !== expected) {
      throw new ProposalHandoffValidationError(
        "production_authorization_binding_mismatch",
        "Production authorization must bind the exact proposal handoff subject",
        `${subjectField}.${key}`,
      );
    }
  }

  const gates = parseProductionAuthorizationGates(authorization.gates);
  const acceptanceIndex = gates.findIndex((gate) => gate.gate === "acceptance");
  if (
    gates[acceptanceIndex]?.evidenceReceiptId !== subject.decisionReceiptId
  ) {
    throw new ProposalHandoffValidationError(
      "production_authorization_binding_mismatch",
      "The acceptance gate must cite the bound decision receipt",
      `${field}.gates[${acceptanceIndex}].evidenceReceiptId`,
    );
  }

  return {
    schemaVersion: PROPOSAL_PRODUCTION_AUTHORIZATION_SCHEMA_VERSION,
    receiptId: stringValue(authorization.receiptId, `${field}.receiptId`),
    status: "authorized",
    policyVersion: stringValue(
      authorization.policyVersion,
      `${field}.policyVersion`,
    ),
    authorizedAt: isoTimestamp(
      authorization.authorizedAt,
      `${field}.authorizedAt`,
    ),
    subject,
    gates,
  };
}

function parseDeliverables(value: unknown): ProposalHandoffPayload["deliverables"] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) {
    throw new ProposalHandoffValidationError(
      "invalid_deliverables",
      "payload.deliverables must contain between 1 and 100 items",
      "payload.deliverables",
    );
  }
  const ids = new Set<string>();
  return value.map((raw, index) => {
    const field = `payload.deliverables[${index}]`;
    const item = objectValue(raw, field);
    assertAllowedKeys(item, field, ["id", "title", "acceptanceCriteria"]);
    const id = stringValue(item.id, `${field}.id`);
    if (ids.has(id)) {
      throw new ProposalHandoffValidationError(
        "duplicate_deliverable",
        "Deliverable IDs must be unique",
        `${field}.id`,
      );
    }
    ids.add(id);
    return {
      id,
      title: stringValue(item.title, `${field}.title`, 500),
      acceptanceCriteria: stringArray(
        item.acceptanceCriteria,
        `${field}.acceptanceCriteria`,
        { min: 1, max: 50, itemMax: 2_000 },
      ),
    };
  });
}

function parseArtifacts(value: unknown): ProposalHandoffPayload["artifactRefs"] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) {
    throw new ProposalHandoffValidationError(
      "invalid_artifacts",
      "payload.artifactRefs must contain between 1 and 100 production-safe items",
      "payload.artifactRefs",
    );
  }
  const kinds = new Set<ProductionArtifactKind>([
    "production_manifest",
    "brief",
    "evidence_register",
    "source",
  ]);
  const keys = new Set<string>();
  return value.map((raw, index) => {
    const field = `payload.artifactRefs[${index}]`;
    const item = objectValue(raw, field);
    assertAllowedKeys(item, field, [
      "kind",
      "artifactId",
      "sha256",
      "classification",
    ]);
    if (typeof item.kind !== "string" || !kinds.has(item.kind as ProductionArtifactKind)) {
      throw new ProposalHandoffValidationError(
        "invalid_artifact_kind",
        "Only production manifests, briefs, evidence registers, and source references may cross the boundary",
        `${field}.kind`,
      );
    }
    if (item.classification !== "production_safe") {
      throw new ProposalHandoffValidationError(
        "unsafe_artifact_classification",
        "Proposal render artifacts cannot enter Co-VideoPro",
        `${field}.classification`,
      );
    }
    const artifactId = stringValue(item.artifactId, `${field}.artifactId`);
    const key = `${item.kind}:${artifactId}`;
    if (keys.has(key)) {
      throw new ProposalHandoffValidationError(
        "duplicate_artifact",
        "Artifact references must be unique",
        field,
      );
    }
    keys.add(key);
    return {
      kind: item.kind as ProductionArtifactKind,
      artifactId,
      sha256: artifactSha256(item.sha256, `${field}.sha256`),
      classification: "production_safe" as const,
    };
  });
}

function parseCoCreditBudget(value: unknown): ProposalHandoffPayload["coCreditBudget"] {
  if (value === undefined || value === null) return null;
  const budget = objectValue(value, "payload.coCreditBudget");
  assertAllowedKeys(budget, "payload.coCreditBudget", ["credits", "policyVersion"]);
  if (!Number.isSafeInteger(budget.credits) || Number(budget.credits) < 0) {
    throw new ProposalHandoffValidationError(
      "invalid_credit_budget",
      "payload.coCreditBudget.credits must be a non-negative integer",
      "payload.coCreditBudget.credits",
    );
  }
  return {
    credits: Number(budget.credits),
    policyVersion: stringValue(
      budget.policyVersion,
      "payload.coCreditBudget.policyVersion",
    ),
  };
}

function parseProject(value: unknown): ProposalHandoffPayload["project"] {
  const project = objectValue(value, "payload.project");
  assertAllowedKeys(project, "payload.project", [
    "title",
    "description",
    "productionWindow",
  ]);
  const window = objectValue(
    project.productionWindow,
    "payload.project.productionWindow",
  );
  assertAllowedKeys(window, "payload.project.productionWindow", [
    "startDate",
    "dueDate",
    "constraints",
  ]);
  const startDate = validCalendarDate(
    window.startDate,
    "payload.project.productionWindow.startDate",
  );
  const dueDate = validCalendarDate(
    window.dueDate,
    "payload.project.productionWindow.dueDate",
  );
  if (dueDate < startDate) {
    throw new ProposalHandoffValidationError(
      "invalid_production_window",
      "Production due date cannot be before the start date",
      "payload.project.productionWindow.dueDate",
    );
  }
  return {
    title: stringValue(project.title, "payload.project.title"),
    description: optionalStringValue(
      project.description,
      "payload.project.description",
      10_000,
    ),
    productionWindow: {
      startDate,
      dueDate,
      constraints: stringArray(
        window.constraints,
        "payload.project.productionWindow.constraints",
        { min: 1, max: 100, itemMax: 2_000 },
      ),
    },
  };
}

function expectedIdempotencyKey(
  packageId: string,
  packageVersion: number,
  displayNumber: string,
) {
  const display = /^[A-Z0-9]+-([A-Z][A-Z0-9]{0,2})(?:-R[1-9][0-9]*)?$/.exec(
    displayNumber.toUpperCase(),
  );
  if (!display) {
    throw new ProposalHandoffValidationError(
      "invalid_display_number",
      "payload.displayNumber must include the issued variant",
      "payload.displayNumber",
    );
  }
  return `cco:${packageId.toLowerCase()}:v${packageVersion}:${display[1].toLowerCase()}`;
}

function parsePayload(
  value: unknown,
  schemaVersion: ProposalHandoffSchemaVersion,
): ProposalHandoffPayload {
  const payload = objectValue(value, "payload");
  assertAllowedKeys(payload, "payload", [
    "intent",
    "sourceTenantId",
    "idempotencyKey",
    "packageId",
    "packageVersion",
    "proposalVersionId",
    "proposalContentHash",
    "quoteVersionId",
    "quoteContentHash",
    "displayNumber",
    "approvalReceiptIds",
    "decisionReceipt",
    "clientId",
    "opportunityId",
    "briefId",
    "proposalRequestReceiptId",
    "origin",
    "project",
    "scopeItemIds",
    "deliverables",
    "productionModules",
    "artifactRefs",
    "coCreditBudget",
    "productionAuthorization",
  ]);
  if (payload.intent !== "validate" && payload.intent !== "activate") {
    throw new ProposalHandoffValidationError(
      "invalid_intent",
      "payload.intent must be validate or activate",
      "payload.intent",
    );
  }
  const packageId = stringValue(payload.packageId, "payload.packageId");
  const packageVersion = positiveInteger(
    payload.packageVersion,
    "payload.packageVersion",
    2_147_483_647,
  );
  const proposalVersionId = stringValue(
    payload.proposalVersionId,
    "payload.proposalVersionId",
  );
  const proposalContentHash = sha256Reference(
    payload.proposalContentHash,
    "payload.proposalContentHash",
  );
  const quoteVersionId = stringValue(
    payload.quoteVersionId,
    "payload.quoteVersionId",
  );
  const quoteContentHash = sha256Reference(
    payload.quoteContentHash,
    "payload.quoteContentHash",
  );
  const decisionReceipt = parseDecision(payload.decisionReceipt);
  const displayNumber = stringValue(
    payload.displayNumber,
    "payload.displayNumber",
    80,
  ).toUpperCase();
  const idempotencyKey = stringValue(
    payload.idempotencyKey,
    "payload.idempotencyKey",
    320,
  ).toLowerCase();
  const expectedKey = expectedIdempotencyKey(
    packageId,
    packageVersion,
    displayNumber,
  );
  if (idempotencyKey !== expectedKey) {
    throw new ProposalHandoffValidationError(
      "idempotency_binding_mismatch",
      "The idempotency key must exactly match the package, version, and issued variant",
      "payload.idempotencyKey",
    );
  }

  const modules = stringArray(payload.productionModules, "payload.productionModules", {
    min: 3,
    max: 3,
    itemMax: 40,
    unique: true,
  });
  if (JSON.stringify(modules) !== JSON.stringify(REQUIRED_PRODUCTION_MODULES)) {
    throw new ProposalHandoffValidationError(
      "invalid_production_modules",
      "Production modules must contain Co-Script, Co-Edit, and Co-Deliver in order",
      "payload.productionModules",
    );
  }

  const clientId = stringValue(payload.clientId, "payload.clientId");
  const opportunityId = stringValue(
    payload.opportunityId,
    "payload.opportunityId",
  );
  const briefId = stringValue(payload.briefId, "payload.briefId");
  let proposalRequestReceiptId: string | undefined;
  if (schemaVersion === PROPOSAL_HANDOFF_ACTIVATION_SCHEMA_VERSION) {
    if (
      payload.proposalRequestReceiptId === undefined ||
      payload.proposalRequestReceiptId === null
    ) {
      throw new ProposalHandoffValidationError(
        "proposal_request_receipt_required",
        "Schema 2.0.0 requires the governed proposal request receipt",
        "payload.proposalRequestReceiptId",
      );
    }
    proposalRequestReceiptId = uuidReference(
      payload.proposalRequestReceiptId,
      "payload.proposalRequestReceiptId",
    );
  } else if (payload.proposalRequestReceiptId !== undefined) {
    throw new ProposalHandoffValidationError(
      "proposal_request_receipt_not_supported",
      "The proposal request receipt is available only in schema 2.0.0",
      "payload.proposalRequestReceiptId",
    );
  }
  const artifactRefs = parseArtifacts(payload.artifactRefs);
  const origin =
    payload.origin === undefined || payload.origin === null
      ? undefined
      : parseOrigin(payload.origin);
  if (
    origin &&
    (clientId !== origin.accountId ||
      opportunityId !== origin.opportunityId ||
      briefId !== origin.briefRevisionId)
  ) {
    throw new ProposalHandoffValidationError(
      "origin_binding_mismatch",
      "The proposal origin must match its client, opportunity, and brief references",
      "payload.origin",
    );
  }
  if (
    origin &&
    !artifactRefs.some(
      (artifact) =>
        artifact.kind === "brief" &&
        artifact.artifactId === origin.briefRevisionId &&
        `sha256:${artifact.sha256}` === origin.briefContentHash,
    )
  ) {
    throw new ProposalHandoffValidationError(
      "origin_brief_evidence_missing",
      "The canonical CRM brief must be included as hash-bound production-safe evidence",
      "payload.artifactRefs",
    );
  }

  let productionAuthorization: ProposalProductionAuthorization | undefined;
  if (schemaVersion === PROPOSAL_HANDOFF_ACTIVATION_SCHEMA_VERSION) {
    if (!origin) {
      throw new ProposalHandoffValidationError(
        "production_origin_required",
        "Schema 2.0.0 requires the canonical CRM proposal origin",
        "payload.origin",
      );
    }
    if (!proposalRequestReceiptId) {
      throw new ProposalHandoffValidationError(
        "proposal_request_receipt_required",
        "Schema 2.0.0 requires the governed proposal request receipt",
        "payload.proposalRequestReceiptId",
      );
    }
    if (
      payload.productionAuthorization === undefined ||
      payload.productionAuthorization === null
    ) {
      throw new ProposalHandoffValidationError(
        "production_authorization_required",
        "Schema 2.0.0 requires a production authorization receipt",
        "payload.productionAuthorization",
      );
    }
    productionAuthorization = parseProductionAuthorization(
      payload.productionAuthorization,
      {
        proposalRequestReceiptId,
        packageId,
        packageVersion,
        proposalVersionId,
        proposalContentHash,
        quoteVersionId,
        quoteContentHash,
        decisionReceiptId: decisionReceipt.id,
        opportunityId,
        readyBriefId: origin.briefRevisionId,
        readyBriefContentHash: origin.briefContentHash,
      },
    );
  } else if (payload.productionAuthorization !== undefined) {
    throw new ProposalHandoffValidationError(
      "production_authorization_not_supported",
      "Production authorization is available only in schema 2.0.0",
      "payload.productionAuthorization",
    );
  }

  return {
    intent: payload.intent,
    sourceTenantId: stringValue(
      payload.sourceTenantId,
      "payload.sourceTenantId",
    ).toLowerCase(),
    idempotencyKey,
    packageId,
    packageVersion,
    proposalVersionId,
    proposalContentHash,
    quoteVersionId,
    quoteContentHash,
    displayNumber,
    approvalReceiptIds: stringArray(
      payload.approvalReceiptIds,
      "payload.approvalReceiptIds",
      { min: 1, max: 20, unique: true },
    ),
    decisionReceipt,
    clientId,
    opportunityId,
    briefId,
    ...(proposalRequestReceiptId ? { proposalRequestReceiptId } : {}),
    ...(origin ? { origin } : {}),
    project: parseProject(payload.project),
    scopeItemIds: stringArray(payload.scopeItemIds, "payload.scopeItemIds", {
      min: 1,
      max: 500,
      unique: true,
    }),
    deliverables: parseDeliverables(payload.deliverables),
    productionModules: [...REQUIRED_PRODUCTION_MODULES],
    artifactRefs,
    coCreditBudget: parseCoCreditBudget(payload.coCreditBudget),
    ...(productionAuthorization ? { productionAuthorization } : {}),
  };
}

function parseAttestation(value: unknown): ProposalHandoffAttestation {
  const attestation = objectValue(value, "attestation");
  assertAllowedKeys(attestation, "attestation", [
    "keyId",
    "issuedAt",
    "expiresAt",
    "nonce",
    "payloadHash",
    "signature",
  ]);
  const nonce = stringValue(attestation.nonce, "attestation.nonce", 200);
  if (!/^[A-Za-z0-9_-]{16,200}$/.test(nonce)) {
    throw new ProposalHandoffValidationError(
      "invalid_attestation_nonce",
      "attestation.nonce must be a base64url value",
      "attestation.nonce",
    );
  }
  const signature = stringValue(
    attestation.signature,
    "attestation.signature",
    512,
  );
  if (!/^[A-Za-z0-9_-]{64,512}$/.test(signature)) {
    throw new ProposalHandoffValidationError(
      "invalid_attestation_signature",
      "attestation.signature must be base64url encoded",
      "attestation.signature",
    );
  }
  return {
    keyId: stringValue(attestation.keyId, "attestation.keyId", 160),
    issuedAt: isoTimestamp(attestation.issuedAt, "attestation.issuedAt"),
    expiresAt: isoTimestamp(attestation.expiresAt, "attestation.expiresAt"),
    nonce,
    payloadHash: sha256Reference(
      attestation.payloadHash,
      "attestation.payloadHash",
    ),
    signature,
  };
}

export function parseProposalHandoffRequest(value: unknown): ProposalHandoffRequest {
  rejectCommercialOrDeepFields(value);
  const body = objectValue(value, "request");
  assertAllowedKeys(body, "request", ["schemaVersion", "attestation", "payload"]);
  if (
    body.schemaVersion !== PROPOSAL_HANDOFF_SCHEMA_VERSION &&
    body.schemaVersion !== PROPOSAL_HANDOFF_ACTIVATION_SCHEMA_VERSION
  ) {
    throw new ProposalHandoffValidationError(
      "invalid_schema_version",
      `schemaVersion must be ${PROPOSAL_HANDOFF_SCHEMA_VERSION} or ${PROPOSAL_HANDOFF_ACTIVATION_SCHEMA_VERSION}`,
      "schemaVersion",
    );
  }
  const schemaVersion = body.schemaVersion;
  const payload = parsePayload(body.payload, schemaVersion);
  if (
    payload.intent === "activate" &&
    schemaVersion !== PROPOSAL_HANDOFF_ACTIVATION_SCHEMA_VERSION
  ) {
    throw new ProposalHandoffValidationError(
      "activation_schema_required",
      "Production activation requires proposal handoff schema 2.0.0",
      "schemaVersion",
    );
  }
  return {
    schemaVersion,
    attestation: parseAttestation(body.attestation),
    payload,
  };
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as JsonObject)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function proposalHandoffPayloadHash(
  payload: ProposalHandoffPayload,
): `sha256:${string}` {
  return `sha256:${createHash("sha256")
    .update(proposalHandoffCanonicalPayload(payload))
    .digest("hex")}`;
}

export function proposalHandoffCanonicalPayload(
  payload: ProposalHandoffPayload,
): string {
  return stableJson(payload);
}

function receiverSecret(value: string): Buffer {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9_-]{43}$/.test(normalized)) {
    throw new ProposalHandoffValidationError(
      "invalid_receiver_secret",
      "Proposal receiver secret must be 32 base64url-encoded bytes",
    );
  }
  const secret = Buffer.from(normalized, "base64url");
  if (secret.length !== PROPOSAL_RECEIVER_SECRET_BYTES) {
    throw new ProposalHandoffValidationError(
      "invalid_receiver_secret",
      "Proposal receiver secret must be 32 base64url-encoded bytes",
    );
  }
  return secret;
}

export function proposalHandoffReceiverProof({
  canonicalPayload,
  secret,
}: {
  canonicalPayload: string;
  secret: string;
}): string {
  return createHmac("sha256", receiverSecret(secret))
    .update(canonicalPayload)
    .digest("hex");
}

export function proposalHandoffAttestationMessage(
  request: Pick<ProposalHandoffRequest, "schemaVersion" | "attestation">,
): string {
  return stableJson({
    schemaVersion: request.schemaVersion,
    keyId: request.attestation.keyId,
    issuedAt: request.attestation.issuedAt,
    expiresAt: request.attestation.expiresAt,
    nonce: request.attestation.nonce,
    payloadHash: request.attestation.payloadHash,
  });
}

export function verifyProposalHandoffAttestation({
  request,
  publicKey,
  now = new Date(),
}: {
  request: ProposalHandoffRequest;
  publicKey: string;
  now?: Date;
}) {
  const payloadHash = proposalHandoffPayloadHash(request.payload);
  if (payloadHash !== request.attestation.payloadHash) {
    throw new ProposalHandoffValidationError(
      "attestation_payload_mismatch",
      "The signed payload hash does not match this handoff",
      "attestation.payloadHash",
    );
  }

  const issuedAt = Date.parse(request.attestation.issuedAt);
  const expiresAt = Date.parse(request.attestation.expiresAt);
  const nowMs = now.getTime();
  if (
    issuedAt > nowMs + 60_000 ||
    expiresAt <= nowMs ||
    expiresAt <= issuedAt ||
    expiresAt - issuedAt > PROPOSAL_ATTESTATION_MAX_TTL_MS
  ) {
    throw new ProposalHandoffValidationError(
      "invalid_attestation_window",
      "The Proposal Studio attestation is expired or outside its allowed window",
      "attestation.expiresAt",
    );
  }

  let verified = false;
  try {
    const signature = Buffer.from(request.attestation.signature, "base64url");
    verified = verifySignature(
      null,
      Buffer.from(proposalHandoffAttestationMessage(request), "utf8"),
      createPublicKey(publicKey),
      signature,
    );
  } catch {
    verified = false;
  }
  if (!verified) {
    throw new ProposalHandoffValidationError(
      "invalid_attestation_signature",
      "The Proposal Studio attestation could not be verified",
      "attestation.signature",
    );
  }
  return { payloadHash };
}
