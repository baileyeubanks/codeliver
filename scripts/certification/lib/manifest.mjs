import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const REQUIRED_JOURNEY_ARRAYS = [
  "routes",
  "states",
  "viewports",
  "accessibility",
  "securityInvariants",
  "persistence",
  "concurrency",
  "degradedDependencies",
  "rollback",
  "performanceBudgets",
  "checks",
];

function jsonFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return jsonFiles(path);
      return entry.isFile() && entry.name.endsWith(".json") ? [path] : [];
    })
    .sort();
}

function validatePillar(manifest, file) {
  const errors = [];
  if (
    !Array.isArray(manifest.horizons) ||
    manifest.horizons.length !== 3 ||
    ![1, 2, 3].every((horizon) => manifest.horizons.includes(horizon))
  ) {
    errors.push(`${file}: pillar horizons must contain 1, 2, and 3`);
  }
  const authorityDomains = ["identity", "tenant", "project", "version", "permission", "billing", "audit"];
  if (!Array.isArray(manifest.authorityDomains) || manifest.authorityDomains.length === 0) {
    errors.push(`${file}: pillar must declare preserved authority domains`);
  } else if (manifest.authorityDomains.some((domain) => !authorityDomains.includes(domain))) {
    errors.push(`${file}: pillar contains an unknown authority domain`);
  }
  if (!Array.isArray(manifest.surfaces) || manifest.surfaces.length === 0) {
    errors.push(`${file}: pillar must classify at least one surface`);
  }
  for (const [index, surface] of (manifest.surfaces ?? []).entries()) {
    if (!surface || !["page", "api"].includes(surface.kind) || !surface.pattern?.startsWith("/")) {
      errors.push(`${file}: invalid surface at index ${index}`);
    }
  }
  if (!Array.isArray(manifest.obligations) || manifest.obligations.length === 0) {
    errors.push(`${file}: pillar must define at least one proof obligation`);
  }
  for (const [index, obligation] of (manifest.obligations ?? []).entries()) {
    if (!obligation?.id || !obligation.title || !obligation.category) {
      errors.push(`${file}: obligation ${index} is missing id, title, or category`);
    }
    if (!["critical", "high", "medium", "low"].includes(obligation?.severity)) {
      errors.push(`${file}: obligation ${obligation?.id ?? index} has invalid severity`);
    }
    if (![1, 2, 3].includes(obligation?.horizon)) {
      errors.push(`${file}: obligation ${obligation?.id ?? index} must declare horizon 1, 2, or 3`);
    }
    if (!Array.isArray(obligation?.checks) || obligation.checks.length === 0) {
      errors.push(`${file}: obligation ${obligation?.id ?? index} has no checks`);
    }
    if (!obligation?.residualRisk) {
      errors.push(`${file}: obligation ${obligation?.id ?? index} has no residual risk`);
    }
  }
  if (!Array.isArray(manifest.slos)) {
    errors.push(`${file}: pillar slos must be an array`);
  }
  for (const horizon of [1, 2, 3]) {
    if (!(manifest.obligations ?? []).some((obligation) => obligation.horizon === horizon)) {
      errors.push(`${file}: pillar has no horizon ${horizon} obligation`);
    }
  }
  return errors;
}

function validateJourney(manifest, file) {
  const errors = [];
  if (![1, 2, 3].includes(manifest.horizon)) {
    errors.push(`${file}: journey horizon must be 1, 2, or 3`);
  }
  for (const key of REQUIRED_JOURNEY_ARRAYS) {
    if (!Array.isArray(manifest[key]) || manifest[key].length === 0) {
      errors.push(`${file}: journey ${key} must be a non-empty array`);
    }
  }
  const viewportIds = new Set((manifest.viewports ?? []).map((viewport) => viewport.id));
  if (!viewportIds.has("mobile") || !viewportIds.has("desktop")) {
    errors.push(`${file}: journey must include mobile and desktop viewports`);
  }
  for (const route of manifest.routes ?? []) {
    if (typeof route !== "string" || !route.startsWith("/")) {
      errors.push(`${file}: journey route must start with /`);
    }
  }
  return errors;
}

function validateManifest(manifest, file) {
  const errors = [];
  if (manifest?.schemaVersion !== 1) errors.push(`${file}: schemaVersion must be 1`);
  if (!manifest?.id || typeof manifest.id !== "string") errors.push(`${file}: id is required`);
  if (!manifest?.title || typeof manifest.title !== "string") errors.push(`${file}: title is required`);
  if (manifest?.kind === "pillar") return errors.concat(validatePillar(manifest, file));
  if (manifest?.kind === "journey") return errors.concat(validateJourney(manifest, file));
  errors.push(`${file}: kind must be pillar or journey`);
  return errors;
}

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function loadManifestRegistry(repoRoot, options = {}) {
  const baseDirectory = options.baseDirectory ?? join(repoRoot, "scripts", "certification");
  const files = [
    ...jsonFiles(join(baseDirectory, "pillars")),
    ...jsonFiles(join(baseDirectory, "journeys")),
  ];
  const manifests = [];
  const errors = [];

  for (const file of files) {
    const displayFile = relative(repoRoot, file);
    try {
      const manifest = JSON.parse(readFileSync(file, "utf8"));
      errors.push(...validateManifest(manifest, displayFile));
      manifests.push({ ...manifest, _file: displayFile });
    } catch (error) {
      errors.push(`${displayFile}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const ids = new Map();
  for (const manifest of manifests) {
    if (ids.has(manifest.id)) {
      errors.push(`${manifest._file}: duplicate manifest id ${manifest.id} (also ${ids.get(manifest.id)})`);
    } else {
      ids.set(manifest.id, manifest._file);
    }
  }

  const obligationIds = new Map();
  for (const pillar of manifests.filter((manifest) => manifest.kind === "pillar")) {
    for (const obligation of pillar.obligations ?? []) {
      if (obligationIds.has(obligation.id)) {
        errors.push(`${pillar._file}: duplicate obligation id ${obligation.id}`);
      } else {
        obligationIds.set(obligation.id, pillar._file);
      }
    }
  }

  const digest = createHash("sha256")
    .update(stableStringify(manifests.map(({ _file, ...manifest }) => ({ _file, ...manifest }))))
    .digest("hex");

  return {
    schemaVersion: 1,
    baseDirectory,
    files: files.map((file) => relative(repoRoot, file)),
    pillars: manifests.filter((manifest) => manifest.kind === "pillar"),
    journeys: manifests.filter((manifest) => manifest.kind === "journey"),
    errors,
    digest,
  };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function matchesSurfacePattern(route, pattern) {
  if (pattern.endsWith("/**")) {
    const base = pattern.slice(0, -3);
    return route === base || route.startsWith(`${base}/`);
  }
  const expression = escapeRegex(pattern).replace(/\\\*/g, "[^/]*");
  return new RegExp(`^${expression}$`).test(route);
}

export function routeTemplateMatches(template, route) {
  if (template === route) return true;
  const segments = template.split("/");
  const expression = segments
    .map((segment) => {
      if (/^\[\.\.\..+\]$/.test(segment)) return ".+";
      if (/^\[\[\.\.\..+\]\]$/.test(segment)) return ".*";
      if (/^\[.+\]$/.test(segment)) return "[^/]+";
      return escapeRegex(segment);
    })
    .join("/");
  return new RegExp(`^${expression}$`).test(route);
}

export const JOURNEY_REQUIRED_ARRAYS = [...REQUIRED_JOURNEY_ARRAYS];
