"use client";

import { useState } from "react";
import { Download, AlertCircle } from "lucide-react";

export default function PDFViewer({
  url,
  onPageClick,
}: {
  url: string;
  onPageClick?: (page: number, x: number, y: number) => void;
}) {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 bg-[var(--surface-2)] rounded-[var(--radius)]">
        <AlertCircle size={32} className="text-[var(--dim)] mb-3" />
        <p className="text-sm text-[var(--muted)] mb-4">
          Unable to display PDF preview
        </p>
        <a
          href={url}
          download
          className="flex items-center gap-2 px-4 py-2 text-sm bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-[var(--radius-sm)] transition-colors"
        >
          <Download size={16} />
          Download PDF
        </a>
      </div>
    );
  }

  return (
    <div className="relative w-full bg-[var(--surface-2)] rounded-[var(--radius)] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-[var(--surface)] border-b border-[var(--border)]">
        <span className="text-xs text-[var(--muted)]">PDF Viewer</span>
        <a
          href={url}
          download
          className="flex items-center gap-1 text-xs text-[var(--accent)] hover:text-[var(--accent-hover)]"
        >
          <Download size={12} />
          Download
        </a>
      </div>
      <iframe
        src={url}
        className="w-full h-[70vh] border-0"
        title="PDF Viewer"
        onError={() => setError(true)}
        onLoad={(e) => {
          try {
            const frame = e.target as HTMLIFrameElement;
            if (!frame.contentDocument && !frame.contentWindow) {
              setError(true);
            }
          } catch {
            // Cross-origin is fine for PDF display
          }
        }}
      />
    </div>
  );
}
