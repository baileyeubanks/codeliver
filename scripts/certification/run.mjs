#!/usr/bin/env node
import { runCertification, writeCertificationReceipt } from "./lib/engine.mjs";

function parseArguments(argv) {
  const options = {
    runCommands: false,
    includeBuild: false,
    writeReceipt: false,
    summary: false,
    enforce: false,
  };
  for (const argument of argv) {
    if (argument === "--run-commands") options.runCommands = true;
    else if (argument === "--include-build") options.includeBuild = true;
    else if (argument === "--write-receipt") options.writeReceipt = true;
    else if (argument === "--summary") options.summary = true;
    else if (argument === "--enforce") options.enforce = true;
    else if (argument.startsWith("--repo-root=")) options.repoRoot = argument.slice("--repo-root=".length);
    else if (argument.startsWith("--stability-window-ms=")) {
      options.stabilityWindowMs = Number(argument.slice("--stability-window-ms=".length));
      if (!Number.isInteger(options.stabilityWindowMs) || options.stabilityWindowMs < 0 || options.stabilityWindowMs > 60_000) {
        throw new Error("--stability-window-ms must be an integer from 0 through 60000");
      }
    } else if (argument.startsWith("--stability-attempts=")) {
      options.stabilityAttempts = Number(argument.slice("--stability-attempts=".length));
      if (!Number.isInteger(options.stabilityAttempts) || options.stabilityAttempts < 1 || options.stabilityAttempts > 100) {
        throw new Error("--stability-attempts must be an integer from 1 through 100");
      }
    } else if (argument === "--help") options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function printHelp() {
  process.stdout.write(`Co-Deliver enterprise certification\n\n`);
  process.stdout.write(`Usage: node scripts/certification/run.mjs [options]\n\n`);
  process.stdout.write(`  --run-commands   Run lint, typecheck, product tests, and certification tests\n`);
  process.stdout.write(`  --include-build  Also run the production build (requires --run-commands)\n`);
  process.stdout.write(`  --write-receipt  Atomically write versioned and latest JSON receipts\n`);
  process.stdout.write(`  --summary        Print a concise text summary instead of JSON\n`);
  process.stdout.write(`  --enforce        Exit non-zero when any release gate is blocked\n`);
  process.stdout.write(`  --repo-root=PATH Evaluate another checkout\n`);
  process.stdout.write(`  --stability-window-ms=N  Required quiet interval between source captures\n`);
  process.stdout.write(`  --stability-attempts=N   Maximum attempts to acquire a verified snapshot\n`);
}

function printSummary(receipt, paths) {
  const next = receipt.nextHighestRisk;
  process.stdout.write(`${receipt.releaseDecision}: ${receipt.counts.passedChecks}/${receipt.counts.checks} checks pass; ${receipt.counts.certifiedObligations}/${receipt.counts.totalObligations} obligations certified\n`);
  process.stdout.write(`Source: ${receipt.repository.commit.slice(0, 12)} ${receipt.repository.sourceFingerprint.slice(0, 12)} (${receipt.repository.candidateFileCount} files, ${receipt.repository.dirtyCount} dirty)\n`);
  process.stdout.write(`Routes: ${receipt.inventory.pageCount} pages, ${receipt.inventory.apiCount} APIs (${receipt.inventory.routeCount} total)\n`);
  process.stdout.write(`Gates: ${receipt.releaseGates.map((gate) => `${gate.id}=${gate.status}`).join(" ")}\n`);
  process.stdout.write(`Commands: ${receipt.checks.filter((check) => check.id.startsWith("commands.")).map((check) => `${check.id.slice("commands.".length)}=${check.status}`).join(" ")}\n`);
  if (next) process.stdout.write(`Next risk: [${next.severity}] ${next.id} - ${next.residualRisk}\n`);
  if (paths) process.stdout.write(`Receipt: ${paths.latest}\n`);
}

let options;
try {
  options = parseArguments(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
}

if (options?.help) {
  printHelp();
} else if (options) {
  const receipt = runCertification(options);
  const paths = options.writeReceipt ? writeCertificationReceipt(receipt) : null;
  if (options.summary) printSummary(receipt, paths);
  else process.stdout.write(`${JSON.stringify({ ...receipt, receiptPaths: paths }, null, 2)}\n`);
  if (options.enforce && receipt.releaseDecision !== "PASS") process.exitCode = 1;
}
