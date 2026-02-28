"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, useRef, useCallback } from "react";
import {
  ArrowLeft,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Maximize,
  MessageSquare,
  CheckCircle2,
  Clock,
  Send,
  MapPin,
  Share2,
  Download,
  X,
  ChevronDown,
  AlertTriangle,
} from "lucide-react";

interface Asset {
  id: string;
  title: string;
  file_type: string;
  file_url: string | null;
  status: string;
  project_id: string;
  duration_seconds: number | null;
}

interface Comment {
  id: string;
  body: string;
  author_name: string;
  timecode_seconds: number | null;
  pin_x: number | null;
  pin_y: number | null;
  status: string;
  parent_id: string | null;
  created_at: string;
  replies?: Comment[];
}

interface Approval {
  id: string;
  role_label: string;
  assignee_email: string | null;
  status: string;
  decision_note: string | null;
  step_order: number;
  decided_at: string | null;
}

interface Version {
  id: string;
  version_number: number;
  file_url: string;
  notes: string | null;
  created_at: string;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
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

export default function AssetReviewPage() {
  const { id: projectId, assetId } = useParams<{ id: string; assetId: string }>();
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const [asset, setAsset] = useState<Asset | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);

  // Player state
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);

  // Comment state
  const [commentBody, setCommentBody] = useState("");
  const [commentPin, setCommentPin] = useState<{ x: number; y: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<"comments" | "approvals" | "versions">("comments");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [showSummary, setShowSummary] = useState(false);

  // Share modal
  const [showShare, setShowShare] = useState(false);
  const [shareLink, setShareLink] = useState("");

  useEffect(() => {
    if (!assetId) return;
    Promise.all([
      fetch(`/api/assets/${assetId}`).then((r) => r.json()),
      fetch(`/api/assets/${assetId}/comments`).then((r) => r.json()),
      fetch(`/api/assets/${assetId}/approvals`).then((r) => r.json()),
      fetch(`/api/assets/${assetId}/versions`).then((r) => r.json()),
    ])
      .then(([a, c, ap, v]) => {
        setAsset(a);
        setComments(c.items ?? []);
        setApprovals(ap.items ?? []);
        setVersions(v.items ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [assetId]);

  // Video player controls
  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (playing) videoRef.current.pause();
    else videoRef.current.play();
    setPlaying(!playing);
  }, [playing]);

  const seek = useCallback((seconds: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.max(0, Math.min(seconds, duration));
  }, [duration]);

  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!progressRef.current || !duration) return;
      const rect = progressRef.current.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      seek(pct * duration);
    },
    [duration, seek]
  );

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case " ":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
          seek(currentTime - 5);
          break;
        case "ArrowRight":
          seek(currentTime + 5);
          break;
        case "m":
          setMuted((m) => !m);
          break;
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [togglePlay, seek, currentTime]);

  // Click-to-pin on video
  function handleVideoClick(e: React.MouseEvent<HTMLVideoElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setCommentPin({ x, y });
    if (videoRef.current && playing) {
      videoRef.current.pause();
      setPlaying(false);
    }
  }

  // Submit comment
  async function submitComment() {
    if (!commentBody.trim()) return;
    setSubmitting(true);

    const res = await fetch(`/api/assets/${assetId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body: commentBody,
        timecode_seconds: currentTime > 0 ? currentTime : null,
        pin_x: commentPin?.x ?? null,
        pin_y: commentPin?.y ?? null,
        parent_id: replyingTo ?? null,
      }),
    });

    if (res.ok) {
      const comment = await res.json();
      setComments((prev) => [...prev, comment]);
      setCommentBody("");
      setCommentPin(null);
      setReplyingTo(null);
    }
    setSubmitting(false);
  }

  // Resolve comment
  async function resolveComment(commentId: string) {
    const res = await fetch(`/api/assets/${assetId}/comments`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: commentId, status: "resolved" }),
    });
    if (res.ok) {
      setComments((prev) =>
        prev.map((c) => (c.id === commentId ? { ...c, status: "resolved" } : c))
      );
    }
  }

  // Approval decision
  async function submitApproval(approvalId: string, decision: string) {
    const note = decision === "changes_requested" ? prompt("Note (optional):") ?? "" : "";
    const res = await fetch(`/api/assets/${assetId}/approvals`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: approvalId, status: decision, decision_note: note }),
    });
    if (res.ok) {
      setApprovals((prev) =>
        prev.map((a) => (a.id === approvalId ? { ...a, status: decision, decision_note: note || a.decision_note } : a))
      );
    }
  }

  // Share link
  async function generateShareLink() {
    const res = await fetch(`/api/assets/${assetId}/share`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setShareLink(`${window.location.origin}/review/${data.token}`);
      setShowShare(true);
    }
  }

  // Generate summary of comments
  async function generateSummary() {
    if (comments.length === 0) return;
    setLoadingSummary(true);
    const res = await fetch("/api/ai/summarize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset_id: assetId }),
    });
    if (res.ok) {
      const data = await res.json();
      setSummary(data.summary);
      setShowSummary(true);
    }
    setLoadingSummary(false);
  }

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="skeleton h-8 w-48 mb-4 rounded-lg" />
        <div className="skeleton aspect-video w-full mb-4 rounded-xl" />
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="p-6 text-center py-20">
        <p className="text-[var(--muted)]">Asset not found</p>
      </div>
    );
  }

  const openComments = comments.filter((c) => c.status === "open" && !c.parent_id);
  const resolvedComments = comments.filter((c) => c.status === "resolved" && !c.parent_id);

  // Helper to get replies for a comment
  function getReplies(commentId: string) {
    return comments.filter((c) => c.parent_id === commentId);
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Left: Video Player */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href={`/projects/${projectId}`}
              className="text-[var(--muted)] hover:text-[var(--ink)] transition-colors"
            >
              <ArrowLeft size={18} />
            </Link>
            <div>
              <h1 className="text-sm font-semibold">{asset.title}</h1>
              <p className="text-xs text-[var(--dim)]">
                {asset.file_type} · {versions.length > 0 ? `v${versions.length}` : "v1"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={generateShareLink}
              className="flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--ink)] border border-[var(--border)] rounded-lg px-3 py-1.5 transition-colors"
            >
              <Share2 size={14} /> Share
            </button>
            {asset.file_url && (
              <a
                href={asset.file_url}
                download
                className="flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--ink)] border border-[var(--border)] rounded-lg px-3 py-1.5 transition-colors"
              >
                <Download size={14} /> Download
              </a>
            )}
          </div>
        </div>

        {/* Video / Preview */}
        <div className="flex-1 flex items-center justify-center bg-black relative overflow-hidden">
          {asset.file_type === "video" && asset.file_url ? (
            <>
              <video
                ref={videoRef}
                src={asset.file_url}
                className="max-w-full max-h-full cursor-crosshair"
                muted={muted}
                onClick={handleVideoClick}
                onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime ?? 0)}
                onLoadedMetadata={() => setDuration(videoRef.current?.duration ?? 0)}
                onEnded={() => setPlaying(false)}
              />
              {/* Pin marker */}
              {commentPin && (
                <div
                  className="absolute w-6 h-6 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ left: `${commentPin.x}%`, top: `${commentPin.y}%` }}
                >
                  <MapPin size={24} className="text-[var(--accent)] drop-shadow-lg" />
                </div>
              )}
              {/* Comment pins on video */}
              {comments
                .filter((c) => c.pin_x != null && c.pin_y != null && c.status === "open")
                .map((c) => (
                  <button
                    key={c.id}
                    className="absolute w-5 h-5 -translate-x-1/2 -translate-y-1/2 bg-[var(--accent)] text-white rounded-full text-[10px] font-bold flex items-center justify-center hover:scale-125 transition-transform"
                    style={{ left: `${c.pin_x}%`, top: `${c.pin_y}%` }}
                    onClick={() => {
                      if (c.timecode_seconds != null) seek(c.timecode_seconds);
                    }}
                    title={c.body}
                  >
                    {comments.filter((cc) => cc.status === "open" && !cc.parent_id).indexOf(c) + 1}
                  </button>
                ))}
            </>
          ) : asset.file_type === "image" && asset.file_url ? (
            <img src={asset.file_url} alt={asset.title} className="max-w-full max-h-full object-contain" />
          ) : (
            <div className="text-[var(--dim)] text-sm">
              {asset.file_url ? "Preview not available" : "No file uploaded"}
            </div>
          )}
        </div>

        {/* Transport Controls */}
        {asset.file_type === "video" && (
          <div className="border-t border-[var(--border)] bg-[var(--surface)] px-4 py-2">
            {/* Progress bar */}
            <div
              ref={progressRef}
              className="h-1.5 bg-[var(--border)] rounded-full cursor-pointer mb-2 relative"
              onClick={handleProgressClick}
            >
              <div
                className="h-full bg-[var(--accent)] rounded-full transition-all"
                style={{ width: duration ? `${(currentTime / duration) * 100}%` : "0%" }}
              />
              {/* Comment markers on timeline */}
              {comments
                .filter((c) => c.timecode_seconds != null)
                .map((c) => (
                  <div
                    key={c.id}
                    className="absolute top-0 w-1 h-full bg-[var(--orange)] rounded-full"
                    style={{ left: duration ? `${((c.timecode_seconds ?? 0) / duration) * 100}%` : "0%" }}
                    title={`${formatTime(c.timecode_seconds ?? 0)} - ${c.body.slice(0, 40)}`}
                  />
                ))}
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button onClick={() => seek(currentTime - 10)} className="text-[var(--muted)] hover:text-[var(--ink)] p-1">
                  <SkipBack size={16} />
                </button>
                <button onClick={togglePlay} className="text-[var(--ink)] hover:text-[var(--accent)] p-1">
                  {playing ? <Pause size={20} /> : <Play size={20} />}
                </button>
                <button onClick={() => seek(currentTime + 10)} className="text-[var(--muted)] hover:text-[var(--ink)] p-1">
                  <SkipForward size={16} />
                </button>
                <button onClick={() => setMuted(!muted)} className="text-[var(--muted)] hover:text-[var(--ink)] p-1">
                  {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>
                <span className="text-xs text-[var(--muted)] font-mono ml-2">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>
              <button
                onClick={() => videoRef.current?.requestFullscreen()}
                className="text-[var(--muted)] hover:text-[var(--ink)] p-1"
              >
                <Maximize size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right Sidebar */}
      <div className="w-96 border-l border-[var(--border)] flex flex-col bg-[var(--surface)]">
        {/* Tabs */}
        <div className="flex border-b border-[var(--border)]">
          {(["comments", "approvals", "versions"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 text-xs font-semibold uppercase tracking-wider transition-colors ${
                activeTab === tab
                  ? "text-[var(--accent)] border-b-2 border-[var(--accent)]"
                  : "text-[var(--muted)] hover:text-[var(--ink)]"
              }`}
            >
              {tab === "comments" && `Comments (${openComments.length})`}
              {tab === "approvals" && `Approvals (${approvals.length})`}
              {tab === "versions" && `Versions (${versions.length || 1})`}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === "comments" && (
            <div className="p-4 space-y-3">
              {showSummary && summary && (
                <div className="bg-[var(--accent-dim)] border border-[var(--accent)] rounded-lg p-3">
                  <div className="flex items-start justify-between mb-2">
                    <p className="text-xs font-semibold text-[var(--accent)] uppercase">Summary</p>
                    <button
                      onClick={() => setShowSummary(false)}
                      className="text-[var(--accent)] hover:text-[var(--ink)]"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <p className="text-sm text-[var(--ink)] leading-relaxed">{summary}</p>
                </div>
              )}
              {openComments.length > 0 && (
                <button
                  onClick={generateSummary}
                  disabled={loadingSummary || comments.length === 0}
                  className="w-full text-xs font-semibold py-2 px-3 border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent-dim)] rounded-lg transition-colors disabled:opacity-50"
                >
                  {loadingSummary ? "Summarizing..." : "Summarize Comments"}
                </button>
              )}
              {openComments.length === 0 && resolvedComments.length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare size={28} className="mx-auto mb-2 text-[var(--dim)]" />
                  <p className="text-sm text-[var(--muted)]">No comments yet</p>
                  <p className="text-xs text-[var(--dim)] mt-1">Click on the video to pin a comment</p>
                </div>
              ) : (
                <>
                  {openComments.map((c, i) => {
                    const replies = getReplies(c.id);
                    return (
                      <div key={c.id} className="space-y-2">
                        <div className="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-3">
                          <div className="flex items-start gap-2">
                            <div className="w-5 h-5 rounded-full bg-[var(--accent)] text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                              {i + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-semibold">{c.author_name}</span>
                                {c.timecode_seconds != null && (
                                  <button
                                    onClick={() => seek(c.timecode_seconds!)}
                                    className="text-[10px] font-mono text-[var(--accent)] hover:underline"
                                  >
                                    {formatTime(c.timecode_seconds)}
                                  </button>
                                )}
                                <span className="text-[10px] text-[var(--dim)] ml-auto">{timeAgo(c.created_at)}</span>
                              </div>
                              <p className="text-sm text-[var(--ink)] leading-relaxed">{c.body}</p>
                            </div>
                          </div>
                          <div className="flex justify-end gap-2 mt-2">
                            <button
                              onClick={() => setReplyingTo(replyingTo === c.id ? null : c.id)}
                              className="text-[10px] font-semibold text-[var(--accent)] hover:underline"
                            >
                              {replyingTo === c.id ? "Cancel" : "Reply"}
                            </button>
                            <button
                              onClick={() => resolveComment(c.id)}
                              className="text-[10px] font-semibold text-[var(--green)] hover:underline flex items-center gap-1"
                            >
                              <CheckCircle2 size={10} /> Resolve
                            </button>
                          </div>
                        </div>
                        {replies.map((reply) => (
                          <div key={reply.id} className="ml-6 bg-[var(--bg)] border border-[var(--border)] rounded-lg p-3">
                            <div className="flex items-start gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs font-semibold">{reply.author_name}</span>
                                  <span className="text-[10px] text-[var(--dim)] ml-auto">{timeAgo(reply.created_at)}</span>
                                </div>
                                <p className="text-sm text-[var(--ink)] leading-relaxed">{reply.body}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                  {resolvedComments.length > 0 && (
                    <div className="pt-2">
                      <p className="text-xs font-semibold text-[var(--dim)] mb-2">
                        Resolved ({resolvedComments.length})
                      </p>
                      {resolvedComments.map((c) => (
                        <div key={c.id} className="bg-[var(--bg)]/50 border border-[var(--border)]/50 rounded-lg p-3 mb-2 opacity-60">
                          <div className="flex items-center gap-2 mb-1">
                            <CheckCircle2 size={12} className="text-[var(--green)]" />
                            <span className="text-xs font-semibold">{c.author_name}</span>
                            {c.timecode_seconds != null && (
                              <span className="text-[10px] font-mono text-[var(--dim)]">
                                {formatTime(c.timecode_seconds)}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-[var(--muted)] line-through">{c.body}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === "approvals" && (
            <div className="p-4 space-y-3">
              {approvals.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle2 size={28} className="mx-auto mb-2 text-[var(--dim)]" />
                  <p className="text-sm text-[var(--muted)]">No approval gates configured</p>
                </div>
              ) : (
                approvals
                  .sort((a, b) => a.step_order - b.step_order)
                  .map((a) => (
                    <div key={a.id} className="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
                            Step {a.step_order}: {a.role_label}
                          </p>
                          {a.assignee_email && (
                            <p className="text-[10px] text-[var(--dim)] mt-0.5">{a.assignee_email}</p>
                          )}
                        </div>
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            a.status === "approved"
                              ? "text-[var(--green)] bg-[var(--green-dim)]"
                              : a.status === "changes_requested" || a.status === "rejected"
                              ? "text-[var(--red)] bg-[var(--red-dim)]"
                              : "text-[var(--orange)] bg-[var(--orange-dim)]"
                          }`}
                        >
                          {a.status.replace(/_/g, " ")}
                        </span>
                      </div>
                      {a.decision_note && (
                        <p className="text-xs text-[var(--muted)] italic mb-2">&ldquo;{a.decision_note}&rdquo;</p>
                      )}
                      {a.status === "pending" && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => submitApproval(a.id, "approved")}
                            className="flex-1 bg-[var(--green)] text-black text-xs font-semibold py-1.5 rounded-lg hover:opacity-90 transition-opacity"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => submitApproval(a.id, "changes_requested")}
                            className="flex-1 bg-[var(--red)] text-white text-xs font-semibold py-1.5 rounded-lg hover:opacity-90 transition-opacity"
                          >
                            Request Changes
                          </button>
                        </div>
                      )}
                    </div>
                  ))
              )}
            </div>
          )}

          {activeTab === "versions" && (
            <div className="p-4 space-y-3">
              {versions.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-[var(--muted)]">Original version</p>
                </div>
              ) : (
                versions
                  .sort((a, b) => b.version_number - a.version_number)
                  .map((v) => (
                    <div key={v.id} className="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">Version {v.version_number}</span>
                        <span className="text-[10px] text-[var(--dim)]">{timeAgo(v.created_at)}</span>
                      </div>
                      {v.notes && <p className="text-xs text-[var(--muted)] mt-1">{v.notes}</p>}
                    </div>
                  ))
              )}
            </div>
          )}
        </div>

        {/* Comment input (always visible when on comments tab) */}
        {activeTab === "comments" && (
          <div className="border-t border-[var(--border)] p-3">
            {replyingTo && (
              <div className="flex items-center gap-2 mb-2 text-xs text-[var(--accent)] bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1">
                <span>Replying to comment</span>
                <button onClick={() => setReplyingTo(null)} className="ml-auto hover:text-[var(--ink)]">
                  <X size={12} />
                </button>
              </div>
            )}
            {commentPin && (
              <div className="flex items-center gap-2 mb-2 text-xs text-[var(--accent)]">
                <MapPin size={12} />
                <span>Pin at ({Math.round(commentPin.x)}%, {Math.round(commentPin.y)}%)</span>
                <button onClick={() => setCommentPin(null)} className="ml-auto hover:text-[var(--ink)]">
                  <X size={12} />
                </button>
              </div>
            )}
            {currentTime > 0 && !replyingTo && (
              <div className="text-[10px] text-[var(--dim)] mb-1 font-mono">
                @ {formatTime(currentTime)}
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && submitComment()}
                placeholder={replyingTo ? "Write a reply..." : "Add a comment..."}
                className="flex-1 bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--dim)] focus:border-[var(--accent)] outline-none"
              />
              <button
                onClick={submitComment}
                disabled={submitting || !commentBody.trim()}
                className="bg-[var(--accent)] text-white p-2 rounded-lg hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Share Modal */}
      {showShare && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Share Review Link</h3>
              <button onClick={() => setShowShare(false)} className="text-[var(--muted)] hover:text-[var(--ink)]">
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-[var(--muted)] mb-3">
              Anyone with this link can view and comment on this asset.
            </p>
            <div className="flex gap-2">
              <input
                readOnly
                value={shareLink}
                className="flex-1 bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--ink)] font-mono"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(shareLink);
                }}
                className="bg-[var(--accent)] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[var(--accent-hover)] transition-colors"
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
