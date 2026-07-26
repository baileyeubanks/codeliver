import type { StorageAdapter } from "../storage/contracts";

export type MediaPipelineReceiptCatalogKind = "restore_attestation";

export interface MediaPipelineReceiptCatalogListInput {
  kind: MediaPipelineReceiptCatalogKind;
  limit: number;
  cursor?: string | null;
}

export interface MediaPipelineReceiptCatalogObject {
  objectKey: string;
  size: number;
  sha256: string;
  filename?: string | null;
  providerVersionId?: string | null;
}

export interface MediaPipelineReceiptCatalogListResult {
  objects: MediaPipelineReceiptCatalogObject[];
  truncated: boolean;
  nextCursor?: string | null;
  unsafeEntries?: number;
}

export interface MediaPipelineReceiptCatalogCapableAdapter extends StorageAdapter {
  listMediaPipelineReceiptObjects(
    input: MediaPipelineReceiptCatalogListInput
  ): Promise<MediaPipelineReceiptCatalogListResult>;
}

export function mediaPipelineReceiptCatalogCapability(
  adapter: StorageAdapter
): MediaPipelineReceiptCatalogCapableAdapter | null {
  const candidate = adapter as Partial<MediaPipelineReceiptCatalogCapableAdapter>;
  return typeof candidate.listMediaPipelineReceiptObjects === "function"
    ? (adapter as MediaPipelineReceiptCatalogCapableAdapter)
    : null;
}
