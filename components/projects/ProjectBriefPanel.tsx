"use client";

/**
 * P24 Brief tab — the living creative brief.
 *
 * Objectives, audience, messaging, references, deliverables notes, and
 * standing brand guardrails, with honest version history: every version stays
 * on file, any version can be viewed, consecutive versions diff word by word,
 * and saving an edit appends a new draft version (never an overwrite).
 */

import { useMemo, useState, type FormEvent } from "react";
import {
  diffBriefVersions,
  sortBriefVersionsNewestFirst,
  type BriefLike,
  type TextDiffSegment,
} from "@/lib/projects/briefs.ts";
import { projectBrandGuardrails } from "@/lib/projects/guardrails.ts";
import { formatDateShort } from "@/lib/projects/dates.ts";
import { saveBrief, useDemoWorkspace } from "@/lib/demo/workspace-store";
import { currentBrief } from "@/lib/covideopro/record.ts";
import styles from "./ProjectWorkspaceTabs.module.css";

function DiffText({ segments }: { segments: TextDiffSegment[] }) {
  return (
    <p className={styles.briefField}>
      {segments.map((segment, index) => (
        <span
          key={index}
          className={
            segment.kind === "added"
              ? styles.diffAdded
              : segment.kind === "removed"
                ? styles.diffRemoved
                : undefined
          }
        >
          {segment.text}{" "}
        </span>
      ))}
    </p>
  );
}

function briefStatusLabel(status: string) {
  return status.replaceAll("_", " ");
}

export default function ProjectBriefPanel({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const workspace = useDemoWorkspace();
  const versions = useMemo(
    () =>
      sortBriefVersionsNewestFirst(
        workspace.briefs.filter((brief) => brief.project_id === projectId),
      ),
    [workspace.briefs, projectId],
  );
  const current = currentBrief(workspace.briefs.filter((brief) => brief.project_id === projectId));
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const viewed: BriefLike | null =
    versions.find((brief) => brief.version === selectedVersion) ?? current ?? versions[0] ?? null;
  const previous =
    viewed !== null
      ? versions.find((brief) => brief.version === viewed.version - 1) ?? null
      : null;
  const diff = viewed && previous ? diffBriefVersions(previous, viewed) : null;
  const guardrails = projectBrandGuardrails(projectId);

  function startEdit() {
    setEditing(true);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    saveBrief({
      projectId,
      objectives: String(data.get("objectives") ?? ""),
      audience: String(data.get("audience") ?? ""),
      message: String(data.get("message") ?? ""),
      references: String(data.get("references") ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      deliverablesNotes: String(data.get("deliverables_notes") ?? ""),
    });
    setEditing(false);
    setSelectedVersion(null);
  }

  return (
    <div className={styles.panelInner}>
      <div className={styles.panelHeader}>
        <div>
          <h2 className={styles.panelTitle}>Creative brief</h2>
          <p className={styles.panelSubtitle}>
            The living brief for {projectName} — every version stays on file.
          </p>
        </div>
        {!editing && (
          <button type="button" className={styles.primaryButton} onClick={startEdit}>
            {viewed ? "Edit brief" : "Start the brief"}
          </button>
        )}
      </div>

      {editing ? (
        <form className={`${styles.card} ${styles.editForm}`} onSubmit={onSubmit} aria-label="Edit creative brief">
          <label className={styles.editLabel}>
            Objectives
            <textarea
              className={styles.editInput}
              name="objectives"
              rows={3}
              required
              defaultValue={current?.objectives ?? ""}
            />
          </label>
          <label className={styles.editLabel}>
            Audience
            <textarea
              className={styles.editInput}
              name="audience"
              rows={2}
              required
              defaultValue={current?.audience ?? ""}
            />
          </label>
          <label className={styles.editLabel}>
            Messaging
            <textarea
              className={styles.editInput}
              name="message"
              rows={2}
              required
              defaultValue={current?.message ?? ""}
            />
          </label>
          <label className={styles.editLabel}>
            References (one per line)
            <textarea
              className={styles.editInput}
              name="references"
              rows={3}
              defaultValue={(current?.references ?? []).join("\n")}
            />
          </label>
          <label className={styles.editLabel}>
            Deliverables notes
            <textarea
              className={styles.editInput}
              name="deliverables_notes"
              rows={2}
              defaultValue={current?.deliverables_notes ?? ""}
            />
          </label>
          <div className={styles.editActions}>
            <button type="submit" className={styles.primaryButton}>
              Save as v{(current?.version ?? 0) + 1}
            </button>
            <button type="button" className={styles.secondaryButton} onClick={() => setEditing(false)}>
              Cancel
            </button>
            <span className={styles.editNote}>
              Saving creates a new draft version — earlier versions stay on file.
            </span>
          </div>
        </form>
      ) : viewed === null ? (
        <div className={styles.emptyState}>
          No creative brief yet. Start one to anchor objectives, audience, and messaging.
        </div>
      ) : (
        <>
          <div className={styles.versionRail} aria-label="Brief version history">
            {versions.map((brief) => (
              <button
                key={brief.version}
                type="button"
                className={
                  brief.version === viewed.version ? styles.versionButtonActive : styles.versionButton
                }
                aria-pressed={brief.version === viewed.version}
                onClick={() => setSelectedVersion(brief.version)}
              >
                <span>
                  v{brief.version}
                  <span className={styles.versionMeta}>
                    {briefStatusLabel(brief.status)} · {formatDateShort(brief.updated_at)}
                  </span>
                </span>
                {current && brief.version === current.version && (
                  <span className={styles.chipAccent}>Current</span>
                )}
              </button>
            ))}
          </div>

          {current && viewed.version !== current.version && (
            <p className={styles.viewingBanner} role="status">
              You’re viewing v{viewed.version} — the current brief is v{current.version}.
            </p>
          )}

          <section className={styles.card} aria-label={`Brief version ${viewed.version}`}>
            <h3 className={styles.briefFieldLabel}>Objectives</h3>
            <p className={styles.briefField}>{viewed.objectives}</p>
            <h3 className={styles.briefFieldLabel}>Audience</h3>
            <p className={styles.briefField}>{viewed.audience}</p>
            <h3 className={styles.briefFieldLabel}>Messaging</h3>
            <p className={styles.briefField}>{viewed.message}</p>
            <h3 className={styles.briefFieldLabel}>References</h3>
            {viewed.references.length > 0 ? (
              <ul className={styles.referenceList}>
                {viewed.references.map((reference) => (
                  <li key={reference} className={styles.chip}>{reference}</li>
                ))}
              </ul>
            ) : (
              <p className={styles.muted}>No references on this version.</p>
            )}
            {viewed.deliverables_notes && (
              <>
                <h3 className={styles.briefFieldLabel} style={{ marginTop: 14 }}>Deliverables notes</h3>
                <p className={styles.briefField}>{viewed.deliverables_notes}</p>
              </>
            )}
            {guardrails.length > 0 && (
              <>
                <h3 className={styles.briefFieldLabel} style={{ marginTop: 14 }}>Brand guardrails</h3>
                <ul className={styles.guardrailList}>
                  {guardrails.map((guardrail) => (
                    <li key={guardrail}>{guardrail}</li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {diff && (
            <section className={styles.card} aria-label={`Changes from v${diff.fromVersion} to v${diff.toVersion}`}>
              <h3 className={styles.cardTitle}>
                Changes from v{diff.fromVersion} → v{diff.toVersion}
              </h3>
              {diff.changedFieldCount === 0 ? (
                <p className={styles.muted}>No changes between these versions.</p>
              ) : (
                <>
                  {diff.fields.filter((field) => field.changed).map((field) => (
                    <div key={field.field}>
                      <h4 className={styles.briefFieldLabel}>{field.label}</h4>
                      <DiffText segments={field.segments} />
                    </div>
                  ))}
                  {(diff.references.added.length > 0 || diff.references.removed.length > 0) && (
                    <div>
                      <h4 className={styles.briefFieldLabel}>References</h4>
                      <ul className={styles.referenceList}>
                        {diff.references.unchanged.map((reference) => (
                          <li key={reference} className={styles.chip}>{reference}</li>
                        ))}
                        {diff.references.added.map((reference) => (
                          <li key={reference} className={styles.chipAccent}>+ {reference}</li>
                        ))}
                        {diff.references.removed.map((reference) => (
                          <li key={reference} className={styles.chip}>
                            <span className={styles.diffRemoved}>{reference}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
