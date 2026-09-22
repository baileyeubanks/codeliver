"use client";

import { useEffect, useMemo, useState } from "react";
import { useDemoMode } from "@/lib/demo/mode";
import { useDemoWorkspace } from "@/lib/demo/workspace-store";
import { deriveActionItems } from "@/lib/portal/actions.ts";
import { clientSafeActivity } from "@/lib/portal/activity.ts";
import {
  activePortalProjects,
  latestReviews,
  recentDeliveries,
  resolveClientIdentity,
  type PortalDeliverableRef,
} from "@/lib/portal/views.ts";
import ActionItemsPanel from "./ActionItemsPanel";
import ActivityFeed from "./ActivityFeed";
import DeliveryList from "./DeliveryList";
import PortalShell from "./PortalShell";
import ProjectList from "./ProjectList";
import ReviewLinks from "./ReviewLinks";
import styles from "./Portal.module.css";

/**
 * P23 Client Dashboard — the client-facing home. Every panel is a pure
 * projection of the live demo workspace; nothing here is hardcoded copy.
 */
export default function PortalHome() {
  const demoMode = useDemoMode();
  const workspace = useDemoWorkspace();

  const identity = useMemo(
    () =>
      resolveClientIdentity(
        workspace.shareLinks,
        workspace.contacts,
        workspace.organizations,
      ),
    [workspace.shareLinks, workspace.contacts, workspace.organizations],
  );
  const actionItems = useMemo(
    () =>
      deriveActionItems({
        assets: workspace.assets,
        shareLinks: workspace.shareLinks,
        approvalStages: workspace.approvalStages,
      }),
    [workspace.assets, workspace.shareLinks, workspace.approvalStages],
  );
  const projects = useMemo(
    () =>
      activePortalProjects({
        projects: workspace.projects,
        planItems: workspace.planItems,
        assets: workspace.assets,
      }),
    [workspace.projects, workspace.planItems, workspace.assets],
  );
  const reviews = useMemo(
    () =>
      latestReviews({
        assets: workspace.assets,
        shareLinks: workspace.shareLinks,
      }),
    [workspace.assets, workspace.shareLinks],
  );
  // Locked delivery (6.4): delivered packages — including their lock state
  // and checksums — come from the canonical deliverables API for each active
  // project, not the demo store. Unavailable/auth-less views degrade to the
  // asset-driven rows only.
  const [deliverables, setDeliverables] = useState<PortalDeliverableRef[]>([]);
  useEffect(() => {
    let cancelled = false;
    const ids = projects.map((project) => project.id);
    if (ids.length === 0) {
      queueMicrotask(() => {
        if (!cancelled) setDeliverables([]);
      });
      return () => {
        cancelled = true;
      };
    }
    Promise.all(
      ids.map((id) =>
        fetch(`/api/projects/${id}/deliverables`, { cache: "no-store" })
          .then((response) =>
            response.ok ? response.json() : { deliverables: [] },
          )
          .then(
            (body: { deliverables?: PortalDeliverableRef[] }) =>
              body.deliverables ?? [],
          )
          .catch(() => [] as PortalDeliverableRef[]),
      ),
    ).then((lists) => {
      if (!cancelled) setDeliverables(lists.flat());
    });
    return () => {
      cancelled = true;
    };
  }, [projects]);

  const deliveries = useMemo(
    () =>
      recentDeliveries({
        deliverables,
        assets: workspace.assets,
      }),
    [deliverables, workspace.assets],
  );
  const events = useMemo(
    () => clientSafeActivity(workspace.activity),
    [workspace.activity],
  );

  const projectNames = useMemo(
    () =>
      Object.fromEntries(
        workspace.projects.map((project) => [project.id, project.name]),
      ),
    [workspace.projects],
  );

  const clientName = identity.organizationName ?? "Client portal";
  const userName = identity.contactName ?? "Client reviewer";
  const firstName = userName.split(" ")[0] ?? userName;

  return (
    <PortalShell clientName={clientName} userName={userName}>
      <div className={styles.hero}>
        <h1>Welcome back, {firstName}</h1>
        <p>Here&rsquo;s where things stand across your projects with Content Co-op.</p>
      </div>
      <ActionItemsPanel items={actionItems} demoMode={demoMode} />
      <ProjectList projects={projects} />
      <div className={styles.splitGrid}>
        <ReviewLinks reviews={reviews} projectNames={projectNames} />
        <DeliveryList deliveries={deliveries} projectNames={projectNames} />
      </div>
      <ActivityFeed events={events} />
    </PortalShell>
  );
}
