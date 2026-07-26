import assert from "node:assert/strict";
import test from "node:test";

import {
  assessSignedDeliveryReadiness,
  SIGNED_DELIVERY_REQUIRED_BINDINGS,
} from "../lib/storage/delivery-readiness.ts";
import { buildUploadWorkflowReadiness } from "../lib/storage/release-readiness.ts";
import type { StorageReadiness } from "../lib/storage/contracts.ts";

function storageReadiness(
  capabilities: StorageReadiness["capabilities"] = []
): StorageReadiness {
  return {
    provider: "local",
    label: "Test storage",
    configured: true,
    external: false,
    writeEnabled: true,
    readyForWrites: true,
    capabilities,
    checks: [],
    capacity: null,
    observedAt: new Date().toISOString(),
  };
}

test("signed delivery remains fail-closed when any authority is absent", () => {
  const storage = storageReadiness(["signed-delivery"]);
  const blocked = assessSignedDeliveryReadiness(storage);
  assert.equal(blocked.ready, false);
  assert.equal(blocked.failClosed, true);
  assert.deepEqual(blocked.requiredBindings, SIGNED_DELIVERY_REQUIRED_BINDINGS);

  const stillBlocked = assessSignedDeliveryReadiness(storageReadiness(), {
    signerConfigured: true,
    policyResolverReady: true,
    revocationStoreReady: true,
    auditSinkReady: true,
  });
  assert.equal(stillBlocked.ready, false);
  assert.match(
    stillBlocked.checks.find((check) => check.key === "signed-delivery-capability")
      ?.message ?? "",
    /does not advertise/
  );
});

test("signed delivery readiness requires every manifest authority", () => {
  const ready = assessSignedDeliveryReadiness(
    storageReadiness(["signed-delivery"]),
    {
      signerConfigured: true,
      policyResolverReady: true,
      revocationStoreReady: true,
      auditSinkReady: true,
    }
  );
  assert.equal(ready.ready, true);
  assert.equal(ready.checks.every((check) => check.status === "pass"), true);
});

test("workflow readiness distinguishes ingest from automatic release", () => {
  const workflow = buildUploadWorkflowReadiness({
    storage: storageReadiness(),
    scanner: {
      mode: "required-unconfigured",
      configured: false,
      automaticReleaseReady: false,
      message: "Scanner unavailable",
    },
    derivativeHooksConfigured: false,
  });
  assert.equal(workflow.scanner.automaticReleaseReady, false);
  assert.equal(workflow.derivatives.automaticProcessingReady, false);
  assert.equal(workflow.signedDelivery.ready, false);
  assert.equal(workflow.scanner.failClosed, true);
  assert.equal(workflow.derivatives.failClosed, true);
});
