import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function source(path: string): string {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

test("review links page presents share authority as an operational cockpit surface", () => {
  const reviewsPage = source("app/(dashboard)/reviews/page.tsx");

  assert.match(reviewsPage, /Review authority/);
  assert.match(reviewsPage, /Review links/);
  assert.match(reviewsPage, /reviewReadiness/);
  assert.match(reviewsPage, /aria-label="Review readiness"/);
  assert.match(reviewsPage, /Create from cockpit/);
  assert.match(reviewsPage, /Open projects/);
  assert.match(reviewsPage, /permissionLabel/);
  assert.match(reviewsPage, /Decision authority/);
  assert.doesNotMatch(reviewsPage, /rounded-xl/);
});

test("review links filters, empty state, and details dialog stay honest and accessible", () => {
  const reviewsPage = source("app/(dashboard)/reviews/page.tsx");

  assert.match(reviewsPage, /role="tablist" aria-label="Review link filters"/);
  assert.match(reviewsPage, /aria-pressed=\{tab === "all"\}/);
  assert.match(reviewsPage, /aria-pressed=\{tab === "mine"\}/);
  assert.match(reviewsPage, /No review links yet/);
  assert.match(reviewsPage, /No delivery or notification is implied until a link is created/);
  assert.match(reviewsPage, /role="dialog"/);
  assert.match(reviewsPage, /aria-modal="true"/);
  assert.match(reviewsPage, /Close review link details/);
  assert.match(reviewsPage, /Notification status is controlled by share settings and provider readiness/);
  assert.doesNotMatch(reviewsPage, /✕/);
  assert.doesNotMatch(reviewsPage, /notification sent/i);
});
