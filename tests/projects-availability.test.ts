import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

const availabilityModuleUrl = new URL(
  "../lib/api/projects-availability.ts",
  import.meta.url,
);

test("Projects Shell actions fail closed until the matching page state succeeds", async () => {
  assert.equal(
    existsSync(availabilityModuleUrl),
    true,
    "Projects page and Shell must share one availability contract",
  );

  const { normalizeProjectsFixture, projectsActionsUnavailable } = await import(
    "../lib/api/projects-availability.ts"
  );

  assert.equal(
    typeof normalizeProjectsFixture,
    "function",
    "fixture query values must pass through an explicit allowlist",
  );
  assert.equal(normalizeProjectsFixture("loading"), "loading");
  assert.equal(normalizeProjectsFixture("error"), "error");
  assert.equal(normalizeProjectsFixture("empty"), "empty");
  assert.equal(normalizeProjectsFixture("unknown"), null);
  assert.equal(normalizeProjectsFixture(null), null);

  assert.equal(projectsActionsUnavailable("/projects", "remote", null), true);
  assert.equal(
    projectsActionsUnavailable("/projects", "remote", {
      key: "remote",
      status: "loading",
    }),
    true,
  );
  assert.equal(
    projectsActionsUnavailable("/projects", "remote", {
      key: "remote",
      status: "error",
    }),
    true,
  );
  assert.equal(
    projectsActionsUnavailable("/projects", "remote", {
      key: "remote",
      status: "empty",
    }),
    true,
  );
  assert.equal(
    projectsActionsUnavailable("/projects", "remote", {
      key: "remote",
      status: "success",
    }),
    false,
  );
  assert.equal(
    projectsActionsUnavailable("/projects", "demo:loading", {
      key: "demo:default",
      status: "success",
    }),
    true,
    "a stale report from another fixture cannot enable actions",
  );
  assert.equal(
    projectsActionsUnavailable("/reviews", "remote", null),
    false,
    "Projects availability cannot suppress unrelated routes",
  );
});
