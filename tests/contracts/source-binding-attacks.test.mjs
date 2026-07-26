import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  executeBoundCommand,
  executeBoundedCommand,
} from "../../scripts/certification/lib/checks.mjs";
import {
  captureSourceState,
  createStableSourceSnapshot,
} from "../../scripts/certification/lib/snapshot.mjs";

function runGit(root, args) {
  const completed = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(completed.status, 0, completed.stderr);
}

function createFixtureRepository() {
  const root = mkdtempSync(join(tmpdir(), "codeliver-source-binding-"));
  mkdirSync(join(root, "app"), { recursive: true });
  mkdirSync(join(root, "scripts", "certification", "receipts"), { recursive: true });
  mkdirSync(join(root, "scripts", "certification", "proofs"), { recursive: true });
  mkdirSync(join(root, "output", "playwright"), { recursive: true });
  writeFileSync(join(root, ".gitignore"), "*.tsbuildinfo\n");
  writeFileSync(join(root, "package.json"), '{"private":true}\n');
  writeFileSync(join(root, "app", "globals.css"), "body { color: red; }\n");
  writeFileSync(join(root, "next-env.d.ts"), '/// <reference types="next" />\n');
  writeFileSync(join(root, "scripts", "certification", "receipts", "latest.json"), "{}\n");
  writeFileSync(join(root, "scripts", "certification", "proofs", "journey.json"), "{}\n");
  writeFileSync(join(root, "output", "playwright", "page.png"), "generated\n");
  runGit(root, ["init", "--quiet"]);
  runGit(root, ["add", ".gitignore", "package.json", "app/globals.css"]);
  runGit(root, ["-c", "user.name=Certification", "-c", "user.email=certification@example.invalid", "commit", "--quiet", "-m", "fixture"]);
  return root;
}

test("fingerprints bind content even when the dirty path set does not change", () => {
  const root = createFixtureRepository();
  try {
    writeFileSync(join(root, "app", "globals.css"), "body { color: blue; }\n");
    const first = captureSourceState(root).binding;
    writeFileSync(join(root, "app", "globals.css"), "body { color: green; }\n");
    const second = captureSourceState(root).binding;

    assert.equal(first.dirtyCount, second.dirtyCount);
    assert.notEqual(first.sourceFingerprint, second.sourceFingerprint);
    assert.notEqual(first.dirtyFingerprint, second.dirtyFingerprint);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("generated declarations, proof, and receipt writes cannot recursively change the source fingerprint", () => {
  const root = createFixtureRepository();
  try {
    const before = captureSourceState(root).binding;
    writeFileSync(join(root, "scripts", "certification", "receipts", "latest.json"), '{"new":true}\n');
    writeFileSync(join(root, "scripts", "certification", "proofs", "journey.json"), '{"new":true}\n');
    writeFileSync(join(root, "next-env.d.ts"), '/// <reference types="next/rewritten" />\n');
    writeFileSync(join(root, "output", "playwright", "page.png"), "regenerated\n");
    const after = captureSourceState(root).binding;

    assert.equal(after.sourceFingerprint, before.sourceFingerprint);
    assert.equal(after.dirtyFingerprint, before.dirtyFingerprint);
    assert.equal(after.dirtyCount, before.dirtyCount);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("snapshot acquisition fails closed while another writer keeps changing source", () => {
  const root = createFixtureRepository();
  let revision = 0;
  try {
    const acquisition = createStableSourceSnapshot(root, {
      stabilityWindowMs: 0,
      maxAttempts: 3,
      wait: () => {
        revision += 1;
        writeFileSync(join(root, "app", "globals.css"), `body { order: ${revision}; }\n`);
      },
    });
    assert.equal(acquisition.stable, false);
    assert.equal(acquisition.attempts, 3);
    assert.match(acquisition.reason, /No verified source snapshot/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("copy-time races are rejected before command evidence can run", () => {
  const root = createFixtureRepository();
  let revision = 0;
  try {
    const acquisition = createStableSourceSnapshot(root, {
      stabilityWindowMs: 0,
      maxAttempts: 2,
      wait: () => undefined,
      afterCopy: () => {
        revision += 1;
        writeFileSync(join(root, "app", "globals.css"), `body { race: ${revision}; }\n`);
      },
    });
    assert.equal(acquisition.stable, false);
    assert.equal(acquisition.observations.every((entry) => entry.copy?.verified === false), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a successful command is rejected if it mutates candidate source", () => {
  const root = createFixtureRepository();
  const acquisition = createStableSourceSnapshot(root, {
    stabilityWindowMs: 0,
    maxAttempts: 1,
    wait: () => undefined,
  });
  try {
    assert.equal(acquisition.stable, true);
    const execution = executeBoundCommand(
      acquisition.root,
      acquisition.files,
      null,
      acquisition.binding,
      {
        executable: process.execPath,
        args: ["-e", "require('node:fs').writeFileSync('app/globals.css', 'attacked\\n')"],
        timeoutMs: 1_000,
      }
    );
    assert.equal(execution.exitCode, 0);
    assert.equal(execution.sourceVerifiedBefore, true);
    assert.equal(execution.sourceMutated, true);
    assert.notEqual(execution.sourceFingerprintAfter, execution.sourceFingerprintBefore);
  } finally {
    acquisition.cleanup?.();
    rmSync(root, { recursive: true, force: true });
  }
});

test("verification commands are forcibly bounded by their timeout", () => {
  const root = createFixtureRepository();
  try {
    const execution = executeBoundedCommand(root, {
      executable: process.execPath,
      args: ["-e", "setInterval(() => undefined, 1_000)"],
      timeoutMs: 75,
    });
    assert.ok(execution.durationMs < 2_000, `duration was ${execution.durationMs}ms`);
    assert.match(execution.error ?? "", /timed out|ETIMEDOUT/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
