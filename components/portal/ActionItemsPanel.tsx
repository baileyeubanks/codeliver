import Link from "next/link";
import {
  CircleCheck,
  CircleHelp,
  MessageSquare,
  Upload,
} from "lucide-react";
import type { PortalActionItem, PortalActionKind } from "@/lib/portal/actions.ts";
import styles from "./Portal.module.css";

const KIND_ICONS: Record<PortalActionKind, typeof CircleCheck> = {
  approval: CircleCheck,
  feedback: MessageSquare,
  upload: Upload,
  question: CircleHelp,
};

export interface ActionItemsPanelProps {
  items: PortalActionItem[];
}

/**
 * "What we need from you" — approvals, feedback, uploads, unanswered
 * questions, each with one clear action. Empty state stays honest.
 */
export default function ActionItemsPanel({ items }: ActionItemsPanelProps) {
  return (
    <section
      className={`${styles.section} ${styles.actionSection}`}
      aria-labelledby="portal-actions-heading"
    >
      <div className={styles.sectionHeader}>
        <h2 id="portal-actions-heading">What we need from you</h2>
        {items.length > 0 ? (
          <p>
            {items.length} {items.length === 1 ? "item" : "items"}
          </p>
        ) : null}
      </div>
      {items.length === 0 ? (
        <div className={styles.emptyState}>
          <CircleCheck className={styles.emptyIcon} size={22} aria-hidden="true" />
          <p>
            You&rsquo;re all set.
            <span>Nothing needs your attention right now — we&rsquo;ll post here when it does.</span>
          </p>
        </div>
      ) : (
        <ul className={styles.actionList}>
          {items.map((item) => {
            const Icon = KIND_ICONS[item.kind];
            return (
              <li className={styles.actionItem} key={item.id}>
                <span className={styles.actionIcon} aria-hidden="true">
                  <Icon size={18} />
                </span>
                <div className={styles.actionBody}>
                  <p className={styles.actionTitle}>{item.title}</p>
                  <p className={styles.actionDetail}>{item.detail}</p>
                </div>
                {item.href ? (
                  <Link className={styles.cta} href={item.href}>
                    {item.actionLabel}
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
