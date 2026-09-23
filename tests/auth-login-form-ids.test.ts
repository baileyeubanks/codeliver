import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const loginPage = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../app/login/page.tsx"),
  "utf8",
);

test("login form keeps the auth ids the form-fill door uses", () => {
  assert.match(loginPage, /id="auth-form"/);
  assert.match(loginPage, /id="login-title"/);
  assert.match(loginPage, /id="login-email"/);
  assert.match(loginPage, /name="email"/);
  assert.match(loginPage, /id="login-password"/);
  assert.match(loginPage, /name="password"/);
  assert.match(loginPage, /htmlFor="login-email"/);
  assert.match(loginPage, /htmlFor="login-password"/);
  assert.match(loginPage, /aria-controls="login-password"/);
  assert.match(loginPage, /document\.getElementById\("login-password"\)/);
  assert.match(loginPage, /formData\.get\("email"\)/);
  assert.match(loginPage, /formData\.get\("password"\)/);
});
