"use client";

import { useEffect, useRef, useState } from "react";
import {
  CircleCheck,
  FileUp,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { DetailedError, Upload } from "tus-js-client";

import {
  formatIntakeUploadBytes,
  isPublicInquiryUploadMimeType,
  PUBLIC_INQUIRY_UPLOAD_CHUNK_BYTES,
  PUBLIC_INQUIRY_UPLOAD_MAX_BYTES,
  PUBLIC_INQUIRY_UPLOAD_MAX_FILES,
  PUBLIC_INQUIRY_UPLOAD_MAX_TOTAL_BYTES,
  PUBLIC_INQUIRY_UPLOAD_MIME_TYPES,
  type PublicInquiryUploadMimeType,
} from "@/lib/crm/intake-upload-shared";
import styles from "./IntakeAttachments.module.css";

export interface IntakeAttachmentClaim {
  batchToken: string | null;
  attachments: Array<{
    attachmentId: string;
    contentHash: `sha256:${string}`;
  }>;
}

export interface IntakeAttachmentGate {
  busy: boolean;
  hasErrors: boolean;
  count: number;
}

type AttachmentStatus =
  | "queued"
  | "hashing"
  | "uploading"
  | "removing"
  | "screening"
  | "ready"
  | "error";

interface AttachmentItem {
  localId: string;
  idempotencyKey: string;
  file: File;
  mimeType: PublicInquiryUploadMimeType;
  status: AttachmentStatus;
  progress: number;
  sha256: string | null;
  attachmentId: string | null;
  uploadUrl: string | null;
  error: string | null;
}

const ACCEPT = PUBLIC_INQUIRY_UPLOAD_MIME_TYPES.join(",");
const CLAIMABLE_UPLOAD_STATES = new Set(["quarantined", "committed", "bound"]);

const EXTENSION_MIME_TYPES: Record<string, PublicInquiryUploadMimeType> = {
  ".aac": "audio/aac",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".flac": "audio/flac",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".m4a": "audio/m4a",
  ".m4v": "video/x-m4v",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".ogg": "audio/ogg",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".txt": "text/plain",
  ".wav": "audio/wav",
  ".webm": "video/webm",
  ".webp": "image/webp",
};

function createBatchToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `iatb_${bytesToHex(bytes)}`;
}

function mimeTypeFor(file: File): PublicInquiryUploadMimeType | null {
  const declared = file.type.trim().toLowerCase();
  if (declared && isPublicInquiryUploadMimeType(declared)) return declared;
  const extension = file.name.toLowerCase().match(/\.[^.]+$/)?.[0];
  return extension ? (EXTENSION_MIME_TYPES[extension] ?? null) : null;
}

function uploadErrorMessage(error: Error | DetailedError) {
  if (error instanceof DetailedError && error.originalResponse) {
    try {
      const body = JSON.parse(error.originalResponse.getBody()) as { error?: unknown };
      if (typeof body.error === "string" && body.error.trim()) return body.error;
    } catch {
      // The transport message below is still actionable when the body is not JSON.
    }
  }
  return error.message || "The upload could not be completed.";
}

async function hashFile(
  file: File,
  onProgress: (progress: number) => void,
): Promise<string> {
  const digest = sha256.create();
  for (let offset = 0; offset < file.size; offset += PUBLIC_INQUIRY_UPLOAD_CHUNK_BYTES) {
    const bytes = new Uint8Array(
      await file
        .slice(offset, Math.min(file.size, offset + PUBLIC_INQUIRY_UPLOAD_CHUNK_BYTES))
        .arrayBuffer(),
    );
    digest.update(bytes);
    onProgress(Math.min(100, Math.round(((offset + bytes.byteLength) / file.size) * 100)));
  }
  return bytesToHex(digest.digest());
}

export default function IntakeAttachments({
  formKey,
  demoMode,
  onClaimChange,
  onGateChange,
}: {
  formKey: string;
  demoMode: boolean;
  onClaimChange: (claim: IntakeAttachmentClaim) => void;
  onGateChange: (gate: IntakeAttachmentGate) => void;
}) {
  const [items, setItems] = useState<AttachmentItem[]>([]);
  const [selectionError, setSelectionError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const batchTokenRef = useRef<string | null>(null);
  const uploadsRef = useRef(new Map<string, Upload>());
  const cancelledRef = useRef(new Set<string>());
  const unmountedRef = useRef(false);

  useEffect(() => {
    const claimable = items.filter(
      (item) =>
        (item.status === "ready" || item.status === "screening") &&
        item.attachmentId &&
        item.sha256,
    );
    onClaimChange({
      batchToken: claimable.length > 0 ? batchTokenRef.current : null,
      attachments: claimable.map((item) => ({
        attachmentId: item.attachmentId!,
        contentHash: `sha256:${item.sha256!}` as const,
      })),
    });
    onGateChange({
      busy: items.some((item) =>
        ["queued", "hashing", "uploading", "removing"].includes(item.status),
      ),
      hasErrors: items.some((item) => item.status === "error"),
      count: claimable.length,
    });
  }, [items, onClaimChange, onGateChange]);

  useEffect(() => {
    const uploads = uploadsRef.current;
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      for (const upload of uploads.values()) void upload.abort(false);
    };
  }, []);

  function updateItem(localId: string, update: Partial<AttachmentItem>) {
    setItems((current) =>
      current.map((item) => (item.localId === localId ? { ...item, ...update } : item)),
    );
  }

  async function processItem(item: AttachmentItem) {
    try {
      updateItem(item.localId, { status: "hashing", progress: 0, error: null });
      const fileSha256 =
        item.sha256 ??
        (await hashFile(item.file, (progress) => updateItem(item.localId, { progress })));
      if (unmountedRef.current || cancelledRef.current.has(item.localId)) return;
      updateItem(item.localId, {
        sha256: fileSha256,
        status: "uploading",
        progress: 0,
      });

      if (demoMode) {
        for (const progress of [18, 42, 68, 88, 100]) {
          await new Promise((resolve) => window.setTimeout(resolve, 90));
          updateItem(item.localId, { progress });
        }
        updateItem(item.localId, {
          status: "ready",
          attachmentId: crypto.randomUUID(),
          progress: 100,
        });
        return;
      }

      const batchToken = batchTokenRef.current;
      if (!batchToken) throw new Error("Attachment upload authority is unavailable.");
      let attachmentId: string | null = null;
      let observedSha256: string | null = null;
      let uploadState = "receiving";
      const upload = new Upload(item.file, {
        endpoint: "/api/intake/uploads/tus",
        chunkSize: PUBLIC_INQUIRY_UPLOAD_CHUNK_BYTES,
        retryDelays: [0, 1_000, 3_000, 5_000],
        removeFingerprintOnSuccess: true,
        storeFingerprintForResuming: false,
        headers: { "X-Intake-Upload-Capability": batchToken },
        metadata: {
          formKey,
          idempotencyKey: item.idempotencyKey,
          filename: item.file.name,
          filetype: item.mimeType,
          sha256: fileSha256,
        },
        onProgress(bytesSent, bytesTotal) {
          updateItem(item.localId, {
            status: "uploading",
            progress: bytesTotal > 0 ? Math.round((bytesSent / bytesTotal) * 100) : 0,
          });
        },
        onUploadUrlAvailable() {
          updateItem(item.localId, { uploadUrl: upload.url });
        },
        onAfterResponse(_request, response) {
          attachmentId = response.getHeader("Upload-Attachment-Id") ?? attachmentId;
          observedSha256 = response.getHeader("Upload-SHA256") ?? observedSha256;
          uploadState = response.getHeader("Upload-State") ?? uploadState;
        },
        onError(error) {
          uploadsRef.current.delete(item.localId);
          updateItem(item.localId, {
            status: "error",
            uploadUrl: upload.url,
            error: uploadErrorMessage(error),
          });
        },
        onSuccess({ lastResponse }) {
          uploadsRef.current.delete(item.localId);
          attachmentId =
            lastResponse.getHeader("Upload-Attachment-Id") ?? attachmentId;
          observedSha256 = lastResponse.getHeader("Upload-SHA256") ?? observedSha256;
          uploadState = lastResponse.getHeader("Upload-State") ?? uploadState;
          if (!attachmentId || observedSha256 !== fileSha256) {
            updateItem(item.localId, {
              status: "error",
              error: "The upload completed without matching durable checksum evidence.",
            });
            return;
          }
          if (!CLAIMABLE_UPLOAD_STATES.has(uploadState)) {
            updateItem(item.localId, {
              status: "error",
              error:
                uploadState === "rejected"
                  ? "This file did not pass the upload safety checks."
                  : "The upload finished without a claimable storage receipt.",
            });
            return;
          }
          updateItem(item.localId, {
            status: uploadState === "quarantined" ? "screening" : "ready",
            progress: 100,
            attachmentId,
            uploadUrl: upload.url,
            error: null,
          });
        },
      });
      uploadsRef.current.set(item.localId, upload);
      upload.start();
    } catch (error) {
      updateItem(item.localId, {
        status: "error",
        error: error instanceof Error ? error.message : "The upload could not be prepared.",
      });
    }
  }

  async function addFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    setSelectionError("");
    const selected = Array.from(fileList);
    if (inputRef.current) inputRef.current.value = "";
    const existingBytes = items.reduce((total, item) => total + item.file.size, 0);
    if (items.length + selected.length > PUBLIC_INQUIRY_UPLOAD_MAX_FILES) {
      setSelectionError(`Add no more than ${PUBLIC_INQUIRY_UPLOAD_MAX_FILES} files.`);
      return;
    }
    if (
      existingBytes + selected.reduce((total, file) => total + file.size, 0) >
      PUBLIC_INQUIRY_UPLOAD_MAX_TOTAL_BYTES
    ) {
      setSelectionError(
        `Attachments may total up to ${formatIntakeUploadBytes(PUBLIC_INQUIRY_UPLOAD_MAX_TOTAL_BYTES)}.`,
      );
      return;
    }

    const additions: AttachmentItem[] = [];
    for (const file of selected) {
      const mimeType = mimeTypeFor(file);
      if (!mimeType) {
        setSelectionError(`${file.name} is not an accepted production file type.`);
        continue;
      }
      if (file.size <= 0 || file.size > PUBLIC_INQUIRY_UPLOAD_MAX_BYTES) {
        setSelectionError(
          `${file.name} must be smaller than ${formatIntakeUploadBytes(PUBLIC_INQUIRY_UPLOAD_MAX_BYTES)}.`,
        );
        continue;
      }
      const duplicate = [...items, ...additions].some(
        (item) =>
          item.file.name === file.name &&
          item.file.size === file.size &&
          item.file.lastModified === file.lastModified,
      );
      if (duplicate) continue;
      additions.push({
        localId: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
        file,
        mimeType,
        status: "queued",
        progress: 0,
        sha256: null,
        attachmentId: null,
        uploadUrl: null,
        error: null,
      });
    }
    if (additions.length === 0) return;
    batchTokenRef.current ??= createBatchToken();
    setItems((current) => [...current, ...additions]);
    for (let index = 0; index < additions.length; index += 2) {
      await Promise.all(additions.slice(index, index + 2).map(processItem));
    }
  }

  async function removeItem(item: AttachmentItem) {
    cancelledRef.current.add(item.localId);
    updateItem(item.localId, { status: "removing", error: null });
    const active = uploadsRef.current.get(item.localId);
    if (active) {
      await active.abort(false).catch(() => undefined);
      uploadsRef.current.delete(item.localId);
    }
    const uploadUrl = active?.url ?? item.uploadUrl;
    const batchToken = batchTokenRef.current;
    if (!demoMode && uploadUrl && batchToken) {
      try {
        await Upload.terminate(uploadUrl, {
          headers: { "X-Intake-Upload-Capability": batchToken },
        });
      } catch (error) {
        const alreadyMissing =
          error instanceof DetailedError &&
          error.originalResponse?.getStatus() === 404;
        if (!alreadyMissing) {
          cancelledRef.current.delete(item.localId);
          updateItem(item.localId, {
            status: "error",
            error: "The file could not be removed from secure storage. Try again.",
          });
          return;
        }
      }
    }
    setItems((current) => current.filter((candidate) => candidate.localId !== item.localId));
  }

  return (
    <section className={styles.attachments} aria-labelledby="intake-attachments-title">
      <header>
        <div>
          <span className={styles.icon}><FileUp size={17} /></span>
          <div>
            <strong id="intake-attachments-title">Reference files</strong>
            <small>Video, audio, images, scripts, decks, and PDFs</small>
          </div>
        </div>
        <span>{items.length}/{PUBLIC_INQUIRY_UPLOAD_MAX_FILES}</span>
      </header>

      <input
        ref={inputRef}
        className={styles.fileInput}
        type="file"
        accept={ACCEPT}
        multiple
        onChange={(event) => void addFiles(event.target.files)}
      />
      <button
        type="button"
        className={styles.addButton}
        onClick={() => inputRef.current?.click()}
        disabled={items.length >= PUBLIC_INQUIRY_UPLOAD_MAX_FILES}
      >
        <FileUp size={16} /> Add files
      </button>
      <p className={styles.limit}>
        {formatIntakeUploadBytes(PUBLIC_INQUIRY_UPLOAD_MAX_BYTES)} each, {formatIntakeUploadBytes(PUBLIC_INQUIRY_UPLOAD_MAX_TOTAL_BYTES)} total
        {demoMode ? <b>Demo upload simulation</b> : null}
      </p>

      {selectionError ? <p className={styles.selectionError} role="alert">{selectionError}</p> : null}
      {items.length > 0 ? (
        <ul className={styles.fileList} aria-live="polite">
          {items.map((item) => (
            <li key={item.localId} data-status={item.status}>
              <StatusIcon status={item.status} />
              <div className={styles.fileDetail}>
                <div><strong>{item.file.name}</strong><span>{formatIntakeUploadBytes(item.file.size)}</span></div>
                <small>{statusLabel(item)}</small>
                {item.status === "hashing" || item.status === "uploading" ? (
                  <span
                    className={styles.fileProgress}
                    role="progressbar"
                    aria-label={`${item.file.name} progress`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={item.progress}
                  >
                    <i style={{ width: `${item.progress}%` }} />
                  </span>
                ) : null}
                {item.error ? <p role="alert">{item.error}</p> : null}
              </div>
              <div className={styles.fileActions}>
                {item.status === "error" ? (
                  <button type="button" title="Retry upload" onClick={() => {
                    cancelledRef.current.delete(item.localId);
                    void processItem(item);
                  }} aria-label={`Retry ${item.file.name}`}>
                    <RefreshCw size={15} />
                  </button>
                ) : null}
                <button
                  type="button"
                  title="Remove file"
                  aria-label={`Remove ${item.file.name}`}
                  disabled={item.status === "removing"}
                  onClick={() => void removeItem(item)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function statusLabel(item: AttachmentItem) {
  if (item.status === "queued") return "Waiting";
  if (item.status === "hashing") return `Preparing checksum · ${item.progress}%`;
  if (item.status === "uploading") return `Uploading · ${item.progress}%`;
  if (item.status === "removing") return "Removing from secure storage";
  if (item.status === "screening") return "Stored in quarantine · screening pending";
  if (item.status === "ready") return "Securely stored and ready to attach";
  return "Needs attention";
}

function StatusIcon({ status }: { status: AttachmentStatus }) {
  if (
    status === "hashing" ||
    status === "uploading" ||
    status === "queued" ||
    status === "removing"
  ) {
    return <span className={styles.statusIcon}><LoaderCircle size={16} /></span>;
  }
  if (status === "error") {
    return <span className={styles.statusIcon}><TriangleAlert size={16} /></span>;
  }
  if (status === "screening") {
    return <span className={styles.statusIcon}><ShieldCheck size={16} /></span>;
  }
  return <span className={styles.statusIcon}><CircleCheck size={16} /></span>;
}
