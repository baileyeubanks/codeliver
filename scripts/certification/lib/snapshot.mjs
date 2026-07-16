import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readlinkSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  computeSourceFingerprint,
  discoverCandidateFiles,
  discoverDirtyState,
} from "./discovery.mjs";

export const DEFAULT_STABILITY_WINDOW_MS = 500;
export const DEFAULT_STABILITY_ATTEMPTS = 8;

function git(repoRoot, args, fallback = "") {
  const completed = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" });
  return completed.status === 0 ? completed.stdout.trim() : fallback;
}

function sleep(milliseconds) {
  if (milliseconds <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function dirtyFingerprint(dirtyState, sourceFingerprint) {
  return createHash("sha256")
    .update(dirtyState.serialized)
    .update("\0")
    .update(sourceFingerprint)
    .digest("hex");
}

export function captureSourceState(repoRoot, now = new Date()) {
  const files = discoverCandidateFiles(repoRoot);
  const sourceFingerprint = computeSourceFingerprint(repoRoot, files);
  const dirtyState = discoverDirtyState(repoRoot);
  return {
    files,
    binding: {
      commit: git(repoRoot, ["rev-parse", "HEAD"], "unknown"),
      branch: git(repoRoot, ["branch", "--show-current"], "detached") || "detached",
      dirty: dirtyState.count > 0,
      dirtyCount: dirtyState.count,
      dirtyFingerprint: dirtyFingerprint(dirtyState, sourceFingerprint),
      sourceFingerprint,
      candidateFileCount: files.length,
      observedAt: now.toISOString(),
    },
  };
}

export function sameSourceBinding(left, right) {
  return Boolean(
    left &&
      right &&
      left.commit === right.commit &&
      left.branch === right.branch &&
      left.dirtyCount === right.dirtyCount &&
      left.dirtyFingerprint === right.dirtyFingerprint &&
      left.sourceFingerprint === right.sourceFingerprint &&
      left.candidateFileCount === right.candidateFileCount
  );
}

function copyCandidateFiles(sourceRoot, targetRoot, files) {
  mkdirSync(targetRoot, { recursive: true });
  for (const file of files) {
    const source = join(sourceRoot, file);
    if (!existsSync(source)) continue;
    const target = join(targetRoot, file);
    const stat = lstatSync(source);
    mkdirSync(dirname(target), { recursive: true });
    if (stat.isSymbolicLink()) {
      symlinkSync(readlinkSync(source), target);
    } else if (stat.isFile()) {
      copyFileSync(source, target);
      chmodSync(target, stat.mode & 0o777);
    }
  }
}

export function createSourceSnapshot(sourceRoot, files, options = {}) {
  const temporaryRoot = mkdtempSync(join(options.temporaryDirectory ?? tmpdir(), options.prefix ?? "codeliver-cert-source-"));
  const root = join(temporaryRoot, "source");
  try {
    copyCandidateFiles(sourceRoot, root, files);
    const nodeModulesRoot = options.nodeModulesRoot;
    if (nodeModulesRoot && existsSync(nodeModulesRoot)) {
      symlinkSync(nodeModulesRoot, join(root, "node_modules"), "dir");
    }
    return {
      root,
      cleanup: () => rmSync(temporaryRoot, { recursive: true, force: true }),
    };
  } catch (error) {
    rmSync(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
}

function observation(binding) {
  return {
    observedAt: binding.observedAt,
    commit: binding.commit,
    dirtyCount: binding.dirtyCount,
    dirtyFingerprint: binding.dirtyFingerprint,
    sourceFingerprint: binding.sourceFingerprint,
    candidateFileCount: binding.candidateFileCount,
  };
}

export function observeStableSource(repoRoot, options = {}) {
  const stabilityWindowMs = options.stabilityWindowMs ?? DEFAULT_STABILITY_WINDOW_MS;
  const maxAttempts = options.maxAttempts ?? DEFAULT_STABILITY_ATTEMPTS;
  const wait = options.wait ?? sleep;
  const observations = [];
  let latest = captureSourceState(repoRoot);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    wait(stabilityWindowMs);
    const settled = captureSourceState(repoRoot);
    observations.push({ attempt, before: observation(latest.binding), after: observation(settled.binding) });
    if (sameSourceBinding(latest.binding, settled.binding)) {
      return {
        stable: true,
        files: settled.files,
        binding: settled.binding,
        observations,
        stabilityWindowMs,
        attempts: attempt,
      };
    }
    latest = settled;
  }

  return {
    stable: false,
    files: latest.files,
    binding: latest.binding,
    observations,
    stabilityWindowMs,
    attempts: maxAttempts,
    reason: `Source did not settle after ${maxAttempts} attempts`,
  };
}

export function createStableSourceSnapshot(repoRoot, options = {}) {
  const stabilityWindowMs = options.stabilityWindowMs ?? DEFAULT_STABILITY_WINDOW_MS;
  const maxAttempts = options.maxAttempts ?? DEFAULT_STABILITY_ATTEMPTS;
  const wait = options.wait ?? sleep;
  const observations = [];
  let latest = captureSourceState(repoRoot);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    wait(stabilityWindowMs);
    const settled = captureSourceState(repoRoot);
    observations.push({ attempt, before: observation(latest.binding), after: observation(settled.binding) });
    if (!sameSourceBinding(latest.binding, settled.binding)) {
      latest = settled;
      continue;
    }

    const snapshot = createSourceSnapshot(repoRoot, settled.files, {
      temporaryDirectory: options.temporaryDirectory,
    });
    options.afterCopy?.({ attempt, repoRoot, snapshotRoot: snapshot.root });
    const snapshotFingerprint = computeSourceFingerprint(snapshot.root, settled.files);
    const afterCopy = captureSourceState(repoRoot);
    const verified =
      snapshotFingerprint === settled.binding.sourceFingerprint &&
      sameSourceBinding(settled.binding, afterCopy.binding);
    observations[observations.length - 1].copy = {
      verified,
      snapshotFingerprint,
      afterCopy: observation(afterCopy.binding),
    };
    if (verified) {
      return {
        stable: true,
        root: snapshot.root,
        cleanup: snapshot.cleanup,
        files: settled.files,
        binding: settled.binding,
        observations,
        stabilityWindowMs,
        attempts: attempt,
      };
    }
    snapshot.cleanup();
    latest = afterCopy;
  }

  return {
    stable: false,
    files: latest.files,
    binding: latest.binding,
    observations,
    stabilityWindowMs,
    attempts: maxAttempts,
    reason: `No verified source snapshot after ${maxAttempts} attempts`,
  };
}
