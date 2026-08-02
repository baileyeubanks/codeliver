import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_AUTH_HOST_CONTEXT,
  resolveAuthHostContext,
} from "../components/auth/auth-context.ts";

test("auth context recognizes only the exact canonical hostnames", () => {
  assert.deepEqual(resolveAuthHostContext("admin.contentco-op.com"), {
    kind: "admin",
    label: "Content Co-op team",
  });
  assert.deepEqual(resolveAuthHostContext("client.contentco-op.com"), {
    kind: "client",
    label: "Client collaboration",
  });
  assert.equal(resolveAuthHostContext("ADMIN.CONTENTCO-OP.COM").kind, "admin");
  assert.equal(resolveAuthHostContext("CLIENT.CONTENTCO-OP.COM").kind, "client");
});

test("canonical product hosts return a stable external-store snapshot", () => {
  const canonical = resolveAuthHostContext("co-videopro.com");

  assert.equal(canonical.label, "Co-VideoPro workspace");
  assert.strictEqual(resolveAuthHostContext("co-videopro.com"), canonical);
  assert.strictEqual(resolveAuthHostContext("WWW.CO-VIDEOPRO.COM"), canonical);
});

test("aliases, local, and deceptive hosts retain the neutral auth context", () => {
  for (const hostname of [
    "studio.admin.contentco-op.com",
    "preview.admin.contentco-op.com",
    "clients.contentco-op.com",
    "portal.contentco-op.com",
    "deliver.contentco-op.com",
    "admin.localhost",
    "client.localhost",
    "localhost",
    "admin.contentco-op.com:443",
    "client.contentco-op.com.",
    "admin.contentco-op.com.attacker.test",
    "client-contentco-op.example",
    "",
  ]) {
    assert.deepEqual(resolveAuthHostContext(hostname), DEFAULT_AUTH_HOST_CONTEXT);
  }
});
