"use client";

import { useState, useRef, useEffect } from "react";
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
  Image,
  MonitorUp,
  Upload,
} from "lucide-react";
import InfoPanel from "./panels/InfoPanel";
import CommentsPanel from "./panels/CommentsPanel";
import ReviewersPanel from "./panels/ReviewersPanel";
import DownloadPanel from "./panels/DownloadPanel";
import CaptionsPanel from "./panels/CaptionsPanel";
import ActivityPanel from "./panels/ActivityPanel";
import SharePanel from "./panels/SharePanel";

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

interface ReviewWorkspaceProps {
  assetId: string;
  projectId: string;
  title: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  versionNumber: number;
  backHref: string;
}

export default function ReviewWorkspace({
  assetId,
  projectId,
  title,
  videoUrl,
  thumbnailUrl,
  versionNumber,
  backHref,
}: ReviewWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<SidebarTab | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showVersionMenu, setShowVersionMenu] = useState(false);
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "TEXTAREA") return;
      switch (e.key) {
        case "k":
        case " ":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          skip(-5);
          break;
        case "ArrowRight":
          e.preventDefault();
          skip(5);
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
  }, [isPlaying]);

  function togglePlay() {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  }

  function skip(seconds: number) {
    if (videoRef.current) {
      videoRef.current.currentTime += seconds;
    }
  }

  function frameStep(frames: number) {
    if (!videoRef.current) return;
    videoRef.current.pause();
    setIsPlaying(false);
    // Assume 30fps
    videoRef.current.currentTime += frames / 30;
  }

  function toggleFullscreen() {
    const container = document.querySelector(".review-shell");
    if (container) {
      if (!document.fullscreenElement) {
        container.requestFullscreen?.();
      } else {
        document.exitFullscreen?.();
      }
    }
  }

  function toggleMute() {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(!isMuted);
    }
  }

  function setVolumeLevel(v: number) {
    if (videoRef.current) {
      videoRef.current.volume = v;
      setVolume(v);
      if (v === 0) setIsMuted(true);
      else setIsMuted(false);
    }
  }

  function cycleSpeed() {
    const speeds = [0.5, 1, 1.5, 2];
    const idx = speeds.indexOf(playbackRate);
    const next = speeds[(idx + 1) % speeds.length];
    setPlaybackRate(next);
    if (videoRef.current) videoRef.current.playbackRate = next;
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
            comments={[]}
            onReply={() => {}}
            onResolve={() => {}}
          />
        );
      case "reviewers":
        return (
          <ReviewersPanel
            approvers={[]}
            reviewers={[]}
            others={[]}
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
            </div>
          </div>

          {/* Controls bar — matches Wipster exactly */}
          <div className="player-controls">
            {/* Left group: skip back, play, skip forward, frame back, in/out, frame forward */}
            <div className="flex items-center gap-1">
              <button onClick={() => skip(-5)} className="btn-icon" style={{ width: 28, height: 28 }} title="Skip back">
                <SkipBack size={14} />
              </button>
              <button onClick={togglePlay} className="btn-icon" style={{ width: 32, height: 32 }} title="Play/Pause (K)">
                {isPlaying ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <button onClick={() => skip(5)} className="btn-icon" style={{ width: 28, height: 28 }} title="Skip forward">
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
            </div>

            {/* Center: timecodes */}
            <div className="flex items-center gap-3 mx-4">
              <span className="player-timecode">{formatTimecode(currentTime)}</span>
              <span className="player-timecode">{formatTimecode(duration)}</span>
            </div>

            <div className="flex-1" />

            {/* Right group: speed, volume, quality, theater, fullscreen */}
            <div className="flex items-center gap-1">
              <button
                onClick={cycleSpeed}
                className="text-xs font-medium text-[var(--muted)] hover:text-[var(--ink)] px-2 py-1 rounded transition-colors"
                title="Playback speed"
              >
                {playbackRate}x
              </button>

              <button onClick={toggleMute} className="btn-icon" style={{ width: 28, height: 28 }} title="Volume (M)">
                {isMuted || volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
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
                <Image size={14} />
              </button>

              <button onClick={toggleFullscreen} className="btn-icon" style={{ width: 28, height: 28 }} title="Fullscreen (F)">
                <Maximize size={14} />
              </button>
            </div>
          </div>
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
