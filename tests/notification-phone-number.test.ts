import assert from "node:assert/strict";
import test from "node:test";

import { normalizeE164Phone } from "../lib/notifications/phone-number.ts";

test("text notification numbers normalize to E.164", () => {
  assert.equal(normalizeE164Phone("+1 (312) 555-0142"), "+13125550142");
  assert.equal(normalizeE164Phone("+442071838750"), "+442071838750");
});

test("text notification numbers reject local, empty, and oversized values", () => {
  assert.equal(normalizeE164Phone("312-555-0142"), null);
  assert.equal(normalizeE164Phone(""), null);
  assert.equal(normalizeE164Phone("+1234567890123456"), null);
  assert.equal(normalizeE164Phone("javascript:alert(1)"), null);
});
