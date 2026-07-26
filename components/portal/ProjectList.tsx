import Image from "next/image";
import { CalendarDays, Film } from "lucide-react";
import type { ClientProjectStatus } from "@/lib/portal/status.ts";
import type { PortalProjectView } from "@/lib/portal/views.ts";
import styles from "./Portal.module.css";

const STATUS_CHIP_CLASS: Record<ClientProjectStatus, string> = {
  Planning: styles.chipPlanning,
  Production: styles.chipProduction,
  Editing: styles.chipEditing,
  "Awaiting Feedback": styles.chipAwaiting,
  "Final Delivery": styles.chipDelivery,
};

export interface ProjectListProps {
  projects: PortalProjectView[];
}

/** Active projects with plain-language status, next milestone, thumbnail. */
export default function ProjectList({ projects }: ProjectListProps) {
  if (projects.length === 0) return null;
  return (
    <section className={styles.section} aria-labelledby="portal-projects-heading">
      <div className={styles.sectionHeader}>
        <h2 id="portal-projects-heading">Your projects</h2>
        <p>
          {projects.length} active
        </p>
      </div>
      <ul className={styles.projectGrid}>
        {projects.map((project) => (
          <li className={styles.projectCard} key={project.id}>
            <div className={styles.projectThumb}>
              {project.thumbnailUrl ? (
                <Image
                  src={project.thumbnailUrl}
                  alt=""
                  fill
                  sizes="(max-width: 640px) 100vw, 260px"
                  style={{ objectFit: "cover" }}
                  unoptimized
                />
              ) : (
                <span className={styles.projectThumbFallback} aria-hidden="true">
                  <Film size={22} />
                </span>
              )}
            </div>
            <div className={styles.projectBody}>
              <span className={`${styles.chip} ${STATUS_CHIP_CLASS[project.status]}`}>
                {project.status}
              </span>
              <p className={styles.projectName}>{project.name}</p>
              <p className={styles.projectMeta}>
                <CalendarDays size={13} aria-hidden="true" />
                {project.milestoneTitle
                  ? `Next: ${project.milestoneTitle}${
                      project.nextDateLabel ? ` · ${project.nextDateLabel}` : ""
                    }`
                  : "Schedule in progress"}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
