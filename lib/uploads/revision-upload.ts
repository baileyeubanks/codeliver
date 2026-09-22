export interface RevisionUploadTarget {
  assetId: string;
  expectedCurrentVersionId: string;
}

export interface UploadCompletionReceipt {
  assetId: string;
  versionId: string;
  versionNumber: number;
  revision: boolean;
}

export interface UploadResponseHeaders {
  get(name: string): string | null;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function buildUploadTargetMetadata(
  revisionTarget: RevisionUploadTarget | null,
): Record<string, string> {
  if (!revisionTarget) return { version: "1" };
  return {
    assetId: revisionTarget.assetId,
    expectedCurrentVersionId: revisionTarget.expectedCurrentVersionId,
  };
}

export function buildUploadFingerprintScope(
  projectId: string,
  resumeScope: string,
  folderId: string | undefined,
  revisionTarget: RevisionUploadTarget | null,
): string {
  return revisionTarget
    ? ["revision", projectId, resumeScope, revisionTarget.assetId, revisionTarget.expectedCurrentVersionId].join(":")
    : ["initial", projectId, resumeScope, folderId ?? ""].join(":");
}

function parseReceiptPart(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export function parseUploadCompletionReceipt(
  headers: UploadResponseHeaders,
  revisionTarget: RevisionUploadTarget | null,
): UploadCompletionReceipt | null {
  const asset = parseReceiptPart(headers.get("Upload-Asset"));
  const version = parseReceiptPart(headers.get("Upload-Version"));
  if (!asset || !version || !nonEmptyString(asset.id) || !nonEmptyString(version.id)) return null;
  if (!Number.isSafeInteger(version.number) || Number(version.number) < 1) return null;
  if (revisionTarget && (
    asset.id !== revisionTarget.assetId
    || version.id === revisionTarget.expectedCurrentVersionId
    || Number(version.number) < 2
  )) return null;
  return {
    assetId: asset.id,
    versionId: version.id,
    versionNumber: Number(version.number),
    revision: revisionTarget !== null,
  };
}

export function shouldRetryUploadStatus(
  status: number | undefined,
  revision: boolean,
): boolean {
  if (!status) return true;
  if (status === 409) return !revision;
  if (status === 423 || status === 429) return true;
  return status >= 500;
}

export function resolveRevisionUploadTarget(
  payload: unknown,
  projectId: string,
  assetId: string,
): RevisionUploadTarget | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const asset = payload as Record<string, unknown>;
  const currentVersion = asset.current_version;
  if (
    asset.id !== assetId
    || asset.project_id !== projectId
    || !currentVersion
    || typeof currentVersion !== "object"
    || Array.isArray(currentVersion)
  ) return null;
  const currentVersionId = (currentVersion as Record<string, unknown>).id;
  if (!nonEmptyString(currentVersionId)) return null;
  return {
    assetId,
    expectedCurrentVersionId: currentVersionId,
  };
}
