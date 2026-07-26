import assert from "node:assert/strict";
import test from "node:test";

import {
  authFailureMessage,
  buildAuthPageHref,
  normalizeAuthEmail,
  resolveDemoReturnPath,
  resolveSafeReturnPath,
  resolveSurfaceMismatchNotice,
  validateSignupCredentials,
  withDemoMode,
} from "../components/auth/auth-policy.ts";

test("post-auth navigation accepts only local non-authentication paths", () => {
  assert.equal(resolveSafeReturnPath("/projects/ica?view=review#latest"), "/projects/ica?view=review#latest");
  assert.equal(resolveSafeReturnPath("https://attacker.example/session"), "/projects");
  assert.equal(resolveSafeReturnPath("//attacker.example/session"), "/projects");
  assert.equal(resolveSafeReturnPath("/\\attacker.example/session"), "/projects");
  assert.equal(resolveSafeReturnPath("/login?next=/projects"), "/projects");
  assert.equal(resolveSafeReturnPath("/%256cogin?next=/projects"), "/projects");
  assert.equal(resolveSafeReturnPath("/auth/callback?code=secret"), "/projects");
  assert.equal(resolveSafeReturnPath("/API/AUTH/session"), "/projects");
  assert.equal(resolveSafeReturnPath("/%2f%2fattacker.example/session"), "/projects");
  assert.equal(resolveSafeReturnPath("/projects%0d%0aSet-Cookie:test"), "/projects");
  assert.equal(resolveSafeReturnPath("/projects\u0000/admin"), "/projects");
});

test("demo navigation preserves an internal target and adds one demo marker", () => {
  assert.equal(withDemoMode("/projects/ica?view=review#latest", true), "/projects/ica?view=review&demo=1#latest");
  assert.equal(withDemoMode("//attacker.example", true), "/projects?demo=1");
  assert.equal(withDemoMode("/projects?demo=0", true), "/projects?demo=1");
});

test("signup validation normalizes identity without weakening the server password contract", () => {
  assert.equal(normalizeAuthEmail("  Owner@Example.com "), "owner@example.com");
  assert.deepEqual(
    validateSignupCredentials({
      email: " Owner@Example.com ",
      password: "secret12",
      confirmation: "secret12",
    }),
    { email: "owner@example.com", error: null, field: null },
  );
  assert.match(
    validateSignupCredentials({ email: "invalid", password: "secret12", confirmation: "secret12" }).error ?? "",
    /valid email/i,
  );
  assert.match(
    validateSignupCredentials({ email: "a@example.com", password: "short", confirmation: "short" }).error ?? "",
    /at least 8/i,
  );
  assert.match(
    validateSignupCredentials({ email: "a@example.com", password: "secret12", confirmation: "different" }).error ?? "",
    /do not match/i,
  );
  assert.equal(
    validateSignupCredentials({ email: "a@example.com", password: "secret12", confirmation: "different" }).field,
    "confirmation",
  );
});

test("auth page links preserve only a safe return target and explicit demo mode", () => {
  assert.equal(
    buildAuthPageHref("/signup", "/settings?section=preferences", true),
    "/signup?demo=1&next=%2Fsettings%3Fsection%3Dpreferences",
  );
  assert.equal(
    buildAuthPageHref("/login", "https://attacker.example/session", false),
    "/login?next=%2Fprojects",
  );
  assert.equal(buildAuthPageHref("/login", null, false), "/login");
  assert.equal(
    resolveDemoReturnPath(
      "/settings",
      "?section=brand&demo=1",
      "#history",
    ),
    "/settings?section=brand#history",
  );
});

test("authentication failures do not expose provider account details", () => {
  assert.equal(authFailureMessage(401), "Email or password was not accepted.");
  assert.equal(authFailureMessage(429), "Too many attempts. Wait a moment and try again.");
  assert.equal(authFailureMessage(503), "Authentication is temporarily unavailable.");
});

test("surface mismatch notices accept only safe managed portal instructions", () => {
  assert.deepEqual(
    resolveSurfaceMismatchNotice(
      "?access=surface_mismatch&required_surface=client&next=%2Fprojects%2Fica%3Fview%3Dreview",
    ),
    {
      portalHref: "https://client.contentco-op.com/login?next=%2Fprojects%2Fica%3Fview%3Dreview",
      portalLabel: "Client Portal",
      requiredSurface: "client",
    },
  );
  assert.deepEqual(
    resolveSurfaceMismatchNotice(
      "?access=surface_mismatch&required_surface=admin&next=https%3A%2F%2Fattacker.example%2Fsession",
    ),
    {
      portalHref: "https://admin.contentco-op.com/login?next=%2Fprojects",
      portalLabel: "Admin Portal",
      requiredSurface: "admin",
    },
  );

  for (const search of [
    "?required_surface=client",
    "?access=pending&required_surface=client",
    "?access=surface_mismatch&required_surface=staff",
    "?access=surface_mismatch&required_surface=client&required_surface=admin",
  ]) {
    assert.equal(resolveSurfaceMismatchNotice(search), null, search);
  }
});
