import { Download } from "lucide-react";
import { formatPortalDate, type PortalDelivery } from "@/lib/portal/views.ts";
import styles from "./Portal.module.css";

export interface DeliveryListProps {
  deliveries: PortalDelivery[];
  projectNames: Record<string, string>;
}

/** Recently delivered work. Downloads only ever point at real files; a
 * master without a file on this demo server says so instead of faking one. */
export default function DeliveryList({ deliveries, projectNames }: DeliveryListProps) {
  if (deliveries.length === 0) return null;
  return (
    <section className={styles.section} aria-labelledby="portal-deliveries-heading">
      <div className={styles.sectionHeader}>
        <h2 id="portal-deliveries-heading">Recently delivered</h2>
      </div>
      <ul className={styles.rowList}>
        {deliveries.map((delivery) => (
          <li className={styles.rowItem} key={delivery.id}>
            <div className={styles.rowBody}>
              <p className={styles.rowTitle}>{delivery.name}</p>
              <p className={styles.rowMeta}>
                {projectNames[delivery.projectId] ?? "Project"}
                {delivery.deliveredAt
                  ? ` · Delivered ${formatPortalDate(delivery.deliveredAt)}`
                  : ""}
                {delivery.locked ? " · Locked" : ""}
              </p>
              {delivery.locked || delivery.formatChips.length > 0 ? (
                <span className={styles.formatChips}>
                  {delivery.locked ? (
                    <span className={styles.formatChip}>Locked</span>
                  ) : null}
                  {delivery.locked && delivery.checksum ? (
                    <span className={styles.formatChip} title={`Checksum ${delivery.checksum}`}>
                      sha256 {delivery.checksum.slice(0, 12)}…
                    </span>
                  ) : null}
                  {delivery.formatChips.map((chip) => (
                    <span className={styles.formatChip} key={chip}>
                      {chip}
                    </span>
                  ))}
                </span>
              ) : null}
            </div>
            <div className={styles.rowActions}>
              {delivery.downloadHref ? (
                <a className={styles.textLink} href={delivery.downloadHref} download>
                  <Download size={14} aria-hidden="true" />
                  Download
                </a>
              ) : (
                <span className={styles.onRequest}>Available on request</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
