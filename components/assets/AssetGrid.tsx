"use client";

import { Video, Image as ImageIcon, Music, FileText, File, MessageSquare, GitBranch, Upload, CheckCircle2 } from "lucide-react";
import type { Tag } from "@/lib/types/codeliver";
import { formatFileSize, timeAgo } from "@/lib/utils/media";
import AssetCard from "@/components/assets/AssetCard";

type Asset = {
  id: string; title: string; file_type: string; file_url: string | null;
  thumbnail_url: string | null; status: string; file_size: number | null;
  duration_seconds: number | null; folder_id: string | null;
  created_at: string; updated_at: string;
  _commentCount?: number; _versionCount?: number; _approvalProgress?: number; tags?: Tag[];
};

const ICONS: Record<string, typeof Video> = { video: Video, image: ImageIcon, audio: Music, document: FileText, other: File };
const STATUS_LABELS: Record<string, string> = { draft: "Draft", in_review: "In Review", approved: "Approved", needs_changes: "Changes", final: "Final" };
const STATUS_DOTS: Record<string, string> = { draft: "bg-[var(--dim)]", in_review: "bg-[var(--orange)]", approved: "bg-[var(--green)]", needs_changes: "bg-[var(--red)]", final: "bg-[var(--purple)]" };

function Checkbox({ checked, onClick }: { checked: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`w-5 h-5 rounded-[4px] border flex items-center justify-center transition-colors ${checked ? "bg-[var(--accent)] border-[var(--accent)]" : "border-[var(--muted)] hover:border-[var(--ink)]"}`}>
      {checked && <CheckCircle2 size={14} className="text-white" />}
    </button>
  );
}

const TH = ({ children, className = "" }: { children: string; className?: string }) => (
  <th className={`p-3 text-xs font-medium text-[var(--muted)] uppercase tracking-wide ${className}`}>{children}</th>
);

export default function AssetGrid({ assets, view, selectedIds, onSelect, onSelectAll }: {
  assets: Asset[]; view: "grid" | "list"; selectedIds: string[]; onSelect: (id: string) => void; onSelectAll: () => void;
}) {
  const allSelected = assets.length > 0 && selectedIds.length === assets.length;

  if (assets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-[var(--muted)]">
        <Upload size={48} className="mb-4 text-[var(--dim)]" />
        <p className="text-lg font-medium text-[var(--ink)]">No assets yet</p>
        <p className="text-sm mt-1">Upload your first file.</p>
      </div>
    );
  }

  if (view === "grid") {
    return (
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Checkbox checked={allSelected} onClick={onSelectAll} />
          <span className="text-xs text-[var(--muted)]">Select all</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {assets.map((a) => (
            <AssetCard key={a.id} asset={a} selected={selectedIds.includes(a.id)} onSelect={onSelect} onClick={() => {}} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="border border-[var(--border)] rounded-[var(--radius)] overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-[var(--surface)] border-b border-[var(--border)]">
            <th className="p-3 w-10"><Checkbox checked={allSelected} onClick={onSelectAll} /></th>
            <TH className="text-left">Asset</TH>
            <TH className="text-left hidden md:table-cell">Type</TH>
            <TH className="text-left hidden md:table-cell">Status</TH>
            <TH className="text-center hidden lg:table-cell">Versions</TH>
            <TH className="text-center hidden lg:table-cell">Comments</TH>
            <TH className="text-right hidden sm:table-cell">Updated</TH>
          </tr>
        </thead>
        <tbody>
          {assets.map((asset) => {
            const Icon = ICONS[asset.file_type] || File;
            const sel = selectedIds.includes(asset.id);
            return (
              <tr key={asset.id} className={`border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--surface)] cursor-pointer transition-colors ${sel ? "bg-[var(--accent)]/5" : ""}`}>
                <td className="p-3"><Checkbox checked={sel} onClick={() => onSelect(asset.id)} /></td>
                <td className="p-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-[var(--radius-sm)] bg-[var(--surface-2)] flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {asset.thumbnail_url ? <img src={asset.thumbnail_url} alt="" className="w-full h-full object-cover" /> : <Icon size={16} className="text-[var(--dim)]" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--ink)] truncate">{asset.title}</p>
                      {asset.file_size && <p className="text-xs text-[var(--dim)]">{formatFileSize(asset.file_size)}</p>}
                    </div>
                  </div>
                </td>
                <td className="p-3 hidden md:table-cell"><span className="text-xs text-[var(--muted)] capitalize">{asset.file_type}</span></td>
                <td className="p-3 hidden md:table-cell">
                  <span className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
                    <span className={`w-2 h-2 rounded-full ${STATUS_DOTS[asset.status] || STATUS_DOTS.draft}`} />
                    {STATUS_LABELS[asset.status] || asset.status}
                  </span>
                </td>
                <td className="p-3 text-center hidden lg:table-cell"><span className="inline-flex items-center gap-1 text-xs text-[var(--dim)]"><GitBranch size={12} />{asset._versionCount ?? 0}</span></td>
                <td className="p-3 text-center hidden lg:table-cell"><span className="inline-flex items-center gap-1 text-xs text-[var(--dim)]"><MessageSquare size={12} />{asset._commentCount ?? 0}</span></td>
                <td className="p-3 text-right hidden sm:table-cell"><span className="text-xs text-[var(--dim)]">{timeAgo(asset.updated_at)}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
