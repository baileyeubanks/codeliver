import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(
  resolve(repositoryRoot, "app/(dashboard)/projects/new/page.tsx"),
  "utf8",
);

test("new project surface uses compact cockpit command language", () => {
  assert.match(source, /Back to projects/);
  assert.match(source, /New project/);
  assert.match(source, /Create project/);
  assert.match(source, /Project name/);
  assert.doesNotMatch(source, /Back to Projects/);
  assert.doesNotMatch(source, /Create Project/);
  assert.doesNotMatch(source, /Project Name/);
});

test("new project surface maps visible context to existing workspace contracts", () => {
  assert.match(source, /Review-ready workspace/);
  assert.match(source, /Creation path/);
  assert.match(source, /\/projects\/:id/);
  assert.match(source, /Upload media or open the review cockpit/);
  assert.match(source, /Comments, approvals, versions, and delivery assets/);
  assert.match(source, /aria-describedby="new-project-contract"/);
  assert.match(source, /FolderPlus/);
  assert.match(source, /UploadCloud/);
});

test("new project form preserves payload hygiene and cockpit radius discipline", () => {
  assert.match(source, /const name = String\(fd\.get\("name"\) \?\? ""\)\.trim\(\)/);
  assert.match(source, /const description = String\(fd\.get\("description"\) \?\? ""\)\.trim\(\)/);
  assert.doesNotMatch(source, /rounded-lg|rounded-xl|rounded-2xl|shadow-2xl/);
});
