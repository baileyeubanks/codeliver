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
  assert.match(reviewsPage, /aria-selected=\{tab === "all"\}/);
  assert.match(reviewsPage, /aria-selected=\{tab === "mine"\}/);
  assert.doesNotMatch(reviewsPage, /aria-pressed=\{tab ===/);
  assert.match(reviewsPage, /No review links yet/);
  assert.match(reviewsPage, /No delivery or notification is implied until a link is created/);
  assert.match(reviewsPage, /role="dialog"/);
  assert.match(reviewsPage, /aria-modal="true"/);
  assert.match(reviewsPage, /Close review link details/);
  assert.match(reviewsPage, /Notification status is controlled by share settings and provider readiness/);
  assert.doesNotMatch(reviewsPage, /✕/);
  assert.doesNotMatch(reviewsPage, /notification sent/i);
});

test("review links remain labeled and usable in the mobile card layout", () => {
  const reviewsPage = source("app/(dashboard)/reviews/page.tsx");
  const globalStyles = source("app/globals.css");

  assert.match(reviewsPage, /className="table reviews-table"/);
  assert.match(reviewsPage, /className="reviews-row cursor-pointer"/);
  for (const label of [
    "Type",
    "Created",
    "Created by",
    "Message",
    "Media",
    "Invited",
    "Settings",
    "Link",
    "Active",
  ]) {
    assert.match(reviewsPage, new RegExp(`data-label="${label}"`));
  }
  assert.match(reviewsPage, /reviews-type-label/);
  assert.match(globalStyles, /\.reviews-table tr\s*\{/);
  assert.match(globalStyles, /grid-template-areas:\s*"type active"\s*"message message"\s*"created creator"\s*"media invited"\s*"settings settings"\s*"link link"/);
  assert.match(globalStyles, /\.reviews-table td::before\s*\{/);
  assert.match(globalStyles, /content:\s*attr\(data-label\)/);
  assert.match(globalStyles, /\.reviews-link-cell > div\s*\{[\s\S]*flex-wrap:\s*wrap/);
});
