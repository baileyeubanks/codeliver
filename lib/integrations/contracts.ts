export const INTEGRATION_COMMAND_SCHEMA_VERSION = "integration-command/v1" as const;
export const INTEGRATION_CONFIGURATION_SCHEMA_VERSION =
  "integration-configuration/v1" as const;
export const INTEGRATION_RECEIPT_SCHEMA_VERSION = "integration-receipt/v1" as const;

export const INTEGRATION_CAPABILITIES = [
  "content.read",
  "content.write",
  "event.publish",
  "message.submit",
  "status.receive",
] as const;

export type IntegrationCapability = (typeof INTEGRATION_CAPABILITIES)[number];

export type IntegrationPermission =
  | "integrations.inspect"
  | "integrations.configure"
  | "integrations.enable"
  | "integrations.preview"
  | "integrations.request_delivery"
  | "integrations.cancel";

export interface IntegrationExecutionContext {
  /** Selected by the request but verified against server-side membership. */
  tenantId: string;
  /** Derived from the authenticated server session, never from request JSON. */
  actorId: string;
  /** Derived from the actor's server-side tenant role. */
  permissions: ReadonlySet<IntegrationPermission>;
}

export interface RegisterConfigurationCommand {
  schemaVersion: typeof INTEGRATION_COMMAND_SCHEMA_VERSION;
  type: "register_configuration";
  idempotencyKey: string;
  integrationId: string;
  configuration: {
    schemaVersion: typeof INTEGRATION_CONFIGURATION_SCHEMA_VERSION;
    configurationVersion: string;
    capabilities: IntegrationCapability[];
    payloadSchemaBindings: Partial<Record<IntegrationCapability, string>>;
    initialState: "disabled";
  };
}

interface ConfigurationTransitionCommandBase {
  schemaVersion: typeof INTEGRATION_COMMAND_SCHEMA_VERSION;
  idempotencyKey: string;
  integrationId: string;
  expectedConfigurationVersion: string;
  nextConfigurationVersion: string;
}

export interface EnableConfigurationCommand extends ConfigurationTransitionCommandBase {
  type: "enable_configuration";
}

export interface DisableConfigurationCommand extends ConfigurationTransitionCommandBase {
  type: "disable_configuration";
}

export type ConfigurationTransitionCommand =
  | EnableConfigurationCommand
  | DisableConfigurationCommand;

interface DeliveryIntentCommandBase {
  schemaVersion: typeof INTEGRATION_COMMAND_SCHEMA_VERSION;
  idempotencyKey: string;
  integrationId: string;
  expectedConfigurationVersion: string;
  capability: IntegrationCapability;
  payloadSchemaVersion: string;
  payload: Record<string, unknown>;
}

export interface PreviewDeliveryCommand extends DeliveryIntentCommandBase {
  type: "preview_delivery";
}

export interface RequestDeliveryCommand extends DeliveryIntentCommandBase {
  type: "request_delivery";
}

export type DeliveryIntentCommand = PreviewDeliveryCommand | RequestDeliveryCommand;

interface IntentTransitionCommandBase {
  schemaVersion: typeof INTEGRATION_COMMAND_SCHEMA_VERSION;
  idempotencyKey: string;
  integrationId: string;
  targetReceiptId: string;
}

export interface CancelIntentCommand extends IntentTransitionCommandBase {
  type: "cancel_intent";
}

export interface RestoreIntentCommand extends IntentTransitionCommandBase {
  type: "restore_intent";
}

export type IntentTransitionCommand = CancelIntentCommand | RestoreIntentCommand;

export type IntegrationCommand =
  | RegisterConfigurationCommand
  | ConfigurationTransitionCommand
  | DeliveryIntentCommand
  | IntentTransitionCommand;

export type IntegrationReceiptStatus =
  | "configuration_registered_disabled"
  | "configuration_enabled_for_dry_run"
  | "configuration_disabled"
  | "preview_recorded"
  | "delivery_intent_recorded_not_delivered"
  | "intent_canceled"
  | "intent_restored";

export interface IntegrationReceipt {
  schemaVersion: typeof INTEGRATION_RECEIPT_SCHEMA_VERSION;
  receiptId: string;
  tenantId: string;
  actorRef: string;
  integrationId: string;
  commandType: IntegrationCommand["type"];
  idempotencyKey: string;
  commandFingerprint: string;
  configurationVersion: string | null;
  status: IntegrationReceiptStatus;
  deliveryAttempted: false;
  occurredAt: string;
  targetReceiptId?: string;
  payloadDigest?: string;
}

export interface IntegrationCommandResult {
  receipt: IntegrationReceipt;
  replayed: boolean;
  message: string;
}

export interface IntegrationConfigurationView {
  integrationId: string;
  schemaVersion: typeof INTEGRATION_CONFIGURATION_SCHEMA_VERSION;
  configurationVersion: string;
  capabilities: IntegrationCapability[];
  payloadSchemaBindings: Partial<Record<IntegrationCapability, string>>;
  state: "enabled_for_dry_run" | "disabled";
  liveDeliveryAvailable: false;
}

export interface SafeIntegrationAuditEvent {
  event: "integration_command_receipted";
  receiptId: string;
  tenantRef: string;
  actorRef: string;
  integrationRef: string;
  commandType: IntegrationCommand["type"];
  status: IntegrationReceiptStatus;
  configurationVersion: string | null;
  deliveryAttempted: false;
}
