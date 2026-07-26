"use client";

import { useMemo } from "react";
import PortalShell from "@/components/portal/PortalShell";
import { useDemoMode } from "@/lib/demo/mode";
import { submitDemoRequest, useDemoWorkspace } from "@/lib/demo/workspace-store";
import { resolveClientIdentity } from "@/lib/portal/views.ts";
import RequestForm from "./RequestForm";

/** P27 client intake: the conversational request form inside the portal shell. */
export default function PortalRequestNew() {
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
  const clientName = identity.organizationName ?? "Client portal";
  const userName = identity.contactName ?? "Client reviewer";

  const assets = useMemo(
    () =>
      workspace.assets
        .filter((asset) => asset.file_type === "video")
        .map((asset) => ({ id: asset.id, title: asset.title })),
    [workspace.assets],
  );

  return (
    <PortalShell clientName={clientName} userName={userName}>
      <div className="mx-auto w-full max-w-2xl px-4 py-5" data-testid="portal-request-new">
        <div className="mb-4 border-b border-[var(--border)] pb-4">
          <p className="mb-1 text-[10px] font-bold uppercase text-[var(--dim)]">Requests</p>
          <h1 className="text-[22px] font-bold leading-tight text-[var(--ink)]">Make a request</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Two quick steps: what kind of work, then only the details that kind needs.
          </p>
        </div>
        <RequestForm
          assets={assets}
          onSubmit={(input) => submitDemoRequest({ ...input, requesterName: userName })}
          doneHref={demoMode ? "/portal/requests?demo=1" : "/portal/requests"}
          doneLabel="View your requests"
        />
      </div>
    </PortalShell>
  );
}
