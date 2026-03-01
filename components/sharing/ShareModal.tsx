"use client";

import { useState } from "react";
import {
  X,
  Copy,
  Check,
  Lock,
  Calendar,
  Eye,
  MessageSquare,
  Shield,
  Link2,
  Droplets,
  Download,
} from "lucide-react";
import type { SharePermission } from "@/lib/types/codeliver";

interface ShareModalProps {
  assetId: string;
  open: boolean;
  onClose: () => void;
}

const PERMISSIONS: { value: SharePermission; label: string; icon: React.ReactNode; desc: string }[] = [
  { value: "view", label: "View only", icon: <Eye size={14} />, desc: "Can watch but not comment" },
  { value: "comment", label: "Comment", icon: <MessageSquare size={14} />, desc: "Can view and leave comments" },
  { value: "approve", label: "Approve", icon: <Shield size={14} />, desc: "Can view, comment, and approve" },
];

export default function ShareModal({ assetId, open, onClose }: ShareModalProps) {
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [permission, setPermission] = useState<SharePermission>("comment");
  const [password, setPassword] = useState("");
  const [usePassword, setUsePassword] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [watermark, setWatermark] = useState(false);
  const [allowDownload, setAllowDownload] = useState(true);
  const [maxViews, setMaxViews] = useState<number | null>(null);

  if (!open) return null;

  async function createLink() {
    setLoading(true);
    const res = await fetch(`/api/assets/${assetId}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        permissions: permission,
        password: usePassword ? password : null,
        expires_at: expiresAt || null,
        watermark_enabled: watermark,
        download_enabled: allowDownload,
        max_views: maxViews,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setLink(`${window.location.origin}/review/${data.token}`);
    }
    setLoading(false);
  }

  function copyLink() {
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 w-full max-w-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Link2 size={18} /> Share Review Link
          </h3>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--ink)]">
            <X size={18} />
          </button>
        </div>

        {!link ? (
          <div className="space-y-4">
            {/* Permission level */}
            <div>
              <label className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2 block">
                Permission Level
              </label>
              <div className="space-y-1">
                {PERMISSIONS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setPermission(p.value)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                      permission === p.value
                        ? "bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/30"
                        : "text-[var(--muted)] hover:bg-white/5 border border-transparent"
                    }`}
                  >
                    {p.icon}
                    <span className="font-medium">{p.label}</span>
                    <span className="text-xs text-[var(--dim)] ml-auto">{p.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Password protection */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setUsePassword(!usePassword)}
                className={`flex items-center gap-2 text-sm ${usePassword ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}
              >
                <Lock size={14} />
                Password protect
              </button>
              {usePassword && (
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="flex-1 bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-[var(--ink)] placeholder:text-[var(--dim)] outline-none focus:border-[var(--accent)]"
                />
              )}
            </div>

            {/* Expiration */}
            <div className="flex items-center gap-3">
              <Calendar size={14} className="text-[var(--muted)]" />
              <span className="text-sm text-[var(--muted)]">Expires</span>
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
              />
            </div>

            {/* Options row */}
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm text-[var(--muted)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={watermark}
                  onChange={(e) => setWatermark(e.target.checked)}
                  className="accent-[var(--accent)]"
                />
                <Droplets size={14} /> Watermark
              </label>
              <label className="flex items-center gap-2 text-sm text-[var(--muted)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowDownload}
                  onChange={(e) => setAllowDownload(e.target.checked)}
                  className="accent-[var(--accent)]"
                />
                <Download size={14} /> Allow download
              </label>
            </div>

            {/* Max views */}
            <div className="flex items-center gap-3">
              <Eye size={14} className="text-[var(--muted)]" />
              <span className="text-sm text-[var(--muted)]">Max views</span>
              <input
                type="number"
                min={1}
                value={maxViews ?? ""}
                onChange={(e) => setMaxViews(e.target.value ? parseInt(e.target.value) : null)}
                placeholder="Unlimited"
                className="w-24 bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-[var(--ink)] placeholder:text-[var(--dim)] outline-none focus:border-[var(--accent)]"
              />
            </div>

            <button
              onClick={createLink}
              disabled={loading || (usePassword && !password)}
              className="w-full bg-[var(--accent)] text-white text-sm font-semibold py-2.5 rounded-lg hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create Share Link"}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-[var(--muted)]">
              Anyone with this link can {permission === "view" ? "view" : permission === "comment" ? "view and comment on" : "review and approve"} this asset.
            </p>
            <div className="flex gap-2">
              <input
                readOnly
                value={link}
                className="flex-1 bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--ink)] font-mono"
              />
              <button
                onClick={copyLink}
                className="bg-[var(--accent)] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[var(--accent-hover)] transition-colors flex items-center gap-1.5"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <button
              onClick={() => { setLink(""); }}
              className="text-sm text-[var(--accent)] hover:underline"
            >
              Create another link
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
