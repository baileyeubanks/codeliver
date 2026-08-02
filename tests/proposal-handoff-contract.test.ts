import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";

import {
  parseProposalHandoffRequest,
  PROPOSAL_HANDOFF_SCHEMA_VERSION,
  ProposalHandoffValidationError,
  proposalHandoffAttestationMessage,
  proposalHandoffPayloadHash,
  proposalHandoffReceiverProof,
  type ProposalHandoffPayload,
  type ProposalHandoffRequest,
  verifyProposalHandoffAttestation,
} from "../lib/integrations/proposal-handoff.ts";

const signingKeys = generateKeyPairSync("ed25519");
const alternateKeys = generateKeyPairSync("ed25519");
const publicKeyPem = signingKeys.publicKey.export({
  format: "pem",
  type: "spki",
}).toString();

function validPayload(): ProposalHandoffPayload {
  return {
    intent: "validate",
    sourceTenantId: "content-co-op",
    idempotencyKey: "cco:proposal-package-schneider-first-layer:v1:b",
    packageId: "proposal-package-schneider-first-layer",
    packageVersion: 1,
    proposalVersionId: "proposal-version-schneider-first-layer-r1",
    proposalContentHash: `sha256:${"1".repeat(64)}`,
    quoteVersionId: "quote-version-schneider-0000189-b-r1",
    quoteContentHash: `sha256:${"2".repeat(64)}`,
    displayNumber: "0000189-B",
    approvalReceiptIds: ["approval-schneider-b-r1"],
    decisionReceipt: {
      id: "decision-schneider-b-r1",
      decision: "accepted",
      actorId: "client-contact-madeline",
      decidedAt: "2026-07-15T16:02:00Z",
      consentTextVersion: "cco-client-acceptance@1",
      viewReceiptId: "view-schneider-b-r1",
      requestId: "decision-request-schneider-b-r1",
    },
    clientId: "client-schneider-electric",
    opportunityId: "opportunity-first-layer",
    briefId: "brief-first-layer",
    project: {
      title: "The First Layer",
      description: "Production project activated from 0000189-B.",
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
        acceptanceCriteria: [
          "2.5 to 3.5 minute master",
          "Captions and approved master exports",
        ],
      },
    ],
    productionModules: ["Co-Script", "Co-Edit", "Co-Deliver"],
    artifactRefs: [
      {
        kind: "production_manifest",
        artifactId: "artifact-production-manifest-schneider-b-r1",
        sha256: "3".repeat(64),
        classification: "production_safe",
      },
      {
        kind: "brief",
        artifactId: "artifact-brief-schneider-b-r1",
        sha256: "4".repeat(64),
        classification: "production_safe",
      },
    ],
    coCreditBudget: {
      credits: 25_000,
      policyVersion: "co-credit-production@1",
    },
  };
}

function internallyOriginatedPayload(): ProposalHandoffPayload {
  const payload = validPayload();
  const accountId = "10000000-0000-4000-8000-000000000001";
  const opportunityId = "20000000-0000-4000-8000-000000000002";
  const briefRevisionId = "30000000-0000-4000-8000-000000000003";
  const briefContentHash = `sha256:${"4".repeat(64)}` as const;
  payload.clientId = accountId;
  payload.opportunityId = opportunityId;
  payload.briefId = briefRevisionId;
  payload.origin = {
    authority: "co-videopro-crm",
    inquiryId: "40000000-0000-4000-8000-000000000004",
    accountId,
    accountAuthorityVersion: 3,
    primaryContactId: "50000000-0000-4000-8000-000000000005",
    contactAuthorityVersion: 2,
    opportunityId,
    opportunityAuthorityVersion: 7,
    briefRevisionId,
    briefRevisionNumber: 4,
    briefContentHash,
  };
  payload.artifactRefs[1] = {
    kind: "brief",
    artifactId: briefRevisionId,
    sha256: "4".repeat(64),
    classification: "production_safe",
  };
  return payload;
}

function signedRequest({
  payload = validPayload(),
  issuedAt = "2026-07-15T17:00:00.000Z",
  expiresAt = "2026-07-15T17:10:00.000Z",
}: {
  payload?: ProposalHandoffPayload;
  issuedAt?: string;
  expiresAt?: string;
} = {}): ProposalHandoffRequest {
  const request: ProposalHandoffRequest = {
    schemaVersion: PROPOSAL_HANDOFF_SCHEMA_VERSION,
    attestation: {
      keyId: "cco-proposal-ed25519-2026-01",
      issuedAt,
      expiresAt,
      nonce: "hKJ9BU9s5bZ0aNeRz9H7bg",
      payloadHash: proposalHandoffPayloadHash(payload),
      signature: "x".repeat(86),
    },
    payload,
  };
  request.attestation.signature = sign(
    null,
    Buffer.from(proposalHandoffAttestationMessage(request), "utf8"),
    signingKeys.privateKey,
  ).toString("base64url");
  return request;
}

test("signed Proposal Studio packages become production-safe handoff payloads", () => {
  const parsed = parseProposalHandoffRequest(signedRequest());
  const verified = verifyProposalHandoffAttestation({
    request: parsed,
    publicKey: publicKeyPem,
    now: new Date("2026-07-15T17:05:00.000Z"),
  });

  assert.equal(parsed.payload.decisionReceipt.decision, "accepted");
  assert.deepEqual(parsed.payload.productionModules, [
    "Co-Script",
    "Co-Edit",
    "Co-Deliver",
  ]);
  assert.deepEqual(parsed.payload.coCreditBudget, {
    credits: 25_000,
    policyVersion: "co-credit-production@1",
  });
  assert.equal(verified.payloadHash, parsed.attestation.payloadHash);

  const serialized = JSON.stringify(parsed.payload);
  assert.doesNotMatch(
    serialized,
    /totalCents|currency|subtotal|deposit|payment|charge|unitPrice/i,
  );
});

test("canonical CRM origins are identity, version, and brief-evidence bound", () => {
  const parsed = parseProposalHandoffRequest(
    signedRequest({ payload: internallyOriginatedPayload() }),
  );
  assert.deepEqual(parsed.payload.origin, internallyOriginatedPayload().origin);

  const mismatchedAccount = internallyOriginatedPayload();
  mismatchedAccount.clientId = "60000000-0000-4000-8000-000000000006";
  assert.throws(
    () =>
      parseProposalHandoffRequest(
        signedRequest({ payload: mismatchedAccount }),
      ),
    (error: unknown) =>
      error instanceof ProposalHandoffValidationError &&
      error.code === "origin_binding_mismatch",
  );

  const missingBriefEvidence = internallyOriginatedPayload();
  missingBriefEvidence.artifactRefs = missingBriefEvidence.artifactRefs.filter(
    (artifact) => artifact.kind !== "brief",
  );
  assert.throws(
    () =>
      parseProposalHandoffRequest(
        signedRequest({ payload: missingBriefEvidence }),
      ),
    (error: unknown) =>
      error instanceof ProposalHandoffValidationError &&
      error.code === "origin_brief_evidence_missing",
  );

  const staleBriefEvidence = internallyOriginatedPayload();
  staleBriefEvidence.artifactRefs[1] = {
    ...staleBriefEvidence.artifactRefs[1],
    sha256: "9".repeat(64),
  };
  assert.throws(
    () =>
      parseProposalHandoffRequest(
        signedRequest({ payload: staleBriefEvidence }),
      ),
    (error: unknown) =>
      error instanceof ProposalHandoffValidationError &&
      error.code === "origin_brief_evidence_missing",
  );
});

test("tampered, expired, and incorrectly signed attestations fail closed", () => {
  const tampered = signedRequest();
  tampered.payload.briefId = "tampered-brief";
  assert.throws(
    () =>
      verifyProposalHandoffAttestation({
        request: tampered,
        publicKey: publicKeyPem,
        now: new Date("2026-07-15T17:05:00.000Z"),
      }),
    (error: unknown) =>
      error instanceof ProposalHandoffValidationError &&
      error.code === "attestation_payload_mismatch",
  );

  const expired = signedRequest();
  assert.throws(
    () =>
      verifyProposalHandoffAttestation({
        request: expired,
        publicKey: publicKeyPem,
        now: new Date("2026-07-15T17:11:00.000Z"),
      }),
    (error: unknown) =>
      error instanceof ProposalHandoffValidationError &&
      error.code === "invalid_attestation_window",
  );

  const wrongPublicKey = alternateKeys.publicKey.export({
    format: "pem",
    type: "spki",
  }).toString();
  assert.throws(
    () =>
      verifyProposalHandoffAttestation({
        request: signedRequest(),
        publicKey: wrongPublicKey,
        now: new Date("2026-07-15T17:05:00.000Z"),
      }),
    (error: unknown) =>
      error instanceof ProposalHandoffValidationError &&
      error.code === "invalid_attestation_signature",
  );
});

test("commercial and unknown fields are rejected instead of silently discarded", () => {
  const commercial = signedRequest() as unknown as Record<string, unknown>;
  const commercialPayload = commercial.payload as Record<string, unknown>;
  commercialPayload.totalCents = 1_225_000;
  assert.throws(
    () => parseProposalHandoffRequest(commercial),
    (error: unknown) =>
      error instanceof ProposalHandoffValidationError &&
      error.code === "commercial_field_forbidden",
  );

  const unknown = signedRequest() as unknown as Record<string, unknown>;
  const unknownPayload = unknown.payload as Record<string, unknown>;
  unknownPayload.teamId = "4e611835-e5c2-4ddc-8a24-22623dc43a29";
  assert.throws(
    () => parseProposalHandoffRequest(unknown),
    (error: unknown) =>
      error instanceof ProposalHandoffValidationError &&
      error.code === "unknown_field",
  );
});

test("idempotency is exactly bound to package, version, and issued variant", () => {
  const normalized = validPayload();
  normalized.idempotencyKey = normalized.idempotencyKey.toUpperCase();
  const parsed = parseProposalHandoffRequest(signedRequest({ payload: normalized }));
  assert.equal(
    parsed.payload.idempotencyKey,
    "cco:proposal-package-schneider-first-layer:v1:b",
  );

  const alternate = validPayload();
  alternate.idempotencyKey = "cco:some-other-package:v1:b";
  assert.throws(
    () => parseProposalHandoffRequest(signedRequest({ payload: alternate })),
    (error: unknown) =>
      error instanceof ProposalHandoffValidationError &&
      error.code === "idempotency_binding_mismatch",
  );

  const tooLarge = validPayload();
  tooLarge.packageVersion = 2_147_483_648;
  assert.throws(
    () => parseProposalHandoffRequest(signedRequest({ payload: tooLarge })),
    (error: unknown) =>
      error instanceof ProposalHandoffValidationError &&
      error.code === "invalid_integer",
  );
});

test("receiver proof requires an independent 32-byte secret", () => {
  const canonicalPayload = JSON.stringify(validPayload());
  const secret = Buffer.alloc(32, 9).toString("base64url");
  assert.match(
    proposalHandoffReceiverProof({ canonicalPayload, secret }),
    /^[a-f0-9]{64}$/,
  );
  assert.throws(
    () => proposalHandoffReceiverProof({ canonicalPayload, secret: "too-short" }),
    (error: unknown) =>
      error instanceof ProposalHandoffValidationError &&
      error.code === "invalid_receiver_secret",
  );
});

test("production scope, real dates, constraints, modules, and artifacts are bounded", () => {
  const duplicateScope = validPayload();
  duplicateScope.scopeItemIds = ["same", "same"];
  assert.throws(
    () => parseProposalHandoffRequest(signedRequest({ payload: duplicateScope })),
    (error: unknown) =>
      error instanceof ProposalHandoffValidationError &&
      error.code === "duplicate_items",
  );

  const impossibleDate = validPayload();
  impossibleDate.project.productionWindow.startDate = "2026-02-30";
  assert.throws(
    () => parseProposalHandoffRequest(signedRequest({ payload: impossibleDate })),
    (error: unknown) =>
      error instanceof ProposalHandoffValidationError &&
      error.code === "invalid_date",
  );

  const missingConstraints = validPayload();
  missingConstraints.project.productionWindow.constraints = [];
  assert.throws(
    () => parseProposalHandoffRequest(signedRequest({ payload: missingConstraints })),
    (error: unknown) =>
      error instanceof ProposalHandoffValidationError &&
      error.field === "payload.project.productionWindow.constraints",
  );

  const wrongModules = validPayload();
  wrongModules.productionModules = ["Co-Deliver", "Co-Edit", "Co-Script"];
  assert.throws(
    () => parseProposalHandoffRequest(signedRequest({ payload: wrongModules })),
    (error: unknown) =>
      error instanceof ProposalHandoffValidationError &&
      error.code === "invalid_production_modules",
  );

  const proposalRender = validPayload() as unknown as Record<string, unknown>;
  const refs = proposalRender.artifactRefs as Array<Record<string, unknown>>;
  refs[0] = {
    kind: "pdf",
    artifactId: "client-proposal.pdf",
    sha256: "3".repeat(64),
    classification: "production_safe",
  };
  assert.throws(
    () =>
      parseProposalHandoffRequest(
        signedRequest({ payload: proposalRender as unknown as ProposalHandoffPayload }),
      ),
    (error: unknown) =>
      error instanceof ProposalHandoffValidationError &&
      error.code === "invalid_artifact_kind",
  );
});
