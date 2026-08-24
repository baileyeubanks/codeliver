import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function source(path: string): string {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

test("Projects is project-first and removes the mobile zero-stat media dashboard", () => {
  const projectsPage = source("app/(dashboard)/projects/page.tsx");

  assert.match(projectsPage, /<h1[^>]*>\s*Projects\s*<\/h1>/);
  assert.match(projectsPage, /data-testid="project-list"/);
  assert.match(projectsPage, /Open project/);
  assert.doesNotMatch(projectsPage, /AssetUpload/);
  assert.doesNotMatch(projectsPage, />Upload media</);
  assert.match(projectsPage, /\/assets\/\$\{encodeURIComponent\(asset\.id\)\}/);
  assert.match(projectsPage, /<div className="projects-content">/);
  assert.doesNotMatch(projectsPage, /<main className="projects-content">/);
  assert.doesNotMatch(projectsPage, /All production media/);
  assert.doesNotMatch(projectsPage, /projectReadiness/);
  assert.doesNotMatch(projectsPage, /aria-label="Project readiness"/);
  assert.doesNotMatch(projectsPage, /aria-label="Production lifecycle"/);
  assert.doesNotMatch(
    projectsPage,
    /Manage project media, review readiness, share links, versions, and delivery state from one workspace/,
  );
});

test("Projects renders loading, error, empty, and success from response status", () => {
  const projectsPage = source("app/(dashboard)/projects/page.tsx");

  assert.match(projectsPage, /type ProjectsLoadState/);
  assert.match(projectsPage, /status: "loading"/);
  assert.match(projectsPage, /status: "error"/);
  assert.match(projectsPage, /status: "empty"/);
  assert.match(projectsPage, /status: "success"/);
  assert.match(projectsPage, /response\.status/);
  assert.match(projectsPage, /function isProject\(value:\s*unknown\):\s*value is Project/);
  assert.match(projectsPage, /typeof value\.stage === "string"/);
  assert.match(projectsPage, /function isMediaAsset\(value:\s*unknown\):\s*value is MediaAsset/);
  assert.match(projectsPage, /items\.every\(isItem\)/);
  assert.match(projectsPage, /if \(!nextProjects \|\| !nextAssets\)[\s\S]*status:\s*"error"/);
  assert.match(projectsPage, /Projects unavailable/);
  assert.match(projectsPage, /Create your first project/);
  assert.match(projectsPage, /Retry/);
  assert.doesNotMatch(
    projectsPage,
    /fetch\("\/api\/projects"\)\.then\(\(r\) => r\.ok \? r\.json\(\) : \{ items: \[\] \}\)/,
  );
});

test("mobile shell exposes one menu affordance and reserves safe bottom space", () => {
  const shell = source("components/Shell.tsx");
  const projectsPage = source("app/(dashboard)/projects/page.tsx");
  const shellCss = source("components/Shell.module.css");
  const navigationCss = source("components/navigation/WorkspaceNavigation.module.css");
  const projectsCss = source("app/(dashboard)/projects/projects.module.css");

  assert.match(shell, /data-testid="workspace-storage-notice"/);
  assert.match(shellCss, /\.offlineNotice[\s\S]*align-items:\s*flex-start/);
  assert.match(shellCss, /overflow-wrap:\s*anywhere/);
  assert.match(shellCss, /\.main\s*>\s*\.offlineNotice\s*\{[\s\S]*min-height:\s*44px/);
  assert.match(shellCss, /@media \(max-width: 760px\)[\s\S]*\.shell\s+:global\(\.workspace-body\)[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)[\s\S]*padding-bottom:\s*calc\(64px\s*\+\s*env\(safe-area-inset-bottom\)\)/);
  assert.match(shellCss, /@media \(max-width: 760px\)[\s\S]*\.shell\s*~\s*:global\(\.cvp-copilot-pill\)[\s\S]*bottom:\s*calc\(76px\s*\+\s*env\(safe-area-inset-bottom\)\)[\s\S]*min-height:\s*44px/);
  assert.match(shellCss, /@media \(max-width: 760px\)[\s\S]*\.menuButton\s*\{[\s\S]*display:\s*none/);
  assert.match(navigationCss, /\.mobileBar a,[\s\S]*min-height:\s*44px/);
  assert.match(projectsCss, /\.scope[\s\S]*--mobile-nav-clearance/);
  assert.match(projectsPage, /data-testid="projects-end"/);
});

test("Projects interior locks the Sapphire Light canon and 44px actions", () => {
  const projectsPage = source("app/(dashboard)/projects/page.tsx");
  const projectsCss = source("app/(dashboard)/projects/projects.module.css");
  const tokens = source("app/brand-tokens.css");

  assert.match(tokens, /--cvp-canvas:\s*#f7f9fc/i);
  assert.match(tokens, /--cvp-blue:\s*#0057ff/i);
  assert.match(projectsCss, /projects-content[\s\S]*background:\s*var\(--cvp-canvas\)/);
  assert.match(projectsCss, /projects-primary-action[\s\S]*background:\s*var\(--cvp-blue\)/);
  assert.match(projectsCss, /projects-action[\s\S]*min-height:\s*44px/);
  assert.match(projectsPage, /projects-primary-action/);
});
