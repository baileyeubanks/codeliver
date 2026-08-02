import assert from "node:assert/strict";
import test from "node:test";

import {
  createProposalStudioImportContext,
  ProposalStudioContextError,
} from "../lib/proposals/proposal-studio-contract.ts";

const ids = {
  inquiry: "11111111-1111-4111-8111-111111111111",
  account: "22222222-2222-4222-8222-222222222222",
  contact: "33333333-3333-4333-8333-333333333333",
  opportunity: "44444444-4444-4444-8444-444444444444",
  brief: "55555555-5555-4555-8555-555555555555",
};

function validInput() {
  return {
    origin: {
      authority: "co-videopro-crm" as const,
      inquiryId: ids.inquiry,
      accountId: ids.account,
      accountAuthorityVersion: 3,
      primaryContactId: ids.contact,
      contactAuthorityVersion: 2,
      opportunityId: ids.opportunity,
      opportunityAuthorityVersion: 7,
      briefRevisionId: ids.brief,
      briefRevisionNumber: 4,
      briefContentHash: `sha256:${"a".repeat(64)}`,
    },
    opportunity: {
      id: ids.opportunity,
      name: "Schneider First Layer",
      authorityVersion: 7,
      stage: "proposal_requested" as const,
    },
    client: {
      id: ids.account,
      displayName: "Schneider Electric",
      authorityVersion: 3,
    },
    contact: {
      id: ids.contact,
      authorityVersion: 2,
    },
    brief: {
      id: ids.brief,
      revisionNumber: 4,
      contentHash: `sha256:${"a".repeat(64)}` as `sha256:${string}`,
      status: "ready_for_proposal" as const,
      title: "The First Layer campaign",
      requestedDeliverables: ["Hero film", "Social cutdowns"],
      constraints: ["Plant access requires clearance"],
    },
    readiness: {
      receiptId: "77777777-7777-4777-8777-777777777777",
      requestedAt: "2026-07-16T10:00:00.000Z",
    },
    requestedProductionWindow: {
      desiredStartDate: "2026-08-03",
      dueDate: "2026-09-18",
      flexibility: "somewhat_flexible" as const,
    },
  };
}

test("CRM context becomes a price-free Proposal Studio import contract", () => {
  const context = createProposalStudioImportContext(validInput());

  assert.equal(context.schemaVersion, "cco.proposal-studio.import-context.v3");
  assert.equal(context.pricingIncluded, false);
  assert.equal(context.origin.opportunityId, ids.opportunity);
  assert.equal(context.brief.contentHash, `sha256:${"a".repeat(64)}`);
  assert.equal(context.opportunity.stage, "proposal_requested");
  assert.equal(context.brief.status, "ready_for_proposal");
  assert.equal(context.readiness.receiptId, "77777777-7777-4777-8777-777777777777");
  assert.deepEqual(context.requestedProductionWindow, {
    source: "client_reported",
    authority: "non_authoritative",
    desiredStartDate: "2026-08-03",
    dueDate: "2026-09-18",
    flexibility: "somewhat_flexible",
  });
  assert.equal("totalCents" in context, false);
  assert.equal("rateCard" in context, false);
  assert.equal("deposit" in context, false);
});

test("client-requested production dates remain non-authoritative and ordered", () => {
  const input = validInput();
  input.requestedProductionWindow.dueDate = "2026-07-31";

  assert.throws(
    () => createProposalStudioImportContext(input),
    (error: unknown) =>
      error instanceof ProposalStudioContextError &&
      error.code === "invalid_context_date_range",
  );
});

test("context fails closed when a proposal no longer matches CRM authority", () => {
  const input = validInput();
  input.brief.revisionNumber = 5;

  assert.throws(
    () => createProposalStudioImportContext(input),
    (error: unknown) =>
      error instanceof ProposalStudioContextError &&
      error.code === "stale_origin_context",
  );
});

test("context fails closed when the proposal points at another client", () => {
  const input = validInput();
  input.client.id = "66666666-6666-4666-8666-666666666666";

  assert.throws(
    () => createProposalStudioImportContext(input),
    (error: unknown) =>
      error instanceof ProposalStudioContextError &&
      error.code === "client_origin_mismatch",
  );
});

test("context rejects a brief before the governed proposal request", () => {
  const input = validInput();
  (input.opportunity as { stage: string }).stage = "discovery";

  assert.throws(
    () => createProposalStudioImportContext(input),
    (error: unknown) =>
      error instanceof ProposalStudioContextError &&
      error.code === "proposal_not_requested",
  );
});

test("context rejects a contact that does not match the CRM origin", () => {
  const input = validInput();
  input.contact.id = "66666666-6666-4666-8666-666666666666";

  assert.throws(
    () => createProposalStudioImportContext(input),
    (error: unknown) =>
      error instanceof ProposalStudioContextError &&
      error.code === "contact_origin_mismatch",
  );
});

test("context rejects malformed authority identifiers before Proposal Studio sees them", () => {
  const input = validInput();
  input.origin.briefRevisionId = "brief-not-a-uuid";

  assert.throws(
    () => createProposalStudioImportContext(input),
    (error: unknown) =>
      error instanceof ProposalStudioContextError &&
      error.code === "invalid_context_id",
  );
});
