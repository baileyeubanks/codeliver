"use client";

import { useEffect, useRef } from "react";
import { ShieldCheck, X } from "lucide-react";
import AssetUpload from "@/components/assets/AssetUpload";
import styles from "./AuthoritativeUploadDialog.module.css";

interface AuthoritativeUploadDialogProps {
  projectId: string;
  folderId?: string;
  projectName: string;
  onClose: () => void;
  onUploadComplete: () => void;
}

export default function AuthoritativeUploadDialog({
  projectId,
  folderId,
  projectName,
  onClose,
  onUploadComplete,
}: AuthoritativeUploadDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => closeRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [onClose]);

  return (
    <div className={styles.overlay} role="presentation" onMouseDown={onClose}>
      <section
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="production-upload-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span>Upload to {projectName}</span>
            <h2 id="production-upload-title">Upload media</h2>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close upload dialog">
            <X size={19} aria-hidden="true" />
          </button>
        </header>
        <div className={styles.authority}>
          <ShieldCheck size={15} aria-hidden="true" />
          <span><strong>Guarded ingest</strong><small>Resumable transfer · checksum evidence · quarantine policy</small></span>
        </div>
        <div className={styles.body}>
          <AssetUpload
            projectId={projectId}
            folderId={folderId}
            inputId="authoritative-project-upload"
            onUploadComplete={() => onUploadComplete()}
          />
        </div>
      </section>
    </div>
  );
}
