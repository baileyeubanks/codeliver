import assert from "node:assert/strict";
import test from "node:test";
import {
  createInquiryFingerprint,
  hashPreProjectPayload,
  parseInquiryQualificationReceipt,
  parseIntakeFormReceipt,
  parseInquiryQualificationMutation,
  parsePublicInquiryRequest,
  parsePublicInquiryReceipt,
  parsePublicInquirySubmission,
  PreProjectValidationError,
  PUBLIC_INQUIRY_REQUEST_SCHEMA_VERSION,
  PUBLIC_INQUIRY_SCHEMA_VERSION,
} from "../lib/crm/preproject.ts";

const FORM_KEY = `ifm_${"a".repeat(64)}`;
const REQUEST_ID = "10000000-0000-4000-8000-000000000001";

function inquiry() {
  return {
    schemaVersion: PUBLIC_INQUIRY_SCHEMA_VERSION,
    formKey: FORM_KEY,
    idempotencyKey: "inquiry.web.20260716.0001",
    contact: {
      name: "Bailey Eubanks",
      email: "BAILEY@EXAMPLE.COM",
      phone: "+19155550123",
    },
    company: {
      name: "First Layer",
      website: "https://example.com/work",
    },
    project: {
      title: "EPC recruiting film",
      goals: ["Explain the work clearly"],
      audiences: ["Experienced engineers"],
      requestedDeliverables: ["Primary film", "Social cutdowns"],
      references: ["https://example.com/reference"],
      constraints: ["Film during the operating day"],
      notes: "Interview-led approach.",
    },
    timeline: {
      desiredStartDate: "2026-08-01",
      dueDate: "2026-09-15",
      flexibility: "somewhat_flexible",
    },
    budgetSignal: { band: "25k_50k" },
    consent: {
      privacyAccepted: true,
      policyVersion: "privacy.2026-07",
      marketingEmailOptIn: false,
      operationalSmsOptIn: true,
      operationalImessageOptIn: false,
    },
    website: "",
  };
}

function qualification() {
  return {
    expectedVersion: 1,
    requestId: REQUEST_ID,
    account: {
      displayName: "First Layer",
      legalName: "First Layer LLC",
      website: "https://example.com",
    },
    contact: {
      name: "Bailey Eubanks",
      email: "bailey@example.com",
      phone: "+19155550123",
      title: "Executive Producer",
    },
    opportunity: {
      name: "EPC recruiting film",
      ownerId: null,
      probabilityBasisPoints: 3500,
      expectedCloseDate: "2026-08-15",
    },
    brief: {
      title: "EPC recruiting film brief",
      objectives: ["Explain the work clearly"],
      audiences: ["Experienced engineers"],
      keyMessages: ["Real work, real people"],
      requestedDeliverables: ["Primary film", "Social cutdowns"],
      constraints: ["Film during the operating day"],
      references: ["https://example.com/reference"],
      successCriteria: ["Qualified applicants understand the role"],
    },
  };
}

test("public inquiry intake normalizes discovery facts without creating commercial truth", () => {
  const parsed = parsePublicInquirySubmission(inquiry());
  assert.equal(parsed.schemaVersion, "cco.public-inquiry.v1");
  assert.equal(parsed.formKey, FORM_KEY);
  assert.equal(parsed.contact.email, "bailey@example.com");
  assert.deepEqual(parsed.project.requestedDeliverables, [
    "Primary film",
    "Social cutdowns",
  ]);
  assert.equal(parsed.timeline.dueDate, "2026-09-15");
  assert.equal(parsed.budgetSignal.source, "client_reported");
  assert.equal(parsed.budgetSignal.authority, "non_authoritative");
  assert.equal(parsed.consent.operationalSmsOptIn, true);
  assert.equal("totalCents" in parsed, false);
  assert.equal("attachments" in parsed, false);
  assert.equal("accessToken" in parsed, false);
});

test("public intake rejects unknown, commercial, automated, and malformed fields", () => {
  for (const mutate of [
    (value: ReturnType<typeof inquiry>) => Object.assign(value, { totalCents: 50_000 }),
    (value: ReturnType<typeof inquiry>) => Object.assign(value.project, { metadata: {} }),
    (value: ReturnType<typeof inquiry>) => Object.assign(value, { website: "bot.example" }),
    (value: ReturnType<typeof inquiry>) => Object.assign(value.contact, { email: "not-an-email" }),
    (value: ReturnType<typeof inquiry>) => Object.assign(value.timeline, { dueDate: "2026-01-01" }),
  ]) {
    const value = inquiry();
    mutate(value);
    assert.throws(
      () => parsePublicInquirySubmission(value),
      (error) => error instanceof PreProjectValidationError,
    );
  }
});

test("phone-channel consent remains bound to a submitted destination", () => {
  const value = inquiry();
  value.contact.phone = null as unknown as string;
  assert.throws(
    () => parsePublicInquirySubmission(value),
    (error) =>
      error instanceof PreProjectValidationError &&
      error.code === "phone_consent_requires_phone",
  );
});

test("public inquiry request v2 binds a capability-scoped attachment manifest", () => {
  const attachmentId = "11000000-0000-4000-8000-000000000001";
  const request = parsePublicInquiryRequest({
    schemaVersion: PUBLIC_INQUIRY_REQUEST_SCHEMA_VERSION,
    inquiry: inquiry(),
    attachmentClaim: {
      batchToken: `iatb_${"b".repeat(64)}`,
      attachments: [
        { attachmentId, contentHash: `sha256:${"c".repeat(64)}` },
      ],
    },
  });
  assert.equal(request.schemaVersion, "cco.public-inquiry-request.v2");
  assert.equal(request.attachmentClaim.batchToken, `iatb_${"b".repeat(64)}`);
  assert.deepEqual(request.attachmentClaim.attachments, [
    { attachmentId, contentHash: `sha256:${"c".repeat(64)}` },
  ]);

  const legacy = parsePublicInquiryRequest(inquiry());
  assert.deepEqual(legacy.attachmentClaim, { batchToken: null, attachments: [] });
});

test("attachment claims reject missing capabilities, duplicate IDs, and unknown fields", () => {
  const attachmentId = "11000000-0000-4000-8000-000000000001";
  const base = {
    schemaVersion: PUBLIC_INQUIRY_REQUEST_SCHEMA_VERSION,
    inquiry: inquiry(),
    attachmentClaim: {
      batchToken: `iatb_${"d".repeat(64)}`,
      attachments: [
        { attachmentId, contentHash: `sha256:${"e".repeat(64)}` },
      ],
    },
  };
  for (const invalid of [
    {
      ...base,
      attachmentClaim: { ...base.attachmentClaim, batchToken: null },
    },
    {
      ...base,
      attachmentClaim: {
        ...base.attachmentClaim,
        attachments: [
          ...base.attachmentClaim.attachments,
          ...base.attachmentClaim.attachments,
        ],
      },
    },
    { ...base, attachmentClaim: { ...base.attachmentClaim, storagePath: "/tmp" } },
  ]) {
    assert.throws(
      () => parsePublicInquiryRequest(invalid),
      (error) => error instanceof PreProjectValidationError,
    );
  }
});

test("qualification is optimistic, tenant-safe by UUID, and contains no deal amount", () => {
  const parsed = parseInquiryQualificationMutation(qualification());
  assert.equal(parsed.expectedVersion, 1);
  assert.equal(parsed.opportunity.probabilityBasisPoints, 3500);
  assert.equal(parsed.brief.objectives[0], "Explain the work clearly");
  assert.equal("valueCents" in parsed.opportunity, false);
  assert.equal("currency" in parsed.opportunity, false);

  const unsafe = qualification();
  Object.assign(unsafe.opportunity, { valueCents: 100_000 });
  assert.throws(
    () => parseInquiryQualificationMutation(unsafe),
    /not accepted/i,
  );
});

test("canonical hashes ignore object key order and change with inquiry content", () => {
  const parsed = parsePublicInquirySubmission(inquiry());
  const reordered = {
    consent: parsed.consent,
    project: parsed.project,
    budgetSignal: parsed.budgetSignal,
    timeline: parsed.timeline,
    company: parsed.company,
    contact: parsed.contact,
    idempotencyKey: parsed.idempotencyKey,
    formKey: parsed.formKey,
    schemaVersion: parsed.schemaVersion,
  };
  assert.equal(hashPreProjectPayload(parsed), hashPreProjectPayload(reordered));
  assert.notEqual(
    hashPreProjectPayload(parsed),
    hashPreProjectPayload({ ...reordered, idempotencyKey: "inquiry.web.20260716.0002" }),
  );
});

test("public rate fingerprints are purpose-bound HMACs and never expose the address", () => {
  const value = createInquiryFingerprint({
    secret: "0123456789abcdef0123456789abcdef",
    edgeAddress: "203.0.113.15",
  });
  assert.match(
    value,
    /^hmac-sha256:cco-public-inquiry-rate-limit:v1:[0-9a-f]{64}$/,
  );
  assert.equal(value.includes("203.0.113.15"), false);
  assert.notEqual(
    value,
    createInquiryFingerprint({
      secret: "0123456789abcdef0123456789abcdef",
      edgeAddress: "203.0.113.16",
    }),
  );
  assert.throws(
    () =>
      createInquiryFingerprint({
        secret: "short",
        edgeAddress: "203.0.113.15",
      }),
    /unavailable/i,
  );
});

test("database receipts are parsed from one exact snake-case contract", () => {
  assert.deepEqual(
    parsePublicInquiryReceipt({
      request_id: REQUEST_ID,
      status: "received",
      replayed: false,
    }),
    {
      requestId: REQUEST_ID,
      status: "received",
      replayed: false,
      attachmentCount: 0,
    },
  );
  assert.equal(
    parsePublicInquiryReceipt({
      request_id: REQUEST_ID,
      status: "received",
      replayed: true,
      attachment_count: 2,
    })?.attachmentCount,
    2,
  );

  const formReceipt = parseIntakeFormReceipt({
    form_id: "20000000-0000-4000-8000-000000000001",
    team_id: "30000000-0000-4000-8000-000000000001",
    form_key: FORM_KEY,
    name: "Website discovery",
    status: "active",
    success_message: "Received.",
    authority_version: 1,
    request_id: REQUEST_ID,
    created_at: "2026-07-16T02:00:00.000Z",
    replayed: false,
  });
  assert.equal(formReceipt?.formKey, FORM_KEY);
  assert.equal(formReceipt?.authorityVersion, 1);

  const qualificationReceipt = parseInquiryQualificationReceipt({
    mutation_receipt_id: "40000000-0000-4000-8000-000000000001",
    inquiry_id: "50000000-0000-4000-8000-000000000001",
    account_id: "60000000-0000-4000-8000-000000000001",
    contact_id: "70000000-0000-4000-8000-000000000001",
    opportunity_id: "80000000-0000-4000-8000-000000000001",
    creative_brief_revision_id: "90000000-0000-4000-8000-000000000001",
    brief_revision_number: 1,
    brief_content_hash: `sha256:${"b".repeat(64)}`,
    mutation_version: 2,
    request_id: REQUEST_ID,
    replayed: false,
  });
  assert.equal(qualificationReceipt?.briefRevisionNumber, 1);
  assert.equal(qualificationReceipt?.mutationVersion, 2);
  assert.equal(
    parseInquiryQualificationReceipt({
      ...qualificationReceipt,
      brief_content_hash: "unsafe",
    }),
    null,
  );
});
