import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readlinkSync, readdirSync, statSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";

const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const GENERATED_ROOTS = new Set([".git", ".next", ".playwright-cli", ".turbo", "coverage", "node_modules", "out"]);
const EVIDENCE_ROOTS = ["output/playwright", "scripts/certification/proofs", "scripts/certification/receipts"];

function normalizedPath(path) {
  return path.split(sep).join("/").replace(/^\.\//, "");
}

export function isCandidatePath(path) {
  const normalized = normalizedPath(path);
  const topLevel = normalized.split("/")[0];
  if (!normalized || normalized.startsWith("../") || GENERATED_ROOTS.has(topLevel)) return false;
  if (normalized === "next-env.d.ts") return false;
  if (normalized.endsWith(".tsbuildinfo")) return false;
  return !EVIDENCE_ROOTS.some((root) => normalized === root || normalized.startsWith(`${root}/`));
}

function git(repoRoot, args) {
  const completed = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (completed.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${completed.stderr.trim() || "unknown error"}`);
  }
  return completed.stdout;
}

export function discoverCandidateFiles(repoRoot) {
  const output = git(repoRoot, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"]);
  const files = output.split("\0").filter(Boolean).map(normalizedPath).filter(isCandidatePath);
  return [...new Set(files)].sort();
}

export function discoverSnapshotFiles(repoRoot) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      const display = normalizedPath(relative(repoRoot, absolute));
      if (!isCandidatePath(display)) continue;
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() || entry.isSymbolicLink()) files.push(display);
    }
  };
  visit(repoRoot);
  return files.sort();
}

export function discoverDirtyState(repoRoot) {
  const output = git(repoRoot, ["status", "--porcelain=v1", "--untracked-files=all", "-z"]);
  const fields = output.split("\0");
  const records = [];
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    if (!field) continue;
    const status = field.slice(0, 2);
    const path = normalizedPath(field.slice(3));
    let originalPath = null;
    if (/[RC]/.test(status)) originalPath = normalizedPath(fields[++index] ?? "");
    if (!isCandidatePath(path) && (!originalPath || !isCandidatePath(originalPath))) continue;
    records.push(`${status}\0${path}\0${originalPath ?? ""}`);
  }
  records.sort();
  return {
    count: records.length,
    serialized: records.join("\0"),
  };
}

function walk(directory, predicate = () => true) {
  if (!existsSync(directory)) return [];
  const results = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (["node_modules", ".next", ".git", "receipts"].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) results.push(...walk(path, predicate));
    else if (entry.isFile() && predicate(path)) results.push(path);
  }
  return results.sort();
}

function extension(path) {
  const name = basename(path);
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot) : "";
}

function routePath(file) {
  const appRelative = relative(join(file.slice(0, file.indexOf(`${sep}app${sep}`)), "app"), file);
  const segments = appRelative
    .split(sep)
    .slice(0, -1)
    .filter((segment) => !/^\(.+\)$/.test(segment));
  const path = `/${segments.join("/")}`.replace(/\/$/, "");
  return path || "/";
}

function exportedMethods(source) {
  const methods = new Set();
  const expression = /export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g;
  for (const match of source.matchAll(expression)) methods.add(match[1]);
  return [...methods].sort();
}

function sourceRouteKind(path) {
  return path.includes(`${sep}api${sep}`) || path.endsWith(`${sep}auth${sep}callback${sep}route.ts`)
    ? "api"
    : "page";
}

export function discoverRepository(repoRoot) {
  const appRoot = join(repoRoot, "app");
  const routeFiles = walk(appRoot, (path) => /(?:^|\/)(?:page|route)\.(?:js|jsx|ts|tsx)$/.test(path));
  const routes = routeFiles.map((file) => {
    const source = readFileSync(file, "utf8");
    const kind = basename(file).startsWith("route.") ? "api" : sourceRouteKind(file);
    return {
      kind,
      route: routePath(file),
      file: relative(repoRoot, file),
      methods: kind === "api" ? exportedMethods(source) : ["GET"],
    };
  });

  const stateFiles = walk(appRoot, (path) => /(?:^|\/)(?:loading|error|not-found|layout)\.(?:js|jsx|ts|tsx)$/.test(path)).map(
    (file) => ({ file: relative(repoRoot, file), type: basename(file).split(".")[0] })
  );
  const testFiles = walk(join(repoRoot, "tests"), (path) => /\.test\.(?:mjs|js|ts)$/.test(path)).map((file) =>
    relative(repoRoot, file)
  );
  const evidenceFiles = [
    ...walk(join(repoRoot, "docs", "design-evidence"), (path) => /\.(?:json|md|png|jpe?g|webp)$/.test(path)),
    ...walk(join(repoRoot, "scripts", "certification", "proofs"), (path) => path.endsWith(".json")),
  ].map((file) => {
    const stat = statSync(file);
    return { file: relative(repoRoot, file), modifiedAt: stat.mtime.toISOString(), bytes: stat.size };
  });

  return {
    generatedAt: new Date().toISOString(),
    routes: routes.sort((left, right) => left.route.localeCompare(right.route) || left.kind.localeCompare(right.kind)),
    pages: routes.filter((route) => route.kind === "page"),
    apis: routes.filter((route) => route.kind === "api"),
    states: stateFiles,
    tests: testFiles,
    evidence: evidenceFiles,
  };
}

export function discoverSourceFiles(repoRoot, roots = ["app", "components", "lib", "supabase/migrations"]) {
  return roots.flatMap((root) =>
    walk(join(repoRoot, root), (path) => SOURCE_EXTENSIONS.has(extension(path)) || path.endsWith(".sql"))
  );
}

export function computeSourceFingerprint(repoRoot, files) {
  const hash = createHash("sha256");
  for (const file of [...new Set(files)].sort()) {
    const absolute = isAbsolute(file) ? resolve(file) : resolve(repoRoot, file);
    const display = normalizedPath(relative(repoRoot, absolute));
    if (!isCandidatePath(display)) continue;
    hash.update(display);
    hash.update("\0");
    if (!existsSync(absolute)) {
      hash.update("missing");
      hash.update("\0");
      continue;
    }
    const stat = lstatSync(absolute);
    hash.update(stat.isSymbolicLink() ? "symlink" : stat.isFile() ? "file" : "other");
    hash.update("\0");
    hash.update(String(stat.mode & 0o777));
    hash.update("\0");
    hash.update(stat.isSymbolicLink() ? readlinkSync(absolute) : readFileSync(absolute));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function readSource(repoRoot, relativePath) {
  const path = join(repoRoot, relativePath);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

export function walkFiles(directory, predicate) {
  return walk(directory, predicate);
}
