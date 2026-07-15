import type {
  CatalogIdempotencyRecord,
  CatalogItem,
  CatalogOperation,
  CatalogReceipt,
  CatalogRepository,
} from "./contracts";

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class MemoryCatalogRepository implements CatalogRepository {
  private readonly items = new Map<string, CatalogItem>();
  private readonly versionOwners = new Map<string, string>();
  private readonly generations = new Map<string, number>();
  private readonly idempotency = new Map<string, CatalogIdempotencyRecord<unknown>>();
  private readonly operations = new Map<string, CatalogOperation>();
  private readonly receipts = new Map<string, CatalogReceipt[]>();

  private itemKey(tenantId: string, assetId: string) {
    return `${tenantId}\u0000${assetId}`;
  }

  private scopedKey(tenantId: string, value: string) {
    return `${tenantId}\u0000${value}`;
  }

  getItem(tenantId: string, assetId: string): CatalogItem | null {
    const item = this.items.get(this.itemKey(tenantId, assetId));
    return item ? clone(item) : null;
  }

  getAssetIdForVersion(tenantId: string, versionId: string): string | null {
    return this.versionOwners.get(this.scopedKey(tenantId, versionId)) ?? null;
  }

  putItem(item: CatalogItem): void {
    const versionKey = this.scopedKey(item.tenantId, item.version.versionId);
    const versionOwner = this.versionOwners.get(versionKey);
    if (versionOwner && versionOwner !== item.version.assetId) {
      throw new Error("catalog version ownership invariant violated");
    }
    this.items.set(this.itemKey(item.tenantId, item.version.assetId), clone(item));
    this.versionOwners.set(versionKey, item.version.assetId);
    this.generations.set(item.tenantId, this.getGeneration(item.tenantId) + 1);
  }

  listItems(tenantId: string): CatalogItem[] {
    return [...this.items.values()]
      .filter((item) => item.tenantId === tenantId)
      .map(clone);
  }

  getGeneration(tenantId: string): number {
    return this.generations.get(tenantId) ?? 0;
  }

  getIdempotency<T>(tenantId: string, key: string): CatalogIdempotencyRecord<T> | null {
    const record = this.idempotency.get(this.scopedKey(tenantId, key));
    return record ? clone(record as CatalogIdempotencyRecord<T>) : null;
  }

  putIdempotency<T>(record: CatalogIdempotencyRecord<T>): void {
    this.idempotency.set(this.scopedKey(record.tenantId, record.key), clone(record));
  }

  getOperation(tenantId: string, operationId: string): CatalogOperation | null {
    const operation = this.operations.get(this.scopedKey(tenantId, operationId));
    return operation ? clone(operation) : null;
  }

  putOperation(operation: CatalogOperation): void {
    this.operations.set(this.scopedKey(operation.tenantId, operation.operationId), clone(operation));
  }

  putReceipt(receipt: CatalogReceipt): void {
    const tenantReceipts = this.receipts.get(receipt.tenantId) ?? [];
    tenantReceipts.push(clone(receipt));
    this.receipts.set(receipt.tenantId, tenantReceipts.slice(-2_000));
  }

  listReceipts(tenantId: string, limit: number): CatalogReceipt[] {
    return (this.receipts.get(tenantId) ?? []).slice(-limit).reverse().map(clone);
  }
}
