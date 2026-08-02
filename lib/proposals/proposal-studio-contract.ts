import type { ProposalHandoffPayload } from "../integrations/proposal-handoff";

export type ProposalStudioOrigin = NonNullable<
  ProposalHandoffPayload["origin"]
>;

export type ProposalStudioImportContext = {
  schemaVersion: "cco.proposal-studio.import-context.v3";
  commercialAuthority: "proposal-studio";
  pricingIncluded: false;
  source: "co-videopro-crm";
  origin: ProposalStudioOrigin;
  opportunity: {
    id: string;
    name: string;
    authorityVersion: number;
    stage: "proposal_requested" | "proposal_sent";
  };
  client: {
    id: string;
    displayName: string;
    authorityVersion: number;
  };
  contact: {
    id: string;
    authorityVersion: number;
  };
  brief: {
    id: string;
    revisionNumber: number;
    contentHash: `sha256:${string}`;
    status: "ready_for_proposal";
    title: string;
    requestedDeliverables: string[];
    constraints: string[];
  };
  readiness: {
    receiptId: string;
    requestedAt: string;
  };
  requestedProductionWindow: {
    source: "client_reported";
    authority: "non_authoritative";
    desiredStartDate: string | null;
    dueDate: string | null;
    flexibility: "fixed" | "somewhat_flexible" | "flexible" | "unknown";
  };
};

export class ProposalStudioContextError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ProposalStudioContextError";
    this.code = code;
  }
}

function nonEmpty(value: string, field: string, maxLength = 240) {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new ProposalStudioContextError(
      "invalid_context_field",
      `${field} must contain between 1 and ${maxLength} characters`,
    );
  }
  return normalized;
}

function positiveInteger(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new ProposalStudioContextError(
      "invalid_context_version",
      `${field} must be a positive integer`,
    );
  }
  return value;
}

function sha256(value: string, field: string): `sha256:${string}` {
  const normalized = nonEmpty(value, field, 135).toLowerCase();
  if (!/^sha256:[a-f0-9]{64}$/.test(normalized)) {
    throw new ProposalStudioContextError(
      "invalid_context_hash",
      `${field} must be a complete SHA-256 reference`,
    );
  }
  return normalized as `sha256:${string}`;
}

function uuid(value: string, field: string) {
  const normalized = nonEmpty(value, field, 36).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)) {
    throw new ProposalStudioContextError(
      "invalid_context_id",
      `${field} must be a UUID`,
    );
  }
  return normalized;
}

function stringList(values: string[], field: string) {
  if (!Array.isArray(values) || values.length > 100) {
    throw new ProposalStudioContextError(
      "invalid_context_list",
      `${field} may contain at most 100 entries`,
    );
  }
  return values.map((value, index) => nonEmpty(value, `${field}[${index}]`, 2_000));
}

function calendarDate(value: string | null, field: string): string | null {
  if (value === null) return null;
  const normalized = nonEmpty(value, field, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new ProposalStudioContextError(
      "invalid_context_date",
      `${field} must be a YYYY-MM-DD calendar date or null`,
    );
  }
  const [year, month, day] = normalized.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new ProposalStudioContextError(
      "invalid_context_date",
      `${field} must be a real calendar date`,
    );
  }
  return normalized;
}

function timelineFlexibility(
  value: ProposalStudioImportContext["requestedProductionWindow"]["flexibility"],
) {
  if (!["fixed", "somewhat_flexible", "flexible", "unknown"].includes(value)) {
    throw new ProposalStudioContextError(
      "invalid_context_timeline",
      "requestedProductionWindow.flexibility is not supported",
    );
  }
  return value;
}

function proposalStage(
  value: ProposalStudioImportContext["opportunity"]["stage"],
) {
  if (value !== "proposal_requested" && value !== "proposal_sent") {
    throw new ProposalStudioContextError(
      "proposal_not_requested",
      "Proposal Studio context requires a requested proposal",
    );
  }
  return value;
}

function readyBriefStatus(value: ProposalStudioImportContext["brief"]["status"]) {
  if (value !== "ready_for_proposal") {
    throw new ProposalStudioContextError(
      "brief_not_ready",
      "Proposal Studio context requires a ready brief revision",
    );
  }
  return value;
}

function timestamp(value: string, field: string) {
  const normalized = nonEmpty(value, field, 40);
  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) {
    throw new ProposalStudioContextError(
      "invalid_context_timestamp",
      `${field} must be an ISO timestamp`,
    );
  }
  return new Date(parsed).toISOString();
}

/**
 * Adapts the canonical CRM proposal context into the exact, price-free input
 * accepted by Proposal Studio. Commercial calculations stay in Proposal Studio;
 * the returned origin is later copied into the signed production handoff.
 */
export function createProposalStudioImportContext(input: {
  origin: ProposalStudioOrigin;
  opportunity: ProposalStudioImportContext["opportunity"];
  client: ProposalStudioImportContext["client"];
  contact: ProposalStudioImportContext["contact"];
  brief: ProposalStudioImportContext["brief"];
  readiness: ProposalStudioImportContext["readiness"];
  requestedProductionWindow: Pick<
    ProposalStudioImportContext["requestedProductionWindow"],
    "desiredStartDate" | "dueDate" | "flexibility"
  >;
}): ProposalStudioImportContext {
  const origin = input.origin;
  if (origin.authority !== "co-videopro-crm") {
    throw new ProposalStudioContextError(
      "invalid_origin_authority",
      "Proposal Studio imports only canonical Co-VideoPro CRM context",
    );
  }

  const normalizedOrigin: ProposalStudioOrigin = {
    authority: "co-videopro-crm",
    inquiryId: uuid(origin.inquiryId, "origin.inquiryId"),
    accountId: uuid(origin.accountId, "origin.accountId"),
    accountAuthorityVersion: positiveInteger(
      origin.accountAuthorityVersion,
      "origin.accountAuthorityVersion",
    ),
    primaryContactId: uuid(origin.primaryContactId, "origin.primaryContactId"),
    contactAuthorityVersion: positiveInteger(
      origin.contactAuthorityVersion,
      "origin.contactAuthorityVersion",
    ),
    opportunityId: uuid(origin.opportunityId, "origin.opportunityId"),
    opportunityAuthorityVersion: positiveInteger(
      origin.opportunityAuthorityVersion,
      "origin.opportunityAuthorityVersion",
    ),
    briefRevisionId: uuid(origin.briefRevisionId, "origin.briefRevisionId"),
    briefRevisionNumber: positiveInteger(
      origin.briefRevisionNumber,
      "origin.briefRevisionNumber",
    ),
    briefContentHash: sha256(origin.briefContentHash, "origin.briefContentHash"),
  };

  if (
    normalizedOrigin.opportunityId !==
    uuid(input.opportunity.id, "opportunity.id")
  ) {
    throw new ProposalStudioContextError(
      "opportunity_origin_mismatch",
      "Proposal opportunity must match the canonical CRM origin",
    );
  }
  if (
    normalizedOrigin.accountId !==
    uuid(input.client.id, "client.id")
  ) {
    throw new ProposalStudioContextError(
      "client_origin_mismatch",
      "Proposal client must match the canonical CRM origin",
    );
  }
  if (
    normalizedOrigin.briefRevisionId !==
    uuid(input.brief.id, "brief.id")
  ) {
    throw new ProposalStudioContextError(
      "brief_origin_mismatch",
      "Proposal brief must match the canonical CRM origin",
    );
  }
  if (
    normalizedOrigin.primaryContactId !==
    uuid(input.contact.id, "contact.id")
  ) {
    throw new ProposalStudioContextError(
      "contact_origin_mismatch",
      "Proposal contact must match the canonical CRM origin",
    );
  }

  if (
    normalizedOrigin.opportunityAuthorityVersion !==
      positiveInteger(input.opportunity.authorityVersion, "opportunity.authorityVersion") ||
    normalizedOrigin.accountAuthorityVersion !==
      positiveInteger(input.client.authorityVersion, "client.authorityVersion") ||
    normalizedOrigin.contactAuthorityVersion !==
      positiveInteger(input.contact.authorityVersion, "contact.authorityVersion") ||
    normalizedOrigin.briefRevisionNumber !==
      positiveInteger(input.brief.revisionNumber, "brief.revisionNumber") ||
    normalizedOrigin.briefContentHash !== sha256(input.brief.contentHash, "brief.contentHash")
  ) {
    throw new ProposalStudioContextError(
      "stale_origin_context",
      "Proposal Studio context must use the current CRM authority versions and brief hash",
    );
  }

  const desiredStartDate = calendarDate(
    input.requestedProductionWindow.desiredStartDate,
    "requestedProductionWindow.desiredStartDate",
  );
  const dueDate = calendarDate(
    input.requestedProductionWindow.dueDate,
    "requestedProductionWindow.dueDate",
  );
  if (desiredStartDate && dueDate && dueDate < desiredStartDate) {
    throw new ProposalStudioContextError(
      "invalid_context_date_range",
      "requestedProductionWindow.dueDate cannot precede desiredStartDate",
    );
  }

  return {
    schemaVersion: "cco.proposal-studio.import-context.v3",
    commercialAuthority: "proposal-studio",
    pricingIncluded: false,
    source: "co-videopro-crm",
    origin: normalizedOrigin,
    opportunity: {
      id: normalizedOrigin.opportunityId,
      name: nonEmpty(input.opportunity.name, "opportunity.name", 500),
      authorityVersion: normalizedOrigin.opportunityAuthorityVersion,
      stage: proposalStage(input.opportunity.stage),
    },
    client: {
      id: normalizedOrigin.accountId,
      displayName: nonEmpty(input.client.displayName, "client.displayName", 500),
      authorityVersion: normalizedOrigin.accountAuthorityVersion,
    },
    contact: {
      id: normalizedOrigin.primaryContactId,
      authorityVersion: normalizedOrigin.contactAuthorityVersion,
    },
    brief: {
      id: normalizedOrigin.briefRevisionId,
      revisionNumber: normalizedOrigin.briefRevisionNumber,
      contentHash: normalizedOrigin.briefContentHash,
      status: readyBriefStatus(input.brief.status),
      title: nonEmpty(input.brief.title, "brief.title", 500),
      requestedDeliverables: stringList(
        input.brief.requestedDeliverables,
        "brief.requestedDeliverables",
      ),
      constraints: stringList(input.brief.constraints, "brief.constraints"),
    },
    readiness: {
      receiptId: uuid(input.readiness.receiptId, "readiness.receiptId"),
      requestedAt: timestamp(input.readiness.requestedAt, "readiness.requestedAt"),
    },
    requestedProductionWindow: {
      source: "client_reported",
      authority: "non_authoritative",
      desiredStartDate,
      dueDate,
      flexibility: timelineFlexibility(input.requestedProductionWindow.flexibility),
    },
  };
}
