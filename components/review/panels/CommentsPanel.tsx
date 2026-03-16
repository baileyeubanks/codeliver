"use client";

import { useState, useMemo } from "react";
import {
  Search,
  Play,
  MoreHorizontal,
  CheckCircle,
  Copy,
  Upload,
  Pencil,
  Trash2,
  Image,
} from "lucide-react";

interface Comment {
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
  replies?: Comment[];
  attachments?: string[];
}

interface CommentsPanelProps {
  comments: Comment[];
  onReply: (commentId: string, text: string) => void;
  onResolve: (commentId: string) => void;
}

function formatTimecode(seconds?: number) {
  if (seconds == null) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const f = Math.floor((seconds % 1) * 30);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}:${String(f).padStart(2, "0")}`;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function getInitials(name: string) {
  return name.split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

export default function CommentsPanel({ comments, onReply, onResolve }: CommentsPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<"timecode" | "recent" | "oldest">("timecode");
  const [taskFilter, setTaskFilter] = useState<"all" | "incomplete" | "complete">("all");
  const [replyText, setReplyText] = useState<Record<string, string>>({});

  const doneCount = comments.filter((c) => c.status === "resolved").length;

  const filtered = useMemo(() => {
    let items = [...comments];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter((c) => c.body.toLowerCase().includes(q) || c.author_name.toLowerCase().includes(q));
    }

    if (taskFilter === "incomplete") items = items.filter((c) => c.status !== "resolved");
    if (taskFilter === "complete") items = items.filter((c) => c.status === "resolved");

    if (sortMode === "timecode") {
      items.sort((a, b) => (a.timecode_seconds ?? 0) - (b.timecode_seconds ?? 0));
    } else if (sortMode === "recent") {
      items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else {
      items.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }

    return items;
  }, [comments, searchQuery, sortMode, taskFilter]);

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--dim)]" />
        <input
          type="text"
          placeholder="Search comments..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="input pl-8"
          style={{ fontSize: "0.78rem" }}
        />
      </div>

      {/* Sort & Filter */}
      <div className="flex items-center gap-2">
        <select
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as typeof sortMode)}
          className="select flex-1"
        >
          <option value="timecode">Timecode</option>
          <option value="recent">Most recent</option>
          <option value="oldest">Oldest</option>
        </select>

        <select
          value={taskFilter}
          onChange={(e) => setTaskFilter(e.target.value as typeof taskFilter)}
          className="select flex-1"
        >
          <option value="all">View all tasks</option>
          <option value="incomplete">Incomplete tasks</option>
          <option value="complete">Complete tasks ({doneCount} of {comments.length})</option>
        </select>
      </div>

      {/* Comment list */}
      {filtered.length === 0 ? (
        <div className="empty-state" style={{ padding: "24px 0" }}>
          <p className="text-xs text-[var(--muted)]">No comments yet</p>
        </div>
      ) : (
        <div className="space-y-1">
          {filtered.map((comment) => (
            <div key={comment.id} className="comment-item">
              <div className="flex items-start gap-3">
                <div className={`comment-avatar ${comment.is_external ? "external" : ""}`}>
                  {getInitials(comment.author_name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{comment.author_name}</span>
                    <span className="text-xs text-[var(--muted)]">{timeAgo(comment.created_at)}</span>
                    {comment.is_team_only && (
                      <span className="text-xs text-[var(--orange)] bg-[var(--orange-dim)] px-1.5 rounded">Team</span>
                    )}
                  </div>

                  {comment.timecode_seconds != null && (
                    <button className="flex items-center gap-1 mt-1 text-xs text-[var(--blue)] hover:underline">
                      <Play size={10} /> {formatTimecode(comment.timecode_seconds)}
                    </button>
                  )}

                  <p className="text-sm text-[var(--ink-secondary)] mt-1">
                    {comment.body}
                  </p>

                  {/* Replies */}
                  {comment.replies && comment.replies.length > 0 && (
                    <div className="mt-2 pl-4 border-l-2 border-[var(--border)] space-y-2">
                      {comment.replies.map((reply) => (
                        <div key={reply.id} className="flex items-start gap-2">
                          <div className="comment-avatar" style={{ width: 24, height: 24, fontSize: "0.55rem" }}>
                            {getInitials(reply.author_name)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold">{reply.author_name}</span>
                              <span className="text-xs text-[var(--dim)]">{timeAgo(reply.created_at)}</span>
                            </div>
                            <p className="text-xs text-[var(--ink-secondary)]">{reply.body}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Reply input */}
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Reply to thread..."
                      value={replyText[comment.id] || ""}
                      onChange={(e) => setReplyText({ ...replyText, [comment.id]: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && replyText[comment.id]?.trim()) {
                          onReply(comment.id, replyText[comment.id]);
                          setReplyText({ ...replyText, [comment.id]: "" });
                        }
                      }}
                      className="input flex-1"
                      style={{ fontSize: "0.75rem", padding: "4px 8px" }}
                    />
                  </div>
                </div>

                {/* Resolve + menu */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => onResolve(comment.id)}
                    className={`btn-icon ${comment.status === "resolved" ? "text-[var(--accent)]" : ""}`}
                    style={{ width: 28, height: 28 }}
                    title="Resolve"
                  >
                    <CheckCircle size={15} />
                  </button>
                  <button className="btn-icon" style={{ width: 28, height: 28 }}>
                    <MoreHorizontal size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
