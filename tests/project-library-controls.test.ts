import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const toolbarSource = readFileSync("components/projects/ProjectToolbar.tsx", "utf8");
const projectsSource = readFileSync("app/(dashboard)/projects/page.tsx", "utf8");

test("project library creation control names the project state it changes", () => {
  assert.match(toolbarSource, /onNewProject/);
  assert.match(toolbarSource, /New Project/);
  assert.doesNotMatch(toolbarSource, /New Folder/);
  assert.match(projectsSource, /onNewProject=\{\(\) => setShowNewProject\(true\)\}/);
});

test("project library removes visible controls without working actions", () => {
  assert.doesNotMatch(toolbarSource, /Batch actions/);
  assert.doesNotMatch(toolbarSource, /Import from cloud/);
  assert.doesNotMatch(projectsSource, /split-chevron/);
});

test("project library uses consistent upload command copy", () => {
  assert.match(projectsSource, /Upload media/);
  assert.doesNotMatch(projectsSource, /Upload Media/);
});
