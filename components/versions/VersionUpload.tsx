"use client";

import { useState, useRef } from "react";
import { Upload, X, FileVideo, Loader2 } from "lucide-react";
import { formatFileSize } from "@/lib/utils/media";

interface VersionUploadProps {
  assetId: string;
  currentVersionNumber: number;
  onComplete: () => void;
  onCancel: () => void;
}

export default function VersionUpload({ assetId, currentVersionNumber, onComplete, onCancel }: VersionUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (selected) setFile(selected);
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setProgress(0);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("notes", notes);

    // Simulate progress since fetch doesn't support upload progress natively
    const progressInterval = setInterval(() => {
      setProgress((prev) => Math.min(prev + 10, 90));
    }, 200);

    try {
      const res = await fetch(`/api/assets/${assetId}/versions`, {
        method: "POST",
        body: formData,
      });

      clearInterval(progressInterval);

      if (res.ok) {
        setProgress(100);
        setTimeout(onComplete, 500);
      }
    } catch {
      clearInterval(progressInterval);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="bg-[var(--bg)] border border-[var(--border)] rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Upload Version {currentVersionNumber + 1}</h4>
        <button onClick={onCancel} className="text-[var(--muted)] hover:text-[var(--ink)]">
          <X size={16} />
        </button>
      </div>

      {!file ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            dragOver
              ? "border-[var(--accent)] bg-[var(--accent)]/5"
              : "border-[var(--border)] hover:border-[var(--surface-3)]"
          }`}
        >
          <Upload size={24} className="mx-auto mb-2 text-[var(--dim)]" />
          <p className="text-sm text-[var(--muted)]">Drop file here or click to browse</p>
          <input
            ref={inputRef}
            type="file"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
      ) : (
        <div className="flex items-center gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3">
          <FileVideo size={20} className="text-[var(--accent)]" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{file.name}</p>
            <p className="text-xs text-[var(--dim)]">{formatFileSize(file.size)}</p>
          </div>
          {!uploading && (
            <button onClick={() => setFile(null)} className="text-[var(--muted)] hover:text-[var(--ink)]">
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {file && (
        <>
          <div>
            <label className="text-xs text-[var(--dim)] block mb-1">Version notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What changed in this version?"
              rows={2}
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--dim)] outline-none focus:border-[var(--accent)] resize-none"
            />
          </div>

          {uploading && (
            <div className="space-y-1">
              <div className="h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--accent)] rounded-full transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-[var(--dim)] text-right">{progress}%</p>
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={uploading}
            className="w-full bg-[var(--accent)] text-white text-sm font-semibold py-2.5 rounded-lg hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {uploading ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Uploading...
              </>
            ) : (
              <>
                <Upload size={14} /> Upload v{currentVersionNumber + 1}
              </>
            )}
          </button>
        </>
      )}
    </div>
  );
}
