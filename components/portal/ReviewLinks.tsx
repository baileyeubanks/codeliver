import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { PortalReviewItem, PortalReviewStatus } from "@/lib/portal/views.ts";
import styles from "./Portal.module.css";

const REVIEW_CHIP_CLASS: Record<PortalReviewStatus, string> = {
  "Needs Review": styles.chipNeedsReview,
  "Feedback Submitted": styles.chipSubmitted,
  Approved: styles.chipApproved,
};

export interface ReviewLinksProps {
  reviews: PortalReviewItem[];
  projectNames: Record<string, string>;
}

/** Latest review links with version labels and honest status chips, linking
 * to the real review surface (never a rebuilt one). */
export default function ReviewLinks({ reviews, projectNames }: ReviewLinksProps) {
  if (reviews.length === 0) return null;
  return (
    <section className={styles.section} aria-labelledby="portal-reviews-heading">
      <div className={styles.sectionHeader}>
        <h2 id="portal-reviews-heading">Latest reviews</h2>
      </div>
      <ul className={styles.rowList}>
        {reviews.map((review) => (
          <li className={styles.rowItem} key={review.id}>
            <div className={styles.rowBody}>
              <p className={styles.rowTitle}>
                {review.title}
                {review.versionLabel ? ` · ${review.versionLabel}` : ""}
              </p>
              <p className={styles.rowMeta}>
                {projectNames[review.projectId] ?? "Project"}
              </p>
            </div>
            <div className={styles.rowActions}>
              <span className={`${styles.chip} ${REVIEW_CHIP_CLASS[review.status]}`}>
                {review.status}
              </span>
              <Link className={styles.textLink} href={review.href}>
                Open review
                <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
