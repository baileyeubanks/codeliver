import assert from "node:assert/strict";
import test from "node:test";
import { projectConversationThreads } from "../lib/projects/conversations.ts";

const assets = [{ id: "film", project_id: "project", title: "Aayush interview" }];
const versions = [
  { id: "v1", asset_id: "film", version_number: 1, is_current: false },
  { id: "v2", asset_id: "film", version_number: 2, is_current: true },
];
const comment = (id: string, version_id: string | null, review_invite_id: string | null) => ({
  id, version_id, review_invite_id, project_id: "project", asset_id: "film",
  body: id, created_at: "2026-09-22T00:00:00Z",
});
const link = (id: string, version_id: string) => ({
  id, version_id, asset_ids: ["film"], token: `${id}-token`,
  version_binding_status: "bound", is_active: true, expires_at: null,
});
const input = { projectId: "project", assets, versions, now: Date.parse("2026-09-22T00:00:00Z") };

test("conversation groups retain the exact cut and review round, including replies", () => {
  const threads = projectConversationThreads({ ...input,
    comments: [comment("old", "v1", "round1"), comment("reply", "v1", "round1"),
      comment("new", "v2", "round2"), comment("other round", "v1", "round3")],
    shareLinks: [link("round1", "v1"), link("round2", "v2"), link("round3", "v1")],
  });
  assert.equal(threads.length, 3);
  assert.deepEqual(threads[0].comments.map(item => item.id), ["old", "reply"]);
  assert.equal(threads[0].versionLabel, "V1");
  assert.equal(threads[0].reviewHref, "/review/round1-token?demo=1");
  assert.equal(threads[1].versionLabel, "V2");
  assert.equal(threads[1].reviewHref, "/review/round2-token?demo=1");
  assert.equal(threads[2].reviewHref, "/review/round3-token?demo=1");
});

test("missing, changed, inactive, expired or ambiguous review authority never opens the latest cut", () => {
  for (const shareLinks of [[], [link("round1", "v2")],
    [{ ...link("round1", "v1"), is_active: false }],
    [{ ...link("round1", "v1"), expires_at: "2026-09-21T00:00:00Z" }],
    [{ ...link("round1", "v1"), asset_ids: ["film", "another"] }],
    [{ ...link("round1", "v1"), version_binding_status: "reissue_required" }],
    [link("round1", "v1"), { ...link("round1", "v1"), token: "other" }],
  ]) {
    const [thread] = projectConversationThreads({ ...input, comments: [comment("old", "v1", "round1")], shareLinks });
    assert.equal(thread.reviewHref, null);
    assert.equal(thread.comments[0].body, "old");
  }
});

test("unversioned history is preserved without guessing a current version", () => {
  const [thread] = projectConversationThreads({ ...input, comments: [comment("legacy", null, null)], shareLinks: [] });
  assert.equal(thread.versionLabel, "Version not recorded");
  assert.equal(thread.reviewHref, null);
});

test("unshared notes open their exact internal cut while preserving separate version threads", () => {
  const threads = projectConversationThreads({ ...input,
    comments: [comment("old internal", "v1", null), comment("current internal", "v2", null)], shareLinks: [] });
  assert.equal(threads[0].reviewHref, "/projects/project?demo=1&asset=film&version=v1&view=review");
  assert.equal(threads[1].reviewHref, "/projects/project?demo=1&asset=film&version=v2&view=review");
  assert.deepEqual(threads[0].comments.map(item => item.id), ["old internal"]);
  assert.deepEqual(threads[1].comments.map(item => item.id), ["current internal"]);
});

test("an unshared note with ambiguous or mismatched version records has no internal shortcut", () => {
  for (const recordedVersions of [[], [versions[0], versions[0]], [{ ...versions[0], asset_id: "another-film" }]]) {
    const [thread] = projectConversationThreads({ ...input,
      versions: recordedVersions, comments: [comment("old internal", "v1", null)], shareLinks: [] });
    assert.equal(thread.reviewHref, null);
  }
});

test("project conversations cannot expose comments attached to another project's media", () => {
  const threads = projectConversationThreads({ ...input,
    assets: [...assets, { id: "foreign", project_id: "another-project", title: "Private film" }],
    comments: [{ ...comment("wrong project", "v1", "round1"), project_id: "another-project" },
      { ...comment("wrong media", "v1", "round1"), asset_id: "foreign" }], shareLinks: [] });
  assert.deepEqual(threads, []);
});
