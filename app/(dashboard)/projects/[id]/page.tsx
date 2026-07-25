import { notFound } from "next/navigation";
import { headers } from "next/headers";
import ProjectWorkspaceClient from "@/components/projects/ProjectWorkspaceClient";
import { getProjectAccess } from "@/lib/access-control";
import { BackendUnavailableError } from "@/lib/api/backend";
import { requireAuth } from "@/lib/auth";
import { isKnownDemoProjectRoute, isProductionRecordId } from "@/lib/dynamic-route-authority";
import { isLocalDemoServerRequest } from "@/lib/demo/server-mode";

export default async function ProjectWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ demo?: string }>;
}) {
  const [{ id }, query, requestHeaders] = await Promise.all([params, searchParams, headers()]);
  const isDemo = isLocalDemoServerRequest({
    host: requestHeaders.get("host") ?? "",
    demo: query.demo,
  });

  if (isDemo) {
    if (!isKnownDemoProjectRoute(id)) notFound();
    return <ProjectWorkspaceClient />;
  }

  if (!isProductionRecordId(id)) notFound();
  const user = await requireAuth();
  if (!user) notFound();
  const projectAccess = await getProjectAccess(id, user.id, "viewer");
  if (!projectAccess.ok) {
    if (projectAccess.status === 404) notFound();
    throw new BackendUnavailableError("Project database");
  }

  return <ProjectWorkspaceClient />;
}
