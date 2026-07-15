import type {
  IntegrationCapability,
  IntegrationReceipt,
} from "./contracts";

export interface StoredIntegrationConfiguration {
  tenantId: string;
  integrationId: string;
  configurationVersion: string;
  usedConfigurationVersions: readonly string[];
  capabilities: readonly IntegrationCapability[];
  payloadSchemaBindings: Readonly<
    Partial<Record<IntegrationCapability, string>>
  >;
  enabled: boolean;
}

export type StoredIntentState = "recorded_not_delivered" | "canceled";

export interface StoredIdempotencyReceipt {
  fingerprint: string;
  receipt: IntegrationReceipt;
}

/**
 * Provider-neutral persistence boundary for the control plane.
 *
 * Implementations must scope every lookup and quota to a tenant. A durable
 * implementation must additionally make receipt append + idempotency claim
 * atomic; this first in-memory adapter is synchronous and intended only for
 * bounded proof and local development.
 */
export interface IntegrationLedgerPort {
  countConfigurations(tenantId: string): number;
  getConfiguration(
    tenantId: string,
    integrationId: string,
  ): StoredIntegrationConfiguration | undefined;
  putConfiguration(configuration: StoredIntegrationConfiguration): void;

  countReceipts(tenantId: string): number;
  getReceiptByIdempotency(
    tenantId: string,
    idempotencyKey: string,
  ): StoredIdempotencyReceipt | undefined;
  getReceiptById(
    tenantId: string,
    receiptId: string,
  ): IntegrationReceipt | undefined;
  putReceipt(
    tenantId: string,
    idempotencyKey: string,
    value: StoredIdempotencyReceipt,
  ): void;

  getIntentState(
    tenantId: string,
    receiptId: string,
  ): StoredIntentState | undefined;
  putIntentState(
    tenantId: string,
    receiptId: string,
    state: StoredIntentState,
  ): void;

  listConfigurations(tenantId: string): StoredIntegrationConfiguration[];
}

function scopedKey(tenantId: string, value: string): string {
  return JSON.stringify([tenantId, value]);
}

function cloneConfiguration(
  value: StoredIntegrationConfiguration,
): StoredIntegrationConfiguration {
  return {
    ...value,
    usedConfigurationVersions: [...value.usedConfigurationVersions],
    capabilities: [...value.capabilities],
    payloadSchemaBindings: { ...value.payloadSchemaBindings },
  };
}

export class InMemoryIntegrationLedger implements IntegrationLedgerPort {
  private readonly configurations = new Map<
    string,
    StoredIntegrationConfiguration
  >();
  private readonly receiptsByIdempotency = new Map<
    string,
    StoredIdempotencyReceipt
  >();
  private readonly receiptsById = new Map<string, IntegrationReceipt>();
  private readonly intentStates = new Map<string, StoredIntentState>();

  countConfigurations(tenantId: string): number {
    let count = 0;
    for (const configuration of this.configurations.values()) {
      if (configuration.tenantId === tenantId) count += 1;
    }
    return count;
  }

  getConfiguration(
    tenantId: string,
    integrationId: string,
  ): StoredIntegrationConfiguration | undefined {
    const value = this.configurations.get(scopedKey(tenantId, integrationId));
    return value ? cloneConfiguration(value) : undefined;
  }

  putConfiguration(configuration: StoredIntegrationConfiguration): void {
    this.configurations.set(
      scopedKey(configuration.tenantId, configuration.integrationId),
      cloneConfiguration(configuration),
    );
  }

  countReceipts(tenantId: string): number {
    let count = 0;
    for (const value of this.receiptsByIdempotency.values()) {
      if (value.receipt.tenantId === tenantId) count += 1;
    }
    return count;
  }

  getReceiptByIdempotency(
    tenantId: string,
    idempotencyKey: string,
  ): StoredIdempotencyReceipt | undefined {
    return this.receiptsByIdempotency.get(scopedKey(tenantId, idempotencyKey));
  }

  getReceiptById(
    tenantId: string,
    receiptId: string,
  ): IntegrationReceipt | undefined {
    return this.receiptsById.get(scopedKey(tenantId, receiptId));
  }

  putReceipt(
    tenantId: string,
    idempotencyKey: string,
    value: StoredIdempotencyReceipt,
  ): void {
    this.receiptsByIdempotency.set(
      scopedKey(tenantId, idempotencyKey),
      value,
    );
    this.receiptsById.set(
      scopedKey(tenantId, value.receipt.receiptId),
      value.receipt,
    );
  }

  getIntentState(
    tenantId: string,
    receiptId: string,
  ): StoredIntentState | undefined {
    return this.intentStates.get(scopedKey(tenantId, receiptId));
  }

  putIntentState(
    tenantId: string,
    receiptId: string,
    state: StoredIntentState,
  ): void {
    this.intentStates.set(scopedKey(tenantId, receiptId), state);
  }

  listConfigurations(tenantId: string): StoredIntegrationConfiguration[] {
    return [...this.configurations.values()]
      .filter((configuration) => configuration.tenantId === tenantId)
      .map(cloneConfiguration);
  }
}
