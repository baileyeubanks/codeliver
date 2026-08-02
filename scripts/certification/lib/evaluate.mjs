const STATUS_PRIORITY = { fail: 5, blocked: 4, expired: 3, unverified: 2, pass: 0 };
const SEVERITY_PRIORITY = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

function aggregateStatus(statuses) {
  if (statuses.length === 0) return "unverified";
  return [...statuses].sort((left, right) => STATUS_PRIORITY[right] - STATUS_PRIORITY[left])[0];
}

function obligationStatus(checks) {
  return aggregateStatus(checks.map((check) => check?.status ?? "unverified"));
}

function certifyPillars(registry, checkIndex) {
  return registry.pillars
    .map((pillar) => {
      const obligations = pillar.obligations.map((obligation) => {
        const checks = obligation.checks.map((id) => checkIndex.get(id) ?? { id, status: "unverified" });
        const status = obligationStatus(checks);
        return {
          ...obligation,
          status,
          certification: status === "pass" ? "certified" : status === "fail" ? "failed" : "unverified",
          evidenceChecks: checks.map((check) => ({ id: check.id, status: check.status })),
        };
      });
      const status = aggregateStatus(obligations.map((obligation) => obligation.status));
      return {
        id: pillar.id,
        title: pillar.title,
        horizons: pillar.horizons,
        authorityDomains: pillar.authorityDomains,
        status,
        certification: status === "pass" ? "certified" : status === "fail" ? "failed" : "partial",
        obligations,
        slos: pillar.slos,
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function makeGate(id, title, members) {
  const failures = members.filter((member) => member.status !== "pass");
  return {
    id,
    title,
    status: failures.length === 0 ? "pass" : "fail",
    members,
    blockers: failures,
  };
}

function releaseGates(pillars, checkIndex) {
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
  const g0 = makeGate(
    "G0",
    "Static integrity and reproducibility",
    g0Ids.map((id) => ({ id, status: checkIndex.get(id)?.status ?? "unverified" }))
  );
  const horizonGate = (horizon, id, title) => {
    const members = pillars
      .flatMap((pillar) =>
        pillar.obligations
          .filter((obligation) => obligation.horizon === horizon && ["critical", "high"].includes(obligation.severity))
          .map((obligation) => ({ id: obligation.id, status: obligation.status }))
      );
    return makeGate(id, title, members);
  };
  return [
    g0,
    horizonGate(1, "G1", "Current workflow release"),
    horizonGate(2, "G2", "Enterprise scale and resilience"),
    horizonGate(3, "G3", "Regulated operations"),
  ];
}

function residualRisks(pillars, checks) {
  const risks = [];
  for (const pillar of pillars) {
    for (const obligation of pillar.obligations) {
      if (obligation.status === "pass") continue;
      risks.push({
        id: obligation.id,
        source: "obligation",
        horizon: obligation.horizon,
        severity: obligation.severity,
        status: obligation.status,
        title: obligation.title,
        residualRisk: obligation.residualRisk,
        evidenceChecks: obligation.evidenceChecks,
      });
    }
  }
  for (const check of checks) {
    if (check.status === "pass" || !check.residualRisk) continue;
    risks.push({
      id: check.id,
      source: "check",
      horizon: null,
      severity: check.severity,
      status: check.status,
      title: check.title,
      residualRisk: check.residualRisk,
      evidence: check.evidence,
    });
  }
  return risks.sort(
    (left, right) =>
      (SEVERITY_PRIORITY[right.severity] ?? 0) - (SEVERITY_PRIORITY[left.severity] ?? 0) ||
      (STATUS_PRIORITY[right.status] ?? 0) - (STATUS_PRIORITY[left.status] ?? 0) ||
      (left.horizon ?? 9) - (right.horizon ?? 9) ||
      left.id.localeCompare(right.id)
  );
}

export function evaluateCertification(registry, checks) {
  const duplicates = checks
    .map((check) => check.id)
    .filter((id, index, ids) => ids.indexOf(id) !== index);
  if (duplicates.length > 0) throw new Error(`Duplicate check results: ${[...new Set(duplicates)].join(", ")}`);

  const checkIndex = new Map(checks.map((check) => [check.id, check]));
  const pillars = certifyPillars(registry, checkIndex);
  const gates = releaseGates(pillars, checkIndex);
  const risks = residualRisks(pillars, checks);
  const gatePassed = gates.every((gate) => gate.status === "pass");

  return {
    releaseDecision: gatePassed ? "PASS" : "BLOCKED",
    releaseGates: gates,
    pillars,
    residualRisks: risks,
    nextHighestRisk: risks[0] ?? null,
    counts: {
      checks: checks.length,
      passedChecks: checks.filter((check) => check.status === "pass").length,
      failedChecks: checks.filter((check) => check.status === "fail").length,
      unverifiedChecks: checks.filter((check) => ["unverified", "blocked", "expired"].includes(check.status)).length,
      certifiedObligations: pillars.flatMap((pillar) => pillar.obligations).filter((obligation) => obligation.status === "pass").length,
      totalObligations: pillars.flatMap((pillar) => pillar.obligations).length,
    },
  };
}
