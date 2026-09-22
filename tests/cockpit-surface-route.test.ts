import assert from "node:assert/strict";
import test from "node:test";

import {
  cockpitSectionFromSearchParams,
  projectCockpitSurfaceHref,
} from "../components/cockpit/cockpit-navigation.ts";

test("project cockpit surface URLs preserve project context and clear only incompatible views", () => {
  const source = "demo=1&asset=el-paso-epw-v4&version=el-paso-epw-v4-v2&tab=brief&view=review&note=client";

  assert.equal(
    projectCockpitSurfaceHref("el-paso", source, "media"),
    "/projects/el-paso?demo=1&asset=el-paso-epw-v4&version=el-paso-epw-v4-v2&note=client&surface=media",
  );
  assert.equal(
    projectCockpitSurfaceHref("el-paso", source, "overview"),
    "/projects/el-paso?demo=1&asset=el-paso-epw-v4&version=el-paso-epw-v4-v2&note=client",
  );
});

test("project cockpit surface parsing safely falls back for absent and unknown URLs", () => {
  assert.equal(cockpitSectionFromSearchParams(new URLSearchParams()), "overview");
  assert.equal(cockpitSectionFromSearchParams(new URLSearchParams("surface=unknown")), "overview");
  assert.equal(cockpitSectionFromSearchParams(new URLSearchParams("surface=delivery")), "delivery");
});
