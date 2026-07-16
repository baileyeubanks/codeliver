import assert from "node:assert/strict";
import test from "node:test";

import {
  activeNavigationId,
  rankCommands,
  roleCan,
  visibleNavigation,
  withWorkspaceQuery,
} from "../components/navigation/navigation-model.ts";

test("workspace navigation is filtered by role capabilities", () => {
  assert.equal(roleCan("owner", "workspace:manage"), true);
  assert.equal(roleCan("viewer", "workspace:manage"), false);
  assert.equal(roleCan("reviewer", "reviews:approve"), true);
  assert.equal(roleCan("editor", "reviews:approve"), false);

  const viewerIds = visibleNavigation("viewer").flatMap((section) =>
    section.items.map((item) => item.id),
  );
  assert.deepEqual(viewerIds, ["projects", "reviews", "library", "archive", "trash"]);
});

test("the most specific route wins active navigation", () => {
  assert.equal(activeNavigationId("/projects/ica", "owner"), "projects");
  assert.equal(activeNavigationId("/projects/archive", "owner"), "archive");
  assert.equal(activeNavigationId("/projects/trash/item-1", "owner"), "trash");
  assert.equal(activeNavigationId("/unknown", "owner"), null);
});

test("workspace query suffixes preserve existing queries and hashes", () => {
  assert.equal(withWorkspaceQuery("/projects", "?demo=1"), "/projects?demo=1");
  assert.equal(withWorkspaceQuery("/settings?tab=brand", "?demo=1"), "/settings?tab=brand&demo=1");
  assert.equal(withWorkspaceQuery("/settings#profile", "?demo=1"), "/settings?demo=1#profile");
  assert.equal(withWorkspaceQuery("https://example.com", "?demo=1"), "https://example.com");
});

test("command ranking rewards exact labels and requires every search term", () => {
  const commands = [
    { id: "media", label: "Media library", description: "All project media", keywords: ["assets"] },
    { id: "project", label: "ICA Roadshow", description: "Open project cockpit", keywords: ["media"] },
    { id: "reviews", label: "Reviews", description: "Client approvals", keywords: ["feedback"] },
  ];

  assert.deepEqual(rankCommands(commands, "media").map((item) => item.id), ["media", "project"]);
  assert.deepEqual(rankCommands(commands, "project media").map((item) => item.id), ["media", "project"]);
  assert.deepEqual(rankCommands(commands, "missing"), []);
  assert.deepEqual(rankCommands(commands, "", 2).map((item) => item.id), ["media", "project"]);
});
