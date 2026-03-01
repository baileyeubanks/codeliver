"use client";

import { useState } from "react";
import { FileText, File, Download, X } from "lucide-react";
import type { CommentAttachment } from "@/lib/types/codeliver";

interface AttachmentPreviewProps {
  attachment: CommentAttachment;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(type: string | null | undefined): boolean {
  return !!type && type.startsWith("image/");
}

function isPdf(type: string | null | undefined): boolean {
  return type === "application/pdf";
}

export default function AttachmentPreview({ attachment }: AttachmentPreviewProps) {
  const [showFull, setShowFull] = useState(false);

  if (isImage(attachment.file_type)) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowFull(true)}
          className="group relative mt-2 block overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border)]"
        >
          <img
            src={attachment.file_url}
            alt={attachment.file_name}
            className="max-h-32 w-auto object-cover transition-opacity group-hover:opacity-80"
          />
          <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
            {attachment.file_name}
          </span>
        </button>

        {showFull && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
            onClick={() => setShowFull(false)}
          >
            <button
              type="button"
              onClick={() => setShowFull(false)}
              className="absolute right-4 top-4 rounded-full bg-[var(--surface)] p-2 text-[var(--ink)] hover:bg-[var(--surface-2)]"
            >
              <X size={20} />
            </button>
            <img
              src={attachment.file_url}
              alt={attachment.file_name}
              className="max-h-[90vh] max-w-[90vw] rounded-[var(--radius)]"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
      </>
    );
  }

  const Icon = isPdf(attachment.file_type) ? FileText : File;

  return (
    <div className="mt-2 flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
      <Icon size={18} className="shrink-0 text-[var(--muted)]" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-[var(--ink)]">{attachment.file_name}</p>
        {attachment.file_size != null && (
          <p className="text-xs text-[var(--dim)]">{formatFileSize(attachment.file_size)}</p>
        )}
      </div>
      <a
        href={attachment.file_url}
        download={attachment.file_name}
        className="shrink-0 rounded p-1 text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
      >
        <Download size={16} />
      </a>
    </div>
  );
}
