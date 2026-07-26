"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Upload, X } from "lucide-react";
import { addDemoAssets, useDemoWorkspace } from "@/lib/demo/workspace-store";
import { putDemoMediaBlob } from "@/lib/demo/media-blob-store";
import { inspectSelectedMedia } from "@/lib/demo/media-inspection";
import { validateDemoUpload } from "@/lib/demo/upload-validation";
import { buildInternalDemoAssetHref } from "@/lib/demo/workspace";
import type { MediaAsset } from "@/components/projects/MediaCard";
import { useDialogFocus } from "./useDialogFocus";
import styles from "./GlobalUploadDialog.module.css";

interface GlobalUploadDialogProps {
  querySuffix: string;
  onClose: () => void;
}

interface UploadProgress {
  bytesStored: number;
  bytesTotal: number;
  percent: number;
  phase: string;
}

interface UploadEntry extends UploadProgress {
  assetId: string;
  fileName: string;
  storage: "persistent" | "session" | null;
  state: "queued" | "uploading" | "success" | "error";
  error?: string;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** unitIndex);
  const precision = value >= 10 || Number.isInteger(value) ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

function overallPercent(entries: UploadEntry[]): number {
  const bytesTotal = entries.reduce((total, entry) => total + entry.bytesTotal, 0);
  if (bytesTotal === 0) return 0;
  const bytesStored = entries.reduce((total, entry) => total + Math.min(entry.bytesStored, entry.bytesTotal), 0);
  return Math.round((bytesStored / bytesTotal) * 100);
}

function phaseLabel(phase: string): string {
  return phase.replace(/[-_]/g, " ").replace(/^./, (character) => character.toUpperCase());
}

function uploadErrorMessage(uploadError: unknown): string {
  if (uploadError instanceof Error) return uploadError.message;
  if (
    typeof uploadError === "object"
    && uploadError !== null
    && "message" in uploadError
    && typeof uploadError.message === "string"
  ) return uploadError.message;
  return "Upload failed.";
}

/**
 * The top command bar's Upload flow. Uploads always belong to a project —
 * the dialog asks which one, registers the files in the local workspace
 * (blob store + asset records), then lands in that project's cockpit.
 */
export default function GlobalUploadDialog({ querySuffix, onClose }: GlobalUploadDialogProps) {
  const workspace = useDemoWorkspace();
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadingRef = useRef(false);
  const [projectId, setProjectId] = useState(workspace.projects[0]?.id ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadEntries, setUploadEntries] = useState<UploadEntry[]>([]);
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const progress = overallPercent(uploadEntries);

  function requestClose() {
    if (!uploadingRef.current) onClose();
  }

  function updateUploadEntry(assetId: string, update: (entry: UploadEntry) => UploadEntry) {
    setUploadEntries((entries) => entries.map((entry) => entry.assetId === assetId ? update(entry) : entry));
  }

  useDialogFocus(true, dialogRef, requestClose, closeRef);

  async function handleUpload() {
    if (!projectId || files.length === 0 || uploadingRef.current) return;
    uploadingRef.current = true;
    setUploading(true);
    setError(null);
    setRegistrationComplete(false);
    try {
      const startedAt = Date.now();
      const assets: MediaAsset[] = files.map((file, index) => {
        const assetId = `local-upload-${startedAt}-${index}`;
        return {
          id: assetId,
          project_id: projectId,
          title: file.name.replace(/\.[^.]+$/, ""),
          file_type: "document",
          status: "draft",
          version_count: 1,
          reviewer_count: 0,
          reviewer_done: 0,
          comment_count: 0,
          created_at: new Date().toISOString(),
          href: buildInternalDemoAssetHref(projectId, assetId),
        };
      });

      // Validate every selection before a byte is stored — the picker hint
      // is bypassable, so unsupported files are rejected here truthfully.
      const validations = await Promise.all(files.map((file) => validateDemoUpload(file)));
      setUploadEntries(files.map((file, index) => {
        const validation = validations[index];
        return {
          assetId: assets[index].id,
          fileName: file.name,
          bytesStored: 0,
          bytesTotal: file.size,
          percent: 0,
          phase: validation.ok ? "queued" : "rejected",
          storage: null,
          state: validation.ok ? "queued" as const : "error" as const,
          error: validation.ok ? undefined : validation.reason,
        };
      }));
      const acceptedIndexes = files
        .map((_, index) => index)
        .filter((index) => validations[index].ok);
      if (acceptedIndexes.length === 0) {
        const first = validations.find((validation) => !validation.ok);
        setError(first && !first.ok ? first.reason : "None of the selected files are supported media.");
        return;
      }

      for (const index of acceptedIndexes) {
        const file = files[index];
        const asset = assets[index];
        try {
          const inspectionPromise = inspectSelectedMedia(file);
          const result = await putDemoMediaBlob(asset.id, file, {
            onProgress: ({ bytesStored, bytesTotal, percent, phase }: UploadProgress) => {
              updateUploadEntry(asset.id, (entry) => ({
                ...entry,
                bytesStored,
                bytesTotal,
                percent,
                phase,
                state: "uploading",
              }));
            },
          });
          const inspection = await inspectionPromise;
          asset.file_type = inspection.kind === "unknown" ? "document" : inspection.kind;
          if (inspection.duration.status === "available") {
            asset.duration_seconds = inspection.duration.seconds;
          }
          if (inspection.thumbnail.status === "available") {
            const thumbnailId = `${asset.id}-preview`;
            updateUploadEntry(asset.id, (entry) => ({
              ...entry,
              phase: "saving preview frame",
              state: "uploading",
            }));
            await putDemoMediaBlob(
              thumbnailId,
              new File(
                [inspection.thumbnail.blob],
                `${asset.id}-preview.jpg`,
                { type: inspection.thumbnail.mimeType },
              ),
            );
            asset.demo_thumbnail_id = thumbnailId;
          }
          updateUploadEntry(asset.id, (entry) => ({
            ...entry,
            bytesStored: entry.bytesTotal,
            percent: 100,
            phase: "stored",
            storage: result.persistent ? "persistent" : "session",
            state: "success",
          }));
        } catch (uploadError) {
          const message = uploadErrorMessage(uploadError);
          updateUploadEntry(asset.id, (entry) => ({
            ...entry,
            phase: "failed",
            state: "error",
            error: message,
          }));
          throw uploadError;
        }
      }
      addDemoAssets(acceptedIndexes.map((index) => assets[index]));
      setRegistrationComplete(true);
      if (acceptedIndexes.length < files.length) {
        const rejected = files.length - acceptedIndexes.length;
        setError(`${rejected} of ${files.length} file${files.length === 1 ? "" : "s"} rejected as unsupported — the rest were stored.`);
      }
    } catch (uploadError) {
      setError(uploadErrorMessage(uploadError));
    } finally {
      uploadingRef.current = false;
      setUploading(false);
    }
  }

  function handleOpenProject() {
    if (!registrationComplete || uploadingRef.current) return;
    onClose();
    router.push(`/projects/${projectId}${querySuffix}`);
  }

  return (
    <div className={styles.overlay} role="presentation" onMouseDown={requestClose}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Upload media"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <div>
            <h2>Upload media</h2>
            <p>Files join a project&apos;s record — versions, review, and delivery stay linked.</p>
          </div>
          <button ref={closeRef} type="button" className={styles.iconButton} onClick={requestClose} aria-label="Close upload dialog" disabled={uploading}>
            <X size={18} />
          </button>
        </header>

        <label className={styles.field}>
          <span>Project</span>
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)} disabled={uploading}>
            {workspace.projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span>Files</span>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="video/*,image/*,audio/*"
            disabled={uploading}
            onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
          />
        </label>
        {files.length > 0 && uploadEntries.length === 0 ? (
          <p className={styles.fileList}>{files.length} file{files.length === 1 ? "" : "s"} · {files.map((file) => file.name).join(", ")}</p>
        ) : null}

        {uploadEntries.length > 0 ? (
          <section className={styles.progressSurface} aria-label="Upload progress" aria-live="polite">
            <div className={styles.progressSummary}>
              <span>Overall progress</span>
              <strong>{progress}% overall</strong>
            </div>
            <progress className={styles.progressBar} value={progress} max={100} aria-label={`${progress}% overall upload progress`} />
            <ul className={styles.uploadEntries}>
              {uploadEntries.map((entry) => (
                <li key={entry.assetId} className={styles.uploadEntry}>
                  <div className={styles.uploadEntryHeader}>
                    <strong>{entry.fileName}</strong>
                    <span>{entry.percent}%</span>
                  </div>
                  <p>{formatBytes(entry.bytesStored)} of {formatBytes(entry.bytesTotal)} · {phaseLabel(entry.phase)}</p>
                  {entry.state === "success" ? (
                    <span className={entry.storage === "persistent" ? styles.persistent : styles.session} role="status">
                      <CheckCircle2 size={14} /> {entry.storage === "persistent" ? "Stored on this device" : "Session-only fallback"}
                    </span>
                  ) : null}
                  {entry.state === "error" ? <span className={styles.entryError} role="alert">Upload failed: {entry.error}</span> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {error ? <p role="alert" className={styles.error}>{error}</p> : null}

        <footer className={styles.footer}>
          <p className={styles.honesty}>Local workspace — persistent storage is preferred; session fallback stays available in this browser.</p>
          {registrationComplete ? (
            <button type="button" className={styles.primary} onClick={handleOpenProject}>
              Open project <ArrowRight size={15} />
            </button>
          ) : (
            <button type="button" className={styles.primary} onClick={handleUpload} disabled={uploading || files.length === 0 || !projectId}>
              <Upload size={15} /> {uploading ? `${progress}% stored` : error ? "Retry upload" : `Upload${files.length > 0 ? ` ${files.length}` : ""}`}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
