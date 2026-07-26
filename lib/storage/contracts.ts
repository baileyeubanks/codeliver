import type { Readable } from "node:stream";

export const STORAGE_PROVIDER_KINDS = [
  "local",
  "ccnas",
  "google-drive",
  "object-store",
  "unconfigured",
] as const;

export type StorageProviderKind = (typeof STORAGE_PROVIDER_KINDS)[number];

export type StorageCapability =
  | "multipart-ingest"
  | "atomic-placement"
  | "capacity-reporting"
  | "server-checksum"
  | "signed-delivery"
  | "object-versioning"
  | "lifecycle-tiering"
  | "legal-hold";

export interface StorageDiagnosticCheck {
  key: string;
  status: "pass" | "warn" | "fail";
  message: string;
}

export interface StorageCapacitySnapshot {
  totalBytes: string | null;
  availableBytes: string | null;
  usedBytes: string | null;
  reservedBytes: string;
  observedAt: string;
}

export interface StorageReadiness {
  provider: StorageProviderKind;
  label: string;
  configured: boolean;
  external: boolean;
  writeEnabled: boolean;
  readyForWrites: boolean;
  capabilities: StorageCapability[];
  checks: StorageDiagnosticCheck[];
  capacity: StorageCapacitySnapshot | null;
  observedAt: string;
}

export interface MultipartHandle {
  provider: StorageProviderKind;
  uploadId: string;
  opaqueId: string;
}

export interface MultipartAppendInput {
  handle: MultipartHandle;
  offset: number;
  chunks: AsyncIterable<Uint8Array>;
  maxBytes: number;
  expectedSize: number;
  expectedPartSha256?: string;
}

export interface MultipartPartReceipt {
  offset: number;
  bytesWritten: number;
  sha256: string;
}

export interface MultipartInspection {
  size: number;
  sha256: string;
}

export interface MultipartReconciliation {
  action: "unchanged" | "rolled-back";
  committedOffset: number;
  observedOffset: number;
}

export interface MultipartCommitReconciliation {
  action: "not-committed" | "committed" | "staging-cleaned";
  receipt: StoredObjectReceipt | null;
}

export interface CommitMultipartInput {
  handle: MultipartHandle;
  objectKey: string;
  size: number;
  sha256: string;
}

export interface StoredObjectReceipt {
  provider: StorageProviderKind;
  objectKey: string;
  size: number;
  sha256: string;
  providerVersionId: string | null;
  committedAt: string;
}

export interface StoredObjectReadRange {
  start: number;
  end: number;
}

export interface StoredObjectReadExpectation {
  size: number;
  providerVersionId: string;
}

export interface StorageAdapter {
  readonly kind: StorageProviderKind;
  readonly label: string;
  readonly external: boolean;
  readonly capabilities: StorageCapability[];

  diagnose(): Promise<StorageReadiness>;
  beginMultipart(uploadId: string): Promise<MultipartHandle>;
  appendMultipart(input: MultipartAppendInput): Promise<MultipartPartReceipt>;
  inspectMultipart(handle: MultipartHandle): Promise<MultipartInspection>;
  reconcileMultipart(
    handle: MultipartHandle,
    committedOffset: number
  ): Promise<MultipartReconciliation>;
  reconcileMultipartCommit(
    input: CommitMultipartInput
  ): Promise<MultipartCommitReconciliation>;
  openMultipartReadStream(handle: MultipartHandle): Promise<Readable>;
  inspectStoredObject(objectKey: string): Promise<MultipartInspection | null>;
  openStoredObjectReadStream(
    objectKey: string,
    range?: StoredObjectReadRange,
    expectation?: StoredObjectReadExpectation
  ): Promise<Readable>;
  commitMultipart(input: CommitMultipartInput): Promise<StoredObjectReceipt>;
  abortMultipart(handle: MultipartHandle): Promise<void>;
}
