"use client";

/**
 * P24 Comms tab — project conversations (review comment threads per asset,
 * linked through to the real review surface) plus the decision log: what was
 * decided, by whom, and when, from the record's approval/decision seeds.
 */

import Link from "next/link";
import { useMemo } from "react";
import { formatDateShort, formatDateTimeShort } from "@/lib/projects/dates.ts";
import { buildInternalDemoAssetHref } from "@/lib/demo/workspace";
import { useDemoWorkspace } from "@/lib/demo/workspace-store";
import styles from "./ProjectWorkspaceTabs.module.css";

const IMPLEMENTATION_LABELS: Record<string, string> = {
  pending: "Not started",
  in_progress: "In progress",
  done: "Done",
  wont_do: "Won’t do",
};

export default function ProjectCommsPanel({ projectId }: { projectId: string }) {
  const workspace = useDemoWorkspace();

  const decisions = useMemo(
    () =>
      workspace.decisions
        .filter((decision) => decision.project_id === projectId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [workspace.decisions, projectId],
  );

  const threads = (() => {
    const comments = workspace.reviewComments
      .filter((comment) => comment.project_id === projectId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    const byAsset = new Map<string, typeof comments>();
    for (const comment of comments) {
      const list = byAsset.get(comment.asset_id) ?? [];
      list.push(comment);
      byAsset.set(comment.asset_id, list);
    }
    return [...byAsset.entries()].map(([assetId, assetComments]) => ({
      assetId,
      title:
        workspace.assets.find((asset) => asset.id === assetId)?.title ?? "Untitled media",
      comments: assetComments,
    }));
  })();

  return (
    <div className={styles.panelInner}>
      <div className={styles.panelHeader}>
        <div>
          <h2 className={styles.panelTitle}>Comms</h2>
          <p className={styles.panelSubtitle}>
            Project conversations and the decision log — what was decided, by whom, and when.
          </p>
        </div>
      </div>

      <h3 className={styles.sectionHeading}>Decision log</h3>
      {decisions.length === 0 ? (
        <p className={styles.muted}>No decisions recorded on this project yet.</p>
      ) : (
        decisions.map((decision) => (
          <article key={decision.id} className={styles.decisionItem}>
            <h4 className={styles.decisionSubject}>{decision.subject}</h4>
            <p className={styles.decisionMeta}>
              Decided by {decision.decided_by} · {formatDateShort(decision.created_at)} ·{" "}
              {IMPLEMENTATION_LABELS[decision.implementation_status] ??
                decision.implementation_status}
            </p>
            <p className={styles.decisionBody}>{decision.body}</p>
          </article>
        ))
      )}

      <h3 className={styles.sectionHeading}>Conversations</h3>
      {threads.length === 0 ? (
        <p className={styles.muted}>No conversations on this project yet.</p>
      ) : (
        threads.map((thread) => (
          <section key={thread.assetId} className={styles.threadCard} aria-label={`Conversation on ${thread.title}`}>
            <div className={styles.threadHeader}>
              <h4 className={styles.threadTitle}>{thread.title}</h4>
              <Link
                className={styles.reviewLink}
                href={buildInternalDemoAssetHref(projectId, thread.assetId)}
              >
                Open in review
              </Link>
            </div>
            {thread.comments.map((comment) => (
              <div key={comment.id} className={styles.commentItem}>
                <p className={styles.commentMeta}>
                  <span className={styles.commentAuthor}>{comment.author_name}</span>
                  <span>{formatDateTimeShort(comment.created_at)}</span>
                  <span className={comment.status === "resolved" ? styles.chipSuccess : styles.chip}>
                    {comment.status === "resolved" ? "Resolved" : "Open"}
                  </span>
                </p>
                <p className={styles.commentBody}>{comment.body}</p>
              </div>
            ))}
          </section>
        ))
      )}
    </div>
  );
}
