import { createHash } from "node:crypto";

import {
  INTEGRATION_CAPABILITIES,
  INTEGRATION_COMMAND_SCHEMA_VERSION,
  INTEGRATION_CONFIGURATION_SCHEMA_VERSION,
  INTEGRATION_RECEIPT_SCHEMA_VERSION,
  type ConfigurationTransitionCommand,
  type DeliveryIntentCommand,
  type IntegrationCapability,
  type IntegrationCommand,
  type IntegrationCommandResult,
  type IntegrationConfigurationView,
  type IntegrationExecutionContext,
  type IntegrationPermission,
  type IntegrationReceipt,
  type IntegrationReceiptStatus,
  type IntentTransitionCommand,
  type RegisterConfigurationCommand,
  type SafeIntegrationAuditEvent,
} from "./contracts";
import {
  InMemoryIntegrationLedger,
  type IntegrationLedgerPort,
  type StoredIntegrationConfiguration,
  type StoredIntentState,
} from "./ledger";

const MAX_COMMAND_BYTES = 16_384;
const MAX_COMMAND_DEPTH = 12;
const MAX_COMMAND_NODES = 512;
const MAX_PAYLOAD_BYTES = 8_192;
const MAX_PAYLOAD_DEPTH = 6;
const MAX_PAYLOAD_NODES = 256;
const MAX_ARRAY_ITEMS = 50;
const MAX_STRING_LENGTH = 2_048;
const MAX_CONFIGURATIONS = 500;
const MAX_RECEIPTS = 5_000;

const CAPABILITY_SET = new Set<string>(INTEGRATION_CAPABILITIES);
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;
const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,63}$/;
const FORBIDDEN_FIELD_WORDS = new Set([
  "accesskey",
  "address",
  "apikey",
  "authorization",
  "callback",
  "callbackurl",
  "cookie",
  "credential",
  "endpoint",
  "host",
  "hostname",
  "ip",
  "password",
  "passwd",
  "privatekey",
  "secret",
  "setcookie",
  "token",
  "uri",
  "url",
  "webhook",
]);
const FORBIDDEN_FIELD_FRAGMENTS = [
  "accesskey",
  "apikey",
  "authorization",
  "callback",
  "cookie",
  "credential",
  "endpoint",
  "hostname",
  "password",
  "passwd",
  "privatekey",
  "secret",
  "setcookie",
  "token",
  "webhook",
] as const;

export type IntegrationControlErrorCode =
  | "INVALID_CONTEXT"
  | "INVALID_COMMAND"
  | "UNSUPPORTED_SCHEMA_VERSION"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "ALREADY_EXISTS"
  | "CONFIGURATION_VERSION_REUSED"
  | "CONFIGURATION_DISABLED"
  | "INVALID_CONFIGURATION_STATE"
  | "STALE_CONFIGURATION"
  | "CAPABILITY_NOT_CONFIGURED"
  | "PAYLOAD_SCHEMA_MISMATCH"
  | "UNSAFE_INPUT"
  | "RESOURCE_LIMIT"
  | "IDEMPOTENCY_KEY_REUSED"
  | "INVALID_INTENT_STATE";

export class IntegrationControlError extends Error {
  constructor(
    public readonly code: IntegrationControlErrorCode,
    public readonly status: number,
    message: string,
    public readonly recovery: string,
  ) {
    super(message);
    this.name = "IntegrationControlError";
  }
}

export interface IntegrationControlPlaneOptions {
  now?: () => Date;
  maxConfigurations?: number;
  maxReceipts?: number;
  ledger?: IntegrationLedgerPort;
}

const ERROR_RECOVERY: Record<IntegrationControlErrorCode, string> = {
  INVALID_CONTEXT: "Refresh your tenant session and try again.",
  INVALID_COMMAND: "Correct the command fields and submit a new idempotency key.",
  UNSUPPORTED_SCHEMA_VERSION: "Use a schema version supported by this control plane.",
  FORBIDDEN: "Ask a tenant administrator for the required permission.",
  NOT_FOUND: "Verify the tenant, integration, and receipt identifiers.",
  ALREADY_EXISTS: "Inspect the existing configuration before changing it.",
  CONFIGURATION_VERSION_REUSED: "Choose a configuration version that has never been used.",
  CONFIGURATION_DISABLED: "Enable dry-run planning with a new configuration version first.",
  INVALID_CONFIGURATION_STATE: "Refresh the configuration and request a real state change.",
  STALE_CONFIGURATION: "Refresh the configuration and bind the current version.",
  CAPABILITY_NOT_CONFIGURED: "Choose a capability declared by the bound configuration.",
  PAYLOAD_SCHEMA_MISMATCH: "Use the payload schema bound to the current configuration.",
  UNSAFE_INPUT: "Remove connection details or secret-like material from the payload.",
  RESOURCE_LIMIT: "Reduce the request size or retry after tenant capacity is available.",
  IDEMPOTENCY_KEY_REUSED: "Retry with a new idempotency key for the changed command.",
  INVALID_INTENT_STATE: "Refresh the receipt state before requesting another transition.",
};

function fail(
  code: IntegrationControlErrorCode,
  status: number,
  message: string,
): never {
  throw new IntegrationControlError(code, status, message, ERROR_RECOVERY[code]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
) {
  const allowedSet = new Set(allowed);
  const unexpected = Object.keys(value).find((key) => !allowedSet.has(key));
  if (unexpected) {
    fail("INVALID_COMMAND", 400, `${label} contains an unsupported field.`);
  }
}

function requireString(
  value: unknown,
  label: string,
  pattern: RegExp = SAFE_IDENTIFIER,
): string {
  if (typeof value !== "string" || !pattern.test(value)) {
    fail("INVALID_COMMAND", 400, `${label} is invalid.`);
  }
  if (containsUnsafeString(value)) {
    fail("UNSAFE_INPUT", 400, `${label} contains unsafe connection or secret material.`);
  }
  return value;
}

function requireVersion(value: unknown, label: string): string {
  return requireString(value, label, SAFE_VERSION);
}

function requireSchemaVersion(value: unknown) {
  if (value !== INTEGRATION_COMMAND_SCHEMA_VERSION) {
    fail(
      "UNSUPPORTED_SCHEMA_VERSION",
      409,
      "The command schema version is not supported.",
    );
  }
}

function canonicalize(
  value: unknown,
  ancestors = new Set<object>(),
  depth = 0,
  nodes = { count: 0 },
): string {
  nodes.count += 1;
  if (nodes.count > MAX_COMMAND_NODES || depth > MAX_COMMAND_DEPTH) {
    fail("RESOURCE_LIMIT", 413, "The command is more complex than the safe limit.");
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      fail("INVALID_COMMAND", 400, "The command must not contain cycles.");
    }
    const nextAncestors = new Set(ancestors).add(value);
    return `[${value
      .map((item) => canonicalize(item, nextAncestors, depth + 1, nodes))
      .join(",")}]`;
  }
  if (isRecord(value)) {
    if (ancestors.has(value)) {
      fail("INVALID_COMMAND", 400, "The command must not contain cycles.");
    }
    const nextAncestors = new Set(ancestors).add(value);
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalize(
            value[key],
            nextAncestors,
            depth + 1,
            nodes,
          )}`,
      )
      .join(",")}}`;
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    fail("INVALID_COMMAND", 400, "The command contains an unsupported value.");
  }
  return serialized;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function shortDigest(value: string): string {
  return digest(value).slice(0, 24);
}

function normalizedFieldPart(key: string): string {
  return key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function containsForbiddenFieldPart(key: string): boolean {
  const normalized = normalizedFieldPart(key);
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .map((word) => word.toLowerCase())
    .filter(Boolean);
  return (
    words.some((word) => FORBIDDEN_FIELD_WORDS.has(word)) ||
    FORBIDDEN_FIELD_FRAGMENTS.some((part) => normalized.includes(part))
  );
}

function containsUnsafeString(value: string): boolean {
  return (
    /(?:^|\s)Bearer\s+[A-Za-z0-9._~+/-]+=*/i.test(value) ||
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(value) ||
    /(?:https?|file|ftp):\/\//i.test(value) ||
    /(?:^|[\s/])(?:localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|169\.254\.169\.254|::1)(?:[\s/:]|$)/i.test(
      value,
    ) ||
    /(?:^|[^A-Za-z0-9])(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{12,}|AKIA[A-Z0-9]{12,})(?:$|[^A-Za-z0-9])/i.test(
      value,
    )
  );
}

function assertPayloadSafe(payload: unknown) {
  const serialized = canonicalize(payload);
  if (Buffer.byteLength(serialized, "utf8") > MAX_PAYLOAD_BYTES) {
    fail("RESOURCE_LIMIT", 413, "The payload is larger than the safe limit.");
  }

  let nodes = 0;
  const visit = (value: unknown, depth: number) => {
    nodes += 1;
    if (nodes > MAX_PAYLOAD_NODES || depth > MAX_PAYLOAD_DEPTH) {
      fail("RESOURCE_LIMIT", 413, "The payload is more complex than the safe limit.");
    }

    if (typeof value === "string") {
      if (value.length > MAX_STRING_LENGTH) {
        fail("RESOURCE_LIMIT", 413, "A payload value is larger than the safe limit.");
      }
      if (containsUnsafeString(value)) {
        fail("UNSAFE_INPUT", 400, "The payload contains unsafe connection or secret material.");
      }
      return;
    }

    if (
      value === null ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value))
    ) {
      return;
    }

    if (Array.isArray(value)) {
      if (value.length > MAX_ARRAY_ITEMS) {
        fail("RESOURCE_LIMIT", 413, "A payload list is larger than the safe limit.");
      }
      value.forEach((item) => visit(item, depth + 1));
      return;
    }

    if (isRecord(value)) {
      for (const [key, child] of Object.entries(value)) {
        if (!SAFE_IDENTIFIER.test(key) || containsForbiddenFieldPart(key)) {
          fail("UNSAFE_INPUT", 400, "The payload contains a restricted field.");
        }
        visit(child, depth + 1);
      }
      return;
    }

    fail("INVALID_COMMAND", 400, "The payload contains an unsupported value.");
  };

  if (!isRecord(payload)) {
    fail("INVALID_COMMAND", 400, "payload must be an object.");
  }
  visit(payload, 0);
}

function parseCapabilities(value: unknown): IntegrationCapability[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 16) {
    fail("INVALID_COMMAND", 400, "capabilities must be a bounded non-empty list.");
  }
  const result: IntegrationCapability[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !CAPABILITY_SET.has(item)) {
      fail("INVALID_COMMAND", 400, "A capability is not supported.");
    }
    result.push(item as IntegrationCapability);
  }
  if (new Set(result).size !== result.length) {
    fail("INVALID_COMMAND", 400, "capabilities must not contain duplicates.");
  }
  return [...result].sort();
}

function parsePayloadBindings(
  value: unknown,
  capabilities: IntegrationCapability[],
): Partial<Record<IntegrationCapability, string>> {
  if (!isRecord(value)) {
    fail("INVALID_COMMAND", 400, "payloadSchemaBindings must be an object.");
  }
  assertExactKeys(value, capabilities, "payloadSchemaBindings");
  const bindings: Partial<Record<IntegrationCapability, string>> = {};
  for (const capability of capabilities) {
    bindings[capability] = requireVersion(
      value[capability],
      `payloadSchemaBindings.${capability}`,
    );
  }
  return bindings;
}

function parseCommand(input: unknown): IntegrationCommand {
  if (!isRecord(input)) {
    fail("INVALID_COMMAND", 400, "The command must be an object.");
  }
  if (Buffer.byteLength(canonicalize(input), "utf8") > MAX_COMMAND_BYTES) {
    fail("RESOURCE_LIMIT", 413, "The command is larger than the safe limit.");
  }

  requireSchemaVersion(input.schemaVersion);
  const type = input.type;
  const idempotencyKey = requireString(input.idempotencyKey, "idempotencyKey");
  const integrationId = requireString(input.integrationId, "integrationId");

  if (type === "register_configuration") {
    assertExactKeys(
      input,
      ["schemaVersion", "type", "idempotencyKey", "integrationId", "configuration"],
      "command",
    );
    if (!isRecord(input.configuration)) {
      fail("INVALID_COMMAND", 400, "configuration must be an object.");
    }
    assertExactKeys(
      input.configuration,
      [
        "schemaVersion",
        "configurationVersion",
        "capabilities",
        "payloadSchemaBindings",
        "initialState",
      ],
      "configuration",
    );
    if (input.configuration.schemaVersion !== INTEGRATION_CONFIGURATION_SCHEMA_VERSION) {
      fail(
        "UNSUPPORTED_SCHEMA_VERSION",
        409,
        "The configuration schema version is not supported.",
      );
    }
    if (input.configuration.initialState !== "disabled") {
      fail("INVALID_COMMAND", 400, "New configurations must start disabled.");
    }
    const capabilities = parseCapabilities(input.configuration.capabilities);
    return {
      schemaVersion: INTEGRATION_COMMAND_SCHEMA_VERSION,
      type,
      idempotencyKey,
      integrationId,
      configuration: {
        schemaVersion: INTEGRATION_CONFIGURATION_SCHEMA_VERSION,
        configurationVersion: requireVersion(
          input.configuration.configurationVersion,
          "configurationVersion",
        ),
        capabilities,
        payloadSchemaBindings: parsePayloadBindings(
          input.configuration.payloadSchemaBindings,
          capabilities,
        ),
        initialState: "disabled",
      },
    } satisfies RegisterConfigurationCommand;
  }

  if (type === "enable_configuration" || type === "disable_configuration") {
    assertExactKeys(
      input,
      [
        "schemaVersion",
        "type",
        "idempotencyKey",
        "integrationId",
        "expectedConfigurationVersion",
        "nextConfigurationVersion",
      ],
      "command",
    );
    const expectedConfigurationVersion = requireVersion(
      input.expectedConfigurationVersion,
      "expectedConfigurationVersion",
    );
    const nextConfigurationVersion = requireVersion(
      input.nextConfigurationVersion,
      "nextConfigurationVersion",
    );
    if (expectedConfigurationVersion === nextConfigurationVersion) {
      fail("INVALID_COMMAND", 400, "A configuration transition requires a new version.");
    }
    return {
      schemaVersion: INTEGRATION_COMMAND_SCHEMA_VERSION,
      type,
      idempotencyKey,
      integrationId,
      expectedConfigurationVersion,
      nextConfigurationVersion,
    } satisfies ConfigurationTransitionCommand;
  }

  if (type === "preview_delivery" || type === "request_delivery") {
    assertExactKeys(
      input,
      [
        "schemaVersion",
        "type",
        "idempotencyKey",
        "integrationId",
        "expectedConfigurationVersion",
        "capability",
        "payloadSchemaVersion",
        "payload",
      ],
      "command",
    );
    if (typeof input.capability !== "string" || !CAPABILITY_SET.has(input.capability)) {
      fail("INVALID_COMMAND", 400, "The capability is not supported.");
    }
    assertPayloadSafe(input.payload);
    return {
      schemaVersion: INTEGRATION_COMMAND_SCHEMA_VERSION,
      type,
      idempotencyKey,
      integrationId,
      expectedConfigurationVersion: requireVersion(
        input.expectedConfigurationVersion,
        "expectedConfigurationVersion",
      ),
      capability: input.capability as IntegrationCapability,
      payloadSchemaVersion: requireVersion(input.payloadSchemaVersion, "payloadSchemaVersion"),
      payload: input.payload as Record<string, unknown>,
    } satisfies DeliveryIntentCommand;
  }

  if (type === "cancel_intent" || type === "restore_intent") {
    assertExactKeys(
      input,
      ["schemaVersion", "type", "idempotencyKey", "integrationId", "targetReceiptId"],
      "command",
    );
    return {
      schemaVersion: INTEGRATION_COMMAND_SCHEMA_VERSION,
      type,
      idempotencyKey,
      integrationId,
      targetReceiptId: requireString(input.targetReceiptId, "targetReceiptId"),
    } satisfies IntentTransitionCommand;
  }

  fail("INVALID_COMMAND", 400, "The command type is not supported.");
}

function requiredPermission(command: IntegrationCommand): IntegrationPermission {
  switch (command.type) {
    case "register_configuration":
    case "disable_configuration":
      return "integrations.configure";
    case "enable_configuration":
      return "integrations.enable";
    case "preview_delivery":
      return "integrations.preview";
    case "request_delivery":
      return "integrations.request_delivery";
    case "cancel_intent":
    case "restore_intent":
      return "integrations.cancel";
  }
}

function assertContext(context: IntegrationExecutionContext) {
  if (
    !SAFE_IDENTIFIER.test(context.tenantId) ||
    !SAFE_IDENTIFIER.test(context.actorId) ||
    !(context.permissions instanceof Set)
  ) {
    fail("INVALID_CONTEXT", 400, "The server execution context is invalid.");
  }
}

export class IntegrationControlPlane {
  private readonly now: () => Date;
  private readonly maxConfigurations: number;
  private readonly maxReceipts: number;
  private readonly ledger: IntegrationLedgerPort;

  constructor(options: IntegrationControlPlaneOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.maxConfigurations = options.maxConfigurations ?? MAX_CONFIGURATIONS;
    this.maxReceipts = options.maxReceipts ?? MAX_RECEIPTS;
    this.ledger = options.ledger ?? new InMemoryIntegrationLedger();
  }

  execute(context: IntegrationExecutionContext, input: unknown): IntegrationCommandResult {
    assertContext(context);
    const command = parseCommand(input);
    const permission = requiredPermission(command);
    if (!context.permissions.has(permission)) {
      fail("FORBIDDEN", 403, "You do not have permission for this integration command.");
    }

    const fingerprint = digest(canonicalize(command));
    const prior = this.ledger.getReceiptByIdempotency(
      context.tenantId,
      command.idempotencyKey,
    );
    if (prior) {
      if (prior.fingerprint !== fingerprint) {
        fail(
          "IDEMPOTENCY_KEY_REUSED",
          409,
          "The idempotency key was already used for a different command.",
        );
      }
      return {
        receipt: prior.receipt,
        replayed: true,
        message: "The original receipt was returned; no action was repeated.",
      };
    }
    if (this.ledger.countReceipts(context.tenantId) >= this.maxReceipts) {
      fail("RESOURCE_LIMIT", 503, "The command ledger is at its safe capacity.");
    }

    const receipt = this.applyCommand(context, command, fingerprint);
    this.ledger.putReceipt(context.tenantId, command.idempotencyKey, {
      fingerprint,
      receipt,
    });
    return {
      receipt,
      replayed: false,
      message: "The command was recorded. No external delivery was attempted.",
    };
  }

  listConfigurations(context: IntegrationExecutionContext): IntegrationConfigurationView[] {
    assertContext(context);
    if (!context.permissions.has("integrations.inspect")) {
      fail("FORBIDDEN", 403, "You do not have permission to inspect integrations.");
    }
    return this.ledger
      .listConfigurations(context.tenantId)
      .map((configuration) => this.toView(configuration))
      .sort((left, right) => left.integrationId.localeCompare(right.integrationId));
  }

  toSafeAuditEvent(receipt: IntegrationReceipt): SafeIntegrationAuditEvent {
    return {
      event: "integration_command_receipted",
      receiptId: receipt.receiptId,
      tenantRef: `tenant_${shortDigest(receipt.tenantId)}`,
      actorRef: receipt.actorRef,
      integrationRef: `integration_${shortDigest(receipt.integrationId)}`,
      commandType: receipt.commandType,
      status: receipt.status,
      configurationVersion: receipt.configurationVersion,
      deliveryAttempted: false,
      externalEffect: "none",
      compensationStatus: "not_required_no_external_effect",
    };
  }

  private applyCommand(
    context: IntegrationExecutionContext,
    command: IntegrationCommand,
    fingerprint: string,
  ): IntegrationReceipt {
    if (command.type === "register_configuration") {
      return this.register(context, command, fingerprint);
    }
    if (command.type === "enable_configuration" || command.type === "disable_configuration") {
      return this.transitionConfiguration(context, command, fingerprint);
    }
    if (command.type === "preview_delivery" || command.type === "request_delivery") {
      return this.recordIntent(context, command, fingerprint);
    }
    if (command.type === "cancel_intent" || command.type === "restore_intent") {
      return this.transitionIntent(context, command, fingerprint);
    }
    const unreachable: never = command;
    return unreachable;
  }

  private register(
    context: IntegrationExecutionContext,
    command: RegisterConfigurationCommand,
    fingerprint: string,
  ) {
    if (this.ledger.getConfiguration(context.tenantId, command.integrationId)) {
      fail("ALREADY_EXISTS", 409, "The integration configuration already exists.");
    }
    if (this.ledger.countConfigurations(context.tenantId) >= this.maxConfigurations) {
      fail("RESOURCE_LIMIT", 503, "The configuration registry is at its safe capacity.");
    }
    this.ledger.putConfiguration({
      tenantId: context.tenantId,
      integrationId: command.integrationId,
      configurationVersion: command.configuration.configurationVersion,
      usedConfigurationVersions: [command.configuration.configurationVersion],
      capabilities: [...command.configuration.capabilities],
      payloadSchemaBindings: { ...command.configuration.payloadSchemaBindings },
      enabled: false,
    });
    return this.createReceipt(
      context,
      command,
      fingerprint,
      "configuration_registered_disabled",
      command.configuration.configurationVersion,
    );
  }

  private transitionConfiguration(
    context: IntegrationExecutionContext,
    command: ConfigurationTransitionCommand,
    fingerprint: string,
  ) {
    const configuration = this.requireConfiguration(context.tenantId, command.integrationId);
    this.assertCurrentVersion(configuration, command.expectedConfigurationVersion);
    if (configuration.usedConfigurationVersions.includes(command.nextConfigurationVersion)) {
      fail(
        "CONFIGURATION_VERSION_REUSED",
        409,
        "The next configuration version was already used.",
      );
    }
    const nextEnabled = command.type === "enable_configuration";
    if (configuration.enabled === nextEnabled) {
      fail(
        "INVALID_CONFIGURATION_STATE",
        409,
        "The configuration is already in the requested state.",
      );
    }
    const nextConfiguration: StoredIntegrationConfiguration = {
      ...configuration,
      configurationVersion: command.nextConfigurationVersion,
      usedConfigurationVersions: [
        ...configuration.usedConfigurationVersions,
        command.nextConfigurationVersion,
      ],
      enabled: nextEnabled,
    };
    this.ledger.putConfiguration(nextConfiguration);
    return this.createReceipt(
      context,
      command,
      fingerprint,
      command.type === "enable_configuration"
        ? "configuration_enabled_for_dry_run"
        : "configuration_disabled",
      nextConfiguration.configurationVersion,
    );
  }

  private recordIntent(
    context: IntegrationExecutionContext,
    command: DeliveryIntentCommand,
    fingerprint: string,
  ) {
    const configuration = this.requireConfiguration(context.tenantId, command.integrationId);
    this.assertCurrentVersion(configuration, command.expectedConfigurationVersion);
    if (!configuration.capabilities.includes(command.capability)) {
      fail("CAPABILITY_NOT_CONFIGURED", 409, "The capability is not configured.");
    }
    if (configuration.payloadSchemaBindings[command.capability] !== command.payloadSchemaVersion) {
      fail("PAYLOAD_SCHEMA_MISMATCH", 409, "The payload schema version is not configured.");
    }
    if (command.type === "request_delivery" && !configuration.enabled) {
      fail("CONFIGURATION_DISABLED", 409, "The integration configuration is disabled.");
    }

    const status: IntegrationReceiptStatus =
      command.type === "preview_delivery"
        ? "preview_recorded"
        : "delivery_intent_recorded_not_delivered";
    const receipt = this.createReceipt(
      context,
      command,
      fingerprint,
      status,
      configuration.configurationVersion,
      { payloadDigest: digest(canonicalize(command.payload)) },
    );
    if (command.type === "request_delivery") {
      this.ledger.putIntentState(
        context.tenantId,
        receipt.receiptId,
        "recorded_not_delivered",
      );
    }
    return receipt;
  }

  private transitionIntent(
    context: IntegrationExecutionContext,
    command: IntentTransitionCommand,
    fingerprint: string,
  ) {
    const target = this.ledger.getReceiptById(
      context.tenantId,
      command.targetReceiptId,
    );
    if (
      !target ||
      target.tenantId !== context.tenantId ||
      target.integrationId !== command.integrationId ||
      target.status !== "delivery_intent_recorded_not_delivered"
    ) {
      fail("NOT_FOUND", 404, "The delivery intent was not found.");
    }
    const currentState = this.ledger.getIntentState(
      context.tenantId,
      command.targetReceiptId,
    );
    const expectedState: StoredIntentState =
      command.type === "cancel_intent" ? "recorded_not_delivered" : "canceled";
    if (currentState !== expectedState) {
      fail("INVALID_INTENT_STATE", 409, "The delivery intent is not in the required state.");
    }
    this.ledger.putIntentState(
      context.tenantId,
      command.targetReceiptId,
      command.type === "cancel_intent" ? "canceled" : "recorded_not_delivered",
    );
    return this.createReceipt(
      context,
      command,
      fingerprint,
      command.type === "cancel_intent" ? "intent_canceled" : "intent_restored",
      target.configurationVersion,
      { targetReceiptId: command.targetReceiptId },
    );
  }

  private requireConfiguration(tenantId: string, integrationId: string) {
    const configuration = this.ledger.getConfiguration(tenantId, integrationId);
    if (!configuration) {
      fail("NOT_FOUND", 404, "The integration configuration was not found.");
    }
    return configuration;
  }

  private assertCurrentVersion(
    configuration: StoredIntegrationConfiguration,
    expectedVersion: string,
  ) {
    if (configuration.configurationVersion !== expectedVersion) {
      fail("STALE_CONFIGURATION", 409, "The configuration version is stale.");
    }
  }

  private createReceipt(
    context: IntegrationExecutionContext,
    command: IntegrationCommand,
    fingerprint: string,
    status: IntegrationReceiptStatus,
    configurationVersion: string | null,
    extra: Pick<IntegrationReceipt, "targetReceiptId" | "payloadDigest"> = {},
  ): IntegrationReceipt {
    return Object.freeze({
      schemaVersion: INTEGRATION_RECEIPT_SCHEMA_VERSION,
      receiptId: `ir_${shortDigest(
        canonicalize([context.tenantId, command.idempotencyKey, fingerprint]),
      )}`,
      tenantId: context.tenantId,
      actorRef: `actor_${shortDigest(context.actorId)}`,
      integrationId: command.integrationId,
      commandType: command.type,
      idempotencyKey: command.idempotencyKey,
      commandFingerprint: fingerprint,
      configurationVersion,
      status,
      deliveryAttempted: false,
      externalEffect: "none",
      compensationStatus: "not_required_no_external_effect",
      reversibleBy: this.reversalFor(command.type),
      occurredAt: this.now().toISOString(),
      ...extra,
    });
  }

  private toView(
    configuration: StoredIntegrationConfiguration,
  ): IntegrationConfigurationView {
    return {
      integrationId: configuration.integrationId,
      schemaVersion: INTEGRATION_CONFIGURATION_SCHEMA_VERSION,
      configurationVersion: configuration.configurationVersion,
      capabilities: [...configuration.capabilities],
      payloadSchemaBindings: { ...configuration.payloadSchemaBindings },
      state: configuration.enabled ? "enabled_for_dry_run" : "disabled",
      liveDeliveryAvailable: false,
    };
  }

  private reversalFor(
    commandType: IntegrationCommand["type"],
  ): IntegrationReceipt["reversibleBy"] {
    switch (commandType) {
      case "enable_configuration":
        return "disable_configuration";
      case "disable_configuration":
        return "enable_configuration";
      case "request_delivery":
      case "restore_intent":
        return "cancel_intent";
      case "cancel_intent":
        return "restore_intent";
      case "register_configuration":
      case "preview_delivery":
        return null;
    }
  }
}
