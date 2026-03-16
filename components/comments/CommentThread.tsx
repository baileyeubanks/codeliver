"use client";

import { useState } from "react";
import { MessageSquare, CheckCircle, ChevronDown, ChevronUp, MapPin } from "lucide-react";
import { timeAgo } from "@/lib/utils/media";
import TimecodeLink from "@/components/comments/TimecodeLink";
import CommentReactions from "@/components/comments/CommentReactions";
import AttachmentPreview from "@/components/comments/AttachmentPreview";
import type { Comment } from "@/lib/types/codeliver";

interface CommentThreadProps {
  comment: Comment;
  replies: Comment[];
  onReply?: (parentId: string) => void;
  onResolve?: (id: string) => void;
  onSeek?: (time: number) => void;
  index: number;
  canReply?: boolean;
  canResolve?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  showVisibilityLabel?: boolean;
}

function CommentCard({
  comment,
  onSeek,
  isReply,
  showVisibilityLabel,
}: {
  comment: Comment;
  onSeek?: (time: number) => void;
  isReply?: boolean;
  showVisibilityLabel?: boolean;
}) {
  return (
    <div className="flex gap-2.5">
      {/* Author initials */}
      <div
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
        </div>

        {/* Body */}
        {comment.rich_body ? (
          <div
            className="mt-1 text-sm leading-relaxed text-[var(--muted)]"
            dangerouslySetInnerHTML={{ __html: comment.rich_body }}
          />
        ) : (
          <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
            {comment.body}
          </p>
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

        {/* Reactions */}
        {comment.reactions && comment.reactions.length > 0 && (
          <div className="mt-2">
            <CommentReactions
              commentId={comment.id}
              reactions={comment.reactions}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default function CommentThread({
  comment,
  replies,
  onReply,
  onResolve,
  onSeek,
  index,
  canReply = true,
  canResolve = true,
  selected = false,
  onSelect,
  showVisibilityLabel = false,
}: CommentThreadProps) {
  const [expanded, setExpanded] = useState(replies.length <= 3);
  const isResolved = comment.status === "resolved";
  const visibleReplies = expanded ? replies : replies.slice(0, 3);
  const hiddenCount = replies.length - 3;

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
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
            isResolved
              ? "bg-[var(--green)]/15 text-[var(--green)]"
              : "bg-[var(--accent)]/15 text-[var(--accent)]"
          }`}
        >
          {index}
        </span>
        <div className="min-w-0 flex-1">
          <CommentCard comment={comment} onSeek={onSeek} showVisibilityLabel={showVisibilityLabel} />
        </div>
      </div>

      {/* Actions */}
      {(canReply && onReply) || (canResolve && onResolve) || isResolved ? (
        <div className="mt-3 flex items-center gap-3 pl-9">
          {canReply && onReply && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onReply(comment.id);
              }}
              className="flex items-center gap-1 text-xs text-[var(--muted)] transition-colors hover:text-[var(--accent)]"
            >
              <MessageSquare size={12} />
              Reply
            </button>
          )}
          {canResolve && onResolve && !isResolved && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onResolve(comment.id);
              }}
              className="flex items-center gap-1 text-xs text-[var(--muted)] transition-colors hover:text-[var(--green)]"
            >
              <CheckCircle size={12} />
              Resolve
            </button>
          )}
          {isResolved && (
            <span className="flex items-center gap-1 text-xs text-[var(--green)]">
              <CheckCircle size={12} />
              Resolved
            </span>
          )}
        </div>
      ) : null}

      {/* Replies */}
      {replies.length > 0 && (
        <div className="ml-6 mt-3 space-y-3 border-l-2 border-[var(--border)] pl-4">
          {visibleReplies.map((reply) => (
            <CommentCard
              key={reply.id}
              comment={reply}
              onSeek={onSeek}
              isReply
              showVisibilityLabel={showVisibilityLabel}
            />
          ))}

          {replies.length > 3 && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setExpanded(!expanded);
              }}
              className="flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
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
  );
}
