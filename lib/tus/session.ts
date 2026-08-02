import type {
  MultipartHandle,
  StorageProviderKind,
  StoredObjectReceipt,
} from "../storage/contracts";
import type { MalwareScanResult } from "../storage/malware";

export const UPLOAD_SESSION_STATES = [
  "receiving",
  "verifying",
  "quarantined",
  "committed",
  "rejected",
  "aborted",
  "failed",
] as const;

export type UploadSessionState = (typeof UPLOAD_SESSION_STATES)[number];

export type UploadDerivativeState = "blocked" | "pending" | "ready" | "error";

export interface UploadDerivativeReadiness {
  state: UploadDerivativeState;
  attempts: number;
  lastError: string | null;
  updatedAt: string;
}

export interface UploadRecoveryState {
  attempts: number;
  lastAction:
    | "none"
    | "multipart-unchanged"
    | "multipart-rolled-back"
    | "verification-resumed"
    | "placement-recovered"
    | "failed-closed";
  lastRecoveredAt: string | null;
}

export interface UploadSession {
  schemaVersion: 1;
  id: string;
  scopeKind?: "project" | "public-intake";
  tenantKey: string | null;
  projectId: string | null;
  folderId: string | null;
  intakeFormKeyHash?: string | null;
  intakeCapabilityHash?: string | null;
  idempotencyKeyHash: string;
  filename: string;
  mimeType: string;
  size: number;
  offset: number;
  version: number;
  provider: StorageProviderKind;
  providerHandle: MultipartHandle;
  state: UploadSessionState;
  expectedSha256: string | null;
  computedSha256: string | null;
  objectKey: string | null;
  receipt: StoredObjectReceipt | null;
  scan: MalwareScanResult | null;
  partCount: number;
  lastPartSha256: string | null;
  lastPartOffset?: number | null;
  mediaIngestAuthoritySessionId?: string | null;
  assetId: string | null;
  catalog: {
    state: "pending" | "attached" | "error";
    attempts: number;
    lastError: string | null;
    updatedAt: string;
  };
  derivatives: UploadDerivativeReadiness;
  recovery: UploadRecoveryState;
  legalHold: boolean;
  revision: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  lastError: { code: string; message: string; at: string } | null;
}

export interface UploadSessionEvent {
  at: string;
  event: string;
  state: UploadSessionState;
  offset: number;
  revision: number;
  detail?: Record<string, string | number | boolean | null>;
}

export interface CreateUploadSessionInput {
  tenantId: string;
  projectId: string;
  folderId?: string;
  idempotencyKey: string;
  filename: string;
  mimeType: string;
  size: number;
  version?: number;
  expectedSha256?: string;
}

export interface CreatePublicIntakeUploadSessionInput {
  formKey: string;
  capabilityHash: string;
  idempotencyKey: string;
  filename: string;
  mimeType: string;
  size: number;
  expectedSha256: string;
  version?: number;
}

export interface CreateUploadSessionResult {
  session: UploadSession;
  resumed: boolean;
}

export interface AppendUploadPartInput {
  uploadId: string;
  tenantId: string;
  offset: number;
  chunks: AsyncIterable<Uint8Array>;
  expectedPartSha256?: string;
}

export interface AppendPublicIntakeUploadPartInput {
  uploadId: string;
  capabilityHash: string;
  offset: number;
  chunks: AsyncIterable<Uint8Array>;
  expectedPartSha256?: string;
  maxChunkBytes?: number;
}

export interface AppendUploadPartResult {
  session: UploadSession;
  complete: boolean;
}
