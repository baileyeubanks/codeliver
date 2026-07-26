"use client";

/**
 * P24 Team tab — client stakeholders (from the CRM contacts on the project's
 * organization) and the Content Co-op owners on the record (workspace owner +
 * crew). Contact details render only where seeded.
 */

import { useDemoWorkspace } from "@/lib/demo/workspace-store";
import styles from "./ProjectWorkspaceTabs.module.css";

interface Person {
  id: string;
  name: string;
  role: string;
  email: string | null;
  phone: string | null;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function PersonCard({ person }: { person: Person }) {
  return (
    <div className={styles.personCard}>
      <span className={styles.avatar} aria-hidden="true">
        {initials(person.name)}
      </span>
      <div>
        <p className={styles.personName}>{person.name}</p>
        <p className={styles.personRole}>{person.role}</p>
        {person.email && (
          <p className={styles.personContact}>
            <a href={`mailto:${person.email}`}>{person.email}</a>
          </p>
        )}
        {person.phone && <p className={styles.personContact}>{person.phone}</p>}
      </div>
    </div>
  );
}

export default function ProjectTeamPanel({ projectId }: { projectId: string }) {
  const workspace = useDemoWorkspace();
  const project = workspace.projects.find((candidate) => candidate.id === projectId);

  const clientTeam: Person[] = !project?.organization_id
    ? []
    : workspace.contacts
        .filter((contact) => contact.organization_id === project.organization_id)
        .map((contact) => ({
          id: contact.id,
          name: contact.name,
          role: contact.role ?? "Client stakeholder",
          email: contact.email || null,
          phone: null,
        }));

  const coopTeam: Person[] = [
    {
      id: "owner",
      name: `${workspace.settings.profile.firstName} ${workspace.settings.profile.lastName}`.trim(),
      role: "Owner — Content Co-op",
      email: workspace.session.email || null,
      phone: null,
    },
    ...workspace.crewMembers
      .filter((member) => member.project_id === projectId)
      .map((member) => ({
        id: member.id,
        name: member.name,
        role: member.role,
        email: null,
        phone: member.contact,
      })),
  ];

  const organization = workspace.organizations.find(
    (candidate) => candidate.id === project?.organization_id,
  );

  return (
    <div className={styles.panelInner}>
      <div className={styles.panelHeader}>
        <div>
          <h2 className={styles.panelTitle}>Team directory</h2>
          <p className={styles.panelSubtitle}>
            Client stakeholders and Content Co-op owners on this project.
          </p>
        </div>
      </div>

      <h3 className={styles.sectionHeading}>
        {organization ? `${organization.name} — client stakeholders` : "Client stakeholders"}
      </h3>
      {clientTeam.length === 0 ? (
        <div className={styles.emptyState}>No client contacts linked to this project yet.</div>
      ) : (
        <div className={styles.teamGrid}>
          {clientTeam.map((person) => (
            <PersonCard key={person.id} person={person} />
          ))}
        </div>
      )}

      <h3 className={styles.sectionHeading}>Content Co-op</h3>
      <div className={styles.teamGrid}>
        {coopTeam.map((person) => (
          <PersonCard key={person.id} person={person} />
        ))}
      </div>
    </div>
  );
}
