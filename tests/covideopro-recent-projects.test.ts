import assert from "node:assert/strict";
import test from "node:test";
import { orderProjectsByActivity } from "../lib/demo/recent-projects.ts";

test("projects sort by latest activity, newest first", () => {
  const projects = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const activity = [
    { project_id: "c", created_at: "2026-07-10T00:00:00.000Z" },
    { project_id: "a", created_at: "2026-07-16T00:00:00.000Z" },
  ];
  assert.deepEqual(
    orderProjectsByActivity(projects, activity).map((project) => project.id),
    ["a", "c", "b"],
  );
});

test("latest activity wins when a project has several entries", () => {
  const projects = [{ id: "a" }, { id: "b" }];
  const activity = [
    { project_id: "a", created_at: "2026-07-01T00:00:00.000Z" },
    { project_id: "b", created_at: "2026-07-02T00:00:00.000Z" },
    { project_id: "a", created_at: "2026-07-03T00:00:00.000Z" },
  ];
  assert.deepEqual(
    orderProjectsByActivity(projects, activity).map((project) => project.id),
    ["a", "b"],
  );
});

test("projects with no activity keep their workspace order", () => {
  const projects = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(
    orderProjectsByActivity(projects, []).map((project) => project.id),
    ["a", "b", "c"],
  );
});

test("the input array is not mutated", () => {
  const projects = [{ id: "b" }, { id: "a" }];
  orderProjectsByActivity(projects, [{ project_id: "a", created_at: "2026-07-01T00:00:00.000Z" }]);
  assert.deepEqual(
    projects.map((project) => project.id),
    ["b", "a"],
  );
});
