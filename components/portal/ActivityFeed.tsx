import type { ClientActivityEvent } from "@/lib/portal/activity.ts";
import { formatPortalDate } from "@/lib/portal/views.ts";
import styles from "./Portal.module.css";

export interface ActivityFeedProps {
  events: ClientActivityEvent[];
}

/** Client-visible progress only — internal team noise is filtered out
 * upstream by clientSafeActivity, never rendered here. */
export default function ActivityFeed({ events }: ActivityFeedProps) {
  return (
    <section className={styles.section} aria-labelledby="portal-activity-heading">
      <div className={styles.sectionHeader}>
        <h2 id="portal-activity-heading">Recent activity</h2>
      </div>
      {events.length === 0 ? (
        <p className={styles.feedEmpty}>
          Progress will appear here as your projects move forward.
        </p>
      ) : (
        <ol className={styles.feedList}>
          {events.map((event) => (
            <li className={styles.feedItem} key={event.id}>
              <span className={styles.feedDot} aria-hidden="true" />
              <p className={styles.feedMessage}>{event.message}</p>
              <span className={styles.feedDate}>
                {formatPortalDate(event.createdAt)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
