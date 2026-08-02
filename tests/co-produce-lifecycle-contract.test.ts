import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCoProduceRoute,
  canAccessCoProduceCapability,
  CO_PRODUCE_CAPABILITIES,
  CO_PRODUCE_CAPABILITY_GROUPS,
  CO_PRODUCE_PHASES,
  CO_PRODUCE_RECORDS,
  CO_PRODUCE_ROUTES,
  getCoProduceCapability,
  resolveCoProduceCapabilityRoute,
  validateCoProduceLifecycleContract,
  type CoProduceCapability,
} from "../lib/co-produce/lifecycle-contract.ts";

function capability(id: string): CoProduceCapability {
  const value = getCoProduceCapability(id);
  assert.ok(value, `Missing capability ${id}`);
  return value;
}

test("stable lifecycle, capability, and route IDs do not drift", () => {
  assert.deepEqual(
    CO_PRODUCE_PHASES.map((phase) => phase.id),
    ["pre-production", "production", "post-production", "delivery-assets"],
  );

  assert.deepEqual(
    CO_PRODUCE_CAPABILITIES.map((item) => item.id),
    [
      "workspace-shell.dashboard",
      "workspace-shell.projects",
      "workspace-shell.project-overview",
      "workspace-shell.project-operating-record",
      "workspace-shell.search",
      "workspace-shell.notifications",
      "workspace-shell.team-management",
      "workspace-shell.activity",
      "workspace-shell.settings",
      "workspace-shell.timeline",
      "workspace-shell.details",
      "workspace-shell.storage-management",
      "pre-production.project-brief",
      "pre-production.scripts-storyboards",
      "pre-production.shot-lists-schedules",
      "pre-production.locations-talent",
      "pre-production.tasks-approvals",
      "production.live-production",
      "production.on-set-media",
      "production.logging-metadata",
      "production.team-communication",
      "production.daily-reports",
      "post-production.editor-workspace",
      "post-production.reviews-feedback",
      "post-production.public-review",
      "post-production.public-review-comment",
      "post-production.public-review-approval",
      "post-production.review-approvals",
      "post-production.spatial-annotations",
      "post-production.graphics-titles",
      "post-production.audio-music",
      "post-production.exports-versions",
      "delivery-assets.deliverables",
      "delivery-assets.asset-library",
      "delivery-assets.permissions-sharing",
      "delivery-assets.distribution",
      "delivery-assets.project-archive",
      "delivery-assets.archive-compliance",
      "human-agent-loop.lifecycle-control",
      "human-agent-loop.human-checkpoint",
      "human-agent-loop.agent-copilot",
      "human-agent-loop.ai-automations",
      "human-agent-loop.smart-search",
      "human-agent-loop.real-time-collaboration",
      "human-agent-loop.analytics-insights",
      "human-agent-loop.custom-workflows",
      "human-agent-loop.integrations-apis",
      "human-agent-loop.mobile-access",
      "human-agent-loop.secure-cloud",
    ],
  );

  assert.deepEqual(Object.keys(CO_PRODUCE_ROUTES), [
    "dashboard",
    "projects",
    "project_create",
    "project",
    "asset_review",
    "reviews",
    "library",
    "activity",
    "settings",
    "archive",
    "trash",
    "public_review",
  ]);
});

test("permission boundaries fail closed across workspace and review-invite principals", () => {
  const upload = capability("production.on-set-media");
  assert.equal(
    canAccessCoProduceCapability(upload, { principal: "workspace", granted: ["media:read"] }),
    false,
  );
  assert.equal(
    canAccessCoProduceCapability(upload, { principal: "workspace", granted: ["media:write"] }),
    true,
  );

  const internalApproval = capability("post-production.review-approvals");
  assert.equal(
    canAccessCoProduceCapability(internalApproval, {
      principal: "workspace",
      granted: ["reviews:comment"],
    }),
    false,
  );
  assert.equal(
    canAccessCoProduceCapability(internalApproval, {
      principal: "workspace",
      granted: ["reviews:approve"],
    }),
    true,
  );
  assert.equal(
    canAccessCoProduceCapability(internalApproval, {
      principal: "review-invite",
      permission: "approve",
    }),
    false,
  );

  const publicReview = capability("post-production.public-review");
  const publicComment = capability("post-production.public-review-comment");
  const publicApproval = capability("post-production.public-review-approval");

  assert.equal(
    canAccessCoProduceCapability(publicReview, {
      principal: "review-invite",
      permission: "view",
    }),
    true,
  );
  assert.equal(
    canAccessCoProduceCapability(publicComment, {
      principal: "review-invite",
      permission: "view",
    }),
    false,
  );
  assert.equal(
    canAccessCoProduceCapability(publicComment, {
      principal: "review-invite",
      permission: "comment",
    }),
    true,
  );
  assert.equal(
    canAccessCoProduceCapability(publicApproval, {
      principal: "review-invite",
      permission: "comment",
    }),
    false,
  );
  assert.equal(
    canAccessCoProduceCapability(publicApproval, {
      principal: "review-invite",
      permission: "approve",
    }),
    true,
  );
  assert.equal(
    canAccessCoProduceCapability(publicReview, {
      principal: "workspace",
      granted: [
        "projects:read",
        "media:read",
        "media:write",
        "reviews:read",
        "reviews:comment",
        "reviews:approve",
        "workspace:manage",
      ],
    }),
    false,
  );

  const unavailableAgent = capability("human-agent-loop.agent-copilot");
  assert.equal(
    canAccessCoProduceCapability(unavailableAgent, {
      principal: "workspace",
      granted: ["agents:propose", "agents:approve"],
    }),
    false,
  );
});

test("route resolution allows only declared local templates and safe path segments", () => {
  assert.equal(buildCoProduceRoute("dashboard"), "/");
  assert.equal(
    buildCoProduceRoute("project", { projectId: "project-42" }),
    "/projects/project-42",
  );
  assert.equal(
    buildCoProduceRoute("asset_review", {
      projectId: "project-42",
      assetId: "asset_v5~final",
    }),
    "/projects/project-42/assets/asset_v5~final",
  );
  assert.equal(
    buildCoProduceRoute("public_review", { reviewToken: "token_ABC-123" }),
    "/review/token_ABC-123",
  );

  assert.throws(() => buildCoProduceRoute("project"), /requires exactly/i);
  assert.throws(
    () => buildCoProduceRoute("project", { projectId: "safe", extra: "unsafe" }),
    /requires exactly/i,
  );

  for (const unsafe of [
    "..",
    "../asset",
    "project/asset",
    "https://attacker.example",
    "//attacker.example",
    "%2f%2fattacker.example",
    "project?demo=1",
    "project#fragment",
    "project\\asset",
    " project",
    "",
  ]) {
    assert.throws(
      () => buildCoProduceRoute("project", { projectId: unsafe }),
      /unsafe/i,
      unsafe,
    );
  }

  assert.equal(
    resolveCoProduceCapabilityRoute(capability("post-production.reviews-feedback"), {
      projectId: "project-42",
      assetId: "asset-7",
    }),
    "/projects/project-42/assets/asset-7",
  );
  assert.equal(
    resolveCoProduceCapabilityRoute(capability("pre-production.project-brief"), {
      projectId: "project-42",
    }),
    "/projects/project-42",
  );
});

test("the approved project brief is a canonical immutable read-only capability", () => {
  const briefRecord = CO_PRODUCE_RECORDS.project_brief_revision;
  assert.equal(briefRecord.deployment, "canonical");
  assert.equal(briefRecord.storage, "project_brief_revisions");
  assert.equal(briefRecord.status.kind, "immutable");

  const briefCapability = capability("pre-production.project-brief");
  assert.deepEqual(briefCapability.route, {
    kind: "action",
    intent: "inspect-approved-project-brief",
    routeId: "project",
    action: "surface=tasks",
  });
  assert.deepEqual(briefCapability.permission.anyOf, [
    { principal: "workspace", allOf: ["projects:read"] },
  ]);
  assert.equal(briefCapability.data.primary, "project_brief_revision");
  assert.equal(briefCapability.audit.responsibility, "read-only");
  assert.equal(briefCapability.readiness.state, "read-only");
});

test("Co-Script is a canonical guarded project capability without a second shell", () => {
  const scriptRecord = CO_PRODUCE_RECORDS.script_revision;
  assert.equal(scriptRecord.authority, "co-script");
  assert.equal(scriptRecord.deployment, "canonical");
  assert.equal(scriptRecord.storage, "project_script_revisions");
  assert.equal(scriptRecord.parent, "project");
  assert.equal(scriptRecord.status.kind, "derived");
  assert.deepEqual(scriptRecord.status.values, [
    "draft",
    "submitted",
    "approved",
    "changes_requested",
    "superseded",
  ]);

  const scriptCapability = capability("pre-production.scripts-storyboards");
  assert.deepEqual(scriptCapability.route, {
    kind: "action",
    intent: "open-project-script",
    routeId: "project",
    action: "surface=tasks&plan=script",
  });
  assert.equal(scriptCapability.data.primary, "script_revision");
  assert.equal(scriptCapability.readiness.state, "guarded");
  assert.equal(scriptCapability.audit.responsibility, "append-after-commit");
  assert.equal(scriptCapability.audit.record, "project_preproduction_event");
  assert.equal(
    scriptCapability.data.supporting.includes("project_brief_revision"),
    true,
  );
  assert.equal(
    scriptCapability.readiness.blockers.some((blocker) =>
      blocker.includes("Call-sheet distribution"),
    ),
    true,
  );
  assert.equal(
    resolveCoProduceCapabilityRoute(scriptCapability, { projectId: "project-42" }),
    "/projects/project-42",
  );

  const shotPlanRecord = CO_PRODUCE_RECORDS.shot_plan_revision;
  assert.equal(shotPlanRecord.authority, "co-script");
  assert.equal(shotPlanRecord.deployment, "canonical");
  assert.equal(shotPlanRecord.storage, "project_shot_plan_revisions");
  assert.equal(shotPlanRecord.parent, "project");
  assert.equal(shotPlanRecord.status.kind, "derived");
  assert.deepEqual(shotPlanRecord.status.values, [
    "draft",
    "submitted",
    "approved",
    "changes_requested",
  ]);

  const shotPlanCapability = capability("pre-production.shot-lists-schedules");
  assert.deepEqual(shotPlanCapability.route, {
    kind: "action",
    intent: "open-project-production-schedule",
    routeId: "project",
    action: "surface=tasks&plan=schedule",
  });
  assert.equal(shotPlanCapability.data.primary, "production_schedule_revision");
  assert.equal(shotPlanCapability.data.supporting.includes("shot_plan_revision"), true);
  assert.equal(shotPlanCapability.data.supporting.includes("call_sheet_revision"), true);
  assert.equal(
    shotPlanCapability.data.supporting.includes("planned.call_sheet_distribution"),
    true,
  );
  assert.equal(shotPlanCapability.audit.responsibility, "append-after-commit");
  assert.equal(shotPlanCapability.readiness.state, "guarded");
  assert.equal(
    shotPlanCapability.readiness.blockers.some((blocker) =>
      blocker.includes("Call-sheet distribution and acknowledgement remain unavailable"),
    ),
    true,
  );
  assert.equal(
    resolveCoProduceCapabilityRoute(shotPlanCapability, { projectId: "project-42" }),
    "/projects/project-42",
  );

  const scheduleRecord = CO_PRODUCE_RECORDS.production_schedule_revision;
  assert.equal(scheduleRecord.authority, "co-script");
  assert.equal(scheduleRecord.deployment, "canonical");
  assert.equal(scheduleRecord.storage, "project_production_schedule_revisions");
  assert.equal(scheduleRecord.parent, "project");
  assert.equal(scheduleRecord.status.kind, "derived");
  assert.deepEqual(scheduleRecord.status.values, [
    "draft",
    "submitted",
    "approved",
    "changes_requested",
  ]);
  const callSheetRecord = CO_PRODUCE_RECORDS.call_sheet_revision;
  assert.equal(callSheetRecord.authority, "co-script");
  assert.equal(callSheetRecord.deployment, "canonical");
  assert.equal(callSheetRecord.storage, "project_call_sheet_revisions");
  assert.equal(callSheetRecord.parent, "production_schedule_revision");
  assert.equal(callSheetRecord.status.kind, "derived");
  assert.deepEqual(callSheetRecord.status.values, [
    "draft",
    "submitted",
    "approved",
    "changes_requested",
  ]);
  assert.equal(
    CO_PRODUCE_RECORDS["planned.call_sheet_distribution"].deployment,
    "planned",
  );
});

test("phase ordering is contiguous and excludes shell and loop owners", () => {
  assert.deepEqual(
    CO_PRODUCE_PHASES.map(({ id, order }) => [id, order]),
    [
      ["pre-production", 1],
      ["production", 2],
      ["post-production", 3],
      ["delivery-assets", 4],
    ],
  );

  const phaseOwners = CO_PRODUCE_CAPABILITY_GROUPS
    .filter((group) => group.owner.kind === "phase")
    .map((group) => group.owner.id);
  assert.deepEqual(phaseOwners, CO_PRODUCE_PHASES.map((phase) => phase.id));
  assert.equal(phaseOwners.includes("workspace-shell"), false);
  assert.equal(phaseOwners.includes("human-agent-loop"), false);
});

test("each capability and visible surface has exactly one owner", () => {
  const capabilityOwners = new Map<string, string>();
  const surfaceOwners = new Map<string, string>();

  for (const group of CO_PRODUCE_CAPABILITY_GROUPS) {
    for (const item of group.capabilities) {
      assert.equal(item.owner, group.owner.id, item.id);
      assert.equal(capabilityOwners.has(item.id), false, item.id);
      capabilityOwners.set(item.id, group.owner.id);

      for (const mappedSurface of item.surfaces) {
        assert.equal(surfaceOwners.has(mappedSurface.id), false, mappedSurface.id);
        surfaceOwners.set(mappedSurface.id, item.id);
      }
    }
  }

  assert.equal(capabilityOwners.size, CO_PRODUCE_CAPABILITIES.length);
  assert.deepEqual(validateCoProduceLifecycleContract(), []);
});

test("unsupported capabilities expose neither routes nor live audit responsibilities", () => {
  const unavailable = CO_PRODUCE_CAPABILITIES.filter(
    (item) => item.readiness.state === "unavailable",
  );
  assert.ok(unavailable.length > 0);

  for (const item of unavailable) {
    assert.equal(item.route.kind, "unavailable", item.id);
    assert.equal(item.audit.responsibility, "unavailable", item.id);
    assert.equal(resolveCoProduceCapabilityRoute(item), null, item.id);
    assert.equal(
      canAccessCoProduceCapability(item, {
        principal: "workspace",
        granted: [
          "projects:read",
          "projects:create",
          "media:read",
          "media:write",
          "reviews:read",
          "reviews:comment",
          "reviews:approve",
          "activity:read",
          "workspace:manage",
          "preproduction:write",
          "production:manage",
          "postproduction:write",
          "delivery:manage",
          "analytics:read",
          "storage:manage",
          "integrations:manage",
          "agents:propose",
          "agents:approve",
        ],
      }),
      false,
      item.id,
    );
  }
});
