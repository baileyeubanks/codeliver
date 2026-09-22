"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Upload,
  X,
  FileIcon,
  CheckCircle,
  AlertCircle,
  RotateCcw,
  Pause,
  Play,
} from "lucide-react";
import { formatFileSize } from "@/lib/utils/media";
import * as tus from "tus-js-client";
import { TransferIntent, setTransferTimeout } from "@/lib/uploads/transfer-intent";
import {
  buildUploadFingerprintScope,
  buildUploadTargetMetadata,
  parseUploadCompletionReceipt,
  shouldRetryUploadStatus,
  type RevisionUploadTarget,
  type UploadCompletionReceipt,
} from "@/lib/uploads/revision-upload";
import styles from "./AssetUpload.module.css";
import type { Tag } from "@/lib/types/codeliver";

type Asset = {
  id: string;
  title: string;
  file_type: string;
  file_url: string | null;
  thumbnail_url: string | null;
  status: string;
  file_size: number | null;
  duration_seconds: number | null;
  folder_id: string | null;
  created_at: string;
  updated_at: string;
  _commentCount?: number;
  _versionCount?: number;
  _approvalProgress?: number;
  tags?: Tag[];
};

type UploadStatus =
  | "pending"
  | "uploading"
  | "pausing"
  | "paused"
  | "cancelling"
  | "processing"
  | "quarantined"
  | "rejected"
  | "done"
  | "error";

type UploadItem = {
  file: File;
  id: string;
  attemptId: string;
  progress: number;
  bytesUploaded: number;
  bytesTotal: number;
  status: UploadStatus;
  error?: string;
  tusUpload?: tus.Upload;
  asset?: Asset;
  revisionTarget: RevisionUploadTarget | null;
  scanRetryable?: boolean;
  catalogPending?: boolean;
  uploadUrl?: string;
};

type ScanRetryStatus = {
  state?: string;
  retryable?: boolean;
  originalReady?: boolean;
  message?: string;
  error?: string;
  asset?: { id?: string };
  version?: { id?: string; number?: number };
};

const WARN_EXT = new Set(["exe", "bat", "sh", "cmd", "msi"]);
const CHUNK_SIZE = 8 * 1024 * 1024; // Keep mobile retries small and below the proxy buffer.

type StorageReadiness = {
  phase: "checking" | "ready" | "blocked";
  label: string;
  message: string;
  maxUploadBytes: number;
  maxChunkBytes: number;
  quarantineRequired: boolean;
  automaticReleaseReady: boolean;
};

type StorageReadinessResponse = {
  readyForWrites?: boolean;
  label?: string;
  checks?: Array<{ status: "pass" | "warn" | "fail"; message: string }>;
  quarantineRequired?: boolean;
  workflow?: {
    scanner?: {
      automaticReleaseReady?: boolean;
    };
  };
  limits?: { maxUploadBytes?: string; maxChunkBytes?: string };
  error?: string;
};

export type UploadCompletion = UploadCompletionReceipt;

export default function AssetUpload({
  projectId,
  resumeScope = "",
  folderId,
  inputId,
  onUploadComplete,
  revisionTarget = null,
  variant = "dropzone",
}: {
  projectId: string;
  resumeScope?: string;
  folderId?: string;
  inputId?: string;
  onUploadComplete: (uploads: UploadCompletion[]) => void | Promise<void>;
  revisionTarget?: RevisionUploadTarget | null;
  variant?: "dropzone" | "cockpit";
}) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [minimized, setMinimized] = useState(false);
  const intent = useRef(new TransferIntent());
  const uploads = useRef(new Map<string, tus.Upload>());
  const mounted = useRef(true);
  const [dragOver, setDragOver] = useState(false);
  const [storage, setStorage] = useState<StorageReadiness>({
    phase: "checking",
    label: "Storage",
    message: "Checking storage readiness...",
    maxUploadBytes: 0,
    maxChunkBytes: CHUNK_SIZE,
    quarantineRequired: true,
    automaticReleaseReady: false,
  });
  const inputRef = useRef<HTMLInputElement>(null);

  const refreshStorageReadiness = useCallback(async (signal?: AbortSignal) => {
    setStorage((current) => ({
      ...current,
      phase: "checking",
      message: "Checking storage readiness...",
    }));
    try {
      const response = await fetch("/api/storage/readiness", {
        cache: "no-store",
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000),
      });
      const payload = (await response.json()) as StorageReadinessResponse;
      if (!response.ok || !payload.readyForWrites) {
        const failure = payload.checks?.find((check) => check.status === "fail");
        throw new Error(failure?.message || payload.error || "Storage is unavailable");
      }
      const maxUploadBytes = Number(payload.limits?.maxUploadBytes);
      const maxChunkBytes = Number(payload.limits?.maxChunkBytes);
      const nextStorage: StorageReadiness = {
        phase: "ready",
        label: payload.label || "Storage",
        message: "Ready",
        maxUploadBytes: Number.isSafeInteger(maxUploadBytes) ? maxUploadBytes : 0,
        maxChunkBytes:
          Number.isSafeInteger(maxChunkBytes) && maxChunkBytes > 0
            ? Math.min(maxChunkBytes, CHUNK_SIZE)
            : CHUNK_SIZE,
        quarantineRequired: payload.quarantineRequired !== false,
        automaticReleaseReady:
          payload.workflow?.scanner?.automaticReleaseReady === true,
      };
      setStorage(nextStorage);
      return nextStorage;
    } catch (error: unknown) {
      if (signal?.aborted) return null;
      const blockedStorage: StorageReadiness = {
        phase: "blocked",
        label: "Storage",
        message: error instanceof Error ? error.message : "Storage is unavailable",
        maxUploadBytes: 0,
        maxChunkBytes: CHUNK_SIZE,
        quarantineRequired: true,
        automaticReleaseReady: false,
      };
      setStorage(blockedStorage);
      return blockedStorage;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    const activeUploads = uploads.current;
    void refreshStorageReadiness(controller.signal);
    return () => {
      mounted.current = false;
      controller.abort();
      activeUploads.forEach((upload) => { void upload.abort(); });
    };
  }, [refreshStorageReadiness]);

  const updateItem = useCallback(
    (id: string, patch: Partial<UploadItem>) => {
      if (!mounted.current || intent.current.isCancelled(id)) return;
      if (intent.current.isPaused(id) && (patch.status === "uploading" || patch.status === "processing")) return;
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, ...patch } : i))
      );
    },
    []
  );

  const startTusUpload = useCallback(
    (item: UploadItem, readiness: StorageReadiness = storage) => {
      if (!mounted.current || intent.current.isCancelled(item.id)) return;
      if (readiness.phase !== "ready") {
        updateItem(item.id, {
          status: "error",
          error: readiness.message,
        });
        return;
      }
      let serverState = "receiving";
      let originalReleaseReady = false;
      let scanRetryable = false;
      let uploadAssetHeader: string | null = null;
      let uploadVersionHeader: string | null = null;
      let receiptStorageKey: string | null = null;
      const backingUrlStorage = tus.defaultOptions.urlStorage;
      // Tus clears this before onSuccess when configured normally. Keep it through
      // receipt parsing, then remove only this upload's exact storage entry.
      const receiptBoundUrlStorage = {
        findAllUploads: () => backingUrlStorage.findAllUploads(),
        findUploadsByFingerprint: (fingerprint: string) => backingUrlStorage.findUploadsByFingerprint(fingerprint),
        async addUpload(fingerprint: string, previousUpload: Parameters<typeof backingUrlStorage.addUpload>[1]) {
          const key = await backingUrlStorage.addUpload(fingerprint, previousUpload);
          receiptStorageKey = key;
          return key;
        },
        removeUpload: (key: string) => backingUrlStorage.removeUpload(key),
      };
      const removeReceiptFingerprint = async () => {
        if (!receiptStorageKey) return;
        const key = receiptStorageKey;
        receiptStorageKey = null;
        try {
          await receiptBoundUrlStorage.removeUpload(key);
        } catch (error) {
          // A confirmed catalog receipt is authoritative; leave a diagnostic rather
          // than converting a completed upload into a retryable duplicate.
          console.error("[tus] Unable to clear confirmed upload resume record:", error);
        }
      };
      const waitForSecurityClearance = async (uploadUrl: string) => {
        const started = await fetch(`${uploadUrl}/scan`, {
          method: "POST",
          cache: "no-store",
        });
        let status = (await started.json()) as ScanRetryStatus;
        if (!started.ok) {
          throw new Error(
            status.error ||
              status.message ||
              "The security scan could not be started",
          );
        }
        for (
          let attempt = 0;
          attempt < 45 &&
            (status.state === "verifying" ||
              (status.state === "committed" && !status.originalReady));
          attempt += 1
        ) {
          const response = await fetch(`${uploadUrl}/scan`, { cache: "no-store" });
          status = (await response.json()) as ScanRetryStatus;
          if (!response.ok) {
            throw new Error(
              status.error ||
                status.message ||
                "The security scan status could not be confirmed",
            );
          }
        }
        return status;
      };
      const upload = new tus.Upload(item.file, {
        endpoint: "/api/upload/tus",
        chunkSize: readiness.maxChunkBytes,
        onBeforeRequest(request) {
          const xhr = request.getUnderlyingObject();
          if (xhr instanceof XMLHttpRequest) setTransferTimeout(xhr);
        },
        fingerprint: async (file) => JSON.stringify([
          "cvp-v2",
          buildUploadFingerprintScope(projectId, resumeScope, folderId, item.revisionTarget),
          file.name,
          file.size,
          file.type,
          file.lastModified,
        ]),
        retryDelays: [0, 1000, 3000, 5000, 10000],
        // Keep this exact session recoverable until its signed catalog receipt has
        // been parsed. A missing final receipt is an error, not a new upload.
        removeFingerprintOnSuccess: false,
        urlStorage: receiptBoundUrlStorage,
        metadata: {
          filename: item.file.name,
          filetype: item.file.type || "application/octet-stream",
          projectId,
          idempotencyKey: item.attemptId,
          ...buildUploadTargetMetadata(item.revisionTarget),
          ...(!item.revisionTarget && folderId ? { folderId } : {}),
        },
        onAfterResponse(request, response) {
          void request;
          serverState = response.getHeader("Upload-State") || serverState;
          originalReleaseReady =
            response.getHeader("Upload-Original-Ready") === "true";
          scanRetryable = response.getHeader("Upload-Scan-Retryable") === "true";
          uploadAssetHeader = response.getHeader("Upload-Asset") ?? uploadAssetHeader;
          uploadVersionHeader = response.getHeader("Upload-Version") ?? uploadVersionHeader;
        },
        onProgress(bytesUploaded, bytesTotal) {
          // Wire bytes can be retried. The bar advances only on acknowledged chunks.
          if (bytesUploaded === bytesTotal) updateItem(item.id, { status: "processing" });
        },
        onChunkComplete(_chunkSize, bytesAccepted, bytesTotal) {
          updateItem(item.id, {
            progress: Math.round((bytesAccepted / bytesTotal) * 100),
            bytesUploaded: bytesAccepted, bytesTotal,
            status: bytesAccepted === bytesTotal ? "processing" : "uploading",
          });
        },
        async onSuccess() {
          updateItem(item.id, { status: "processing", progress: 100,
            bytesUploaded: item.bytesTotal, bytesTotal: item.bytesTotal });
          try {
            if (serverState === "verifying" && upload.url) {
              const status = await waitForSecurityClearance(upload.url);
              serverState = status.state || serverState;
              originalReleaseReady = status.originalReady === true;
              scanRetryable = status.retryable === true || status.state === "verifying";
              if (status.asset?.id) uploadAssetHeader = JSON.stringify(status.asset);
              if (status.version?.id && Number.isSafeInteger(status.version.number)) {
                uploadVersionHeader = JSON.stringify(status.version);
              }
              if (status.state === "rejected") {
                updateItem(item.id, {
                  status: "rejected",
                  scanRetryable: false,
                  uploadUrl: upload.url,
                  error: status.message || "Security scan rejected this file. It remains unavailable for review.",
                });
                return;
              }
            }
            if (serverState === "committed" && !originalReleaseReady) {
              updateItem(item.id, {
                status: "error",
                catalogPending: true,
                scanRetryable: false,
                uploadUrl: upload.url ?? undefined,
                error: "Verified media is saved. Check again while Co-VideoPro finishes its catalog record.",
              });
              return;
            }
            const quarantined = serverState !== "committed" || !originalReleaseReady;
            const completion = parseUploadCompletionReceipt({
              get(name) {
                if (name === "Upload-Asset") return uploadAssetHeader;
                if (name === "Upload-Version") return uploadVersionHeader;
                return null;
              },
            }, item.revisionTarget);
            if (quarantined) {
              updateItem(item.id, {
                status: "quarantined",
                scanRetryable,
                uploadUrl: upload.url ?? undefined,
                error: serverState === "verifying"
                  ? "Security scan is still running against the verified upload. Check again without uploading the file again."
                  : scanRetryable
                  ? "Security scan timed out. Your verified upload is retained and still quarantined; retry the scan without uploading the file again."
                  : "Security scanning has not cleared this file. It remains quarantined and unavailable for review. Check again without uploading the file again.",
              });
              return;
            }
            if (!completion) {
              updateItem(item.id, {
                status: "error",
                error: "Upload finished without a verified catalog receipt. Retry the same upload to reconcile it.",
              });
              return;
            }
            await removeReceiptFingerprint();
            await onUploadComplete([completion]);
            updateItem(item.id, { status: "done" });
          } catch (error) {
            if (serverState === "committed" && !originalReleaseReady) {
              updateItem(item.id, {
                status: "error",
                catalogPending: true,
                scanRetryable: false,
                uploadUrl: upload.url ?? undefined,
                error: "Verified media is saved. Check again while Co-VideoPro finishes its catalog record.",
              });
              return;
            }
            updateItem(item.id, {
              status:
                serverState === "committed" && originalReleaseReady
                  ? "done"
                  : "quarantined",
              scanRetryable: serverState !== "committed",
              uploadUrl: upload.url ?? undefined,
              error:
                serverState === "committed"
                  ? "File saved. Reload the project to refresh your media list."
                  : `${error instanceof Error ? error.message : "Security scan status is unavailable"}. The verified upload remains quarantined; checking again will not upload it again.`,
            });
          }
        },
        onError(error) {
          console.error("[tus] Upload error:", error);
          updateItem(item.id, {
            status: "error",
            error: error.message || "Upload failed",
          });
        },
        onShouldRetry(err) {
          const status = (err as { originalResponse?: { getStatus(): number } })
            ?.originalResponse?.getStatus();
          return shouldRetryUploadStatus(status, item.revisionTarget !== null);
        },
      });

      uploads.current.set(item.id, upload);
      updateItem(item.id, {
        tusUpload: upload,
        status: "uploading",
      });

      // Check for previous uploads to resume
      void upload
        .findPreviousUploads()
        .then((previousUploads) => {
          if (!mounted.current || intent.current.isCancelled(item.id)) return;
          if (previousUploads.length > 0) {
            receiptStorageKey = previousUploads[0].urlStorageKey;
            upload.resumeFromPreviousUpload(previousUploads[0]);
          }
          intent.current.ready(item.id);
          if (intent.current.canStart(item.id)) upload.start();
        })
        .catch((error: unknown) => {
          updateItem(item.id, {
            status: "error",
            error: error instanceof Error ? error.message : "Upload resume failed",
          });
        });
    },
    [projectId, resumeScope, folderId, onUploadComplete, storage, updateItem]
  );

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      if (revisionTarget && files.length !== 1) {
        const item = Array.from(files)[0];
        if (!item) return;
        setItems((current) => [...current, {
          file: item,
          id: crypto.randomUUID(),
          attemptId: crypto.randomUUID(),
          progress: 0,
          bytesUploaded: 0,
          bytesTotal: item.size,
          status: "error",
          error: "Choose exactly one file for a replacement version.",
          revisionTarget,
        }]);
        return;
      }
      const newItems: UploadItem[] = Array.from(files).map((file) => {
        const id = crypto.randomUUID();
        return {
          file,
          id,
          attemptId: id,
          progress: 0,
          bytesUploaded: 0,
          bytesTotal: file.size,
          status: "pending",
          revisionTarget,
        };
      });
      setMinimized(false);
      setItems((prev) => [...prev, ...newItems]);
      const begin = (readiness: StorageReadiness | null) => {
        newItems.forEach((item) => {
          if (!mounted.current || intent.current.isCancelled(item.id)) return;
          if (!readiness || readiness.phase !== "ready") {
            updateItem(item.id, {
              status: "error",
              error: readiness?.message || "Storage readiness could not be confirmed",
            });
          } else if (readiness.maxUploadBytes > 0 && item.file.size > readiness.maxUploadBytes) {
            updateItem(item.id, {
              status: "error",
              error: `File exceeds the ${formatFileSize(readiness.maxUploadBytes)} limit`,
            });
          } else {
            startTusUpload(item, readiness);
          }
        });
      };
      if (storage.phase === "ready") {
        begin(storage);
      } else {
        void refreshStorageReadiness().then(begin);
      }
    },
    [startTusUpload, storage, refreshStorageReadiness, updateItem, revisionTarget]
  );

  const pauseUpload = useCallback(
    (id: string) => {
      const item = items.find((current) => current.id === id);
      if (!item?.tusUpload) return;
      intent.current.pause(id);
      updateItem(id, { status: "pausing" });
      void item.tusUpload.abort()
        .then(() => updateItem(id, { status: "paused" }))
        .catch((error: unknown) => {
          updateItem(id, {
            status: "error",
            error: error instanceof Error ? error.message : "Unable to pause upload",
          });
        });
    },
    [items, updateItem]
  );

  const resumeUpload = useCallback(
    (id: string) => {
      const item = items.find((current) => current.id === id);
      if (!item?.tusUpload) return;
      intent.current.resume(id);
      if (intent.current.canStart(id)) item.tusUpload.start();
      updateItem(id, { status: "uploading" });
    },
    [items, updateItem]
  );

  const retryUpload = useCallback(
    (id: string) => {
      const item = items.find((i) => i.id === id);
      if (item) {
        intent.current.reset(id);
        const retryItem: UploadItem = {
          ...item,
          // A final PATCH can fail after bytes are committed but before the
          // catalog/V1 response reaches this client. Keep the durable upload
          // identity so a fresh Tus client can HEAD and reconcile that session.
          attemptId: item.attemptId,
          progress: 0,
          bytesUploaded: 0,
          status: "pending",
          error: undefined,
          tusUpload: undefined,
          catalogPending: false,
        };
        updateItem(id, retryItem);
        const restart = () => {
          if (storage.phase === "ready") {
            startTusUpload(retryItem);
            return;
          }
          void refreshStorageReadiness().then((readiness) => {
            if (readiness?.phase === "ready") {
              startTusUpload(retryItem, readiness);
              return;
            }
            updateItem(id, {
              status: "error",
              error: readiness?.message || "Storage readiness could not be confirmed",
            });
          });
        };
        // Do not terminate an errored upload: its original bytes may already
        // be committed, and the canonical route recovers catalog attachment on
        // the next HEAD request.
        restart();
      }
    },
    [items, refreshStorageReadiness, startTusUpload, storage.phase, updateItem]
  );

  const retrySecurityScan = useCallback(
    async (id: string) => {
      const item = items.find((current) => current.id === id);
      const uploadUrl = item?.uploadUrl ?? item?.tusUpload?.url ?? null;
      if ((!item?.scanRetryable && !item?.catalogPending) || !uploadUrl) return;

      updateItem(id, {
        status: "processing",
        error: item.catalogPending
          ? "Verified media is saved. Checking its catalog record without uploading file data again."
          : "Security scan is running against the retained verified upload. No file data is being uploaded again.",
      });
      try {
        const started = await fetch(`${uploadUrl}/scan`, {
          method: "POST",
          cache: "no-store",
        });
        let status = (await started.json()) as ScanRetryStatus;
        if (!started.ok) {
          updateItem(id, {
            status: "quarantined",
            scanRetryable: started.status >= 500,
            error:
              status.error ||
              status.message ||
              "The security scan could not be restarted. The file remains quarantined.",
          });
          return;
        }

        for (let attempt = 0; attempt < 45; attempt += 1) {
          if (
            status.state !== "verifying" &&
            !(status.state === "committed" && !status.originalReady)
          ) break;
          const response = await fetch(`${uploadUrl}/scan`, { cache: "no-store" });
          status = (await response.json()) as ScanRetryStatus;
          if (!response.ok) {
            updateItem(id, {
              status: "quarantined",
              scanRetryable: response.status >= 500,
              error:
                status.error ||
                status.message ||
                "The security scan status could not be confirmed. The file remains quarantined.",
            });
            return;
          }
        }

        if (status.state === "committed" && status.originalReady) {
          retryUpload(id);
          return;
        }
        if (status.state === "committed" && !status.originalReady) {
          updateItem(id, {
            status: "error",
            catalogPending: true,
            scanRetryable: false,
            error: status.message || "Verified media is saved. Check again while Co-VideoPro finishes its catalog record.",
          });
          return;
        }
        if (status.state === "rejected") {
          updateItem(id, {
            status: "rejected",
            scanRetryable: false,
            error: status.message || "Security scan rejected this file. It remains unavailable for review.",
          });
          return;
        }
        updateItem(id, {
          status: "quarantined",
          scanRetryable: status.retryable === true || status.state === "verifying",
          error:
            status.state === "verifying"
              ? "Security scan is still running. Check again without uploading the file again."
              : status.message || "The file remains quarantined and unavailable for review.",
        });
      } catch (error) {
        updateItem(id, {
          status: "quarantined",
          scanRetryable: true,
          error:
            error instanceof Error
              ? `${error.message}. The verified upload remains quarantined; retrying will not upload it again.`
              : "The verified upload remains quarantined; retrying will not upload it again.",
        });
      }
    },
    [items, retryUpload, updateItem],
  );

  const removeUploadItem = useCallback((id: string) => {
    intent.current.cancel(id);
    uploads.current.delete(id);
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const cancelUpload = useCallback(
    (id: string) => {
      const item = items.find((current) => current.id === id);
      if (!item?.tusUpload) {
        removeUploadItem(id);
        return;
      }
      updateItem(id, { status: "cancelling" });
      intent.current.cancel(id);
      void item.tusUpload.abort(true)
        .then(() => removeUploadItem(id))
        .catch((error: unknown) => {
          intent.current.cancellationFailed(id);
          updateItem(id, {
            status: "error",
            error: error instanceof Error ? error.message : "Unable to cancel upload",
          });
        });
    },
    [items, removeUploadItem, updateItem]
  );

  const ext = (name: string) => name.split(".").pop()?.toLowerCase() || "";

  const statusLabel = (status: UploadStatus, progress: number) => {
    switch (status) {
      case "pending":
        return "Preparing...";
      case "uploading":
        return `${progress}%`;
      case "pausing":
        return "Pausing...";
      case "paused":
        return "Paused";
      case "cancelling":
        return "Cancelling...";
      case "processing":
        return "Verifying & saving…";
      case "quarantined":
        return "Security scan required";
      case "rejected":
        return "Security scan rejected";
      case "done":
        return "Complete";
      case "error":
        return "Failed";
    }
  };

  const activeUploadCount = items.filter((item) =>
    ["pending", "uploading", "pausing", "paused", "cancelling", "processing"].includes(item.status),
  ).length;
  const receivedUploadCount = items.filter((item) =>
    item.status === "done" || item.status === "quarantined",
  ).length;
  const failedUploadCount = items.filter((item) =>
    item.status === "error" || item.status === "rejected",
  ).length;
  const totalBytes = items.reduce((sum, item) => sum + item.bytesTotal, 0);
  const uploadedBytes = items.reduce((sum, item) => sum + item.bytesUploaded, 0);
  const overallProgress = totalBytes > 0
    ? Math.round((uploadedBytes / totalBytes) * 100)
    : 0;
  const overallByteProgress = `${formatFileSize(uploadedBytes)} of ${formatFileSize(totalBytes)} uploaded`;
  const uploadTerminal = items.length > 0 && activeUploadCount === 0;
  const uploadTitle = activeUploadCount > 0
    ? items.every((item) => item.status === "processing" || item.status === "done")
      ? "Verifying your media" : "Uploading media"
    : failedUploadCount > 0
      ? "Upload needs attention"
      : items.some((item) => item.status === "quarantined")
        ? "Security scan required"
        : items.some((item) => item.error) ? "Upload saved" : "Ready for review";
  const uploadMessage = activeUploadCount > 0
    ? "Keep this window open while Co‑VideoPro transfers and prepares the review asset."
    : failedUploadCount > 0
      ? "Review the failed item below, then retry or remove it."
      : items.some((item) => item.status === "quarantined")
        ? "The verified original remains quarantined until a security scan passes. Retry below without uploading the file again."
        : "The uploaded media is ready in this project.";

  return (
    <div className="space-y-4">
      <div
        className={`${variant === "cockpit" ? "hidden" : ""} border-2 border-dashed rounded-[var(--radius)] p-8 text-center transition-colors ${
          storage.phase === "ready" ? "cursor-pointer" : "cursor-pointer opacity-70"
        } ${
          dragOver && storage.phase === "ready"
            ? "border-[var(--accent)] bg-[var(--accent)]/5"
            : "border-[var(--border)] hover:border-[var(--muted)]"
        }`}
        role="button"
        tabIndex={0}
        aria-label="Select files to upload"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length) {
            addFiles(e.dataTransfer.files);
          }
        }}
        onClick={() => {
          inputRef.current?.click();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        <Upload size={32} className="mx-auto mb-3 text-[var(--dim)]" />
        <p className="text-sm text-[var(--ink)] font-medium">
          {storage.phase === "ready"
            ? "Drag and drop files here"
            : storage.phase === "checking"
              ? "Storage check in progress"
              : "Uploads unavailable until storage is ready"}
        </p>
        <p
          className={`text-xs mt-1 ${
            storage.phase === "blocked" ? "text-[var(--red)]" : "text-[var(--muted)]"
          }`}
        >
          {storage.phase === "ready"
            ? `or click to browse · ${storage.label}${
                storage.quarantineRequired
                  ? storage.automaticReleaseReady
                    ? " · security scan required"
                    : " · uploads remain quarantined until scanned"
                  : ""
              }`
            : storage.message}
        </p>
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          multiple={!revisionTarget}
          aria-label="Upload files"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {items.length > 0 && (
        <div
          className={variant === "cockpit" ? styles.dock : ""}
          role={variant === "cockpit" ? "presentation" : undefined}
        >
          <section
            className={variant === "cockpit" ? `${styles.panel} ${minimized ? styles.minimized : ""}` : "contents"}
            role={variant === "cockpit" ? "dialog" : undefined}
            aria-modal={variant === "cockpit" ? false : undefined}
            aria-labelledby={variant === "cockpit" ? "asset-upload-title" : undefined}
            aria-live={variant === "cockpit" ? "polite" : undefined}
          >
            {variant === "cockpit" ? (
              <>
                <div className={styles.toolbar}>
                  <span>CO-VIDEOPRO · TRANSFERS</span>
                  <button type="button" aria-label={uploadTerminal ? "Close upload panel" : minimized ? "Expand uploads" : "Minimize uploads"}
                    onClick={() => uploadTerminal ? setItems([]) : setMinimized(!minimized)}>
                    {uploadTerminal ? <X size={18} /> : minimized ? "+" : "−"}
                  </button>
                </div>
                <div className="cockpit-upload-icon">
                  {activeUploadCount > 0 ? (
                    <Upload size={28} />
                  ) : failedUploadCount > 0 ? (
                    <AlertCircle size={28} />
                  ) : (
                    <CheckCircle size={28} />
                  )}
                </div>

                <h2 id="asset-upload-title">{uploadTitle}</h2>
                <strong title={items.map((item) => item.file.name).join(", ")}>
                  {items.length === 1 ? items[0].file.name : `${items.length} files`}
                </strong>
                <div
                  className="cockpit-upload-progress"
                  role="progressbar"
                  aria-label="Total upload progress"
                  aria-valuemin={0}
                  aria-valuemax={totalBytes}
                  aria-valuenow={uploadedBytes}
                  aria-valuetext={`${overallByteProgress} (${overallProgress}%)`}
                >
                  <span style={{ width: `${overallProgress}%` }} />
                </div>
                <div className="cockpit-upload-progress-copy">
                  <span>{uploadMessage} {overallByteProgress}</span>
                  <b>{overallProgress}%</b>
                </div>
              </>
            ) : null}

            <div className={`space-y-2 cockpit-upload-queue ${styles.queue}`}>
              {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 p-3 rounded-[var(--radius-sm)] bg-[var(--surface)] border border-[var(--border)]"
            >
              <FileIcon size={16} className="text-[var(--dim)] flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-[var(--ink)] truncate">
                    {item.file.name}
                    {WARN_EXT.has(ext(item.file.name)) && (
                      <AlertCircle
                        size={12}
                        className="inline ml-1 text-[var(--orange)]"
                      />
                    )}
                  </span>
                  <span className="text-xs text-[var(--dim)] ml-2 flex-shrink-0 whitespace-nowrap">
                        {formatFileSize(item.bytesUploaded)} / {formatFileSize(item.bytesTotal)}
                    {" · "}
                    <span
                      className={
                        item.status === "error"
                          ? "text-[var(--red)]"
                          : item.status === "done"
                            ? "text-[var(--green)]"
                            : item.status === "processing"
                              ? "text-[var(--accent)]"
                              : item.status === "quarantined"
                                ? "text-[var(--orange)]"
                                : item.status === "rejected"
                                  ? "text-[var(--red)]"
                              : ""
                      }
                    >
                      {statusLabel(item.status, item.progress)}
                    </span>
                  </span>
                </div>
                {(item.status === "uploading" ||
                  item.status === "pausing" ||
                  item.status === "paused" ||
                  item.status === "cancelling" ||
                  item.status === "processing") && (
                  <div
                    className="w-full bg-[var(--surface-2)] rounded-full h-1.5"
                    role="progressbar"
                    aria-label={`${item.file.name} upload progress`}
                    aria-valuemin={0}
                    aria-valuemax={item.bytesTotal}
                    aria-valuenow={item.bytesUploaded}
                    aria-valuetext={`${formatFileSize(item.bytesUploaded)} of ${formatFileSize(item.bytesTotal)} uploaded (${item.progress}%)`}
                  >
                    <div
                      className={`h-1.5 rounded-full transition-all ${
                        item.status === "processing"
                          ? "bg-[var(--accent)] animate-pulse"
                          : item.status === "paused" || item.status === "pausing"
                            ? "bg-[var(--muted)]"
                            : "bg-[var(--accent)]"
                      }`}
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                )}
                {item.error && (
                  <p className="text-xs text-[var(--red)]" role="alert">{item.error}</p>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {item.status === "done" ? (
                  <CheckCircle
                    size={16}
                    className="text-[var(--green)]"
                  />
                ) : item.status === "quarantined" ? (
                  <>
                    <AlertCircle
                      size={16}
                      className="text-[var(--orange)]"
                      aria-label="Security scan pending"
                    />
                    {item.scanRetryable ? (
                      <button
                        type="button"
                        onClick={() => void retrySecurityScan(item.id)}
                        className="text-[var(--dim)] hover:text-[var(--accent)]"
                        title="Retry security scan using retained verified bytes"
                        aria-label="Retry security scan"
                      >
                        <RotateCcw size={16} />
                      </button>
                    ) : null}
                        <button
                          type="button"
                          onClick={() => cancelUpload(item.id)}
                          className="text-[var(--dim)] hover:text-[var(--red)]"
                          title="Cancel quarantined upload"
                          aria-label="Cancel quarantined upload"
                    >
                      <X size={16} />
                    </button>
                  </>
                ) : item.status === "rejected" ? (
                  <>
                    <AlertCircle
                      size={16}
                      className="text-[var(--red)]"
                      aria-label="Security scan rejected"
                    />
                    <button
                      type="button"
                      onClick={() => cancelUpload(item.id)}
                      className="text-[var(--dim)] hover:text-[var(--red)]"
                      title="Remove rejected upload"
                      aria-label="Remove rejected upload"
                    >
                      <X size={16} />
                    </button>
                  </>
                ) : item.status === "error" ? (
                  <>
                    {item.catalogPending ? (
                      <button
                        type="button"
                        onClick={() => void retrySecurityScan(item.id)}
                        className="text-[var(--dim)] hover:text-[var(--accent)]"
                        title="Check saved upload"
                        aria-label="Check upload"
                      >
                        <RotateCcw size={16} />
                      </button>
                    ) : (
                        <button
                          type="button"
                          onClick={() => retryUpload(item.id)}
                          className="text-[var(--dim)] hover:text-[var(--accent)]"
                          title="Retry upload"
                          aria-label="Retry upload"
                    >
                      <RotateCcw size={16} />
                    </button>
                    )}
                        <button
                          type="button"
                          onClick={() => removeUploadItem(item.id)}
                          className="text-[var(--dim)] hover:text-[var(--red)]"
                          title="Remove"
                          aria-label="Remove failed upload"
                    >
                      <X size={16} />
                    </button>
                  </>
                ) : item.status === "uploading" ? (
                  <>
                        <button
                          type="button"
                          onClick={() => pauseUpload(item.id)}
                          className="text-[var(--dim)] hover:text-[var(--accent)]"
                          title="Pause upload"
                          aria-label="Pause upload"
                    >
                      <Pause size={14} />
                    </button>
                        <button
                          type="button"
                          onClick={() => cancelUpload(item.id)}
                          className="text-[var(--dim)] hover:text-[var(--red)]"
                          title="Cancel upload"
                          aria-label="Cancel upload"
                    >
                      <X size={16} />
                    </button>
                  </>
                ) : item.status === "paused" ? (
                  <>
                        <button
                          type="button"
                          onClick={() => resumeUpload(item.id)}
                          className="text-[var(--dim)] hover:text-[var(--accent)]"
                          title="Resume upload"
                          aria-label="Resume upload"
                    >
                      <Play size={14} />
                    </button>
                        <button
                          type="button"
                          onClick={() => cancelUpload(item.id)}
                          className="text-[var(--dim)] hover:text-[var(--red)]"
                          title="Cancel upload"
                          aria-label="Cancel upload"
                    >
                      <X size={16} />
                    </button>
                  </>
                    ) : item.status === "processing" || item.status === "pausing" || item.status === "cancelling" ? (
                      <div className="w-4 h-4 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <button
                        type="button"
                        onClick={() => cancelUpload(item.id)}
                        className="text-[var(--dim)] hover:text-[var(--red)]"
                        title="Cancel"
                        aria-label="Cancel upload"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>
              ))}
            </div>

            {variant === "cockpit" ? (
              <footer>
                <span>
                  {receivedUploadCount} of {items.length} file{items.length === 1 ? "" : "s"} received
                </span>
                {uploadTerminal ? (
                  <button type="button" onClick={() => setItems([])}>
                    Back to project
                  </button>
                ) : (
                  <small>Uploads can be paused, resumed, or cancelled per file.</small>
                )}
              </footer>
            ) : null}
          </section>
        </div>
      )}
    </div>
  );
}
