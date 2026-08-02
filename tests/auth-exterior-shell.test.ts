import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const authStyles = readFileSync("components/auth/AuthShell.module.css", "utf8");
const brandSource = readFileSync("components/brand/CoProductionBrand.tsx", "utf8");
const loginSource = readFileSync("app/login/page.tsx", "utf8");
const signupSource = readFileSync("app/signup/page.tsx", "utf8");
const notFoundSource = readFileSync("app/not-found.tsx", "utf8");
const globalErrorSource = readFileSync("app/global-error.tsx", "utf8");

test("auth panels use the supplied stacked product mark without changing the shell", () => {
  assert.match(authStyles, /\.panelBrand/);
  assert.match(authStyles, /--co-production-brand-width: 188px/);
  assert.match(authStyles, /--co-production-brand-width: 212px/);
  assert.match(loginSource, /<CoProductionBrand[\s\S]*?variant="stacked"/);
  assert.match(signupSource, /<CoProductionBrand[\s\S]*?variant="stacked"/);
  assert.match(loginSource, /className=\{styles\.panelBrand\}/);
  assert.match(signupSource, /className=\{styles\.panelBrand\}/);
  assert.match(loginSource, /variant="stacked"[\s\S]*?priority/);
  assert.match(signupSource, /variant="stacked"[\s\S]*?priority/);
});

test("fallback and empty states stay in the bright Co-VideoPro language", () => {
  assert.match(brandSource, /style\?: CSSProperties/);
  assert.match(notFoundSource, /variant="stacked"/);
  assert.match(notFoundSource, /variant="stacked"[\s\S]*?priority/);
  assert.match(notFoundSource, /#edf1f4/);
  assert.match(notFoundSource, /Back to projects/);
  assert.match(globalErrorSource, /variant="stacked"/);
  assert.match(globalErrorSource, /variant="stacked"[\s\S]*?priority/);
  assert.match(globalErrorSource, /#edf1f4/);
  assert.match(globalErrorSource, /#145bb8/);
  assert.doesNotMatch(globalErrorSource, /#0f172a/);
  assert.doesNotMatch(globalErrorSource, /#3b82f6/);
});
