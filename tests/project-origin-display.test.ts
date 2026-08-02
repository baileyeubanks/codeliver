import assert from "node:assert/strict";
import test from "node:test";
import {
  DEMO_PROJECT_ORIGIN,
  deriveProjectOriginDisplay,
} from "../lib/co-produce/project-origin-display.ts";

test("manual projects are explicit about the missing proposal handoff", () => {
  assert.deepEqual(
    deriveProjectOriginDisplay({
      authority: { preproject: "unlinked" },
      lineage: { source: "manual_project" },
    }),
    {
      source: "Manual project",
      authority: "Co-VideoPro",
      reference: "Created in workspace",
      verification: "No proposal handoff",
    },
  );
});

test("verified CRM origins show the accepted proposal reference", () => {
  assert.deepEqual(
    deriveProjectOriginDisplay({
      authority: { preproject: "Co-VideoPro CRM" },
      lineage: {
        source: "accepted_proposal",
        preprojectOrigin: "linked",
        displayNumber: "0000189-B",
      },
    }),
    {
      source: "Accepted proposal",
      authority: "Co-VideoPro CRM",
      reference: "0000189-B",
      verification: "Verified handoff",
    },
  );
});

test("origin display fails closed when CRM evidence is incomplete", () => {
  assert.deepEqual(
    deriveProjectOriginDisplay({
      authority: { preproject: "Co-VideoPro CRM" },
      lineage: {
        source: "accepted_proposal",
        preprojectOrigin: "external_reference",
        displayNumber: "0000189-V",
      },
    }),
    {
      source: "Accepted proposal",
      authority: "External reference",
      reference: "0000189-V",
      verification: "Read-only reference",
    },
  );
});

test("legacy projects are never displayed as manually created without origin evidence", () => {
  assert.deepEqual(
    deriveProjectOriginDisplay({
      authority: { preproject: "unlinked" },
      lineage: { source: "unlinked_project" },
    }),
    {
      source: "Origin needs confirmation",
      authority: "Unlinked",
      reference: "Legacy project",
      verification: "No durable origin record",
    },
  );
});

test("malformed operating records stay out of the shell", () => {
  assert.equal(deriveProjectOriginDisplay(null), null);
  assert.equal(deriveProjectOriginDisplay({}), null);
  assert.equal(
    deriveProjectOriginDisplay({
      authority: { preproject: "Co-VideoPro CRM" },
      lineage: { source: "unknown" },
    }),
    null,
  );
});

test("demo origin is clearly labeled as preview-only", () => {
  assert.equal(DEMO_PROJECT_ORIGIN.reference, "Preview workspace");
  assert.equal(DEMO_PROJECT_ORIGIN.verification, "No proposal handoff");
});
