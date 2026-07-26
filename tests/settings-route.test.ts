import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSettingsHref,
  resolveSettingsTab,
} from "../components/auth/settings-route.ts";

test("settings sections are deep-linkable without accepting unknown panels", () => {
  assert.equal(resolveSettingsTab("brand"), "brand");
  assert.equal(resolveSettingsTab("systems"), "systems");
  assert.equal(resolveSettingsTab("preferences"), "preferences");
  assert.equal(resolveSettingsTab("billing"), "account");
  assert.equal(resolveSettingsTab(null), "account");
});

test("settings links preserve explicit local demo mode", () => {
  assert.equal(
    buildSettingsHref("preferences", true),
    "/settings?section=preferences&demo=1",
  );
  assert.equal(
    buildSettingsHref("systems", true),
    "/settings?section=systems&demo=1",
  );
  assert.equal(buildSettingsHref("account", false), "/settings?section=account");
});
