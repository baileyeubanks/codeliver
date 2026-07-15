import {
  OPERATIONS_LIMITS,
  OperationsError,
  digest,
  type OperationReceipt,
  type OperationsEnvelope,
} from "./contracts";

interface LedgerEntry<T> {
  requestDigest: string;
  value: T;
}

export class OperationsIdempotencyLedger {
  private readonly entries = new Map<string, LedgerEntry<unknown>>();

  run<T>(
    operation: string,
    envelope: OperationsEnvelope,
    request: unknown,
    produce: (requestDigest: string) => T,
  ): T {
    const requestDigest = digest(request);
    const ledgerKey = `${envelope.tenantId}:${operation}:${envelope.idempotencyKey}`;
    const existing = this.entries.get(ledgerKey) as LedgerEntry<T> | undefined;
    if (existing) {
      if (existing.requestDigest !== requestDigest) {
        throw new OperationsError(
          "IDEMPOTENCY_COLLISION",
          "The idempotency key was already used for a different request.",
          409,
        );
      }

      const value = structuredClone(existing.value);
      const candidate = value as { receipt?: OperationReceipt };
      if (candidate.receipt) candidate.receipt.replayed = true;
      return value;
    }

    if (this.entries.size >= OPERATIONS_LIMITS.maximumLedgerEntries) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (oldestKey) this.entries.delete(oldestKey);
    }

    const value = produce(requestDigest);
    this.entries.set(ledgerKey, {
      requestDigest,
      value: structuredClone(value),
    });
    return value;
  }
}

export const operationsLedger = new OperationsIdempotencyLedger();
