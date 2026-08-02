import type { Readable } from "node:stream";

import type {
  MultipartHandle,
  MultipartCommitReconciliation,
  MultipartInspection,
  MultipartPartReceipt,
  MultipartReconciliation,
  StorageAdapter,
  StorageCapability,
  StorageDiagnosticCheck,
  StorageProviderKind,
  StorageReadiness,
  StoredObjectReceipt,
} from "./contracts";
import type { StorageRuntimeConfig } from "./config";
// @ts-expect-error Node's native TypeScript test runner requires explicit extensions.
import { StorageError } from "./errors.ts";

export class ReadinessOnlyStorageAdapter implements StorageAdapter {
  readonly capabilities: StorageCapability[] = [];
  readonly external = true;
  readonly kind: StorageProviderKind;
  readonly label: string;
  private readonly config: StorageRuntimeConfig;

  constructor(
    kind: StorageProviderKind,
    label: string,
    config: StorageRuntimeConfig
  ) {
    this.kind = kind;
    this.label = label;
    this.config = config;
  }

  async diagnose(): Promise<StorageReadiness> {
    const checks: StorageDiagnosticCheck[] = this.config.issues.map((message, index) => ({
      key: `configuration-${index + 1}`,
      status: "fail" as const,
      message,
    }));

    if (this.kind === "google-drive") {
      checks.push({
        key: "drive-folder",
        status: this.config.driveFolderId ? "pass" : "fail",
        message: this.config.driveFolderId
          ? "Google Drive destination folder is configured"
          : "GOOGLE_DRIVE_FOLDER_ID is required",
      });
      checks.push({
        key: "drive-credentials",
        status: this.config.driveCredentialsValid ? "pass" : "fail",
        message: this.config.driveCredentialsValid
          ? `Google Drive ${this.config.driveCredentialMode} credentials are structurally valid`
          : "Google Drive credentials are missing or structurally invalid",
      });
      checks.push({
        key: "drive-transport",
        status: "fail",
        message: "Google Drive write transport is not enabled in this release",
      });
    } else {
      checks.push({
        key: "provider-transport",
        status: "fail",
        message: `${this.label} transport is not enabled in this release`,
      });
    }

    return {
      provider: this.kind,
      label: this.label,
      configured:
        this.kind === "google-drive" &&
        Boolean(this.config.driveFolderId) &&
        this.config.driveCredentialsValid,
      external: true,
      writeEnabled: this.config.writeEnabled,
      readyForWrites: false,
      capabilities: this.capabilities,
      checks,
      capacity: null,
      observedAt: new Date().toISOString(),
    };
  }

  private unavailable(): never {
    throw new StorageError(
      "STORAGE_UNSUPPORTED",
      `${this.label} writes are unavailable; readiness never grants write authority`
    );
  }

  async beginMultipart(): Promise<MultipartHandle> {
    return this.unavailable();
  }

  async appendMultipart(): Promise<MultipartPartReceipt> {
    return this.unavailable();
  }

  async inspectMultipart(): Promise<MultipartInspection> {
    return this.unavailable();
  }

  async reconcileMultipart(): Promise<MultipartReconciliation> {
    return this.unavailable();
  }

  async reconcileMultipartCommit(): Promise<MultipartCommitReconciliation> {
    return this.unavailable();
  }

  async openMultipartReadStream(): Promise<Readable> {
    return this.unavailable();
  }

  async inspectStoredObject(): Promise<MultipartInspection | null> {
    return this.unavailable();
  }

  async openStoredObjectReadStream(): Promise<Readable> {
    return this.unavailable();
  }

  async commitMultipart(): Promise<StoredObjectReceipt> {
    return this.unavailable();
  }

  async abortMultipart(): Promise<void> {
    return this.unavailable();
  }
}
