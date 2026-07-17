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
  | "paused"
  | "processing"
  | "quarantined"
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
};

const WARN_EXT = new Set(["exe", "bat", "sh", "cmd", "msi"]);
const CHUNK_SIZE = 50 * 1024 * 1024; // 50 MB chunks

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

export default function AssetUpload({
  projectId,
  folderId,
  inputId,
  onUploadComplete,
  variant = "dropzone",
}: {
  projectId: string;
  folderId?: string;
  inputId?: string;
  onUploadComplete: (assets: Asset[]) => void;
  variant?: "dropzone" | "cockpit";
}) {
  const [items, setItems] = useState<UploadItem[]>([]);
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

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/storage/readiness", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as StorageReadinessResponse;
        if (!response.ok || !payload.readyForWrites) {
          const failure = payload.checks?.find((check) => check.status === "fail");
          throw new Error(failure?.message || payload.error || "Storage is unavailable");
        }
        const maxUploadBytes = Number(payload.limits?.maxUploadBytes);
        const maxChunkBytes = Number(payload.limits?.maxChunkBytes);
        setStorage({
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
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setStorage((current) => ({
          ...current,
          phase: "blocked",
          message: error instanceof Error ? error.message : "Storage is unavailable",
        }));
      });
    return () => controller.abort();
  }, []);

  const updateItem = useCallback(
    (id: string, patch: Partial<UploadItem>) => {
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, ...patch } : i))
      );
    },
    []
  );

  const startTusUpload = useCallback(
    (item: UploadItem) => {
      if (storage.phase !== "ready") {
        updateItem(item.id, {
          status: "error",
          error: storage.message,
        });
        return;
      }
      let serverState = "receiving";
      let originalReleaseReady = false;
      const upload = new tus.Upload(item.file, {
        endpoint: "/api/upload/tus",
        chunkSize: storage.maxChunkBytes,
        retryDelays: [0, 1000, 3000, 5000, 10000],
        removeFingerprintOnSuccess: true,
        metadata: {
          filename: item.file.name,
          filetype: item.file.type || "application/octet-stream",
          projectId,
          idempotencyKey: item.attemptId,
          version: "1",
          ...(folderId ? { folderId } : {}),
        },
        onAfterResponse(request, response) {
          void request;
          serverState = response.getHeader("Upload-State") || serverState;
          originalReleaseReady =
            response.getHeader("Upload-Original-Ready") === "true";
        },
        onProgress(bytesUploaded, bytesTotal) {
          const progress = Math.round((bytesUploaded / bytesTotal) * 100);
          updateItem(item.id, {
            progress,
            bytesUploaded,
            bytesTotal,
            status: "uploading",
          });
        },
        onSuccess() {
          const quarantined =
            serverState !== "committed" || !originalReleaseReady;
          updateItem(item.id, {
            status: quarantined ? "quarantined" : "done",
            progress: 100,
          });
          onUploadComplete([]);
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
          // Don't retry on 4xx client errors (except 409 offset conflict — tus will fix itself)
          if (
            status &&
            status >= 400 &&
            status < 500 &&
            ![409, 423, 429].includes(status)
          ) {
            return false;
          }
          return true;
        },
      });

      updateItem(item.id, {
        tusUpload: upload,
        status: "uploading",
      });

      // Check for previous uploads to resume
      void upload
        .findPreviousUploads()
        .then((previousUploads) => {
          if (previousUploads.length > 0) {
            upload.resumeFromPreviousUpload(previousUploads[0]);
          }
          upload.start();
        })
        .catch((error: unknown) => {
          updateItem(item.id, {
            status: "error",
            error: error instanceof Error ? error.message : "Upload resume failed",
          });
        });
    },
    [projectId, folderId, onUploadComplete, storage, updateItem]
  );

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const newItems: UploadItem[] = Array.from(files).map((file) => {
        const tooLarge = storage.maxUploadBytes > 0 && file.size > storage.maxUploadBytes;
        const id = crypto.randomUUID();
        return {
          file,
          id,
          attemptId: id,
          progress: 0,
          bytesUploaded: 0,
          bytesTotal: file.size,
          status: tooLarge ? ("error" as const) : ("pending" as const),
          ...(tooLarge
            ? { error: `File exceeds the ${formatFileSize(storage.maxUploadBytes)} limit` }
            : {}),
        };
      });
      setItems((prev) => [...prev, ...newItems]);
      newItems
        .filter((item) => item.status === "pending")
        .forEach((item) => startTusUpload(item));
    },
    [startTusUpload, storage.maxUploadBytes]
  );

  const pauseUpload = useCallback(
    (id: string) => {
      setItems((prev) => {
        const item = prev.find((i) => i.id === id);
        if (item?.tusUpload) {
          item.tusUpload.abort();
        }
        return prev.map((i) =>
          i.id === id ? { ...i, status: "paused" as const } : i
        );
      });
    },
    []
  );

  const resumeUpload = useCallback(
    (id: string) => {
      setItems((prev) => {
        const item = prev.find((i) => i.id === id);
        if (item?.tusUpload) {
          item.tusUpload.start();
        }
        return prev.map((i) =>
          i.id === id ? { ...i, status: "uploading" as const } : i
        );
      });
    },
    []
  );

  const retryUpload = useCallback(
    (id: string) => {
      const item = items.find((i) => i.id === id);
      if (item) {
        const retryItem: UploadItem = {
          ...item,
          attemptId: crypto.randomUUID(),
          progress: 0,
          bytesUploaded: 0,
          status: "pending",
          error: undefined,
          tusUpload: undefined,
        };
        updateItem(id, retryItem);
        const restart = () => startTusUpload(retryItem);
        if (item.tusUpload) {
          void item.tusUpload.abort(true).catch(() => undefined).finally(restart);
        } else {
          restart();
        }
      }
    },
    [items, startTusUpload, updateItem]
  );

  const cancelUpload = useCallback(
    (id: string) => {
      setItems((prev) => {
        const item = prev.find((i) => i.id === id);
        if (item?.tusUpload) {
          item.tusUpload.abort(true); // true = terminate on server
        }
        return prev.filter((i) => i.id !== id);
      });
    },
    []
  );

  const ext = (name: string) => name.split(".").pop()?.toLowerCase() || "";

  const statusLabel = (status: UploadStatus, progress: number) => {
    switch (status) {
      case "pending":
        return "Preparing...";
      case "uploading":
        return `${progress}%`;
      case "paused":
        return "Paused";
      case "processing":
        return "Processing...";
      case "quarantined":
        return "Security scan pending";
      case "done":
        return "Complete";
      case "error":
        return "Failed";
    }
  };

  const activeUploadCount = items.filter((item) =>
    ["pending", "uploading", "paused", "processing"].includes(item.status),
  ).length;
  const receivedUploadCount = items.filter((item) =>
    item.status === "done" || item.status === "quarantined",
  ).length;
  const failedUploadCount = items.filter((item) => item.status === "error").length;
  const overallProgress = items.length > 0
    ? Math.round(items.reduce((sum, item) => sum + item.progress, 0) / items.length)
    : 0;
  const uploadTerminal = items.length > 0 && activeUploadCount === 0;
  const uploadTitle = activeUploadCount > 0
    ? "Preparing your media"
    : failedUploadCount > 0
      ? "Upload needs attention"
      : items.some((item) => item.status === "quarantined")
        ? "Upload received"
        : "Ready for review";
  const uploadMessage = activeUploadCount > 0
    ? "Keep this window open while Co‑ProVideo transfers and prepares the review asset."
    : failedUploadCount > 0
      ? "Review the failed item below, then retry or remove it."
      : items.some((item) => item.status === "quarantined")
        ? "The original is stored safely and will become available after its security scan."
        : "The uploaded media is ready in this project.";

  return (
    <div className="space-y-4">
      <div
        className={`${variant === "cockpit" ? "hidden" : ""} border-2 border-dashed rounded-[var(--radius)] p-8 text-center transition-colors ${
          storage.phase === "ready" ? "cursor-pointer" : "cursor-not-allowed opacity-70"
        } ${
          dragOver && storage.phase === "ready"
            ? "border-[var(--accent)] bg-[var(--accent)]/5"
            : "border-[var(--border)] hover:border-[var(--muted)]"
        }`}
        role="button"
        tabIndex={storage.phase === "ready" ? 0 : -1}
        aria-label="Select files to upload"
        aria-disabled={storage.phase !== "ready"}
        onDragOver={(e) => {
          e.preventDefault();
          if (storage.phase === "ready") setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (storage.phase === "ready" && e.dataTransfer.files.length) {
            addFiles(e.dataTransfer.files);
          }
        }}
        onClick={() => {
          if (storage.phase === "ready") inputRef.current?.click();
        }}
        onKeyDown={(event) => {
          if (
            storage.phase === "ready" &&
            (event.key === "Enter" || event.key === " ")
          ) {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        <Upload size={32} className="mx-auto mb-3 text-[var(--dim)]" />
        <p className="text-sm text-[var(--ink)] font-medium">
          {storage.phase === "ready" ? "Drag and drop files here" : "Uploads unavailable"}
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
          multiple
          disabled={storage.phase !== "ready"}
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {items.length > 0 && (
        <div
          className={variant === "cockpit" ? "cockpit-upload-overlay" : ""}
          role={variant === "cockpit" ? "presentation" : undefined}
        >
          <section
            className={variant === "cockpit" ? "" : "contents"}
            role={variant === "cockpit" ? "dialog" : undefined}
            aria-modal={variant === "cockpit" ? true : undefined}
            aria-labelledby={variant === "cockpit" ? "asset-upload-title" : undefined}
            aria-live={variant === "cockpit" ? "polite" : undefined}
          >
            {variant === "cockpit" ? (
              <>
                <div className="cockpit-upload-icon">
                  {activeUploadCount > 0 ? (
                    <Upload size={28} />
                  ) : failedUploadCount > 0 ? (
                    <AlertCircle size={28} />
                  ) : (
                    <CheckCircle size={28} />
                  )}
                </div>
                <p>Media ingest</p>
                <h2 id="asset-upload-title">{uploadTitle}</h2>
                <strong title={items.map((item) => item.file.name).join(", ")}>
                  {items.length === 1 ? items[0].file.name : `${items.length} files`}
                </strong>
                <div className="cockpit-upload-progress" aria-label={`Upload ${overallProgress}% complete`}>
                  <span style={{ width: `${overallProgress}%` }} />
                </div>
                <div className="cockpit-upload-progress-copy">
                  <span>{uploadMessage}</span>
                  <b>{overallProgress}%</b>
                </div>
              </>
            ) : null}

            <div className="space-y-2 cockpit-upload-queue">
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
                    {item.status === "uploading" || item.status === "paused"
                      ? `${formatFileSize(item.bytesUploaded)} / ${formatFileSize(item.bytesTotal)}`
                      : formatFileSize(item.file.size)}
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
                              : ""
                      }
                    >
                      {statusLabel(item.status, item.progress)}
                    </span>
                  </span>
                </div>
                {(item.status === "uploading" ||
                  item.status === "paused" ||
                  item.status === "processing") && (
                  <div className="w-full bg-[var(--surface-2)] rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all ${
                        item.status === "processing"
                          ? "bg-[var(--accent)] animate-pulse"
                          : item.status === "paused"
                            ? "bg-[var(--muted)]"
                            : "bg-[var(--accent)]"
                      }`}
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                )}
                {item.status === "error" && (
                  <p className="text-xs text-[var(--red)]">{item.error}</p>
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
                    <button
                      onClick={() => cancelUpload(item.id)}
                      className="text-[var(--dim)] hover:text-[var(--red)]"
                      title="Cancel quarantined upload"
                    >
                      <X size={16} />
                    </button>
                  </>
                ) : item.status === "error" ? (
                  <>
                    <button
                      onClick={() => retryUpload(item.id)}
                      className="text-[var(--dim)] hover:text-[var(--accent)]"
                      title="Retry upload"
                    >
                      <RotateCcw size={16} />
                    </button>
                    <button
                      onClick={() => cancelUpload(item.id)}
                      className="text-[var(--dim)] hover:text-[var(--red)]"
                      title="Remove"
                    >
                      <X size={16} />
                    </button>
                  </>
                ) : item.status === "uploading" ? (
                  <>
                    <button
                      onClick={() => pauseUpload(item.id)}
                      className="text-[var(--dim)] hover:text-[var(--accent)]"
                      title="Pause upload"
                    >
                      <Pause size={14} />
                    </button>
                    <button
                      onClick={() => cancelUpload(item.id)}
                      className="text-[var(--dim)] hover:text-[var(--red)]"
                      title="Cancel upload"
                    >
                      <X size={16} />
                    </button>
                  </>
                ) : item.status === "paused" ? (
                  <>
                    <button
                      onClick={() => resumeUpload(item.id)}
                      className="text-[var(--dim)] hover:text-[var(--accent)]"
                      title="Resume upload"
                    >
                      <Play size={14} />
                    </button>
                    <button
                      onClick={() => cancelUpload(item.id)}
                      className="text-[var(--dim)] hover:text-[var(--red)]"
                      title="Cancel upload"
                    >
                      <X size={16} />
                    </button>
                  </>
                ) : item.status === "processing" ? (
                  <div className="w-4 h-4 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                ) : (
                  <button
                    onClick={() => cancelUpload(item.id)}
                    className="text-[var(--dim)] hover:text-[var(--red)]"
                    title="Cancel"
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
                    Close
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
