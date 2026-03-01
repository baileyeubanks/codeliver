"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, X, FileIcon, CheckCircle, AlertCircle } from "lucide-react";
import { formatFileSize } from "@/lib/utils/media";
import type { Tag } from "@/lib/types/codeliver";

type Asset = {
  id: string; title: string; file_type: string; file_url: string | null;
  thumbnail_url: string | null; status: string; file_size: number | null;
  duration_seconds: number | null; folder_id: string | null;
  created_at: string; updated_at: string;
  _commentCount?: number; _versionCount?: number; _approvalProgress?: number; tags?: Tag[];
};

type UploadItem = {
  file: File; id: string; progress: number;
  status: "pending" | "uploading" | "done" | "error";
  error?: string; abortController?: AbortController;
};

const WARN_EXT = new Set(["exe", "bat", "sh", "cmd", "msi"]);

export default function AssetUpload({ projectId, folderId, onUploadComplete }: {
  projectId: string; folderId?: string; onUploadComplete: (assets: Asset[]) => void;
}) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(async (item: UploadItem) => {
    const controller = new AbortController();
    setItems((p) => p.map((i) => i.id === item.id ? { ...i, status: "uploading" as const, abortController: controller } : i));
    try {
      const fd = new FormData();
      fd.append("file", item.file);
      fd.append("project_id", projectId);
      if (folderId) fd.append("folder_id", folderId);
      const xhr = new XMLHttpRequest();
      const result = await new Promise<Asset>((resolve, reject) => {
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            setItems((p) => p.map((i) => i.id === item.id ? { ...i, progress: Math.round((e.loaded / e.total) * 100) } : i));
          }
        });
        xhr.addEventListener("load", () => xhr.status >= 200 && xhr.status < 300 ? resolve(JSON.parse(xhr.responseText)) : reject(new Error(`Upload failed: ${xhr.status}`)));
        xhr.addEventListener("error", () => reject(new Error("Network error")));
        xhr.addEventListener("abort", () => reject(new Error("Cancelled")));
        controller.signal.addEventListener("abort", () => xhr.abort());
        xhr.open("POST", "/api/assets");
        xhr.send(fd);
      });
      setItems((p) => p.map((i) => i.id === item.id ? { ...i, status: "done" as const, progress: 100 } : i));
      onUploadComplete([result]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      if (msg !== "Cancelled") {
        setItems((p) => p.map((i) => i.id === item.id ? { ...i, status: "error" as const, error: msg } : i));
      }
    }
  }, [projectId, folderId, onUploadComplete]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const newItems: UploadItem[] = Array.from(files).map((file) => ({ file, id: crypto.randomUUID(), progress: 0, status: "pending" as const }));
    setItems((prev) => [...prev, ...newItems]);
    newItems.forEach((item) => uploadFile(item));
  }, [uploadFile]);

  const cancelUpload = (id: string) => {
    setItems((prev) => { prev.find((i) => i.id === id)?.abortController?.abort(); return prev.filter((i) => i.id !== id); });
  };

  const ext = (name: string) => name.split(".").pop()?.toLowerCase() || "";

  return (
    <div className="space-y-4">
      <div className={`border-2 border-dashed rounded-[var(--radius)] p-8 text-center transition-colors cursor-pointer ${dragOver ? "border-[var(--accent)] bg-[var(--accent)]/5" : "border-[var(--border)] hover:border-[var(--muted)]"}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}>
        <Upload size={32} className="mx-auto mb-3 text-[var(--dim)]" />
        <p className="text-sm text-[var(--ink)] font-medium">Drag and drop files here</p>
        <p className="text-xs text-[var(--muted)] mt-1">or click to browse</p>
        <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ""; }} />
      </div>

      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 p-3 rounded-[var(--radius-sm)] bg-[var(--surface)] border border-[var(--border)]">
              <FileIcon size={16} className="text-[var(--dim)] flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-[var(--ink)] truncate">
                    {item.file.name}
                    {WARN_EXT.has(ext(item.file.name)) && <AlertCircle size={12} className="inline ml-1 text-[var(--orange)]" />}
                  </span>
                  <span className="text-xs text-[var(--dim)] ml-2 flex-shrink-0">{formatFileSize(item.file.size)}</span>
                </div>
                {item.status === "uploading" && (
                  <div className="w-full bg-[var(--surface-2)] rounded-full h-1.5">
                    <div className="bg-[var(--accent)] h-1.5 rounded-full transition-all" style={{ width: `${item.progress}%` }} />
                  </div>
                )}
                {item.status === "error" && <p className="text-xs text-[var(--red)]">{item.error}</p>}
              </div>
              {item.status === "done" ? (
                <CheckCircle size={16} className="text-[var(--green)] flex-shrink-0" />
              ) : (
                <button onClick={() => cancelUpload(item.id)} className="text-[var(--dim)] hover:text-[var(--red)] flex-shrink-0"><X size={16} /></button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
