import assert from "node:assert/strict";
import test from "node:test";

import { resolveShareEmailAuthority } from "../lib/sharing/notification-authority.ts";

test("a recipient email never implies notification authority", () => {
  assert.equal(resolveShareEmailAuthority(false, "reviewer@client.example"), "not_requested");
  assert.equal(resolveShareEmailAuthority(undefined, "reviewer@client.example"), "not_requested");
});

test("an explicit send requires a recipient", () => {
  assert.equal(resolveShareEmailAuthority(true, null), "missing_recipient");
  assert.equal(resolveShareEmailAuthority(true, "reviewer@client.example"), "authorized");
});
