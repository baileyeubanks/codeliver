import assert from "node:assert/strict";
import test from "node:test";

import {
  decryptOpaqueToken,
  encryptOpaqueToken,
  hashOpaqueToken,
  opaqueTokenLookup,
  persistedOpaqueTokenFields,
  recoverOpaqueToken,
  withoutPersistedTokenSecrets,
} from "../lib/security/opaque-token.ts";

const KEY = Buffer.alloc(32, 7).toString("base64url");
const TOKEN = "e4f6bd2928e741d2832e3f9ad3d3447d7ddfbc325e019312aa9e34e801b0aa92";

test("opaque token hashes are stable and never contain the original token", () => {
  const digest = hashOpaqueToken(TOKEN);
  assert.equal(digest.length, 64);
  assert.equal(digest, hashOpaqueToken(TOKEN));
  assert.notEqual(digest, TOKEN);
});

test("opaque token encryption round-trips and uses randomized envelopes", () => {
  const first = encryptOpaqueToken(TOKEN, KEY);
  const second = encryptOpaqueToken(TOKEN, KEY);
  assert.match(first, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.notEqual(first, second);
  assert.equal(decryptOpaqueToken(first, KEY), TOKEN);
  assert.equal(decryptOpaqueToken(second, KEY), TOKEN);
  assert.equal(first.includes(TOKEN), false);
});

test("tampered or incorrectly keyed token envelopes fail closed", () => {
  const encrypted = encryptOpaqueToken(TOKEN, KEY);
  const segments = encrypted.split(".");
  segments[2] = `${segments[2].startsWith("A") ? "B" : "A"}${segments[2].slice(1)}`;
  const tampered = segments.join(".");
  assert.throws(() => decryptOpaqueToken(tampered, KEY));
  assert.throws(() =>
    decryptOpaqueToken(encrypted, Buffer.alloc(32, 8).toString("base64url")),
  );
});

test("legacy demo persistence stays compatible while co_production stores no plaintext", () => {
  assert.deepEqual(persistedOpaqueTokenFields(TOKEN, "public", KEY), { token: TOKEN });
  const isolated = persistedOpaqueTokenFields(TOKEN, "co_production", KEY);
  assert.deepEqual(Object.keys(isolated).sort(), ["token_ciphertext", "token_hash"]);
  assert.equal(JSON.stringify(isolated).includes(TOKEN), false);
  assert.equal(recoverOpaqueToken(isolated, KEY), TOKEN);
  assert.deepEqual(opaqueTokenLookup(TOKEN, "co_production"), {
    column: "token_hash",
    value: hashOpaqueToken(TOKEN),
  });
});

test("isolated persistence requires a valid 32-byte encryption key", () => {
  assert.throws(
    () => persistedOpaqueTokenFields(TOKEN, "co_production", "short"),
    /exactly 32 bytes/,
  );
});

test("serialized rows can expose the ephemeral token without storage secrets", () => {
  const safe = withoutPersistedTokenSecrets({
    id: "invite-1",
    token: TOKEN,
    token_hash: hashOpaqueToken(TOKEN),
    token_ciphertext: encryptOpaqueToken(TOKEN, KEY),
  });
  assert.equal(safe.token, TOKEN);
  assert.equal("token_hash" in safe, false);
  assert.equal("token_ciphertext" in safe, false);
});
