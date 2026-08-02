import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runCommandChecks, runStaticChecks } from "./checks.mjs";
import { discoverRepository } from "./discovery.mjs";
import { evaluateCertification } from "./evaluate.mjs";
import { loadManifestRegistry } from "./manifest.mjs";
import {
  captureSourceState,
  createStableSourceSnapshot,
  observeStableSource,
  sameSourceBinding,
} from "./snapshot.mjs";

export const DEFAULT_REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

export function captureSourceBinding(repoRoot, _inventory, _registry, now = new Date()) {
  return captureSourceState(repoRoot, now).binding;
}

function bindingEvidence(binding) {
  return {
    commit: binding.commit,
    branch: binding.branch,
    dirtyCount: binding.dirtyCount,
    dirtyFingerprint: binding.dirtyFingerprint,
    sourceFingerprint: binding.sourceFingerprint,
    candidateFileCount: binding.candidateFileCount,
    observedAt: binding.observedAt,
  };
}

function snapshotStabilityCheck(acquisition, finalObservation) {
  const stable =
    acquisition.stable &&
    finalObservation.stable &&
    sameSourceBinding(acquisition.binding, finalObservation.binding);
  let summary = "The verified source snapshot remained current through certification";
  if (!acquisition.stable) summary = acquisition.reason;
  else if (!finalObservation.stable) summary = finalObservation.reason;
  else if (!sameSourceBinding(acquisition.binding, finalObservation.binding)) {
    summary = "The shared checkout changed after the certification snapshot was captured";
  }
  return {
    id: "governance.snapshot-stability",
    title: "The checkout remains stable while certification executes",
    status: stable ? "pass" : "fail",
    severity: "critical",
    summary,
    evidence: [
      {
        type: "source-stability",
        stabilityWindowMs: acquisition.stabilityWindowMs,
        acquisitionAttempts: acquisition.attempts,
        finalObservationAttempts: finalObservation.attempts,
        before: bindingEvidence(acquisition.binding),
        after: bindingEvidence(finalObservation.binding),
        snapshotVerified: acquisition.stable,
        acquisitionObservations: acquisition.observations,
        finalObservations: finalObservation.observations,
      },
    ],
    residualRisk: stable ? null : "Command evidence is bound to a snapshot that is not the current shared checkout.",
    durationMs: null,
  };
}

function blockedCommandChecks(checks, reason) {
  return checks.map((check) => ({
    ...check,
    status: "blocked",
    summary: reason,
    residualRisk: "No command ran because an immutable source snapshot could not be established.",
  }));
}

export function runCertification(options = {}) {
  const repoRoot = resolve(options.repoRoot ?? DEFAULT_REPO_ROOT);
  const now = options.now ?? new Date();
  const stabilityOptions = {
    stabilityWindowMs: options.stabilityWindowMs,
    maxAttempts: options.stabilityAttempts,
    wait: options.wait,
    temporaryDirectory: options.temporaryDirectory,
  };
  const acquisition = createStableSourceSnapshot(repoRoot, stabilityOptions);
  const evaluationRoot = acquisition.stable ? acquisition.root : repoRoot;

  try {
    const inventory = discoverRepository(evaluationRoot);
    const registry = loadManifestRegistry(evaluationRoot);
    const binding = acquisition.binding;
    const staticChecks = runStaticChecks({
      repoRoot: evaluationRoot,
      inventory,
      registry,
      binding: { ...binding, now },
    });
    let commandChecks = runCommandChecks({
      repoRoot: evaluationRoot,
      inventory,
      binding,
      sourceFiles: acquisition.files,
      nodeModulesRoot: join(repoRoot, "node_modules"),
      runCommands: acquisition.stable && (options.runCommands ?? false),
      includeBuild: options.includeBuild ?? false,
    });
    if (!acquisition.stable && options.runCommands) {
      commandChecks = blockedCommandChecks(commandChecks, acquisition.reason);
    }

    const finalObservation = observeStableSource(repoRoot, stabilityOptions);
    const stabilityCheck = snapshotStabilityCheck(acquisition, finalObservation);
    const checks = [...staticChecks, ...commandChecks, stabilityCheck].sort((left, right) =>
      left.id.localeCompare(right.id)
    );
    const evaluation = evaluateCertification(registry, checks);

    return {
      schemaVersion: 1,
      receiptType: "codeliver-enterprise-certification",
      generatedAt: now.toISOString(),
      repository: {
        root: repoRoot,
        ...binding,
        sourceSnapshot: {
          verified: acquisition.stable,
          executionIsolation: "fresh-copy-per-command",
          stabilityWindowMs: acquisition.stabilityWindowMs,
          attempts: acquisition.attempts,
          ...(acquisition.reason ? { reason: acquisition.reason } : {}),
        },
        observedAfterCommands: finalObservation.binding,
      },
      registry: {
        schemaVersion: registry.schemaVersion,
        digest: registry.digest,
        files: registry.files,
        errors: registry.errors,
        pillarIds: registry.pillars.map((pillar) => pillar.id),
        journeyIds: registry.journeys.map((journey) => journey.id),
      },
      inventory: {
        routeCount: inventory.routes.length,
        pageCount: inventory.pages.length,
        apiCount: inventory.apis.length,
        stateFileCount: inventory.states.length,
        testCount: inventory.tests.length,
        routes: inventory.routes,
        states: inventory.states,
        tests: inventory.tests,
        evidence: inventory.evidence,
      },
      checks,
      ...evaluation,
    };
  } finally {
    acquisition.cleanup?.();
  }
}

function atomicWrite(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporary, path);
}

export function writeCertificationReceipt(receipt, options = {}) {
  const repoRoot = receipt.repository.root;
  const directory = resolve(options.directory ?? join(repoRoot, "scripts", "certification", "receipts"));
  const timestamp = receipt.generatedAt.replace(/[:.]/g, "-");
  const commit = receipt.repository.commit.slice(0, 12);
  const fingerprint = receipt.repository.sourceFingerprint.slice(0, 12);
  const versioned = join(directory, `${timestamp}-${commit}-${fingerprint}.json`);
  const latest = join(directory, "latest.json");
  atomicWrite(versioned, receipt);
  atomicWrite(latest, receipt);
  return {
    versioned: relative(repoRoot, versioned),
    latest: relative(repoRoot, latest),
  };
}
