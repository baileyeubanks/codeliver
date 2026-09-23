"use client";

import { useRef, useState, type ComponentType } from "react";
import {
  ChevronDown,
  Eye,
  MessageSquare,
  Share2,
  ShieldCheck,
} from "lucide-react";
import { useOverlay } from "@/components/overlay/useOverlay";
import styles from "./ReviewShareMenu.module.css";

/**
 * VA-018: the client handoff is three named modes, never one generic Share.
 * Review = client comments · Approval = client approves · Preview = view-only
 * guest link that needs no account. Each mode opens the share sheet with its
 * intent preselected and the current version pinned.
 */
export type ReviewShareMode = "client_review" | "approval_needed" | "preview";

interface ReviewShareModeDefinition {
  intent: ReviewShareMode;
  label: string;
  hint: string;
  icon: ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
}

export const REVIEW_SHARE_MODES: ReviewShareModeDefinition[] = [
  {
    intent: "client_review",
    label: "Share for Review",
    hint: "Client can comment",
    icon: MessageSquare,
  },
  {
    intent: "approval_needed",
    label: "Share for Approval",
    hint: "Client can approve",
    icon: ShieldCheck,
  },
  {
    intent: "preview",
    label: "Share for Preview",
    hint: "View only · no account",
    icon: Eye,
  },
];

interface ReviewShareMenuProps {
  disabled?: boolean;
  onSelect: (intent: ReviewShareMode) => void;
  /** Caller-owned button language (e.g. cockpit header action classes). */
  triggerClassName?: string;
  triggerLabel?: string;
  compact?: boolean;
}

export default function ReviewShareMenu({
  disabled = false,
  onSelect,
  triggerClassName,
  triggerLabel = "Share",
  compact = false,
}: ReviewShareMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuRef, menuStyle] = useOverlay({
    open,
    onClose: () => setOpen(false),
    anchorRef: triggerRef,
    side: "bottom",
    align: "end",
    offset: 8,
  });

  return (
    <div className={styles.root}>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName ?? styles.trigger}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Share2 size={compact ? 15 : 17} aria-hidden="true" />
        <span>{triggerLabel}</span>
        <ChevronDown size={compact ? 12 : 13} aria-hidden="true" />
      </button>
      {open ? (
        <div
          ref={menuRef}
          style={menuStyle}
          className={styles.menu}
          role="menu"
          aria-label="Share modes"
        >
          {REVIEW_SHARE_MODES.map((mode) => {
            const ModeIcon = mode.icon;
            return (
              <button
                key={mode.intent}
                type="button"
                role="menuitem"
                className={styles.item}
                onClick={() => {
                  setOpen(false);
                  onSelect(mode.intent);
                }}
              >
                <ModeIcon size={16} aria-hidden />
                <span className={styles.itemCopy}>
                  <strong>{mode.label}</strong>
                  <small>{mode.hint}</small>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
