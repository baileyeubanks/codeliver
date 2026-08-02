import assert from "node:assert/strict";
import test from "node:test";
import {
  formatActivityAction,
  formatActivitySubject,
} from "../lib/activity-copy.ts";

test("activity actions are presented as human-readable production events", () => {
  assert.equal(formatActivityAction("moved_asset_to_trash"), "moved media to Trash");
  assert.equal(formatActivityAction("marked_cut_decision"), "marked an edit decision");
  assert.equal(formatActivityAction("recorded_public_approval"), "recorded an external approval");
  assert.equal(formatActivityAction("uploaded_version"), "uploaded a new version");
});

test("activity subjects prefer asset names before project names", () => {
  assert.equal(formatActivitySubject({ asset_title: "Launch Cut", project_name: "Brand Pilot" }), "Launch Cut");
  assert.equal(formatActivitySubject({ project_name: "Brand Pilot" }), "Brand Pilot");
  assert.equal(formatActivitySubject({}), "");
});
