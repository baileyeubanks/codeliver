#!/usr/bin/env node
import { loadManifestRegistry } from "./lib/manifest.mjs";
import { DEFAULT_REPO_ROOT } from "./lib/engine.mjs";

const registry = loadManifestRegistry(DEFAULT_REPO_ROOT);
const output = {
  schemaVersion: registry.schemaVersion,
  digest: registry.digest,
  pillars: registry.pillars.map((pillar) => ({ id: pillar.id, horizons: pillar.horizons, file: pillar._file })),
  journeys: registry.journeys.map((journey) => ({ id: journey.id, horizon: journey.horizon, file: journey._file })),
  errors: registry.errors,
};

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
if (registry.errors.length > 0) process.exitCode = 1;
