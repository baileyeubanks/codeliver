import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  canAccessProjectBriefDisplay,
  parseProjectBriefDisplay,
} from "../lib/co-produce/project-brief-display.ts";

const cockpitSource = readFileSync(
  "components/projects/ProjectCockpit.tsx",
  "utf8",
);
const cockpitStyles = readFileSync(
  "components/projects/ProjectCockpit.module.css",
  "utf8",
);
const navigationSource = readFileSync(
  "components/cockpit/cockpit-navigation.ts",
  "utf8",
);

function operatingRecord() {
  return {
    context: {
      brief: {
        revisionId: "project-brief-secret-id",
        revisionNumber: 4,
        title: "Launch film approved brief",
        objectives: ["Explain the launch"],
        audiences: ["Operations leaders"],
        keyMessages: ["The first layer is visible"],
        requestedDeliverables: ["Hero film", "Social cutdown"],
        constraints: ["Approved facilities only"],
        references: ["Client visual system"],
        successCriteria: ["Campaign owner approval"],
        content: { raw: "raw-brief-secret" },
        sourceProposalRequestReceiptId: "proposal-receipt-secret",
        sourceActivationAuthorizationReceiptId: "activation-receipt-secret",
      },
    },
  };
}

test("the display parser projects only bounded approved brief semantics", () => {
  const display = parseProjectBriefDisplay(operatingRecord(), "producer");

  assert.deepEqual(display, {
    revisionNumber: 4,
    title: "Launch film approved brief",
    objectives: ["Explain the launch"],
    audiences: ["Operations leaders"],
    keyMessages: ["The first layer is visible"],
    requestedDeliverables: ["Hero film", "Social cutdown"],
    constraints: ["Approved facilities only"],
    references: ["Client visual system"],
    successCriteria: ["Campaign owner approval"],
  });

  const serialized = JSON.stringify(display);
  assert.doesNotMatch(serialized, /raw-brief-secret/);
  assert.doesNotMatch(serialized, /receipt-secret/);
  assert.doesNotMatch(serialized, /project-brief-secret-id/);
});

test("the display parser fails closed on malformed or oversized semantics", () => {
  const malformed = operatingRecord();
  malformed.context.brief.objectives = ["x".repeat(1_001)];
  assert.equal(parseProjectBriefDisplay(malformed, "owner"), null);

  const oversized = operatingRecord();
  oversized.context.brief.audiences = new Array(41).fill("Audience");
  assert.equal(parseProjectBriefDisplay(oversized, "admin"), null);

  const wrongLocation = { brief: operatingRecord().context.brief };
  assert.equal(parseProjectBriefDisplay(wrongLocation, "member"), null);
  assert.equal(parseProjectBriefDisplay({ context: { brief: null } }, "editor"), null);
  assert.equal(
    parseProjectBriefDisplay(
      { context: { brief: Object.create(operatingRecord().context.brief) } },
      "producer",
    ),
    null,
  );
});

test("only internal contributor roles can inspect or retain the display brief", () => {
  for (const role of ["owner", "admin", "producer", "editor", "member"]) {
    assert.equal(canAccessProjectBriefDisplay(role), true, role);
    assert.equal(parseProjectBriefDisplay(operatingRecord(), role)?.revisionNumber, 4, role);
  }

  const guardedRecord = new Proxy(
    {},
    {
      get() {
        throw new Error("external roles must not inspect the operating record");
      },
    },
  );
  for (const role of ["reviewer", "viewer", "client"]) {
    assert.equal(canAccessProjectBriefDisplay(role), false, role);
    assert.equal(parseProjectBriefDisplay(guardedRecord, role), null, role);
  }
});

test("the cockpit reuses one role-gated operating-record fetch for origin and brief", () => {
  assert.equal(
    cockpitSource.match(/\/operating-record`/g)?.length,
    1,
  );
  assert.match(
    cockpitSource,
    /const canFetchOperatingRecord = canViewProjectOrigin \|\| canViewProjectBrief;/,
  );
  assert.match(cockpitSource, /if \(demoMode \|\| !canFetchOperatingRecord\)/);
  assert.match(
    cockpitSource,
    /const canViewProjectOrigin = \["owner", "admin", "producer"\]\.includes\(workspaceRole\);/,
  );
  assert.match(cockpitSource, /parseProjectBriefDisplay\(record, workspaceRole\)/);
  assert.match(
    cockpitSource,
    /const projectBrief = canViewProjectBrief \? liveProjectBrief : null;/,
  );
});

test("the compact semantic disclosure sits in Plan before tasks and initialization", () => {
  const planStart = cockpitSource.indexOf('{activeSection === "tasks"');
  const disclosurePlacement = cockpitSource.indexOf(
    "<ApprovedProjectBrief brief={projectBrief}",
    planStart,
  );
  const taskPlacement = cockpitSource.indexOf(
    'aria-label="Loading production tasks"',
    planStart,
  );
  const initializerPlacement = cockpitSource.indexOf(
    'className="cockpit-plan-initializer"',
    planStart,
  );

  assert.ok(planStart >= 0);
  assert.ok(disclosurePlacement > planStart);
  assert.ok(disclosurePlacement < taskPlacement);
  assert.ok(disclosurePlacement < initializerPlacement);
  assert.match(navigationSource, /navigationItem\("tasks", \{ label: "Plan"/);

  const disclosureStart = cockpitSource.indexOf("function ApprovedProjectBrief");
  const disclosureEnd = cockpitSource.indexOf(
    "export default function ProjectCockpit",
    disclosureStart,
  );
  const disclosureSource = cockpitSource.slice(disclosureStart, disclosureEnd);
  assert.match(disclosureSource, /<details/);
  assert.match(disclosureSource, /<summary/);
  for (const label of [
    "Objectives",
    "Audiences",
    "Key messages",
    "Requested deliverables",
    "Constraints",
    "References",
    "Success criteria",
  ]) {
    assert.match(disclosureSource, new RegExp(label));
  }
  assert.doesNotMatch(
    disclosureSource,
    /sourceProposalRequestReceiptId|sourceActivationAuthorizationReceiptId|\.content\b/,
  );
  assert.match(
    cockpitStyles,
    /\.approvedBrief,\s*\n\.approvedBriefStatus\s*\{[\s\S]*?border-block:/,
  );
  assert.match(cockpitStyles, /\.approvedBriefDetails\s*\{[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/);
});

test("the brief remains inside the existing Plan surface without a route or rail", () => {
  assert.doesNotMatch(cockpitSource, /href=\{?["'`]\/[^"'`]*brief/i);
  assert.doesNotMatch(cockpitSource, /activeSection === "brief"/);
  assert.doesNotMatch(navigationSource, /id:\s*"brief"|label:\s*"Approved brief"/);
});
