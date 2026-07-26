import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_AUTH_HOST_CONTEXT,
  resolveAuthHostContext,
} from "../components/auth/auth-context.ts";

test("auth context recognizes exact canonical and legacy hostnames", () => {
  assert.deepEqual(resolveAuthHostContext("admin.contentco-op.com"), {
    kind: "admin",
    label: "Content Co-op team",
  });
  assert.deepEqual(resolveAuthHostContext("client.contentco-op.com"), {
    kind: "client",
    label: "Client collaboration",
  });
  assert.deepEqual(resolveAuthHostContext("co-videopro.com"), {
    kind: "admin",
    label: "Content Co-op team",
  });
  assert.equal(resolveAuthHostContext("ADMIN.CONTENTCO-OP.COM").kind, "admin");
  assert.equal(resolveAuthHostContext("CLIENT.CONTENTCO-OP.COM").kind, "client");
  assert.equal(resolveAuthHostContext("CO-VIDEOPRO.COM").kind, "admin");
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
    "co-videopro.com.",
    "preview.co-videopro.com",
    "co-videopro.com.attacker.test",
    "admin.contentco-op.com.attacker.test",
    "client-contentco-op.example",
    "",
  ]) {
    assert.deepEqual(resolveAuthHostContext(hostname), DEFAULT_AUTH_HOST_CONTEXT);
  }
});
