import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const authHook = readFileSync("components/auth/useAuthSession.ts", "utf8");
const sessionRoute = readFileSync("app/api/auth/session/route.ts", "utf8");

test("managed session loading waits for query-derived demo mode to settle", () => {
  assert.match(authHook, /if \(!enabled\) \{[\s\S]*?reload\(controller\.signal\)/);
  assert.match(authHook, /window\.setTimeout\(\(\) => \{[\s\S]*?reload\(controller\.signal\)/);
  assert.match(authHook, /window\.clearTimeout\(timer\)/);
  assert.match(authHook, /controller\.abort\(\)/);
});

test("session authority fails closed without leaking configuration errors", () => {
  assert.match(sessionRoute, /try \{[\s\S]*?user = await requireAuth\(\)/);
  assert.match(sessionRoute, /catch \{[\s\S]*?code: "AUTH_UNAVAILABLE"/);
  assert.match(sessionRoute, /status: 503/);
  assert.doesNotMatch(sessionRoute, /error\.message|String\(error\)/);
});
