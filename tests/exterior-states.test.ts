import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function source(path: string): string {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

test("not-found and loading states stay inside the Webster exterior shell", () => {
  const notFound = source("app/not-found.tsx");
  const loading = source("app/loading.tsx");
  const globalError = source("app/global-error.tsx");
  const dashboardRedirect = source("app/(dashboard)/page.tsx");
  const demoGuard = source("components/demo/DemoSessionGuard.tsx");
  const globals = source("app/globals.css");
  const exteriorStyles = globals.slice(
    globals.indexOf("/* ── Webster exterior/loading states"),
    globals.indexOf("/* ── Top Navigation"),
  );

  assert.match(notFound, /CoProductionBrand/);
  assert.match(notFound, /variant="stacked"/);
  assert.match(notFound, /Webster surface/);
  assert.match(notFound, /Workspace route unavailable/);
  assert.doesNotMatch(notFound, />404</);
  assert.doesNotMatch(notFound, /Page not found/);

  assert.match(loading, /CoProductionBrand/);
  assert.match(loading, /variant="stacked"/);
  assert.match(loading, /Loading Webster workspace/);
  assert.match(loading, /aria-busy="true"/);

  assert.match(globalError, /CoProductionBrand/);
  assert.match(globalError, /variant="stacked"/);
  assert.match(globalError, /Workspace recovery/);
  assert.match(globalError, /Webster needs a quick refresh/);
  assert.match(globalError, /onClick=\{reset\}/);
  assert.match(globalError, /href="\/projects"/);
  assert.doesNotMatch(globalError, /style=\{\{/);
  assert.doesNotMatch(globalError, /#0f172a|#f1f5f9|#94a3b8/);

  assert.match(dashboardRedirect, /useDemoWorkspace/);
  assert.match(dashboardRedirect, /What needs attention/);
  assert.match(dashboardRedirect, /Productions by stage/);
  assert.match(dashboardRedirect, /PROJECT_STAGE_META/);
  assert.match(dashboardRedirect, /opportunities\?compose=inquiry/);
  assert.doesNotMatch(dashboardRedirect, /router\.replace/);

  assert.match(demoGuard, /CoProductionBrand/);
  assert.match(demoGuard, /variant="stacked"/);
  assert.match(demoGuard, /Returning to Webster sign in/);
  assert.match(demoGuard, /aria-busy="true"/);
  assert.match(demoGuard, /sr-only">Returning to sign in/);
  assert.doesNotMatch(demoGuard, /className="spinner"/);
  assert.doesNotMatch(demoGuard, /bg-\[var\(--bg\)\]/);

  assert.match(exteriorStyles, /\.exterior-state/);
  assert.match(exteriorStyles, /\[data-brand-variant="stacked"\]/);
  assert.match(exteriorStyles, /--co-production-brand-width:\s*min\(100%, 244px\)/);
  assert.doesNotMatch(exteriorStyles, /border-radius:\s*(?:9999px|999px|1rem|12px)/);
});

test("project route loading and empty states resemble the review cockpit structure", () => {
  const projectPage = source("app/(dashboard)/projects/[id]/page.tsx");

  assert.match(projectPage, /project-state__layout/);
  assert.match(projectPage, /project-state__video/);
  assert.match(projectPage, /project-state__timeline/);
  assert.match(projectPage, /CoProductionBrand/);
  assert.match(projectPage, /project-state--empty[\s\S]*?variant="stacked"/);
  assert.match(projectPage, /This project cockpit is not available/);
  assert.doesNotMatch(projectPage, /rounded-xl/);
  assert.doesNotMatch(projectPage, /Project not found/);
});
