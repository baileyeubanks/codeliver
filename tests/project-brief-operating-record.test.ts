import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProjectOperatingRecord,
  type ProjectOperatingBriefInput,
  type ProjectOperatingRecordInput,
} from "../lib/co-produce/project-operating-record.ts";

const CONTENT_HASH = `sha256:${"4".repeat(64)}`;

function briefInput(
  overrides: Partial<ProjectOperatingBriefInput> = {},
): ProjectOperatingBriefInput {
  return {
    revisionId: "project-brief-first-layer-r1",
    sourceCreativeBriefRevisionId: "brief-first-layer",
    revisionNumber: 3,
    title: "The First Layer production brief",
    objectives: ["Explain the first-layer strategy"],
    audiences: ["Industrial operations leaders"],
    keyMessages: ["Visibility begins at the first layer"],
    requestedDeliverables: ["Hero film", "Social cutdowns"],
    constraints: ["Film only at approved facilities"],
    references: ["https://example.com/reference"],
    successCriteria: ["Approved by the campaign owner"],
    content: {
      title: "The First Layer production brief",
      objectives: ["Explain the first-layer strategy"],
    },
    contentHash: CONTENT_HASH,
    createdAt: "2026-07-15T18:00:00.000Z",
    sourceProposalRequestReceiptId: "proposal-request-first-layer",
    sourceActivationAuthorizationReceiptId:
      "activation-authorization-first-layer",
    ...overrides,
  };
}

function fixture(
  accessRole: ProjectOperatingRecordInput["accessRole"] = "owner",
  brief: ProjectOperatingBriefInput | null = briefInput(),
): ProjectOperatingRecordInput {
  return {
    project: {
      id: "project-first-layer",
      name: "The First Layer",
      status: "active",
      createdAt: "2026-07-15T16:00:00.000Z",
      updatedAt: "2026-07-15T17:00:00.000Z",
    },
    accessRole,
    handoff: {
      receiptId: "receipt-first-layer",
      activatedAt: "2026-07-15T16:03:00.000Z",
      displayNumber: "0000189-B",
      packageId: "package-first-layer",
      packageVersion: 1,
      proposalVersionId: "proposal-first-layer-r1",
      quoteVersionId: "quote-first-layer-r1",
      projectSeed: {
        productionWindow: {
          startDate: "2026-08-03",
          dueDate: "2026-09-18",
          constraints: ["Client site access requires advance approval"],
        },
      },
      productionSeed: {
        clientId: "client-schneider-electric",
        opportunityId: "opportunity-first-layer",
        briefId: "brief-first-layer",
        scopeItemIds: ["development", "production", "editorial"],
        deliverables: [
          {
            id: "deliverable-hero-film",
            title: "The First Layer hero film",
            acceptanceCriteria: ["2.5 to 3.5 minute master"],
          },
        ],
        productionModules: ["Co-Script", "Co-Edit", "Co-Deliver"],
      },
      origin: {
        linked: true,
        sourceInquiryId: "inquiry-first-layer",
        primaryContactId: "contact-first-layer",
        briefContentHash: CONTENT_HASH,
        opportunityAuthorityVersion: 8,
        linkHash: `sha256:${"7".repeat(64)}`,
      },
      brief,
    },
    assets: [],
  };
}

test("durable brief semantics are visible only to internal contributor roles", () => {
  const internalRoles = [
    "owner",
    "admin",
    "producer",
    "editor",
    "member",
  ] as const;
  for (const role of internalRoles) {
    const record = buildProjectOperatingRecord(fixture(role));
    assert.equal(
      record.context.brief?.revisionId,
      "project-brief-first-layer-r1",
      role,
    );
    assert.equal(
      record.context.brief?.sourceCreativeBriefRevisionId,
      "brief-first-layer",
      role,
    );
    assert.equal(
      record.context.brief?.sourceProposalRequestReceiptId,
      "proposal-request-first-layer",
      role,
    );
    assert.equal(record.revisionAt, "2026-07-15T18:00:00.000Z", role);
  }

  for (const role of ["reviewer", "viewer"] as const) {
    const record = buildProjectOperatingRecord(fixture(role));
    assert.equal(record.context.brief, null, role);
    assert.equal(record.context.deliverables.length, 1, role);
    assert.equal(record.context.productionWindow?.startDate, "2026-08-03", role);
    assert.equal(record.revisionAt, "2026-07-15T18:00:00.000Z", role);
  }
});

test("missing durable brief semantics stay null and leave honest planning evidence", () => {
  const record = buildProjectOperatingRecord(fixture("owner", null));
  const planning = record.workspaces.find(
    (workspace) => workspace.id === "pre_production",
  );

  assert.equal(record.context.brief, null);
  assert.equal(record.context.deliverables.length, 1);
  assert.equal(record.context.productionWindow?.dueDate, "2026-09-18");
  assert.equal(planning?.status, "blocked");
  const hasDurableBriefBlocker =
    planning?.blockers.some((blocker) => /durable project brief/i.test(blocker)) ??
    false;
  assert.equal(hasDurableBriefBlocker, true);
  assert.equal(planning?.status === "ready" && hasDurableBriefBlocker, false);
  assert.equal(
    planning?.evidence.some((item) => /brief revision/i.test(item)),
    false,
  );
});

test("every unknown durable brief value is validated and bounded", async (t) => {
  const invalidCases: [string, Partial<ProjectOperatingBriefInput>][] = [
    ["revision id", { revisionId: "x".repeat(241) }],
    [
      "source creative brief revision id",
      { sourceCreativeBriefRevisionId: "x".repeat(241) },
    ],
    ["revision number", { revisionNumber: 2.5 }],
    ["title", { title: "x".repeat(241) }],
    ["objectives", { objectives: "not-an-array" }],
    ["audiences", { audiences: ["x".repeat(2_001)] }],
    ["key messages", { keyMessages: [null] }],
    ["requested deliverables", { requestedDeliverables: new Array(101).fill("x") }],
    ["constraints", { constraints: [{}] }],
    ["references", { references: [""] }],
    ["success criteria", { successCriteria: ["   "] }],
    ["content", { content: { body: "x".repeat(65_537) } }],
    ["content hash", { contentHash: "not-a-hash" }],
    ["created at", { createdAt: "not-a-timestamp" }],
    [
      "proposal request receipt",
      { sourceProposalRequestReceiptId: "x".repeat(241) },
    ],
    [
      "activation authorization receipt",
      { sourceActivationAuthorizationReceiptId: { unsafe: true } },
    ],
  ];

  for (const [name, overrides] of invalidCases) {
    await t.test(name, () => {
      const record = buildProjectOperatingRecord(
        fixture("owner", briefInput(overrides)),
      );
      assert.equal(record.context.brief, null);
      assert.equal(record.revisionAt, "2026-07-15T17:00:00.000Z");
    });
  }
});

test("missing either source receipt nulls the entire durable brief", () => {
  const missingProposalRequest = buildProjectOperatingRecord(
    fixture("owner", briefInput({ sourceProposalRequestReceiptId: null })),
  );
  const missingActivationAuthorization = buildProjectOperatingRecord(
    fixture(
      "owner",
      briefInput({ sourceActivationAuthorizationReceiptId: null }),
    ),
  );

  assert.equal(missingProposalRequest.context.brief, null);
  assert.equal(missingActivationAuthorization.context.brief, null);
});

test("source brief identity and hash must agree with the durable handoff lineage", () => {
  const independentProjectRevision = buildProjectOperatingRecord(
    fixture("owner", briefInput({ revisionId: "another-project-brief-row" })),
  );
  const mismatchedSourceRevision = buildProjectOperatingRecord(
    fixture(
      "owner",
      briefInput({ sourceCreativeBriefRevisionId: "different-source-brief" }),
    ),
  );
  const mismatchedHash = buildProjectOperatingRecord(
    fixture(
      "owner",
      briefInput({ contentHash: `sha256:${"5".repeat(64)}` }),
    ),
  );

  assert.equal(
    independentProjectRevision.context.brief?.revisionId,
    "another-project-brief-row",
  );
  assert.equal(mismatchedSourceRevision.context.brief, null);
  assert.equal(mismatchedHash.context.brief, null);
});
