import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceSource = readFileSync(
  resolve(repositoryRoot, "components/review/PublicReviewWorkspace.tsx"),
  "utf8",
);
const workspaceStyles = readFileSync(
  resolve(repositoryRoot, "components/review/PublicReviewWorkspace.module.css"),
  "utf8",
);

test("public recipient shell remains a slot-only presentation boundary", () => {
  assert.match(workspaceSource, /stage\.media/);
  assert.match(workspaceSource, /stage\.context/);
  assert.match(workspaceSource, /rail\.intro/);
  assert.match(workspaceSource, /rail\.approval/);
  assert.match(workspaceSource, /rail\.comments\.content/);
  assert.match(workspaceSource, /rail\.composer/);

  assert.doesNotMatch(workspaceSource, /ProjectCockpit/);
  assert.doesNotMatch(workspaceSource, /useRouter|useParams|useSearchParams/);
  assert.doesNotMatch(workspaceSource, /\bfetch\s*\(/);
  assert.doesNotMatch(workspaceSource, /href=["'`]\/(?:projects|dashboard|reviews)/);
});

test("public recipient shell exposes accessible review and filter landmarks", () => {
  assert.match(workspaceSource, /href="#public-review-workspace"/);
  assert.match(workspaceSource, /<main id="public-review-workspace"/);
  assert.match(workspaceSource, /aria-labelledby="public-review-stage-heading"/);
  assert.match(workspaceSource, /aria-labelledby="public-review-rail-heading"/);
  assert.match(workspaceSource, /role="group" aria-label="Comment filters"/);
  assert.match(workspaceSource, /aria-pressed=\{filter\.active\}/);
  assert.match(workspaceSource, /type="button"/);
});

test("public recipient shell keeps the bright frame scoped and responsive", () => {
  assert.match(workspaceSource, /PublicReviewWorkspace\.module\.css/);
  assert.match(workspaceStyles, /\.shell\s*\{[\s\S]*?--surface:\s*#1a1d21/);
  assert.match(workspaceStyles, /color-scheme:\s*dark/);
  assert.match(workspaceStyles, /\.media\s*\{[\s\S]*?background:\s*#050505/);
  assert.match(workspaceStyles, /@media \(min-width:\s*981px\)/);
  assert.match(
    workspaceStyles,
    /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(360px,\s*390px\)/,
  );
  assert.match(workspaceStyles, /\.rail\s*\{[\s\S]*?min-width:\s*0/);
});
