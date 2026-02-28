"use client";

import { useParams } from "next/navigation";
import { useEffect, useState, useRef, useCallback } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Maximize,
  Send,
  MessageSquare,
  CheckCircle2,
  MapPin,
  X,
} from "lucide-react";

interface Asset {
  id: string;
  title: string;
  file_type: string;
  file_url: string | null;
  status: string;
  projects: { name: string };
}

interface Comment {
  id: string;
  body: string;
  author_name: string;
  timecode_seconds: number | null;
  pin_x: number | null;
  pin_y: number | null;
  status: string;
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

export default function PublicReviewPage() {
  const { token } = useParams<{ token: string }>();
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const [asset, setAsset] = useState<Asset | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [permissions, setPermissions] = useState("view");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);

  const [reviewerName, setReviewerName] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [commentPin, setCommentPin] = useState<{ x: number; y: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [nameSet, setNameSet] = useState(false);

  useEffect(() => {
    fetch(`/api/review/${token}`)
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          setError(d.error || "Invalid link");
          return;
        }
        const d = await r.json();
        setAsset(d.asset);
        setComments(d.comments ?? []);
        setPermissions(d.permissions);
      })
      .catch(() => setError("Connection error"))
      .finally(() => setLoading(false));
  }, [token]);

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

  function handleProgressClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!progressRef.current || !duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    seek(pct * duration);
  }

  function handleVideoClick(e: React.MouseEvent<HTMLVideoElement>) {
    if (permissions === "view") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setCommentPin({ x, y });
    if (videoRef.current && playing) {
      videoRef.current.pause();
      setPlaying(false);
    }
  }

  async function submitComment() {
    if (!commentBody.trim() || !nameSet) return;
    setSubmitting(true);

    const res = await fetch(`/api/assets/${asset?.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body: commentBody,
        author_name: reviewerName,
        timecode_seconds: currentTime > 0 ? currentTime : null,
        pin_x: commentPin?.x ?? null,
        pin_y: commentPin?.y ?? null,
      }),
    });

    if (res.ok) {
      const comment = await res.json();
      setComments((prev) => [...prev, comment]);
      setCommentBody("");
      setCommentPin(null);
    }
    setSubmitting(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
        <div className="spinner" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-bold mb-2 text-[var(--ink)]">Review Unavailable</h1>
          <p className="text-[var(--muted)]">{error}</p>
        </div>
      </div>
    );
  }

  if (!asset) return null;

  const canComment = permissions === "comment" || permissions === "approve";
  const openComments = comments.filter((c) => c.status === "open");

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* Header */}
      <header className="border-b border-[var(--border)] px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-[var(--accent)]" />
          <div>
            <h1 className="text-sm font-semibold text-[var(--ink)]">{asset.title}</h1>
            <p className="text-xs text-[var(--dim)]">{asset.projects?.name} · Review</p>
          </div>
        </div>
        <span className="text-xs text-[var(--dim)] bg-[var(--surface)] px-3 py-1 rounded-full">
          {permissions === "view" ? "View only" : permissions === "approve" ? "Can approve" : "Can comment"}
        </span>
      </header>

      <div className="flex h-[calc(100vh-53px)]">
        {/* Player */}
        <div className="flex-1 flex flex-col">
          <div className="flex-1 flex items-center justify-center bg-black relative">
            {asset.file_type === "video" && asset.file_url ? (
              <>
                <video
                  ref={videoRef}
                  src={asset.file_url}
                  className={`max-w-full max-h-full ${canComment ? "cursor-crosshair" : ""}`}
                  muted={muted}
                  onClick={handleVideoClick}
                  onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime ?? 0)}
                  onLoadedMetadata={() => setDuration(videoRef.current?.duration ?? 0)}
                  onEnded={() => setPlaying(false)}
                />
                {commentPin && (
                  <div
                    className="absolute w-6 h-6 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ left: `${commentPin.x}%`, top: `${commentPin.y}%` }}
                  >
                    <MapPin size={24} className="text-[var(--accent)] drop-shadow-lg" />
                  </div>
                )}
              </>
            ) : asset.file_type === "image" && asset.file_url ? (
              <img src={asset.file_url} alt={asset.title} className="max-w-full max-h-full object-contain" />
            ) : (
              <div className="text-[var(--dim)]">Preview not available</div>
            )}
          </div>

          {asset.file_type === "video" && (
            <div className="border-t border-[var(--border)] bg-[var(--surface)] px-4 py-2">
              <div
                ref={progressRef}
                className="h-1.5 bg-[var(--border)] rounded-full cursor-pointer mb-2 relative"
                onClick={handleProgressClick}
              >
                <div
                  className="h-full bg-[var(--accent)] rounded-full"
                  style={{ width: duration ? `${(currentTime / duration) * 100}%` : "0%" }}
                />
              </div>
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
            </div>
          )}
        </div>

        {/* Comment sidebar */}
        <div className="w-80 border-l border-[var(--border)] flex flex-col bg-[var(--surface)]">
          <div className="px-4 py-3 border-b border-[var(--border)]">
            <h2 className="text-sm font-semibold">Comments ({openComments.length})</h2>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {comments.length === 0 ? (
              <div className="text-center py-8">
                <MessageSquare size={24} className="mx-auto mb-2 text-[var(--dim)]" />
                <p className="text-xs text-[var(--muted)]">
                  {canComment ? "Click on the video to leave feedback" : "No comments yet"}
                </p>
              </div>
            ) : (
              comments.map((c, i) => (
                <div
                  key={c.id}
                  className={`bg-[var(--bg)] border border-[var(--border)] rounded-lg p-3 ${
                    c.status === "resolved" ? "opacity-50" : ""
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {c.status === "resolved" ? (
                      <CheckCircle2 size={12} className="text-[var(--green)]" />
                    ) : (
                      <div className="w-4 h-4 rounded-full bg-[var(--accent)] text-white text-[9px] font-bold flex items-center justify-center">
                        {i + 1}
                      </div>
                    )}
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
                  <p className={`text-sm ${c.status === "resolved" ? "line-through text-[var(--muted)]" : ""}`}>
                    {c.body}
                  </p>
                </div>
              ))
            )}
          </div>

          {canComment && (
            <div className="border-t border-[var(--border)] p-3">
              {!nameSet ? (
                <div className="space-y-2">
                  <input
                    value={reviewerName}
                    onChange={(e) => setReviewerName(e.target.value)}
                    placeholder="Your name"
                    className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--dim)] focus:border-[var(--accent)] outline-none"
                  />
                  <button
                    onClick={() => reviewerName.trim() && setNameSet(true)}
                    disabled={!reviewerName.trim()}
                    className="w-full bg-[var(--accent)] text-white text-sm font-medium py-2 rounded-lg hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
                  >
                    Start Reviewing
                  </button>
                </div>
              ) : (
                <>
                  {commentPin && (
                    <div className="flex items-center gap-2 mb-2 text-xs text-[var(--accent)]">
                      <MapPin size={12} />
                      <span>Pinned</span>
                      <button onClick={() => setCommentPin(null)} className="ml-auto">
                        <X size={12} />
                      </button>
                    </div>
                  )}
                  {currentTime > 0 && (
                    <div className="text-[10px] text-[var(--dim)] mb-1 font-mono">@ {formatTime(currentTime)}</div>
                  )}
                  <div className="flex gap-2">
                    <input
                      value={commentBody}
                      onChange={(e) => setCommentBody(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && submitComment()}
                      placeholder="Add feedback..."
                      className="flex-1 bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--dim)] focus:border-[var(--accent)] outline-none"
                    />
                    <button
                      onClick={submitComment}
                      disabled={submitting || !commentBody.trim()}
                      className="bg-[var(--accent)] text-white p-2 rounded-lg hover:bg-[var(--accent-hover)] disabled:opacity-50"
                    >
                      <Send size={16} />
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
