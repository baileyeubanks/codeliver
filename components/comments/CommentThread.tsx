"use client";

import { useState } from "react";
import {
  MessageSquare,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  MapPin,
  Pencil,
  Trash2,
} from "lucide-react";
import { timeAgo } from "@/lib/utils/media";
import { shouldClamp } from "@/lib/comments/clamp";
import TimecodeLink from "@/components/comments/TimecodeLink";
import CommentReactions from "@/components/comments/CommentReactions";
import AttachmentPreview from "@/components/comments/AttachmentPreview";
import MentionText from "@/components/comments/MentionText";
import ReplyComposer from "@/components/comments/ReplyComposer";
import type { Comment, MentionRosterEntry } from "@/lib/types/codeliver";

const DEMO_NOTE = "Demo only — changes are not saved.";

interface CommentActionHandlers {
  currentUserId?: string;
  roster?: MentionRosterEntry[];
  demoMode?: boolean;
  onEdit?: (id: string, body: string) => void;
  onDelete?: (id: string) => void;
  onDemoNote: (message: string) => void;
}

interface CommentCardProps extends CommentActionHandlers {
  comment: Comment;
  onSeek?: (time: number) => void;
  isReply?: boolean;
  showVisibilityLabel?: boolean;
}

function CommentCard({
  comment,
  onSeek,
  isReply,
  showVisibilityLabel,
  currentUserId,
  demoMode,
  onEdit,
  onDelete,
  onDemoNote,
}: CommentCardProps) {
  const [bodyExpanded, setBodyExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(comment.body);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const clamped = !comment.rich_body && shouldClamp(comment.body);
  const canEdit = Boolean(onEdit) || Boolean(demoMode);
  const canDelete = Boolean(onDelete) || Boolean(demoMode);

  function saveEdit() {
    const body = editDraft.trim();
    if (!body) return;
    if (onEdit) {
      onEdit(comment.id, body);
    } else {
      onDemoNote(DEMO_NOTE);
    }
    setEditing(false);
  }

  function confirmDelete() {
    if (onDelete) {
      onDelete(comment.id);
    } else {
      onDemoNote(DEMO_NOTE);
    }
    setConfirmingDelete(false);
  }

  return (
    <div className="group/card flex gap-2.5">
      {/* Author initials */}
      <div
        aria-hidden
        className={`flex shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/20 text-[var(--accent)] ${
          isReply ? "h-6 w-6 text-[9px]" : "h-8 w-8 text-[10px]"
        } font-semibold`}
      >
        {(comment.author_name || "?")
          .split(" ")
          .map((w) => w[0])
          .join("")
          .toUpperCase()
          .slice(0, 2)}
      </div>

      <div className="min-w-0 flex-1">
        {/* Header */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[var(--ink)]">
            {comment.author_name || "Anonymous"}
          </span>
          {comment.timecode_seconds != null && (
            <TimecodeLink
              seconds={comment.timecode_seconds}
              onClick={() => onSeek?.(comment.timecode_seconds!)}
            />
          )}
          {(comment.pin_x != null || comment.pin_y != null) && (
            <span className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--orange)]/10 px-2 py-0.5 text-xs text-[var(--orange)]">
              <MapPin size={10} />
              Pin
            </span>
          )}
          {showVisibilityLabel && !isReply ? (
            <span
              className={`inline-flex items-center rounded-[var(--radius-sm)] px-2 py-0.5 text-xs ${
                comment.visibility === "external"
                  ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                  : "bg-[var(--surface-2)] text-[var(--muted)]"
              }`}
            >
              {comment.visibility === "external" ? "External" : "Internal"}
            </span>
          ) : null}
          <span className="text-xs text-[var(--dim)]">
            {timeAgo(comment.created_at)}
          </span>

          {/* Hover actions: edit / delete */}
          {(canEdit || canDelete) && !editing && !confirmingDelete && (
            <span className="ml-auto flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover/card:opacity-100">
              {canEdit && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setEditDraft(comment.body);
                    setEditing(true);
                  }}
                  aria-label={`Edit comment by ${comment.author_name || "Anonymous"}`}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded text-[var(--dim)] transition-colors hover:text-[var(--accent)] sm:min-h-0 sm:min-w-0 sm:p-1"
                >
                  <Pencil size={12} />
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setConfirmingDelete(true);
                  }}
                  aria-label={`Delete comment by ${comment.author_name || "Anonymous"}`}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded text-[var(--dim)] transition-colors hover:text-[var(--red)] sm:min-h-0 sm:min-w-0 sm:p-1"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </span>
          )}
        </div>

        {/* Body / inline edit / delete confirm */}
        {editing ? (
          <div className="mt-1">
            <textarea
              value={editDraft}
              onChange={(event) => setEditDraft(event.target.value)}
              aria-label="Edit comment body"
              rows={3}
              className="w-full resize-y rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] focus:border-[var(--accent)] focus:outline-none"
            />
            <div className="mt-1.5 flex items-center gap-2">
              <button
                type="button"
                onClick={saveEdit}
                disabled={!editDraft.trim()}
                className="min-h-[44px] rounded-[var(--radius-sm)] bg-[var(--accent)] px-3 text-xs font-semibold text-black disabled:opacity-40 sm:min-h-0 sm:py-1"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="min-h-[44px] px-2 text-xs text-[var(--muted)] hover:text-[var(--ink)] sm:min-h-0"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : confirmingDelete ? (
          <div
            role="alert"
            className="mt-1 rounded-[var(--radius-sm)] border border-[var(--red)]/30 bg-[var(--red)]/5 px-3 py-2"
          >
            <p className="text-xs text-[var(--ink)]">
              Delete this comment? This cannot be undone.
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <button
                type="button"
                onClick={confirmDelete}
                className="min-h-[44px] rounded-[var(--radius-sm)] bg-[var(--red)] px-3 text-xs font-semibold text-white sm:min-h-0 sm:py-1"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="min-h-[44px] px-2 text-xs text-[var(--muted)] hover:text-[var(--ink)] sm:min-h-0"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : comment.rich_body ? (
          <div
            className="mt-1 text-sm leading-relaxed text-[var(--muted)]"
            dangerouslySetInnerHTML={{ __html: comment.rich_body }}
          />
        ) : (
          <>
            <p
              className={`mt-1 whitespace-pre-wrap text-sm leading-relaxed text-[var(--muted)] ${
                clamped && !bodyExpanded ? "line-clamp-3" : ""
              }`}
            >
              <MentionText text={comment.body} />
            </p>
            {clamped && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setBodyExpanded((value) => !value);
                }}
                aria-expanded={bodyExpanded}
                className="mt-0.5 flex min-h-[44px] items-center text-xs text-[var(--accent)] hover:underline sm:min-h-0"
              >
                {bodyExpanded ? "Show less" : "Show more"}
              </button>
            )}
          </>
        )}

        {/* Annotation preview */}
        {comment.annotations && comment.annotations.length > 0 && (
          <div className="mt-2 inline-block rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-xs text-[var(--dim)]">
            {comment.annotations.length} annotation{comment.annotations.length !== 1 ? "s" : ""}
          </div>
        )}

        {/* Attachments */}
        {comment.attachments?.map((att) => (
          <AttachmentPreview key={att.id} attachment={att} />
        ))}

        {/* Reactions (local state unless a backend is wired) */}
        <div className="mt-2">
          <CommentReactions
            commentId={comment.id}
            reactions={comment.reactions ?? []}
            userId={currentUserId}
            persist={!demoMode}
          />
        </div>
      </div>
    </div>
  );
}

interface CommentThreadProps {
  comment: Comment;
  replies: Comment[];
  onReply?: (parentId: string) => void;
  onReplySubmit?: (parentId: string, body: string, mentions: string[]) => void;
  onResolve?: (id: string) => void;
  onUnresolve?: (id: string) => void;
  onEdit?: (id: string, body: string) => void;
  onDelete?: (id: string) => void;
  onSeek?: (time: number) => void;
  index: number;
  canReply?: boolean;
  canResolve?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  showVisibilityLabel?: boolean;
  roster?: MentionRosterEntry[];
  currentUserId?: string;
  /** Honest demo mode: actions without callbacks surface a not-saved note. */
  demoMode?: boolean;
}

export default function CommentThread({
  comment,
  replies,
  onReply,
  onReplySubmit,
  onResolve,
  onUnresolve,
  onEdit,
  onDelete,
  onSeek,
  index,
  canReply = true,
  canResolve = true,
  selected = false,
  onSelect,
  showVisibilityLabel = false,
  roster,
  currentUserId,
  demoMode = false,
}: CommentThreadProps) {
  const [expanded, setExpanded] = useState(replies.length <= 3);
  const [repliesCollapsed, setRepliesCollapsed] = useState(false);
  const [resolvedOpen, setResolvedOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [demoNote, setDemoNote] = useState<string | null>(null);

  const isResolved = comment.status === "resolved";
  const visibleReplies = expanded ? replies : replies.slice(0, 3);
  const hiddenCount = replies.length - 3;
  const resolveHandler = isResolved ? (onUnresolve ?? onResolve) : onResolve;

  const cardHandlers: CommentActionHandlers = {
    currentUserId,
    roster,
    demoMode,
    onEdit,
    onDelete,
    onDemoNote: setDemoNote,
  };

  function handleReplyClick() {
    if (onReplySubmit || demoMode) {
      setReplyOpen((value) => !value);
    } else {
      onReply?.(comment.id);
    }
  }

  function handleReplySubmit(body: string, mentions: string[]) {
    if (onReplySubmit) {
      onReplySubmit(comment.id, body, mentions);
      setReplyOpen(false);
    } else {
      setDemoNote(DEMO_NOTE);
    }
  }

  function handleResolveClick() {
    if (resolveHandler) {
      resolveHandler(comment.id);
    } else {
      setDemoNote(DEMO_NOTE);
    }
  }

  // Resolved threads collapse to a compact row by default.
  if (isResolved && !resolvedOpen) {
    return (
      <div
        className={`rounded-[var(--radius)] border border-[var(--green)]/20 bg-[var(--bg)]/72 px-4 py-3 opacity-75 transition-colors ${
          onSelect ? "cursor-pointer hover:border-[var(--accent)]/50" : ""
        }`}
        onClick={onSelect}
        role={onSelect ? "button" : undefined}
        tabIndex={onSelect ? 0 : undefined}
        onKeyDown={
          onSelect
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect();
                }
              }
            : undefined
        }
      >
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--green)]/15 text-xs font-bold text-[var(--green)]"
          >
            {index}
          </span>
          <CheckCircle size={12} className="shrink-0 text-[var(--green)]" aria-hidden />
          <span className="shrink-0 text-xs font-medium text-[var(--green)]">
            Resolved
          </span>
          <span className="min-w-0 truncate text-sm text-[var(--muted)]">
            {comment.author_name || "Anonymous"}: {comment.body}
          </span>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setResolvedOpen(true);
            }}
            aria-expanded={false}
            aria-label={`Expand resolved thread ${index}`}
            className="ml-auto flex min-h-[44px] shrink-0 items-center gap-1 px-2 text-xs text-[var(--accent)] hover:underline sm:min-h-0"
          >
            <ChevronDown size={12} />
            Expand
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-[var(--radius)] border bg-[var(--bg)]/72 p-4 transition-colors ${
        selected
          ? "border-[var(--accent)] shadow-[0_0_0_1px_var(--accent)]"
          : isResolved
            ? "border-[var(--green)]/20 opacity-75"
            : "border-[var(--border)]"
      } ${onSelect ? "cursor-pointer hover:border-[var(--accent)]/50" : ""}`}
      onClick={onSelect}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onKeyDown={
        onSelect
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect();
              }
            }
          : undefined
      }
    >
      {/* Numbered badge + main comment */}
      <div className="flex gap-3">
        <span
          aria-hidden
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
            isResolved
              ? "bg-[var(--green)]/15 text-[var(--green)]"
              : "bg-[var(--accent)]/15 text-[var(--accent)]"
          }`}
        >
          {index}
        </span>
        <div className="min-w-0 flex-1">
          <CommentCard
            comment={comment}
            onSeek={onSeek}
            showVisibilityLabel={showVisibilityLabel}
            {...cardHandlers}
          />
        </div>
      </div>

      {/* Actions */}
      {(canReply && (onReply || onReplySubmit || demoMode)) ||
      (canResolve && (resolveHandler || demoMode)) ||
      isResolved ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 pl-9">
          {canReply && (onReply || onReplySubmit || demoMode) && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                handleReplyClick();
              }}
              aria-expanded={replyOpen}
              className="flex min-h-[44px] items-center gap-1 text-xs text-[var(--muted)] transition-colors hover:text-[var(--accent)] sm:min-h-0"
            >
              <MessageSquare size={12} />
              Reply
            </button>
          )}
          {canResolve && (resolveHandler || demoMode) && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                handleResolveClick();
              }}
              className={`flex min-h-[44px] items-center gap-1 text-xs transition-colors sm:min-h-0 ${
                isResolved
                  ? "text-[var(--green)] hover:text-[var(--muted)]"
                  : "text-[var(--muted)] hover:text-[var(--green)]"
              }`}
            >
              <CheckCircle size={12} />
              {isResolved ? "Unresolve" : "Resolve"}
            </button>
          )}
          {isResolved && !(canResolve && (resolveHandler || demoMode)) && (
            <span className="flex items-center gap-1 text-xs text-[var(--green)]">
              <CheckCircle size={12} />
              Resolved
            </span>
          )}
          {isResolved && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setResolvedOpen(false);
              }}
              aria-label={`Collapse resolved thread ${index}`}
              className="flex min-h-[44px] items-center gap-1 text-xs text-[var(--dim)] hover:text-[var(--muted)] sm:min-h-0"
            >
              <ChevronUp size={12} />
              Collapse
            </button>
          )}
          {demoNote && (
            <span role="status" className="text-xs text-[var(--orange)]">
              {demoNote}
            </span>
          )}
        </div>
      ) : null}

      {/* Reply composer */}
      {replyOpen && (
        <div className="mt-3 pl-9">
          <ReplyComposer
            roster={roster}
            onSubmit={handleReplySubmit}
            onCancel={() => setReplyOpen(false)}
            autoFocus
          />
        </div>
      )}

      {/* Replies */}
      {replies.length > 0 && (
        <div className="ml-6 mt-3">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setRepliesCollapsed((value) => !value);
            }}
            aria-expanded={!repliesCollapsed}
            className="flex min-h-[44px] items-center gap-1 text-xs text-[var(--muted)] transition-colors hover:text-[var(--ink)] sm:min-h-0"
          >
            {repliesCollapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
            {replies.length} {replies.length === 1 ? "reply" : "replies"}
          </button>

          {!repliesCollapsed && (
            <div className="mt-2 space-y-3 border-l-2 border-[var(--border)] pl-4">
              {visibleReplies.map((reply) => (
                <CommentCard
                  key={reply.id}
                  comment={reply}
                  onSeek={onSeek}
                  isReply
                  showVisibilityLabel={showVisibilityLabel}
                  {...cardHandlers}
                />
              ))}

              {replies.length > 3 && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setExpanded(!expanded);
                  }}
                  aria-expanded={expanded}
                  className="flex min-h-[44px] items-center gap-1 text-xs text-[var(--accent)] hover:underline sm:min-h-0"
                >
                  {expanded ? (
                    <>
                      <ChevronUp size={12} />
                      Show less
                    </>
                  ) : (
                    <>
                      <ChevronDown size={12} />
                      Show {hiddenCount} more {hiddenCount === 1 ? "reply" : "replies"}
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
