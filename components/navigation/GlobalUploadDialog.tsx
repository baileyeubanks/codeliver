"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, X } from "lucide-react";
import { addDemoAssets, useDemoWorkspace } from "@/lib/demo/workspace-store";
import { putDemoMediaBlob } from "@/lib/demo/media-blob-store";
import { buildInternalDemoAssetHref } from "@/lib/demo/workspace";
import type { MediaAsset } from "@/components/projects/MediaCard";
import { useDialogFocus } from "./useDialogFocus";
import styles from "./GlobalUploadDialog.module.css";

interface GlobalUploadDialogProps {
  querySuffix: string;
  onClose: () => void;
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
  const [projectId, setProjectId] = useState(workspace.projects[0]?.id ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useDialogFocus(true, dialogRef, onClose, closeRef);

  async function handleUpload() {
    if (!projectId || files.length === 0 || uploading) return;
    setUploading(true);
    setError(null);
    try {
      const startedAt = Date.now();
      const assets: MediaAsset[] = files.map((file, index) => {
        const assetId = `local-upload-${startedAt}-${index}`;
        return {
          id: assetId,
          project_id: projectId,
          title: file.name.replace(/\.[^.]+$/, ""),
          thumbnail_url: "/demo/refinery-sunset.jpg",
          file_type: file.type.startsWith("image/") ? "image" : "video",
          duration_seconds: file.type.startsWith("video/") ? 64 : undefined,
          status: "draft",
          version_count: 1,
          reviewer_count: 0,
          reviewer_done: 0,
          comment_count: 0,
          created_at: new Date().toISOString(),
          href: buildInternalDemoAssetHref(projectId, assetId),
        };
      });
      for (const [index, file] of files.entries()) {
        await putDemoMediaBlob(assets[index].id, file);
      }
      addDemoAssets(assets);
      onClose();
      router.push(`/projects/${projectId}${querySuffix}`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
      setUploading(false);
    }
  }

  return (
    <div className={styles.overlay} role="presentation" onMouseDown={onClose}>
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
            <p>Files join a project's record — versions, review, and delivery stay linked.</p>
          </div>
          <button ref={closeRef} type="button" className={styles.iconButton} onClick={onClose} aria-label="Close upload dialog">
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
        {files.length > 0 ? (
          <p className={styles.fileList}>{files.length} file{files.length === 1 ? "" : "s"} · {files.map((file) => file.name).join(", ")}</p>
        ) : null}

        {error ? <p role="alert" className={styles.error}>{error}</p> : null}

        <footer className={styles.footer}>
          <p className={styles.honesty}>Local workspace — files stay on this machine in demo mode.</p>
          <button type="button" className={styles.primary} onClick={handleUpload} disabled={uploading || files.length === 0 || !projectId}>
            <Upload size={15} /> {uploading ? "Uploading…" : `Upload${files.length > 0 ? ` ${files.length}` : ""}`}
          </button>
        </footer>
      </div>
    </div>
  );
}
