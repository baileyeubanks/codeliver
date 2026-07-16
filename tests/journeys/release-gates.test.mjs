import assert from "node:assert/strict";
import test from "node:test";

import { evaluateCertification } from "../../scripts/certification/lib/evaluate.mjs";

const g0Ids = [
  "manifest.validity",
  "inventory.route-coverage",
  "inventory.journey-route-coverage",
  "journey.obligations-complete",
  "governance.snapshot-stability",
  "commands.lint",
  "commands.typecheck",
  "commands.product-tests",
  "commands.certification-tests",
  "commands.build",
];

function fixtureRegistry() {
  return {
    pillars: [
      {
        id: "fixture-pillar",
        title: "Fixture pillar",
        horizons: [1, 2, 3],
        authorityDomains: ["audit"],
        slos: [],
        obligations: [1, 2, 3].map((horizon) => ({
          id: `fixture.h${horizon}`,
          title: `Fixture horizon ${horizon}`,
          horizon,
          severity: "critical",
          residualRisk: `Horizon ${horizon} risk`,
          checks: [`fixture.check.h${horizon}`],
        })),
      },
    ],
  };
}

function passingChecks() {
  return [
    ...g0Ids.map((id) => ({ id, title: id, status: "pass", severity: "critical", residualRisk: null, evidence: [] })),
    ...[1, 2, 3].map((horizon) => ({
      id: `fixture.check.h${horizon}`,
      title: `Fixture ${horizon}`,
      status: "pass",
      severity: "critical",
      residualRisk: null,
      evidence: [],
    })),
  ];
}

test("all four release gates pass only when every required proof passes", () => {
  const evaluation = evaluateCertification(fixtureRegistry(), passingChecks());
  assert.equal(evaluation.releaseDecision, "PASS");
  assert.deepEqual(evaluation.releaseGates.map((gate) => gate.status), ["pass", "pass", "pass", "pass"]);
  assert.equal(evaluation.nextHighestRisk, null);
});

test("a failed horizon obligation blocks release and remains in residual risk", () => {
  const checks = passingChecks().map((check) =>
    check.id === "fixture.check.h2"
      ? { ...check, status: "fail", residualRisk: "Concurrency is unsafe" }
      : check
  );
  const evaluation = evaluateCertification(fixtureRegistry(), checks);
  assert.equal(evaluation.releaseDecision, "BLOCKED");
  assert.equal(evaluation.releaseGates.find((gate) => gate.id === "G2")?.status, "fail");
  assert.equal(evaluation.residualRisks.some((risk) => risk.id === "fixture.h2"), true);
});
