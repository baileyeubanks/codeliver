import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProjectOperatingRecord,
  PROJECT_OPERATING_RECORD_SCHEMA_VERSION,
  type ProjectOperatingRecordInput,
} from "../lib/co-produce/project-operating-record.ts";

function fixture(
  overrides: Partial<ProjectOperatingRecordInput> = {},
): ProjectOperatingRecordInput {
  return {
    project: {
      id: "project-first-layer",
      name: "The First Layer",
      status: "active",
      createdAt: "2026-07-15T16:03:00.000Z",
      updatedAt: "2026-07-15T16:05:00.000Z",
    },
    accessRole: "owner",
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
      brief: {
        revisionId: "project-brief-first-layer-r1",
        sourceCreativeBriefRevisionId: "brief-first-layer",
        revisionNumber: 1,
        title: "The First Layer production brief",
        objectives: ["Explain the first-layer strategy"],
        audiences: ["Industrial operations leaders"],
        keyMessages: ["Visibility begins at the first layer"],
        requestedDeliverables: ["Hero film"],
        constraints: ["Film only at approved facilities"],
        references: ["https://example.com/reference"],
        successCriteria: ["Approved by the campaign owner"],
        content: { title: "The First Layer production brief" },
        contentHash: `sha256:${"4".repeat(64)}`,
        createdAt: "2026-07-15T16:04:00.000Z",
        sourceProposalRequestReceiptId: "proposal-request-first-layer",
        sourceActivationAuthorizationReceiptId:
          "activation-authorization-first-layer",
      },
    },
    evidence: {
      currentVersionCount: 1,
      openReviewThreadCount: 2,
      resolvedReviewThreadCount: 3,
      latestCommentActivityAt: "2026-07-15T17:04:00.000Z",
    },
    assets: [
      {
        id: "asset-hero-film",
        status: "in_review",
        updatedAt: "2026-07-15T17:00:00.000Z",
        commentsCount: 8,
        versionsCount: 4,
        approvalStatuses: ["pending", "approved"],
      },
    ],
    ...overrides,
  };
}

test("accepted proposal context becomes one production-safe operating record", () => {
  const record = buildProjectOperatingRecord(fixture());

  assert.equal(record.schemaVersion, PROJECT_OPERATING_RECORD_SCHEMA_VERSION);
  assert.equal(record.authority.project, "Co-VideoPro");
  assert.equal(record.authority.commercial, "CCO_OS");
  assert.equal(record.authority.preproject, "external_reference");
  assert.equal(record.authority.projection, "read_only");
  assert.equal(record.lineage.source, "accepted_proposal");
  assert.equal(record.lineage.displayNumber, "0000189-B");
  assert.equal(record.lineage.preprojectOrigin, "external_reference");
  assert.equal(record.context.sourceInquiryId, null);
  assert.equal(record.context.primaryContactId, null);
  assert.equal(record.context.briefContentHash, null);
  assert.equal(record.context.clientId, "client-schneider-electric");
  assert.equal(record.context.opportunityId, "opportunity-first-layer");
  assert.equal(record.context.briefId, "brief-first-layer");
  assert.equal(record.context.brief?.revisionId, "project-brief-first-layer-r1");
  assert.equal(record.context.script, null);
  assert.deepEqual(record.context.productionWindow, {
    startDate: "2026-08-03",
    dueDate: "2026-09-18",
    constraints: ["Client site access requires advance approval"],
  });
  assert.equal(record.context.deliverables[0]?.title, "The First Layer hero film");
  assert.deepEqual(record.metrics, {
    assets: 1,
    versions: 4,
    comments: 8,
    approvalsPending: 1,
    approvalsComplete: 1,
    deliverablesPlanned: 1,
    tasks: 0,
    tasksCompleted: 0,
    tasksBlocked: 0,
    planRevision: null,
  });
  assert.deepEqual(record.media, {
    registeredAssets: 1,
    readyAssets: 1,
    processingAssets: 0,
    failedAssets: 0,
    currentVersions: 1,
  });
  assert.deepEqual(record.review, {
    reviewableAssets: 1,
    activeAssets: 1,
    changesRequestedAssets: 0,
    approvedAssets: 0,
    openThreads: 2,
    resolvedThreads: 3,
    latestCommentActivityAt: "2026-07-15T17:04:00.000Z",
  });

  const statuses = Object.fromEntries(
    record.workspaces.map((workspace) => [workspace.id, workspace.status]),
  );
  assert.equal(statuses.sales, "complete");
  assert.equal(statuses.pre_production, "ready");
  assert.equal(statuses.production, "complete");
  assert.equal(statuses.post_production, "active");
  assert.equal(statuses.review, "active");
  assert.equal(statuses.delivery, "blocked");
  assert.equal(statuses.archive, "blocked");
  assert.equal(record.revisionAt, "2026-07-15T17:04:00.000Z");
});

test("an accepted handoff with only the legacy brief reference remains blocked", () => {
  const base = fixture();
  const record = buildProjectOperatingRecord(
    fixture({
      handoff: { ...base.handoff!, brief: null },
      evidence: null,
      assets: [],
    }),
  );
  const planning = record.workspaces.find(
    (workspace) => workspace.id === "pre_production",
  );
  const hasDurableBriefBlocker =
    planning?.blockers.some((blocker) => /durable project brief/i.test(blocker)) ??
    false;

  assert.equal(record.context.brief, null);
  assert.equal(planning?.status, "blocked");
  assert.equal(hasDurableBriefBlocker, true);
  assert.equal(planning?.status === "ready" && hasDurableBriefBlocker, false);
});

test("verified CRM lineage is projected into the project without duplicating it", () => {
  const base = fixture();
  const record = buildProjectOperatingRecord(
    fixture({
      handoff: {
        ...base.handoff!,
        origin: {
          linked: true,
          sourceInquiryId: "40000000-0000-4000-8000-000000000004",
          primaryContactId: "50000000-0000-4000-8000-000000000005",
          briefContentHash: `sha256:${"4".repeat(64)}`,
          opportunityAuthorityVersion: 8,
          linkHash: `sha256:${"7".repeat(64)}`,
        },
      },
    }),
  );

  assert.equal(record.authority.preproject, "Co-VideoPro CRM");
  assert.equal(record.lineage.preprojectOrigin, "linked");
  assert.equal(
    record.context.sourceInquiryId,
    "40000000-0000-4000-8000-000000000004",
  );
  assert.equal(
    record.context.primaryContactId,
    "50000000-0000-4000-8000-000000000005",
  );
  assert.equal(record.context.briefContentHash, `sha256:${"4".repeat(64)}`);
  assert.equal(record.context.opportunityAuthorityVersion, 8);
  assert.equal("linkHash" in record.context, false);
});

test("role projection limits workspaces and strips sales lineage from reviewers", () => {
  const base = fixture();
  const record = buildProjectOperatingRecord(
    fixture({
      accessRole: "reviewer",
      handoff: {
        ...base.handoff!,
        origin: {
          linked: true,
          sourceInquiryId: "40000000-0000-4000-8000-000000000004",
          primaryContactId: "50000000-0000-4000-8000-000000000005",
          briefContentHash: `sha256:${"4".repeat(64)}`,
          opportunityAuthorityVersion: 8,
          linkHash: `sha256:${"7".repeat(64)}`,
        },
      },
    }),
  );

  assert.deepEqual(
    record.workspaces.map((workspace) => workspace.id),
    ["review", "delivery"],
  );
  assert.equal(record.workspaces[0]?.access, "review");
  assert.equal(record.lineage.source, "accepted_proposal");
  assert.equal(record.lineage.receiptId, undefined);
  assert.equal(record.lineage.displayNumber, undefined);
  assert.equal(record.context.clientId, null);
  assert.equal(record.context.sourceInquiryId, null);
  assert.equal(record.context.primaryContactId, null);
  assert.equal(record.context.opportunityId, null);
  assert.equal(record.context.briefId, null);
  assert.equal(record.context.briefContentHash, null);
  assert.equal(record.context.opportunityAuthorityVersion, null);
  assert.equal(record.context.deliverables.length, 1);
  assert.equal(record.nextAction?.workspaceId, "review");
});

test("malformed source context fails closed without leaking arbitrary fields", () => {
  const record = buildProjectOperatingRecord(
    fixture({
      handoff: {
        ...fixture().handoff!,
        projectSeed: { productionWindow: { startDate: 7, dueDate: [] } },
        productionSeed: {
          clientId: { nested: "unsafe" },
          opportunityId: "x".repeat(300),
          briefId: null,
          deliverables: [{ id: "only-id" }, "invalid"],
          scopeItemIds: "not-an-array",
          totalCents: 9_999_999,
        },
        origin: {
          linked: true,
          sourceInquiryId: "source-inquiry",
          primaryContactId: "primary-contact",
          briefContentHash: "not-a-hash",
          opportunityAuthorityVersion: 0,
          linkHash: "not-a-hash",
        },
      },
      assets: [],
    }),
  );

  assert.equal(record.context.clientId, null);
  assert.equal(record.context.opportunityId, null);
  assert.equal(record.context.briefId, null);
  assert.equal(record.authority.preproject, "external_reference");
  assert.equal(record.context.sourceInquiryId, null);
  assert.equal(record.context.primaryContactId, null);
  assert.equal(record.context.briefContentHash, null);
  assert.equal(record.context.productionWindow, null);
  assert.deepEqual(record.context.scopeItemIds, []);
  assert.deepEqual(record.context.deliverables, []);
  assert.equal(
    record.workspaces.find((workspace) => workspace.id === "pre_production")?.status,
    "blocked",
  );
  assert.equal("totalCents" in record.context, false);
});

test("approval makes delivery ready but not complete without a durable receipt", () => {
  const record = buildProjectOperatingRecord(
    fixture({
      project: { ...fixture().project, status: "completed" },
      assets: [
        {
          ...fixture().assets[0],
          status: "approved",
          approvalStatuses: ["approved"],
        },
      ],
    }),
  );

  const delivery = record.workspaces.find((workspace) => workspace.id === "delivery");
  const archive = record.workspaces.find((workspace) => workspace.id === "archive");
  assert.equal(delivery?.status, "ready");
  assert.match(delivery?.blockers[0] ?? "", /delivery receipt/i);
  assert.equal(archive?.status, "complete");
});

test("review evidence is bounded and approved-with-changes is a completed step", () => {
  const record = buildProjectOperatingRecord(
    fixture({
      evidence: {
        currentVersionCount: -1,
        openReviewThreadCount: Number.NaN,
        resolvedReviewThreadCount: 4.5,
        latestCommentActivityAt: "not-a-date",
      },
      assets: [
        {
          ...fixture().assets[0],
          status: "ready",
          approvalStatuses: ["approved_with_changes"],
        },
      ],
    }),
  );

  assert.equal(record.metrics.approvalsPending, 0);
  assert.equal(record.metrics.approvalsComplete, 1);
  assert.deepEqual(record.media, {
    registeredAssets: 1,
    readyAssets: 1,
    processingAssets: 0,
    failedAssets: 0,
    currentVersions: null,
  });
  assert.deepEqual(record.review, {
    reviewableAssets: 0,
    activeAssets: 0,
    changesRequestedAssets: 0,
    approvedAssets: 0,
    openThreads: null,
    resolvedThreads: null,
    latestCommentActivityAt: null,
  });
  assert.equal(record.revisionAt, "2026-07-15T17:00:00.000Z");
});

test("manual projects remain usable without inventing a commercial authority", () => {
  const record = buildProjectOperatingRecord(
    fixture({
      handoff: null,
      manualOrigin: { createdAt: "2026-07-15T16:08:00.000Z" },
      assets: [],
      accessRole: "producer",
    }),
  );

  assert.equal(record.authority.commercial, "unlinked");
  assert.equal(record.authority.preproject, "Co-VideoPro");
  assert.deepEqual(record.lineage, {
    source: "manual_project",
    activatedAt: null,
    originRecordedAt: "2026-07-15T16:08:00.000Z",
  });
  assert.equal(
    record.workspaces.find((workspace) => workspace.id === "sales")?.status,
    "not_started",
  );
  assert.equal(record.nextAction?.workspaceId, "pre_production");
});

test("a persisted plan becomes the pre-production status source", () => {
  const record = buildProjectOperatingRecord(
    fixture({
      plan: {
        revisionNumber: 2,
        title: "ICA production plan",
        createdAt: "2026-07-15T17:04:00.000Z",
        updatedAt: "2026-07-15T17:08:00.000Z",
        taskCount: 3,
        completedTaskCount: 1,
        blockedTaskCount: 1,
      },
    }),
  );

  const planning = record.workspaces.find((workspace) => workspace.id === "pre_production");
  assert.equal(planning?.status, "blocked");
  assert.match(planning?.blockers[0] ?? "", /planning task/i);
  assert.deepEqual(
    {
      tasks: record.metrics.tasks,
      tasksCompleted: record.metrics.tasksCompleted,
      tasksBlocked: record.metrics.tasksBlocked,
      planRevision: record.metrics.planRevision,
    },
    {
      tasks: 3,
      tasksCompleted: 1,
      tasksBlocked: 1,
      planRevision: 2,
    },
  );
  assert.equal(record.revisionAt, "2026-07-15T17:08:00.000Z");
});

test("projects with no handoff or manual origin fail closed instead of claiming manual provenance", () => {
  const record = buildProjectOperatingRecord(
    fixture({ handoff: null, manualOrigin: null, assets: [] }),
  );

  assert.equal(record.lineage.source, "unlinked_project");
  assert.equal(record.authority.preproject, "unlinked");
  assert.equal(
    record.workspaces.find((workspace) => workspace.id === "pre_production")?.status,
    "blocked",
  );
});

test("script projection is bounded and visible only to internal contributor roles", () => {
  const script = {
    revisionNumber: 2,
    title: "The First Layer hero script",
    state: "approved" as const,
    format: "documentary" as const,
    estimatedRuntimeSeconds: 180,
    sectionCount: 3,
    createdAt: "2026-07-15T19:00:00.000Z",
  };

  for (const accessRole of ["owner", "admin", "producer", "editor", "member"] as const) {
    const record = buildProjectOperatingRecord(fixture({ accessRole, script }));
    assert.deepEqual(record.context.script, script, accessRole);
    assert.equal(record.revisionAt, script.createdAt, accessRole);
  }

  for (const accessRole of ["reviewer", "viewer"] as const) {
    const record = buildProjectOperatingRecord(fixture({ accessRole, script }));
    assert.equal(record.context.script, null, accessRole);
  }
});

test("malformed script summaries fail closed without hiding other operating context", () => {
  const record = buildProjectOperatingRecord(fixture({
    script: {
      revisionNumber: 1,
      title: "x".repeat(241),
      state: "draft",
      format: "commercial",
      estimatedRuntimeSeconds: null,
      sectionCount: 1,
      createdAt: "2026-07-15T19:00:00.000Z",
    },
  }));

  assert.equal(record.context.script, null);
  assert.equal(record.context.brief?.title, "The First Layer production brief");
});
