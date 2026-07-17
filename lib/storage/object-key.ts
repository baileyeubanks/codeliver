import { createHash } from "node:crypto";
import { posix } from "node:path";

import { StorageError } from "./errors.ts";

const MAX_OBJECT_KEY_LENGTH = 1024;
const MAX_FILENAME_LENGTH = 180;

function digest(value: string, length = 20): string {
  return createHash("sha256").update(value).digest("hex").slice(0, length);
}

export function hashStorageNamespace(value: string): string {
  return digest(requireNamespaceValue(value, "Storage namespace"), 32);
}

function requireNamespaceValue(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 256 || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new StorageError(
      "STORAGE_PATH_INVALID",
      `${label} must be a non-empty identifier of at most 256 characters`
    );
  }
  return normalized;
}

export function sanitizeObjectFilename(filename: string): string {
  const normalized = filename.normalize("NFKC").replace(/\\/g, "/");
  const leaf = normalized.split("/").pop()?.trim() || "upload";
  const extensionMatch = leaf.match(/(\.[A-Za-z0-9]{1,12})$/);
  const extension = extensionMatch?.[1].toLowerCase() ?? "";
  const stem = extension ? leaf.slice(0, -extension.length) : leaf;
  const safeStem = stem
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, Math.max(1, MAX_FILENAME_LENGTH - extension.length - 13)) || "upload";
  return `${safeStem}-${digest(leaf, 12)}${extension}`;
}

export function assertSafeObjectKey(objectKey: string): string {
  if (
    !objectKey ||
    objectKey.length > MAX_OBJECT_KEY_LENGTH ||
    objectKey.startsWith("/") ||
    objectKey.includes("\\") ||
    objectKey.includes("\u0000") ||
    objectKey.includes("%") ||
    posix.normalize(objectKey) !== objectKey
  ) {
    throw new StorageError("STORAGE_PATH_INVALID", "Object key is not canonical");
  }

  const segments = objectKey.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new StorageError("STORAGE_PATH_INVALID", "Object key contains an unsafe segment");
  }
  return objectKey;
}

export function buildVersionedObjectKey(input: {
  tenantId: string;
  projectId: string;
  objectId: string;
  version: number;
  filename: string;
}): string {
  if (!Number.isSafeInteger(input.version) || input.version <= 0) {
    throw new StorageError("STORAGE_PATH_INVALID", "Object version must be a positive integer");
  }

  const tenant = requireNamespaceValue(input.tenantId, "Tenant id");
  const project = requireNamespaceValue(input.projectId, "Project id");
  const object = requireNamespaceValue(input.objectId, "Object id");
  const version = `v${String(input.version).padStart(8, "0")}`;
  return assertSafeObjectKey(
    [
      "tenants",
      `t-${digest(tenant)}`,
      "projects",
      `p-${digest(project)}`,
      "objects",
      `o-${digest(object)}`,
      version,
      sanitizeObjectFilename(input.filename),
    ].join("/")
  );
}
