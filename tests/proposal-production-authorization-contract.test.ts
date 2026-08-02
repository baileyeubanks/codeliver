import assert from "node:assert/strict";
import test from "node:test";

import {
  parseProposalHandoffRequest,
  PROPOSAL_HANDOFF_ACTIVATION_SCHEMA_VERSION,
  PROPOSAL_HANDOFF_SCHEMA_VERSION,
  PROPOSAL_PRODUCTION_AUTHORIZATION_SCHEMA_VERSION,
  ProposalHandoffValidationError,
  proposalHandoffPayloadHash,
  type ProposalHandoffPayload,
  type ProposalHandoffRequest,
  type ProposalHandoffSchemaVersion,
} from "../lib/integrations/proposal-handoff.ts";

const ids = {
  inquiry: "10000000-0000-4000-8000-000000000001",
  account: "20000000-0000-4000-8000-000000000002",
  contact: "30000000-0000-4000-8000-000000000003",
  opportunity: "40000000-0000-4000-8000-000000000004",
  brief: "50000000-0000-4000-8000-000000000005",
  proposalRequestReceipt: "60000000-0000-4000-8000-000000000006",
};

const packageId = "proposal-package-schneider-first-layer";
const packageVersion = 1;
const proposalVersionId = "proposal-version-schneider-first-layer-r1";
const proposalContentHash = `sha256:${"1".repeat(64)}` as const;
const quoteVersionId = "quote-version-schneider-0000189-b-r1";
const quoteContentHash = `sha256:${"2".repeat(64)}` as const;
const decisionReceiptId = "decision-schneider-b-r1";
const briefContentHash = `sha256:${"4".repeat(64)}` as const;

function validPayload(): ProposalHandoffPayload {
  return {
    intent: "activate",
    sourceTenantId: "content-co-op",
    idempotencyKey: "cco:proposal-package-schneider-first-layer:v1:b",
    packageId,
    packageVersion,
    proposalVersionId,
    proposalContentHash,
    quoteVersionId,
    quoteContentHash,
    displayNumber: "0000189-B",
    approvalReceiptIds: ["approval-schneider-b-r1"],
    decisionReceipt: {
      id: decisionReceiptId,
      decision: "accepted",
      actorId: "client-contact-madeline",
      decidedAt: "2026-07-16T14:00:00.000Z",
      consentTextVersion: "cco-client-acceptance@1",
      viewReceiptId: "view-schneider-b-r1",
      requestId: "decision-request-schneider-b-r1",
    },
    clientId: ids.account,
    opportunityId: ids.opportunity,
    briefId: ids.brief,
    proposalRequestReceiptId: ids.proposalRequestReceipt,
    origin: {
      authority: "co-videopro-crm",
      inquiryId: ids.inquiry,
      accountId: ids.account,
      accountAuthorityVersion: 3,
      primaryContactId: ids.contact,
      contactAuthorityVersion: 2,
      opportunityId: ids.opportunity,
      opportunityAuthorityVersion: 7,
      briefRevisionId: ids.brief,
      briefRevisionNumber: 4,
      briefContentHash,
    },
    project: {
      title: "The First Layer",
      description: "Production project activated from accepted proposal 0000189-B.",
      productionWindow: {
        startDate: "2026-08-03",
        dueDate: "2026-09-18",
        constraints: ["Client site access requires advance approval"],
      },
    },
    scopeItemIds: ["b-development", "b-production", "b-editorial"],
    deliverables: [
      {
        id: "deliverable-hero-film",
        title: "The First Layer hero film",
        acceptanceCriteria: ["Approved master", "Captioned delivery"],
      },
    ],
    productionModules: ["Co-Script", "Co-Edit", "Co-Deliver"],
    artifactRefs: [
      {
        kind: "production_manifest",
        artifactId: "production-manifest-schneider-b-r1",
        sha256: "3".repeat(64),
        classification: "production_safe",
      },
      {
        kind: "brief",
        artifactId: ids.brief,
        sha256: "4".repeat(64),
        classification: "production_safe",
      },
    ],
    coCreditBudget: null,
    productionAuthorization: {
      schemaVersion: PROPOSAL_PRODUCTION_AUTHORIZATION_SCHEMA_VERSION,
      receiptId: "production-authorization-schneider-b-r1",
      status: "authorized",
      policyVersion: "cco-production-activation@1",
      authorizedAt: "2026-07-16T14:05:00.000Z",
      subject: {
        proposalRequestReceiptId: ids.proposalRequestReceipt,
        packageId,
        packageVersion,
        proposalVersionId,
        proposalContentHash,
        quoteVersionId,
        quoteContentHash,
        decisionReceiptId,
        opportunityId: ids.opportunity,
        readyBriefId: ids.brief,
        readyBriefContentHash: briefContentHash,
      },
      gates: [
        {
          gate: "acceptance",
          status: "satisfied",
          evidenceReceiptId: decisionReceiptId,
        },
        {
          gate: "contract",
          status: "satisfied",
          evidenceReceiptId: "contract-authorization-schneider-b-r1",
        },
        {
          gate: "invoice",
          status: "not_required",
          evidenceReceiptId: "invoice-waiver-schneider-b-r1",
        },
        {
          gate: "deposit",
          status: "not_required",
          evidenceReceiptId: "deposit-waiver-schneider-b-r1",
        },
        {
          gate: "payment",
          status: "not_required",
          evidenceReceiptId: "payment-waiver-schneider-b-r1",
        },
      ],
    },
  };
}

function requestFor(
  payload = validPayload(),
  schemaVersion: ProposalHandoffSchemaVersion =
    PROPOSAL_HANDOFF_ACTIVATION_SCHEMA_VERSION,
): ProposalHandoffRequest {
  return {
    schemaVersion,
    attestation: {
      keyId: "cco-proposal-ed25519-2026-01",
      issuedAt: "2026-07-16T14:05:00.000Z",
      expiresAt: "2026-07-16T14:15:00.000Z",
      nonce: "production_authorization_nonce_1",
      payloadHash: proposalHandoffPayloadHash(payload),
      signature: "x".repeat(86),
    },
    payload,
  };
}

function authorizationRecord(request: ProposalHandoffRequest) {
  return request.payload.productionAuthorization as unknown as Record<
    string,
    unknown
  >;
}

function subjectRecord(request: ProposalHandoffRequest) {
  return authorizationRecord(request).subject as Record<string, unknown>;
}

function gateRecords(request: ProposalHandoffRequest) {
  return authorizationRecord(request).gates as Array<Record<string, unknown>>;
}

function assertValidationCode(run: () => unknown, code: string) {
  assert.throws(
    run,
    (error: unknown) =>
      error instanceof ProposalHandoffValidationError && error.code === code,
  );
}

test("schema 1 stays validate-only while schema 2 admits authorized activation", () => {
  const parsed = parseProposalHandoffRequest(requestFor());
  assert.equal(parsed.schemaVersion, PROPOSAL_HANDOFF_ACTIVATION_SCHEMA_VERSION);
  assert.equal(parsed.payload.productionAuthorization?.status, "authorized");
  assert.equal(parsed.payload.productionAuthorization?.gates.length, 5);

  const legacyValidatePayload = validPayload();
  legacyValidatePayload.intent = "validate";
  delete legacyValidatePayload.proposalRequestReceiptId;
  delete legacyValidatePayload.productionAuthorization;
  const legacyValidate = parseProposalHandoffRequest(
    requestFor(legacyValidatePayload, PROPOSAL_HANDOFF_SCHEMA_VERSION),
  );
  assert.equal(legacyValidate.schemaVersion, PROPOSAL_HANDOFF_SCHEMA_VERSION);
  assert.equal(legacyValidate.payload.intent, "validate");

  const legacyActivationPayload = structuredClone(legacyValidatePayload);
  legacyActivationPayload.intent = "activate";
  assertValidationCode(
    () =>
      parseProposalHandoffRequest(
        requestFor(legacyActivationPayload, PROPOSAL_HANDOFF_SCHEMA_VERSION),
      ),
    "activation_schema_required",
  );
});

test("schema 2 activation fails closed without authorization, readiness, or origin", () => {
  const missingAuthorization = requestFor();
  delete missingAuthorization.payload.productionAuthorization;
  assertValidationCode(
    () => parseProposalHandoffRequest(missingAuthorization),
    "production_authorization_required",
  );

  const missingReceipt = requestFor();
  delete missingReceipt.payload.proposalRequestReceiptId;
  assertValidationCode(
    () => parseProposalHandoffRequest(missingReceipt),
    "proposal_request_receipt_required",
  );

  const missingOrigin = requestFor();
  delete missingOrigin.payload.origin;
  assertValidationCode(
    () => parseProposalHandoffRequest(missingOrigin),
    "production_origin_required",
  );
});

test("authorization gates are the exact unique five-gate set", () => {
  const duplicate = requestFor();
  gateRecords(duplicate)[4] = {
    ...gateRecords(duplicate)[0],
    evidenceReceiptId: "duplicate-acceptance-evidence",
  };
  assertValidationCode(
    () => parseProposalHandoffRequest(duplicate),
    "duplicate_production_authorization_gate",
  );

  const incomplete = requestFor();
  gateRecords(incomplete).pop();
  assertValidationCode(
    () => parseProposalHandoffRequest(incomplete),
    "invalid_production_authorization_gates",
  );

  const unknown = requestFor();
  gateRecords(unknown)[4].gate = "fulfillment";
  assertValidationCode(
    () => parseProposalHandoffRequest(unknown),
    "invalid_production_authorization_gate",
  );
});

test("pending and failed authorization states cannot activate production", () => {
  for (const status of ["pending", "failed"]) {
    const request = requestFor();
    authorizationRecord(request).status = status;
    assertValidationCode(
      () => parseProposalHandoffRequest(request),
      "production_authorization_not_authorized",
    );
  }

  for (const status of ["pending", "failed"]) {
    const request = requestFor();
    gateRecords(request)[1].status = status;
    assertValidationCode(
      () => parseProposalHandoffRequest(request),
      "production_authorization_gate_not_complete",
    );
  }

  const waivedAcceptance = requestFor();
  gateRecords(waivedAcceptance)[0].status = "not_required";
  assertValidationCode(
    () => parseProposalHandoffRequest(waivedAcceptance),
    "acceptance_gate_not_satisfied",
  );
});

test("the authorization subject and acceptance evidence reject binding drift", () => {
  const driftCases: Array<[string, unknown]> = [
    ["proposalRequestReceiptId", "70000000-0000-4000-8000-000000000007"],
    ["packageId", "another-package"],
    ["packageVersion", 2],
    ["proposalVersionId", "another-proposal-version"],
    ["proposalContentHash", `sha256:${"a".repeat(64)}`],
    ["quoteVersionId", "another-quote-version"],
    ["quoteContentHash", `sha256:${"b".repeat(64)}`],
    ["decisionReceiptId", "another-decision-receipt"],
    ["opportunityId", "80000000-0000-4000-8000-000000000008"],
    ["readyBriefId", "90000000-0000-4000-8000-000000000009"],
    ["readyBriefContentHash", `sha256:${"c".repeat(64)}`],
  ];

  for (const [field, value] of driftCases) {
    const request = requestFor();
    subjectRecord(request)[field] = value;
    assertValidationCode(
      () => parseProposalHandoffRequest(request),
      "production_authorization_binding_mismatch",
    );
  }

  const staleAcceptanceEvidence = requestFor();
  gateRecords(staleAcceptanceEvidence)[0].evidenceReceiptId =
    "another-decision-receipt";
  assertValidationCode(
    () => parseProposalHandoffRequest(staleAcceptanceEvidence),
    "production_authorization_binding_mismatch",
  );
});

test("unknown production authorization fields are rejected at every level", () => {
  const topLevel = requestFor();
  authorizationRecord(topLevel).approvedBy = "operator-1";
  assertValidationCode(
    () => parseProposalHandoffRequest(topLevel),
    "unknown_field",
  );

  const subject = requestFor();
  subjectRecord(subject).displayNumber = "0000189-B";
  assertValidationCode(
    () => parseProposalHandoffRequest(subject),
    "unknown_field",
  );

  const gate = requestFor();
  gateRecords(gate)[0].note = "accepted";
  assertValidationCode(
    () => parseProposalHandoffRequest(gate),
    "unknown_field",
  );
});

test("commercial values remain denied inside the versioned authorization", () => {
  const cases: Array<(request: ProposalHandoffRequest) => void> = [
    (request) => {
      authorizationRecord(request).totalCents = 1_225_000;
    },
    (request) => {
      subjectRecord(request).currency = "USD";
    },
    (request) => {
      gateRecords(request)[2].invoiceId = "invoice-schneider-r1";
    },
  ];

  for (const leak of cases) {
    const request = requestFor();
    leak(request);
    assertValidationCode(
      () => parseProposalHandoffRequest(request),
      "commercial_field_forbidden",
    );
  }
});
