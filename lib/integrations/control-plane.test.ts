import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  IntegrationControlError,
  IntegrationControlPlane,
  type IntegrationControlErrorCode,
} from "./control-plane";
import {
  INTEGRATION_COMMAND_SCHEMA_VERSION,
  INTEGRATION_CONFIGURATION_SCHEMA_VERSION,
  type IntegrationCommand,
  type IntegrationExecutionContext,
  type IntegrationPermission,
  type RegisterConfigurationCommand,
} from "./contracts";
import { InMemoryIntegrationLedger } from "./ledger";

const ALL_PERMISSIONS = new Set<IntegrationPermission>([
  "integrations.inspect",
  "integrations.configure",
  "integrations.enable",
  "integrations.preview",
  "integrations.request_delivery",
  "integrations.cancel",
]);

function context(
  tenantId = "tenant-a",
  permissions: ReadonlySet<IntegrationPermission> = ALL_PERMISSIONS,
): IntegrationExecutionContext {
  return { tenantId, actorId: "actor-1", permissions };
}

function registration(
  idempotencyKey = "register-1",
  integrationId = "editorial-output",
  configurationVersion = "cfg-1",
): RegisterConfigurationCommand {
  return {
    schemaVersion: INTEGRATION_COMMAND_SCHEMA_VERSION,
    type: "register_configuration",
    idempotencyKey,
    integrationId,
    configuration: {
      schemaVersion: INTEGRATION_CONFIGURATION_SCHEMA_VERSION,
      configurationVersion,
      capabilities: ["message.submit", "status.receive"],
      payloadSchemaBindings: {
        "message.submit": "message/v1",
        "status.receive": "status/v1",
      },
      initialState: "disabled",
    },
  };
}

function enable(
  idempotencyKey = "enable-1",
  expectedConfigurationVersion = "cfg-1",
  nextConfigurationVersion = "cfg-2",
): IntegrationCommand {
  return {
    schemaVersion: INTEGRATION_COMMAND_SCHEMA_VERSION,
    type: "enable_configuration",
    idempotencyKey,
    integrationId: "editorial-output",
    expectedConfigurationVersion,
    nextConfigurationVersion,
  };
}

function requestDelivery(
  idempotencyKey = "intent-1",
  configurationVersion = "cfg-2",
  payload: Record<string, unknown> = { title: "Review complete", assetRef: "asset-7" },
): IntegrationCommand {
  return {
    schemaVersion: INTEGRATION_COMMAND_SCHEMA_VERSION,
    type: "request_delivery",
    idempotencyKey,
    integrationId: "editorial-output",
    expectedConfigurationVersion: configurationVersion,
    capability: "message.submit",
    payloadSchemaVersion: "message/v1",
    payload,
  };
}

function expectCode(code: IntegrationControlErrorCode) {
  return (error: unknown) =>
    error instanceof IntegrationControlError && error.code === code;
}

function fixedPlane(options: ConstructorParameters<typeof IntegrationControlPlane>[0] = {}) {
  return new IntegrationControlPlane({
    now: () => new Date("2026-07-14T12:00:00.000Z"),
    ...options,
  });
}

describe("provider-neutral integration control plane", () => {
  test("starts configurations disabled and exposes only capabilities and safe status", () => {
    const plane = fixedPlane();
    const result = plane.execute(context(), registration());

    assert.equal(result.receipt.status, "configuration_registered_disabled");
    assert.equal(result.receipt.deliveryAttempted, false);
    assert.equal(result.receipt.externalEffect, "none");
    assert.equal(
      result.receipt.compensationStatus,
      "not_required_no_external_effect",
    );
    assert.deepEqual(plane.listConfigurations(context()), [
      {
        integrationId: "editorial-output",
        schemaVersion: INTEGRATION_CONFIGURATION_SCHEMA_VERSION,
        configurationVersion: "cfg-1",
        capabilities: ["message.submit", "status.receive"],
        payloadSchemaBindings: {
          "message.submit": "message/v1",
          "status.receive": "status/v1",
        },
        state: "disabled",
        liveDeliveryAvailable: false,
      },
    ]);
    assert.equal(JSON.stringify(result).includes("providerName"), false);
    const safeAudit = plane.toSafeAuditEvent(result.receipt);
    assert.deepEqual(Object.keys(safeAudit).sort(), [
      "actorRef",
      "commandType",
      "compensationStatus",
      "configurationVersion",
      "deliveryAttempted",
      "event",
      "externalEffect",
      "integrationRef",
      "receiptId",
      "status",
      "tenantRef",
    ]);
    assert.equal(Object.isFrozen(result.receipt), true);
    assert.equal(JSON.stringify(safeAudit).includes("tenant-a"), false);
    assert.equal(JSON.stringify(safeAudit).includes("actor-1"), false);
    assert.equal(JSON.stringify(safeAudit).includes("editorial-output"), false);
    assert.equal(JSON.stringify(safeAudit).includes("register-1"), false);

    const preview = plane.execute(context(), {
      schemaVersion: INTEGRATION_COMMAND_SCHEMA_VERSION,
      type: "preview_delivery",
      idempotencyKey: "preview-disabled",
      integrationId: "editorial-output",
      expectedConfigurationVersion: "cfg-1",
      capability: "message.submit",
      payloadSchemaVersion: "message/v1",
      payload: { title: "Safe preview" },
    });
    assert.equal(preview.receipt.status, "preview_recorded");
    assert.equal(preview.receipt.deliveryAttempted, false);
  });

  test("isolates tenants even when identifiers have overlapping prefixes", () => {
    const plane = fixedPlane();
    plane.execute(context("tenant"), registration("key", "shared"));
    plane.execute(context("tenant:child"), registration("key", "shared"));

    assert.equal(plane.listConfigurations(context("tenant")).length, 1);
    assert.equal(plane.listConfigurations(context("tenant:child")).length, 1);

    assert.throws(
      () => plane.execute(context("tenant:other"), enable("other-key")),
      expectCode("NOT_FOUND"),
    );
  });

  test("rejects disabled delivery and server-context permissions gate enable and send", () => {
    const plane = fixedPlane();
    plane.execute(context(), registration());

    assert.throws(
      () => plane.execute(context(), requestDelivery("disabled", "cfg-1")),
      expectCode("CONFIGURATION_DISABLED"),
    );
    assert.throws(
      () =>
        plane.execute(
          context("tenant-a", new Set(["integrations.inspect"])),
          enable("unauthorized-enable"),
        ),
      expectCode("FORBIDDEN"),
    );
    assert.throws(
      () =>
        plane.execute(
          context("tenant-a", new Set(["integrations.inspect"])),
          requestDelivery("unauthorized-send", "cfg-1"),
        ),
      expectCode("FORBIDDEN"),
    );
  });

  test("records no-delivery receipts, returns deterministic replays, and rejects key collisions", () => {
    const plane = fixedPlane();
    plane.execute(context(), registration());
    plane.execute(context(), enable());

    const command = requestDelivery();
    const first = plane.execute(context(), command);
    const replay = plane.execute(context(), command);

    assert.equal(first.receipt.status, "delivery_intent_recorded_not_delivered");
    assert.equal(first.receipt.deliveryAttempted, false);
    assert.equal(first.receipt.reversibleBy, "cancel_intent");
    assert.equal("payload" in first.receipt, false);
    assert.match(first.receipt.payloadDigest ?? "", /^[a-f0-9]{64}$/);
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.receipt, first.receipt);

    assert.throws(
      () =>
        plane.execute(
          context(),
          requestDelivery("intent-1", "cfg-2", { title: "Different" }),
        ),
      expectCode("IDEMPOTENCY_KEY_REUSED"),
    );
  });

  test("binds configuration and payload schema versions", () => {
    const plane = fixedPlane();
    plane.execute(context(), registration());
    plane.execute(context(), enable());

    assert.throws(
      () => plane.execute(context(), requestDelivery("stale", "cfg-1")),
      expectCode("STALE_CONFIGURATION"),
    );
    assert.throws(
      () =>
        plane.execute(context(), {
          ...requestDelivery("wrong-payload-version"),
          payloadSchemaVersion: "message/v2",
        }),
      expectCode("PAYLOAD_SCHEMA_MISMATCH"),
    );
    assert.throws(
      () =>
        plane.execute(context(), {
          ...requestDelivery("unsupported-capability"),
          capability: "event.publish",
          payloadSchemaVersion: "event/v1",
        }),
      expectCode("CAPABILITY_NOT_CONFIGURED"),
    );
  });

  test("rejects secret-like, callback, endpoint, and connection material", () => {
    const unsafePayloads = [
      { secret: "not-accepted" },
      { api_key: "not-accepted" },
      { callbackUrl: "relative-is-still-not-accepted" },
      { nestedSecretValue: "not-accepted" },
      { endpoint: "http://127.0.0.1/private" },
      { body: "Bearer abc.def.ghi" },
      { body: "http://169.254.169.254/latest" },
      { body: "localhost:3000/private" },
      { body: "sk-1234567890abcdef" },
    ];

    for (const [index, payload] of unsafePayloads.entries()) {
      const plane = fixedPlane();
      plane.execute(context(), registration());
      plane.execute(context(), enable());
      assert.throws(
        () => plane.execute(context(), requestDelivery(`unsafe-${index}`, "cfg-2", payload)),
        expectCode("UNSAFE_INPUT"),
      );
    }
  });

  test("strict schemas reject spoofed callbacks, destination configuration, and provider fields", () => {
    const plane = fixedPlane();
    assert.throws(
      () =>
        plane.execute(context(), {
          ...registration(),
          providerName: "outside-the-contract",
        }),
      expectCode("INVALID_COMMAND"),
    );
    assert.throws(
      () =>
        plane.execute(context(), {
          ...registration(),
          configuration: {
            ...registration().configuration,
            endpoint: "http://127.0.0.1",
          },
        }),
      expectCode("INVALID_COMMAND"),
    );
    assert.throws(
      () =>
        plane.execute(context(), {
          schemaVersion: INTEGRATION_COMMAND_SCHEMA_VERSION,
          type: "receive_callback",
          idempotencyKey: "spoofed-callback",
          integrationId: "editorial-output",
          signature: "untrusted",
        }),
      expectCode("INVALID_COMMAND"),
    );
  });

  test("accepts ordinary media metadata without mistaking clip or duration fields for connection data", () => {
    const plane = fixedPlane();
    plane.execute(context(), registration());
    plane.execute(context(), enable());

    const result = plane.execute(
      context(),
      requestDelivery("media-metadata", "cfg-2", {
        clipId: "clip-7",
        durationSeconds: 42,
        description: "Approved cut",
        thumbnailRef: "asset-thumb-2",
      }),
    );
    assert.equal(result.receipt.status, "delivery_intent_recorded_not_delivered");
  });

  test("cancel and restore are tenant-bound reversible receipt transitions", () => {
    const plane = fixedPlane();
    plane.execute(context(), registration());
    plane.execute(context(), enable());
    const intent = plane.execute(context(), requestDelivery());

    assert.throws(
      () =>
        plane.execute(context("tenant-b"), {
          schemaVersion: INTEGRATION_COMMAND_SCHEMA_VERSION,
          type: "cancel_intent",
          idempotencyKey: "cross-tenant-cancel",
          integrationId: "editorial-output",
          targetReceiptId: intent.receipt.receiptId,
        }),
      expectCode("NOT_FOUND"),
    );

    const canceled = plane.execute(context(), {
      schemaVersion: INTEGRATION_COMMAND_SCHEMA_VERSION,
      type: "cancel_intent",
      idempotencyKey: "cancel-1",
      integrationId: "editorial-output",
      targetReceiptId: intent.receipt.receiptId,
    });
    assert.equal(canceled.receipt.status, "intent_canceled");
    assert.equal(canceled.receipt.deliveryAttempted, false);
    assert.equal(canceled.receipt.reversibleBy, "restore_intent");

    assert.throws(
      () =>
        plane.execute(context(), {
          schemaVersion: INTEGRATION_COMMAND_SCHEMA_VERSION,
          type: "cancel_intent",
          idempotencyKey: "cancel-race",
          integrationId: "editorial-output",
          targetReceiptId: intent.receipt.receiptId,
        }),
      expectCode("INVALID_INTENT_STATE"),
    );

    const restored = plane.execute(context(), {
      schemaVersion: INTEGRATION_COMMAND_SCHEMA_VERSION,
      type: "restore_intent",
      idempotencyKey: "restore-1",
      integrationId: "editorial-output",
      targetReceiptId: intent.receipt.receiptId,
    });
    assert.equal(restored.receipt.status, "intent_restored");
    assert.equal(restored.receipt.deliveryAttempted, false);
    assert.equal(restored.receipt.reversibleBy, "cancel_intent");
  });

  test("disable and re-enable require explicit version transitions", () => {
    const plane = fixedPlane();
    plane.execute(context(), registration());
    plane.execute(context(), enable());
    plane.execute(context(), {
      schemaVersion: INTEGRATION_COMMAND_SCHEMA_VERSION,
      type: "disable_configuration",
      idempotencyKey: "disable-1",
      integrationId: "editorial-output",
      expectedConfigurationVersion: "cfg-2",
      nextConfigurationVersion: "cfg-3",
    });

    assert.equal(plane.listConfigurations(context())[0]?.state, "disabled");
    assert.throws(
      () => plane.execute(context(), requestDelivery("disabled-again", "cfg-3")),
      expectCode("CONFIGURATION_DISABLED"),
    );
    plane.execute(context(), enable("enable-2", "cfg-3", "cfg-4"));
    assert.equal(plane.listConfigurations(context())[0]?.state, "enabled_for_dry_run");
  });

  test("enforces payload, ledger, and configuration resource bounds", () => {
    const payloadPlane = fixedPlane();
    payloadPlane.execute(context(), registration());
    payloadPlane.execute(context(), enable());
    assert.throws(
      () =>
        payloadPlane.execute(
          context(),
          requestDelivery("too-large", "cfg-2", { title: "x".repeat(9_000) }),
        ),
      expectCode("RESOURCE_LIMIT"),
    );

    const ledgerPlane = fixedPlane({ maxReceipts: 1 });
    ledgerPlane.execute(context(), registration());
    assert.throws(
      () => ledgerPlane.execute(context(), enable()),
      expectCode("RESOURCE_LIMIT"),
    );

    const registryPlane = fixedPlane({ maxConfigurations: 1 });
    registryPlane.execute(context(), registration());
    assert.throws(
      () => registryPlane.execute(context(), registration("register-2", "second")),
      expectCode("RESOURCE_LIMIT"),
    );
  });

  test("keeps quotas tenant-scoped so one tenant cannot starve another", () => {
    const receiptPlane = fixedPlane({ maxReceipts: 1 });
    receiptPlane.execute(context("tenant-a"), registration("shared", "shared"));
    receiptPlane.execute(context("tenant-b"), registration("shared", "shared"));
    assert.equal(receiptPlane.listConfigurations(context("tenant-b")).length, 1);

    const configurationPlane = fixedPlane({ maxConfigurations: 1 });
    configurationPlane.execute(
      context("tenant-a"),
      registration("register-a", "integration-a"),
    );
    configurationPlane.execute(
      context("tenant-b"),
      registration("register-b", "integration-b"),
    );
    assert.equal(
      configurationPlane.listConfigurations(context("tenant-a"))[0]?.integrationId,
      "integration-a",
    );
    assert.equal(
      configurationPlane.listConfigurations(context("tenant-b"))[0]?.integrationId,
      "integration-b",
    );
  });

  test("never reuses configuration versions or accepts no-op state transitions", () => {
    const plane = fixedPlane();
    plane.execute(context(), registration());

    assert.throws(
      () =>
        plane.execute(context(), {
          schemaVersion: INTEGRATION_COMMAND_SCHEMA_VERSION,
          type: "disable_configuration",
          idempotencyKey: "disable-already-disabled",
          integrationId: "editorial-output",
          expectedConfigurationVersion: "cfg-1",
          nextConfigurationVersion: "cfg-unused",
        }),
      expectCode("INVALID_CONFIGURATION_STATE"),
    );

    plane.execute(context(), enable());
    plane.execute(context(), {
      schemaVersion: INTEGRATION_COMMAND_SCHEMA_VERSION,
      type: "disable_configuration",
      idempotencyKey: "disable-version-history",
      integrationId: "editorial-output",
      expectedConfigurationVersion: "cfg-2",
      nextConfigurationVersion: "cfg-3",
    });

    assert.throws(
      () => plane.execute(context(), enable("reuse-version", "cfg-3", "cfg-1")),
      expectCode("CONFIGURATION_VERSION_REUSED"),
    );
  });

  test("uses a replaceable in-memory ledger port without returning mutable storage", () => {
    const ledger = new InMemoryIntegrationLedger();
    const plane = fixedPlane({ ledger });
    plane.execute(context(), registration());

    const firstRead = ledger.getConfiguration("tenant-a", "editorial-output");
    assert.ok(firstRead);
    (firstRead.capabilities as string[]).push("content.write");

    const secondRead = ledger.getConfiguration("tenant-a", "editorial-output");
    assert.deepEqual(secondRead?.capabilities, ["message.submit", "status.receive"]);
    assert.equal(ledger.countConfigurations("tenant-a"), 1);
    assert.equal(ledger.countConfigurations("tenant-b"), 0);
  });

  test("provides stable machine codes plus plain-language recovery", () => {
    const plane = fixedPlane();
    let captured: unknown;
    try {
      plane.execute(context(), requestDelivery("missing"));
    } catch (error) {
      captured = error;
    }

    assert.ok(captured instanceof IntegrationControlError);
    assert.equal(captured.code, "NOT_FOUND");
    assert.match(captured.message, /not found/i);
    assert.match(captured.recovery, /verify/i);
  });

  test("rejects malformed, cyclic, and structurally excessive command input", () => {
    const plane = fixedPlane();
    assert.throws(
      () => plane.execute(context(), { ...registration(), unexpected: true }),
      expectCode("INVALID_COMMAND"),
    );

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    assert.throws(
      () => plane.execute(context(), cyclic),
      expectCode("INVALID_COMMAND"),
    );

    let deeplyNested: Record<string, unknown> = { value: "bounded" };
    for (let depth = 0; depth < 20; depth += 1) {
      deeplyNested = { child: deeplyNested };
    }
    assert.throws(
      () =>
        plane.execute(context(), {
          ...registration("deep-command"),
          configuration: deeplyNested,
        }),
      expectCode("RESOURCE_LIMIT"),
    );

    plane.execute(context(), registration());
    plane.execute(context(), enable());
    assert.throws(
      () =>
        plane.execute(
          context(),
          requestDelivery("deep", "cfg-2", {
            a: { b: { c: { d: { e: { f: { g: "too deep" } } } } } },
          }),
        ),
      expectCode("RESOURCE_LIMIT"),
    );
  });

  test("rejects secret-like material smuggled through identifiers or versions", () => {
    const plane = fixedPlane();
    assert.throws(
      () => plane.execute(context(), registration("sk-1234567890abcdef")),
      expectCode("UNSAFE_INPUT"),
    );
    assert.throws(
      () =>
        plane.execute(
          context(),
          registration("safe-key", "editorial-output", "https://internal.invalid"),
        ),
      expectCode("UNSAFE_INPUT"),
    );
  });
});
