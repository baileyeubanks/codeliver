import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = (path: string) => readFileSync(resolve(repositoryRoot, path), "utf8");

// Batch G / cut grade: the signed-in INDEX stays quiet — blue-only chrome,
// no decorative dots, no always-on Copilot, honest role CTAs, whole-row open.

test("VA-022: the workspace search trigger carries no decorative status dot", () => {
  const shellStyles = source("components/Shell.module.css");

  assert.doesNotMatch(shellStyles, /\.searchButton::after/);
  assert.doesNotMatch(shellStyles, /data-online="false"\] \.searchButton/);
});

test("VA-043: the Copilot FAB docks into project workspaces and never lists or hubs", () => {
  const mount = source("components/copilot/CopilotMount.tsx");

  assert.ok(mount.includes('PROJECT_WORKSPACE_PATH = /^\\/projects\\/(?!new$|archive$|trash$)[^/]+/'));
  assert.match(mount, /if \(!PROJECT_WORKSPACE_PATH\.test\(pathname\)\) return null;/);
  // The old hub carve-outs (any demo path, or the /projects list) are gone.
  assert.ok(!mount.includes('pathname !== "/projects" && !pathname.startsWith'));
});

test("cut grade: the overview empty state is one quiet line plus Open projects", () => {
  const home = source("app/(dashboard)/page.tsx");

  assert.match(home, /Home is quiet/);
  assert.match(home, /Open a project to continue\./);
  assert.match(home, /Open projects/);
  assert.doesNotMatch(home, /exception rail reads the local Project Operating Record/);
});

test("VA-044: create CTAs stay honest about the workspace role", () => {
  const projects = source("app/(dashboard)/projects/page.tsx");
  const home = source("app/(dashboard)/page.tsx");
  const hook = source("components/navigation/useWorkspaceRole.ts");

  assert.match(hook, /\/api\/auth\/session/);
  assert.match(hook, /asWorkspaceRole/);

  assert.match(projects, /roleCan\(workspaceRole, "projects:create"\)/);
  assert.match(
    projects,
    /loadState\.status === "success" && canCreateProject[\s\S]*?New project/,
  );
  assert.match(projects, /No projects yet/);
  assert.match(projects, /Projects appear here when your team shares them with you\./);

  assert.match(home, /roleCan\(workspaceRole, "projects:create"\)/);
  assert.match(home, /roleCan\(workspaceRole, "opportunities:write"\)/);
  assert.match(home, /\{canCreateProject \? \(/);
});

test("VA-045: reviews and requests drop the manifesto and provider jargon", () => {
  const reviews = source("app/(dashboard)/reviews/page.tsx");
  const requests = source("components/requests/RequestQueue.tsx");

  assert.doesNotMatch(reviews, /No delivery or notification is implied/);
  assert.doesNotMatch(reviews, /provider readiness/);
  assert.match(
    requests,
    /Triage client requests and keep every conversation in one thread\./,
  );
  assert.doesNotMatch(requests, /scoped work orders/);
});

test("VA-046: the whole project row opens the cockpit", () => {
  const projects = source("app/(dashboard)/projects/page.tsx");
  const styles = source("app/(dashboard)/projects/projects.module.css");

  // One link owns the row; the inner action is presentational, not nested.
  assert.match(
    projects,
    /<Link[\s\S]*?className="project-card project-card-link"[\s\S]*?aria-label=\{`Open project \$\{project\.name\}`\}/,
  );
  assert.doesNotMatch(projects, /<article[\s\S]*?className="project-card"/);
  assert.match(styles, /\.project-card-link:hover/);
  assert.match(styles, /\.project-card-link:focus-visible/);
});
