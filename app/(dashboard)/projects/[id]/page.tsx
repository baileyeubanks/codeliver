"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import {
  ArrowLeft,
  Upload,
  Play,
  Image as ImageIcon,
  FileText,
  Music,
  MoreVertical,
  Plus,
  Share2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Trash2,
} from "lucide-react";
import { createSupabaseBrowser } from "@/lib/supabase-browser";

interface Project {
  id: string;
  name: string;
  description: string;
  status: string;
  created_at: string;
}

interface Asset {
  id: string;
  title: string;
  file_type: string;
  file_url: string | null;
  thumbnail_url: string | null;
  status: string;
  file_size: number | null;
  duration_seconds: number | null;
  updated_at: string;
  comments: { count: number }[];
  approvals: { id: string; status: string }[];
}

function fileIcon(type: string) {
  switch (type) {
    case "video": return <Play size={20} className="text-[var(--accent)]" />;
    case "image": return <ImageIcon size={20} className="text-[var(--purple)]" />;
    case "audio": return <Music size={20} className="text-[var(--green)]" />;
    default: return <FileText size={20} className="text-[var(--muted)]" />;
  }
}

function statusBadge(status: string) {
  switch (status) {
    case "approved":
    case "final":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--green)] bg-[var(--green-dim)] px-2 py-0.5 rounded-full">
          <CheckCircle2 size={10} /> {status === "final" ? "Final" : "Approved"}
        </span>
      );
    case "in_review":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--orange)] bg-[var(--orange-dim)] px-2 py-0.5 rounded-full">
          <Clock size={10} /> In Review
        </span>
      );
    case "needs_changes":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--red)] bg-[var(--red-dim)] px-2 py-0.5 rounded-full">
          <AlertTriangle size={10} /> Changes
        </span>
      );
    default:
      return (
        <span className="text-xs font-medium text-[var(--dim)] bg-[var(--surface-2)]/50 px-2 py-0.5 rounded-full">
          Draft
        </span>
      );
  }
}

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function ProjectWorkspace() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetch(`/api/projects/${id}`).then((r) => r.json()),
      fetch(`/api/projects/${id}/assets`).then((r) => r.json()),
    ])
      .then(([p, a]) => {
        setProject(p);
        setAssets(a.items ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);

    const supabase = createSupabaseBrowser();

    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop() ?? "";
      const fileType = file.type.startsWith("video/")
        ? "video"
        : file.type.startsWith("image/")
        ? "image"
        : file.type.startsWith("audio/")
        ? "audio"
        : "document";

      // Upload to Supabase Storage
      const path = `${id}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("deliverables")
        .upload(path, file);

      if (uploadError) {
        console.error("Upload failed:", uploadError);
        continue;
      }

      const { data: urlData } = supabase.storage
        .from("deliverables")
        .getPublicUrl(path);

      // Create asset record
      const res = await fetch(`/api/projects/${id}/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: file.name.replace(`.${ext}`, ""),
          file_type: fileType,
          file_url: urlData.publicUrl,
          file_size: file.size,
        }),
      });

      if (res.ok) {
        const asset = await res.json();
        setAssets((prev) => [asset, ...prev]);
      }
    }

    setUploading(false);
  }

  async function deleteAsset(assetId: string) {
    if (!confirm("Delete this asset?")) return;
    const res = await fetch(`/api/assets/${assetId}`, { method: "DELETE" });
    if (res.ok) {
      setAssets((prev) => prev.filter((a) => a.id !== assetId));
    }
  }

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="skeleton h-8 w-48 mb-4 rounded-lg" />
        <div className="skeleton h-4 w-72 mb-8 rounded-lg" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-48 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6 max-w-7xl mx-auto text-center py-20">
        <p className="text-[var(--muted)]">Project not found</p>
        <Link href="/projects" className="text-[var(--accent)] text-sm mt-2 inline-block">
          Back to projects
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Back nav */}
      <Link
        href="/projects"
        className="flex items-center gap-2 text-sm text-[var(--muted)] hover:text-[var(--ink)] mb-4 transition-colors"
      >
        <ArrowLeft size={16} /> Projects
      </Link>

      {/* Project header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
          {project.description && (
            <p className="text-sm text-[var(--muted)] mt-1">{project.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            <Upload size={16} />
            {uploading ? "Uploading..." : "Upload"}
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="video/*,image/*,audio/*,.pdf,.doc,.docx"
        className="hidden"
        onChange={(e) => handleUpload(e.target.files)}
      />

      {/* Drop zone / assets grid */}
      {assets.length === 0 ? (
        <div
          className="border-2 border-dashed border-[var(--border)] rounded-xl p-12 text-center cursor-pointer hover:border-[var(--accent)] transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={40} className="mx-auto mb-4 text-[var(--dim)]" />
          <h3 className="text-lg font-semibold mb-2">Upload your first asset</h3>
          <p className="text-sm text-[var(--muted)]">
            Drag and drop files here, or click to browse. Supports video, images, audio, and documents.
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Upload card */}
          <div
            className="border-2 border-dashed border-[var(--border)] rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer hover:border-[var(--accent)] transition-colors min-h-[200px]"
            onClick={() => fileInputRef.current?.click()}
          >
            <Plus size={24} className="text-[var(--dim)] mb-2" />
            <span className="text-sm text-[var(--muted)]">Add asset</span>
          </div>

          {/* Asset cards */}
          {assets.map((asset) => (
            <div
              key={asset.id}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden hover:border-[var(--border-light)] transition-colors group"
            >
              {/* Thumbnail */}
              <div
                className="aspect-video bg-[var(--bg)] flex items-center justify-center cursor-pointer relative"
                onClick={() => router.push(`/projects/${id}/assets/${asset.id}`)}
              >
                {asset.thumbnail_url ? (
                  <img src={asset.thumbnail_url} alt={asset.title} className="w-full h-full object-cover" />
                ) : (
                  fileIcon(asset.file_type)
                )}
                {asset.file_type === "video" && (
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                    <Play size={32} className="text-white" />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <Link
                    href={`/projects/${id}/assets/${asset.id}`}
                    className="font-medium text-sm truncate hover:text-[var(--accent)] transition-colors flex-1"
                  >
                    {asset.title}
                  </Link>
                  <button
                    onClick={() => deleteAsset(asset.id)}
                    className="p-1 text-[var(--dim)] hover:text-[var(--red)] transition-colors ml-2"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  {statusBadge(asset.status)}
                  <span className="text-xs text-[var(--dim)]">
                    {formatSize(asset.file_size)}
                    {asset.file_size ? " · " : ""}
                    {timeAgo(asset.updated_at)}
                  </span>
                </div>
                {(asset.comments?.[0]?.count > 0 || (asset.approvals ?? []).length > 0) && (
                  <div className="flex items-center gap-3 mt-2 pt-2 border-t border-[var(--border)] text-xs text-[var(--dim)]">
                    {asset.comments?.[0]?.count > 0 && (
                      <span>{asset.comments[0].count} comment{asset.comments[0].count !== 1 ? "s" : ""}</span>
                    )}
                    {(asset.approvals ?? []).length > 0 && (
                      <span>
                        {asset.approvals.filter((a) => a.status === "approved").length}/{asset.approvals.length} approved
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
