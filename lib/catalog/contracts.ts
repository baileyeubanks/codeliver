export const CATALOG_SCHEMA_VERSION = "catalog.control-plane.v1" as const;
export const CATALOG_RECEIPT_SCHEMA_VERSION = "catalog.receipt.v1" as const;

export type CatalogRole = "owner" | "admin" | "member" | "viewer";
export type CatalogAction = "discover" | "ingest" | "transition" | "revert" | "audit";
export type CatalogLifecycleState = "active" | "hidden" | "archived" | "withdrawn";
export type CatalogMediaType = "video" | "image" | "audio" | "document" | "other";

export interface CatalogPrincipal {
  actorId: string;
  tenantId: string;
  role: CatalogRole;
}

export interface CatalogVersionBinding {
  assetId: string;
  versionId: string;
  sequence: number;
  checksum: string;
}

export interface CatalogPublicMetadata {
  title: string;
  description: string | null;
  mediaType: CatalogMediaType;
  tags: string[];
  durationMs: number | null;
  language: string | null;
}

export interface CatalogRestrictedMetadata {
  sourceLocator: string | null;
  rightsStatement: string | null;
}

export interface CatalogItem {
  schemaVersion: typeof CATALOG_SCHEMA_VERSION;
  tenantId: string;
  version: CatalogVersionBinding;
  metadata: CatalogPublicMetadata;
  restrictedMetadata: CatalogRestrictedMetadata;
  lifecycleState: CatalogLifecycleState;
  revision: number;
  contentFingerprint: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
  revertedFromOperationId: string | null;
}

export interface CatalogItemView {
  schemaVersion: typeof CATALOG_SCHEMA_VERSION;
  version: CatalogVersionBinding;
  metadata: CatalogPublicMetadata;
  restrictedMetadata?: CatalogRestrictedMetadata;
  lifecycleState: CatalogLifecycleState;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export type CatalogReceiptOutcome =
  | "applied"
  | "noop"
  | "replayed"
  | "read"
  | "denied"
  | "rejected";

export interface CatalogReceipt {
  schemaVersion: typeof CATALOG_RECEIPT_SCHEMA_VERSION;
  operationId: string;
  requestId: string;
  tenantId: string;
  actorId: string;
  action: CatalogAction;
  outcome: CatalogReceiptOutcome;
  occurredAt: string;
  durationMs: number;
  reference: {
    assetId: string | null;
    versionId: string | null;
    revision: number | null;
  };
  errorCode: string | null;
}

export interface CatalogOperation {
  operationId: string;
  tenantId: string;
  action: "ingest" | "transition" | "revert";
  actorId: string;
  before: CatalogItem | null;
  after: CatalogItem;
  occurredAt: string;
}

export interface CatalogIdempotencyRecord<T> {
  tenantId: string;
  key: string;
  digest: string;
  value: T;
}

export interface CatalogMutationResult {
  item: CatalogItemView;
  receipt: CatalogReceipt;
}

export interface CatalogDiscoveryResult {
  items: CatalogItemView[];
  nextCursor: string | null;
  receipt: CatalogReceipt;
}

export interface CatalogAuditResult {
  receipts: CatalogReceipt[];
  receipt: CatalogReceipt;
}

export interface CatalogRepository {
  getItem(tenantId: string, assetId: string): CatalogItem | null;
  getAssetIdForVersion(tenantId: string, versionId: string): string | null;
  putItem(item: CatalogItem): void;
  listItems(tenantId: string): CatalogItem[];
  getGeneration(tenantId: string): number;
  getIdempotency<T>(tenantId: string, key: string): CatalogIdempotencyRecord<T> | null;
  putIdempotency<T>(record: CatalogIdempotencyRecord<T>): void;
  getOperation(tenantId: string, operationId: string): CatalogOperation | null;
  putOperation(operation: CatalogOperation): void;
  putReceipt(receipt: CatalogReceipt): void;
  listReceipts(tenantId: string, limit: number): CatalogReceipt[];
}

export interface CatalogIngestInput {
  tenantId: string;
  idempotencyKey: string;
  requestId: string;
  expectedRevision: number;
  version: CatalogVersionBinding;
  metadata: CatalogPublicMetadata;
  restrictedMetadata: CatalogRestrictedMetadata;
}

export interface CatalogTransitionInput {
  tenantId: string;
  assetId: string;
  targetState: CatalogLifecycleState;
  expectedRevision: number;
  idempotencyKey: string;
  requestId: string;
}

export interface CatalogRevertInput {
  tenantId: string;
  operationId: string;
  expectedRevision: number;
  idempotencyKey: string;
  requestId: string;
}

export interface CatalogDiscoveryInput {
  tenantId: string;
  query: string;
  tags: string[];
  lifecycleState: CatalogLifecycleState | null;
  limit: number;
  cursor: string | null;
  requestId: string;
}
