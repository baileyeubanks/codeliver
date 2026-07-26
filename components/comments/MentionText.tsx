"use client";

import { splitMentionSegments } from "@/lib/comments/mentions";

interface MentionTextProps {
  text: string;
}

/** Renders a comment body with @mentions highlighted. */
export default function MentionText({ text }: MentionTextProps) {
  const segments = splitMentionSegments(text);
  return (
    <>
      {segments.map((segment, index) =>
        segment.mention ? (
          <span
            key={index}
            className="rounded-[var(--radius-sm)] bg-[var(--blue)]/10 px-0.5 font-medium text-[var(--blue)]"
          >
            {segment.text}
          </span>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}
