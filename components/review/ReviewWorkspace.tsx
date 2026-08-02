"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronDown,
  Info,
  MessageSquare,
  Users,
  Download,
  Subtitles,
  Clock,
  Share2,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  ChevronsLeftRight,
  Maximize,
  Volume2,
  VolumeX,
  Monitor,
  Image as TheaterIcon,
  MonitorUp,
  Upload,
  Scissors,
} from "lucide-react";
import InfoPanel from "./panels/InfoPanel";
import CommentsPanel from "./panels/CommentsPanel";
import ReviewersPanel from "./panels/ReviewersPanel";
import DownloadPanel from "./panels/DownloadPanel";
import CaptionsPanel from "./panels/CaptionsPanel";
import ActivityPanel from "./panels/ActivityPanel";
import SharePanel from "./panels/SharePanel";
import { useRealtimeComments } from "@/lib/hooks/useRealtimeComments";
import { useRealtimePresence } from "@/lib/hooks/useRealtimePresence";
import { normalizeReviewSeekStep, normalizeReviewShortcutKey, shouldIgnoreReviewShortcut } from "@/lib/review/player-policy";
import type { EditDecision } from "@/lib/types/codeliver";

type SidebarTab = "info" | "comments" | "reviewers" | "download" | "captions" | "activity" | "share";

const SIDEBAR_TABS: { key: SidebarTab; icon: typeof Info; label: string }[] = [
  { key: "info", icon: Info, label: "Information" },
  { key: "comments", icon: MessageSquare, label: "Comments" },
  { key: "reviewers", icon: Users, label: "Team" },
  { key: "download", icon: Download, label: "Download" },
  { key: "captions", icon: Subtitles, label: "Captions" },
  { key: "activity", icon: Clock, label: "Activity" },
  { key: "share", icon: Share2, label: "Share" },
];

interface ReviewComment {
  id: string;
  author_name: string;
  body: string;
  timecode_seconds?: number;
  pin_x?: number;
  pin_y?: number;
  status: string;
  created_at: string;
  is_team_only?: boolean;
  is_external?: boolean;
  replies?: ReviewComment[];
  attachments?: string[];
}

interface ReviewWorkspaceProps {
  assetId: string;
  projectId: string;
  title: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  versionId?: string;
  versionNumber: number;
  backHref: string;
  userId?: string;
  userName?: string;
}

export default function ReviewWorkspace({
  assetId,
  title,
  videoUrl,
  thumbnailUrl,
  versionId,
  versionNumber,
  backHref,
  userId = "",
  userName = "",
}: ReviewWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<SidebarTab | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showVersionMenu, setShowVersionMenu] = useState(false);
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const [seekStepSeconds, setSeekStepSeconds] = useState(2);
  const [cutMarkers, setCutMarkers] = useState<
    Array<{
      id: string;
      time: number;
      status: EditDecision["status"];
      pending?: boolean;
    }>
  >([]);
  const [cutError, setCutError] = useState("");
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  // ── Realtime: live comments ──
  const onNewComment = useCallback((comment: ReviewComment) => {
    setComments((prev) => {
      // Deduplicate — might already exist from our own optimistic insert
      if (prev.some((c) => c.id === comment.id)) return prev;
      return [...prev, comment];
    });
  }, []);
  useRealtimeComments(assetId, onNewComment as (c: unknown) => void);

  // ── Realtime: presence (who's watching) ──
  const presenceUsers = useRealtimePresence(assetId, userId, userName);

  useEffect(() => {
    const saved = Number(window.localStorage.getItem("co-deliver-review-seek-step"));
    if (Number.isFinite(saved) && saved > 0) {
      setSeekStepSeconds(normalizeReviewSeekStep(saved));
    }
  }, []);

  // ── Load version-bound comments and edit decisions from the API ──
  useEffect(() => {
    if (!assetId) return;
    const versionQuery = versionId ? `?version_id=${encodeURIComponent(versionId)}` : "";

    void Promise.all([
      fetch(`/api/assets/${assetId}/comments${versionQuery}`)
        .then((response) => (response.ok ? response.json() : { items: [] })),
      fetch(`/api/assets/${assetId}/edit-decisions${versionQuery}`)
        .then((response) => (response.ok ? response.json() : { items: [] })),
    ])
      .then(([commentPayload, decisionPayload]) => {
        setComments(commentPayload.items ?? commentPayload ?? []);
        setCutMarkers(
          ((decisionPayload.items ?? []) as EditDecision[])
            .filter(
              (decision) =>
                decision.decision_type === "cut" && decision.status !== "rejected",
            )
            .map((decision) => ({
              id: decision.id,
              time: decision.start_seconds,
              status: decision.status,
            })),
        );
      })
      .catch(() => {
        setCutError("Could not load the version edit decisions.");
      });
  }, [assetId, versionId]);

  // ── Comment actions ──
  const handleReply = useCallback(
    async (commentId: string, text: string) => {
      try {
        const res = await fetch(`/api/assets/${assetId}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            body: text,
            parent_id: commentId,
            version_id: versionId,
          }),
        });
        if (res.ok) {
          const reply = await res.json();
          setComments((prev) =>
            prev.map((c) =>
              c.id === commentId
                ? { ...c, replies: [...(c.replies ?? []), reply] }
                : c
            )
          );
        }
      } catch {}
    },
    [assetId, versionId]
  );

  const handleResolve = useCallback(
    async (commentId: string) => {
      const comment = comments.find((c) => c.id === commentId);
      const newStatus = comment?.status === "resolved" ? "open" : "resolved";
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId ? { ...c, status: newStatus } : c
        )
      );
      try {
        await fetch(`/api/assets/${assetId}/comments`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: commentId, status: newStatus }),
        });
      } catch {}
    },
    [assetId, comments]
  );

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play().catch(() => setIsPlaying(false));
    } else {
      video.pause();
    }
  }, []);

  const skip = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    const upperBound = Number.isFinite(video.duration) ? video.duration : Infinity;
    video.currentTime = Math.max(0, Math.min(upperBound, video.currentTime + seconds));
  }, []);

  const frameStep = useCallback((frames: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    setIsPlaying(false);
    video.currentTime = Math.max(0, video.currentTime + frames / 30);
  }, []);

  const createCutDecision = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    if (!versionId) {
      setCutError("Upload a media version before recording cut decisions.");
      return;
    }

    const time = Math.max(0, Number(video.currentTime.toFixed(3)));
    if (cutMarkers.some((marker) => Math.abs(marker.time - time) < 0.25)) return;

    const requestId = crypto.randomUUID();
    const optimisticId = `pending-${requestId}`;
    setCutError("");
    setCutMarkers((current) => [
      ...current,
      { id: optimisticId, time, status: "accepted", pending: true },
    ]);

    try {
      const response = await fetch(`/api/assets/${assetId}/edit-decisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version_id: versionId,
          decision_type: "cut",
          source: "keyboard",
          status: "accepted",
          start_seconds: time,
          end_seconds: null,
          label: "Cut",
          confidence: null,
          client_request_id: requestId,
          metadata: { input: "ArrowDown", version_number: versionNumber },
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Could not save the cut decision.");
      }

      const decision = payload as EditDecision;
      setCutMarkers((current) =>
        current.map((marker) =>
          marker.id === optimisticId
            ? {
                id: decision.id,
                time: decision.start_seconds,
                status: decision.status,
              }
            : marker,
        ),
      );
    } catch (error) {
      setCutMarkers((current) => current.filter((marker) => marker.id !== optimisticId));
      setCutError(error instanceof Error ? error.message : "Could not save the cut decision.");
    }
  }, [assetId, cutMarkers, versionId, versionNumber]);

  const toggleFullscreen = useCallback(() => {
    const container = videoRef.current?.closest(".review-shell") as HTMLElement | null;
    if (!container) return;

    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      container.requestFullscreen?.();
    }
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const nextMuted = !video.muted;
    video.muted = nextMuted;
    setIsMuted(nextMuted);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const target = e.target instanceof HTMLElement ? e.target : null;
      const insideControl = Boolean(
        target?.closest(
          'input, textarea, select, button, a, [contenteditable="true"], [role="button"], [role="slider"]',
        ),
      );
      const key = normalizeReviewShortcutKey(e.key);
      if (
        shouldIgnoreReviewShortcut({
          key,
          insideControl,
          defaultPrevented: e.defaultPrevented,
          isComposing: e.isComposing,
          altKey: e.altKey,
          ctrlKey: e.ctrlKey,
          metaKey: e.metaKey,
          repeat: e.repeat,
        })
      ) {
        return;
      }

      switch (key) {
        case "k":
        case " ":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          skip(-seekStepSeconds);
          break;
        case "ArrowRight":
          e.preventDefault();
          skip(seekStepSeconds);
          break;
        case "ArrowDown":
          e.preventDefault();
          void createCutDecision();
          break;
        case "j":
          e.preventDefault();
          skip(-10);
          break;
        case "l":
          e.preventDefault();
          skip(10);
          break;
        case ",":
          e.preventDefault();
          frameStep(-1);
          break;
        case ".":
          e.preventDefault();
          frameStep(1);
          break;
        case "f":
          e.preventDefault();
          toggleFullscreen();
          break;
        case "m":
          e.preventDefault();
          toggleMute();
          break;
        case "t":
          e.preventDefault();
          setIsTheaterMode(prev => !prev);
          break;
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [createCutDecision, frameStep, seekStepSeconds, skip, toggleFullscreen, toggleMute, togglePlay]);

  function cycleSpeed() {
    const speeds = [0.5, 1, 1.5, 2];
    const idx = speeds.indexOf(playbackRate);
    const next = speeds[(idx + 1) % speeds.length];
    setPlaybackRate(next);
    if (videoRef.current) videoRef.current.playbackRate = next;
  }

  function updateSeekStep(value: number) {
    const normalized = normalizeReviewSeekStep(value);
    setSeekStepSeconds(normalized);
    window.localStorage.setItem("co-deliver-review-seek-step", String(normalized));
  }

  function formatTimecode(seconds: number) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const f = Math.floor((seconds % 1) * 30);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}:${String(f).padStart(2, "0")}`;
  }

  function handleProgressClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!progressRef.current || !videoRef.current) return;
    const rect = progressRef.current.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    videoRef.current.currentTime = pct * duration;
  }

  function renderSidebarContent() {
    switch (activeTab) {
      case "info":
        return (
          <InfoPanel
            title={title}
            description=""
            tags={[]}
            notificationsOn={true}
            onSave={() => {}}
          />
        );
      case "comments":
        return (
          <CommentsPanel
            comments={comments}
            onReply={handleReply}
            onResolve={handleResolve}
          />
        );
      case "reviewers":
        return (
          <ReviewersPanel
            approvers={[]}
            reviewers={[]}
            others={presenceUsers.map((u) => ({
              id: u.userId,
              name: u.userName,
              role: "viewer",
              status: "online",
            }))}
            approvalRequired={0}
            reviewRequired={0}
          />
        );
      case "download":
        return <DownloadPanel />;
      case "captions":
        return (
          <CaptionsPanel
            captions={[]}
            onUpload={() => {}}
            onDelete={() => {}}
          />
        );
      case "activity":
        return <ActivityPanel entries={[]} />;
      case "share":
        return <SharePanel onShare={() => {}} />;
      default:
        return null;
    }
  }

  return (
    <div className="review-shell">
      {/* Header — matches Wipster: ← V12 ▾  title */}
      <div className="review-header">
        <Link href={backHref} className="btn-icon" style={{ width: 28, height: 28 }}>
          <ArrowLeft size={16} />
        </Link>

        {/* Version dropdown */}
        <div className="relative">
          <button
            className="flex items-center gap-1 px-2 py-1 rounded hover:bg-[var(--surface-hover)] transition-colors text-sm font-semibold"
            onClick={() => setShowVersionMenu(!showVersionMenu)}
          >
            V{versionNumber} <ChevronDown size={12} />
          </button>
          {showVersionMenu && (
            <div className="dropdown" style={{ left: 0, top: "calc(100% + 4px)", minWidth: 240 }}>
              <div className="px-3 py-2 text-xs text-[var(--muted)] font-medium">Version History</div>
              <div className="dropdown-divider" />
              {Array.from({ length: versionNumber }, (_, i) => versionNumber - i).map((v) => (
                <button key={v} className={`dropdown-item ${v === versionNumber ? "text-[var(--accent)]" : ""}`}>
                  <div className="w-8 h-5 rounded bg-[var(--surface-2)] flex-shrink-0" />
                  <span className="text-sm">V{v}</span>
                </button>
              ))}
              <div className="dropdown-divider" />
              <button className="dropdown-item">
                <MonitorUp size={14} /> Compare versions
              </button>
              <button className="dropdown-item text-[var(--accent)]">
                <Upload size={14} /> Upload new version
              </button>
            </div>
          )}
        </div>

        <span className="text-sm font-medium truncate flex-1 ml-2">{title}</span>
      </div>

      {/* Body — player + sidebar icons + sidebar panel */}
      <div className="review-body">
        {/* Player area (takes remaining space) */}
        <div className="review-player-area">
          {/* Video */}
          <div className="player-container" onClick={togglePlay}>
            {videoUrl ? (
              <video
                ref={videoRef}
                className="player-video"
                src={videoUrl}
                poster={thumbnailUrl}
                onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime ?? 0)}
                onDurationChange={() => setDuration(videoRef.current?.duration ?? 0)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />
            ) : (
              <div className="flex items-center justify-center w-full h-full bg-black">
                <div className="text-center">
                  <Play size={48} className="mx-auto text-[var(--dim)] mb-3" />
                  <p className="text-sm text-[var(--muted)]">No media loaded</p>
                </div>
              </div>
            )}

            {/* Annotation layer (blue pin dots) */}
            <div className="annotation-layer" />
          </div>

          {/* Progress bar */}
          <div
            ref={progressRef}
            className="player-timeline"
            onClick={handleProgressClick}
          >
            <div className="player-timeline-track">
              <div
                className="player-timeline-progress"
                style={{
                  width: duration ? `${(currentTime / duration) * 100}%` : "0%",
                  background: "#3498db",
                }}
              />
              {/* Blue playhead dot */}
              {duration > 0 && (
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-[#3498db]"
                  style={{ left: `${(currentTime / duration) * 100}%`, transform: "translate(-50%, -50%)" }}
                />
              )}
              {duration > 0
                ? cutMarkers.map((marker) => (
                    <button
                      key={marker.id}
                      type="button"
                      className={`absolute top-1/2 grid h-5 w-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded border border-white/80 text-white shadow-sm ${
                        marker.pending
                          ? "bg-[var(--muted)] opacity-70 motion-safe:animate-pulse"
                          : marker.status === "applied"
                            ? "bg-[var(--purple)]"
                            : "bg-[var(--green)]"
                      }`}
                      style={{ left: `${Math.max(0, Math.min(100, (marker.time / duration) * 100))}%` }}
                      title={`Cut at ${formatTimecode(marker.time)} · ${marker.pending ? "saving" : marker.status}`}
                      aria-label={`Cut at ${formatTimecode(marker.time)}, ${marker.pending ? "saving" : marker.status}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (videoRef.current) videoRef.current.currentTime = marker.time;
                      }}
                    >
                      <Scissors size={10} />
                    </button>
                  ))
                : null}
            </div>
          </div>

          {/* Controls bar — matches Wipster exactly */}
          <div className="player-controls">
            {/* Left group: skip back, play, skip forward, frame back, in/out, frame forward */}
            <div className="flex items-center gap-1">
              <button onClick={() => skip(-seekStepSeconds)} className="btn-icon" style={{ width: 28, height: 28 }} title={`Back ${seekStepSeconds} seconds`}>
                <SkipBack size={14} />
              </button>
              <button onClick={togglePlay} className="btn-icon" style={{ width: 32, height: 32 }} title="Play/Pause (K)">
                {isPlaying ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <button onClick={() => skip(seekStepSeconds)} className="btn-icon" style={{ width: 28, height: 28 }} title={`Forward ${seekStepSeconds} seconds`}>
                <SkipForward size={14} />
              </button>

              <div className="w-px h-4 bg-[var(--border)] mx-1" />

              <button onClick={() => frameStep(-1)} className="btn-icon" style={{ width: 24, height: 24 }} title="Frame back (,)">
                <ChevronLeft size={14} />
              </button>
              <button className="btn-icon" style={{ width: 24, height: 24 }} title="In/Out points">
                <ChevronsLeftRight size={14} />
              </button>
              <button onClick={() => frameStep(1)} className="btn-icon" style={{ width: 24, height: 24 }} title="Frame forward (.)">
                <ChevronRight size={14} />
              </button>
              <button
                onClick={() => void createCutDecision()}
                className="btn-icon"
                style={{ width: 28, height: 28 }}
                title="Mark cut at playhead (Down)"
                aria-label="Mark cut at playhead"
              >
                <Scissors size={14} />
              </button>
            </div>

            {/* Center: timecodes */}
            <div className="flex items-center gap-3 mx-4">
              <span className="player-timecode">{formatTimecode(currentTime)}</span>
              <span className="player-timecode">{formatTimecode(duration)}</span>
              <span className="text-[11px] text-[var(--dim)]">{cutMarkers.length} cuts</span>
            </div>

            <div className="flex-1" />

            {/* Right group: speed, volume, quality, theater, fullscreen */}
            <div className="flex items-center gap-1">
              <label className="flex items-center gap-1 text-[11px] text-[var(--muted)]">
                <span className="sr-only">Arrow-key seek interval</span>
                <select
                  value={seekStepSeconds}
                  onChange={(event) => updateSeekStep(Number(event.target.value))}
                  className="h-7 rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 text-xs text-[var(--ink)]"
                  title="Arrow-key seek interval"
                >
                  {[1, 2, 5, 10].map((seconds) => (
                    <option key={seconds} value={seconds}>{seconds}s</option>
                  ))}
                </select>
              </label>
              <button
                onClick={cycleSpeed}
                className="text-xs font-medium text-[var(--muted)] hover:text-[var(--ink)] px-2 py-1 rounded transition-colors"
                title="Playback speed"
              >
                {playbackRate}x
              </button>

              <button onClick={toggleMute} className="btn-icon" style={{ width: 28, height: 28 }} title="Volume (M)">
                {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>

              <button className="btn-icon" style={{ width: 28, height: 28 }} title="Quality">
                <Monitor size={14} />
              </button>

              <button
                onClick={() => setIsTheaterMode(!isTheaterMode)}
                className="btn-icon"
                style={{ width: 28, height: 28 }}
                title="Theater mode (T)"
              >
                <TheaterIcon size={14} />
              </button>

              <button onClick={toggleFullscreen} className="btn-icon" style={{ width: 28, height: 28 }} title="Fullscreen (F)">
                <Maximize size={14} />
              </button>
            </div>
          </div>
          <p
            className={`min-h-5 px-2 py-1 text-xs ${cutError ? "text-[var(--red)]" : "text-[var(--dim)]"}`}
            role={cutError ? "alert" : "status"}
            aria-live="polite"
          >
            {cutError || "Down marks a version-bound cut without interrupting playback."}
          </p>
        </div>

        {/* Right sidebar — icon strip + content panel */}
        <div className="review-sidebar flex flex-row">
          {/* Sidebar panel content */}
          {activeTab && (
            <div className="flex-1 flex flex-col overflow-hidden" style={{ width: 320 }}>
              <div className="px-4 py-3 border-b border-[var(--border)]">
                <h3 className="text-sm font-semibold capitalize">{activeTab === "reviewers" ? "Team" : activeTab}</h3>
              </div>
              <div className="review-sidebar-content">
                {renderSidebarContent()}
              </div>
            </div>
          )}

          {/* Tab icons (vertical strip on right edge) */}
          <div className="review-sidebar-tabs">
            {SIDEBAR_TABS.map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                className={`review-sidebar-tab ${activeTab === key ? "active" : ""}`}
                onClick={() => setActiveTab(activeTab === key ? null : key)}
                title={label}
              >
                <Icon size={16} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
