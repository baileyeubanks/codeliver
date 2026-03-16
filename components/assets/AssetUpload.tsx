"use client";

import { useState, useRef, useCallback } from "react";
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
  | "done"
  | "error";

type UploadItem = {
  file: File;
  id: string;
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

export default function AssetUpload({
  projectId,
  folderId,
  onUploadComplete,
}: {
  projectId: string;
  folderId?: string;
  onUploadComplete: (assets: Asset[]) => void;
}) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
      const upload = new tus.Upload(item.file, {
        endpoint: "/api/media/tus",
        chunkSize: CHUNK_SIZE,
        retryDelays: [0, 1000, 3000, 5000, 10000],
        metadata: {
          filename: item.file.name,
          filetype: item.file.type || "application/octet-stream",
          projectId: projectId,
          ...(folderId ? { folderId } : {}),
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
          // Upload complete — asset record created server-side
          updateItem(item.id, {
            status: "processing",
            progress: 100,
          });

          // Try to get asset info from the upload URL
          // The server creates the asset on finalization
          // Poll briefly for the asset to transition from processing to ready
          setTimeout(() => {
            updateItem(item.id, { status: "done" });
            // Trigger parent refresh
            onUploadComplete([]);
          }, 1000);
        },
        onError(error) {
          console.error("[tus] Upload error:", error);
          updateItem(item.id, {
            status: "error",
            error: error.message || "Upload failed",
          });
        },
        onShouldRetry(err, retryAttempt, options) {
          const status = (err as { originalResponse?: { getStatus(): number } })
            ?.originalResponse?.getStatus();
          // Don't retry on 4xx client errors (except 409 offset conflict — tus will fix itself)
          if (status && status >= 400 && status < 500 && status !== 409) {
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
      upload.findPreviousUploads().then((previousUploads) => {
        if (previousUploads.length > 0) {
          // Resume from the most recent previous upload
          upload.resumeFromPreviousUpload(previousUploads[0]);
        }
        upload.start();
      });
    },
    [projectId, folderId, onUploadComplete, updateItem]
  );

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const newItems: UploadItem[] = Array.from(files).map((file) => ({
        file,
        id: crypto.randomUUID(),
        progress: 0,
        bytesUploaded: 0,
        bytesTotal: file.size,
        status: "pending" as const,
      }));
      setItems((prev) => [...prev, ...newItems]);
      newItems.forEach((item) => startTusUpload(item));
    },
    [startTusUpload]
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
        updateItem(id, { status: "pending", progress: 0, error: undefined });
        startTusUpload(item);
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
      case "done":
        return "Complete";
      case "error":
        return "Failed";
    }
  };

  return (
    <div className="space-y-4">
      <div
        className={`border-2 border-dashed rounded-[var(--radius)] p-8 text-center transition-colors cursor-pointer ${
          dragOver
            ? "border-[var(--accent)] bg-[var(--accent)]/5"
            : "border-[var(--border)] hover:border-[var(--muted)]"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
      >
        <Upload size={32} className="mx-auto mb-3 text-[var(--dim)]" />
        <p className="text-sm text-[var(--ink)] font-medium">
          Drag and drop files here
        </p>
        <p className="text-xs text-[var(--muted)] mt-1">
          or click to browse · uploads resume automatically if interrupted
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {items.length > 0 && (
        <div className="space-y-2">
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
      )}
    </div>
  );
}
