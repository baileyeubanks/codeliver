import { NextResponse } from "next/server";
import { getProjectAccess } from "@/lib/access-control";
import { requireAuthWithClient } from "@/lib/auth-client";
import {
  buildProjectOperatingRecord,
  type ProjectOperatingHandoffInput,
  type ProjectOperatingPlanInput,
  type ProjectOperatingScriptInput,
} from "@/lib/co-produce/project-operating-record";
import { getSupabaseDataSchema } from "@/lib/data-authority";
import {
  parseProductionPlanSnapshot,
  type ProductionPlanSnapshot,
} from "@/lib/preproduction/production-plan";
import {
  parseProjectScriptSnapshot,
  type ProjectScriptSnapshot,
} from "@/lib/preproduction/project-script";

interface ProjectRow {
  id: string;
  name: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface AssetRow {
  id: string;
  status: string;
  updated_at: string;
  comments: unknown;
  versions: unknown;
  approvals: unknown;
}

interface OperatingSourceRow {
  receipt_id: string;
  display_number: string;
  package_id: string;
  package_version: number;
  proposal_version_id: string;
  quote_version_id: string;
  activated_at: string;
  production_start_date: string | null;
  production_due_date: string | null;
  production_constraints: unknown;
  client_id: string | null;
  opportunity_id: string | null;
  brief_id: string | null;
  scope_item_ids: unknown;
  deliverables: unknown;
  production_modules: unknown;
  preproject_origin_linked: boolean;
  source_inquiry_id: string | null;
  primary_contact_id: string | null;
  canonical_brief_content_hash: string | null;
  opportunity_authority_version: number | null;
  preproject_origin_link_hash: string | null;
  project_brief_revision_id: unknown;
  source_creative_brief_revision_id: unknown;
  project_brief_revision_number: unknown;
  project_brief_title: unknown;
  project_brief_objectives: unknown;
  project_brief_audiences: unknown;
  project_brief_key_messages: unknown;
  project_brief_requested_deliverables: unknown;
  project_brief_constraints: unknown;
  project_brief_references: unknown;
  project_brief_success_criteria: unknown;
  project_brief_content: unknown;
  project_brief_content_hash: unknown;
  project_brief_created_at: unknown;
  source_proposal_request_receipt_id: unknown;
  source_activation_authorization_receipt_id: unknown;
}

interface ManualOriginRow {
  created_at: string;
}

interface LatestCommentActivityRow {
  updated_at: string | null;
}

const OPERATING_SOURCE_COLUMNS = [
  "receipt_id",
  "display_number",
  "package_id",
  "package_version",
  "proposal_version_id",
  "quote_version_id",
  "activated_at",
  "production_start_date",
  "production_due_date",
  "production_constraints",
  "client_id",
  "opportunity_id",
  "brief_id",
  "scope_item_ids",
  "deliverables",
  "production_modules",
  "preproject_origin_linked",
  "source_inquiry_id",
  "primary_contact_id",
  "canonical_brief_content_hash",
  "opportunity_authority_version",
  "preproject_origin_link_hash",
  "project_brief_revision_id",
  "source_creative_brief_revision_id",
  "project_brief_revision_number",
  "project_brief_title",
  "project_brief_objectives",
  "project_brief_audiences",
  "project_brief_key_messages",
  "project_brief_requested_deliverables",
  "project_brief_constraints",
  "project_brief_references",
  "project_brief_success_criteria",
  "project_brief_content",
  "project_brief_content_hash",
  "project_brief_created_at",
  "source_proposal_request_receipt_id",
  "source_activation_authorization_receipt_id",
].join(", ");

function relationCount(value: unknown) {
  if (!Array.isArray(value)) return 0;
  const candidate = value[0];
  if (!candidate || typeof candidate !== "object") return 0;
  const count = (candidate as { count?: unknown }).count;
  return typeof count === "number" && Number.isFinite(count)
    ? Math.max(0, Math.trunc(count))
    : 0;
}

function approvalStatuses(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const status = (candidate as { status?: unknown }).status;
    return typeof status === "string" ? [status] : [];
  });
}

function exactCount(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function latestCommentActivityAt(value: unknown) {
  if (!Array.isArray(value)) return null;
  const updatedAt = (value[0] as LatestCommentActivityRow | undefined)?.updated_at;
  return typeof updatedAt === "string" && Number.isFinite(Date.parse(updatedAt))
    ? updatedAt
    : null;
}

function handoffInput(row: OperatingSourceRow | null): ProjectOperatingHandoffInput | null {
  if (!row) return null;
  return {
    receiptId: row.receipt_id,
    activatedAt: row.activated_at,
    displayNumber: row.display_number,
    packageId: row.package_id,
    packageVersion: row.package_version,
    proposalVersionId: row.proposal_version_id,
    quoteVersionId: row.quote_version_id,
    projectSeed: {
      productionWindow: {
        startDate: row.production_start_date,
        dueDate: row.production_due_date,
        constraints: row.production_constraints,
      },
    },
    productionSeed: {
      clientId: row.client_id,
      opportunityId: row.opportunity_id,
      briefId: row.brief_id,
      scopeItemIds: row.scope_item_ids,
      deliverables: row.deliverables,
      productionModules: row.production_modules,
    },
    origin: {
      linked: row.preproject_origin_linked === true,
      sourceInquiryId: row.source_inquiry_id,
      primaryContactId: row.primary_contact_id,
      briefContentHash: row.canonical_brief_content_hash,
      opportunityAuthorityVersion: row.opportunity_authority_version,
      linkHash: row.preproject_origin_link_hash,
    },
    brief: {
      revisionId: row.project_brief_revision_id,
      sourceCreativeBriefRevisionId: row.source_creative_brief_revision_id,
      revisionNumber: row.project_brief_revision_number,
      title: row.project_brief_title,
      objectives: row.project_brief_objectives,
      audiences: row.project_brief_audiences,
      keyMessages: row.project_brief_key_messages,
      requestedDeliverables: row.project_brief_requested_deliverables,
      constraints: row.project_brief_constraints,
      references: row.project_brief_references,
      successCriteria: row.project_brief_success_criteria,
      content: row.project_brief_content,
      contentHash: row.project_brief_content_hash,
      createdAt: row.project_brief_created_at,
      sourceProposalRequestReceiptId: row.source_proposal_request_receipt_id,
      sourceActivationAuthorizationReceiptId:
        row.source_activation_authorization_receipt_id,
    },
  };
}

function planInput(snapshot: ProductionPlanSnapshot): ProjectOperatingPlanInput | null {
  if (!snapshot.plan) return null;
  const taskCount = snapshot.tasks.length;
  const completedTaskCount = snapshot.tasks.filter(
    (task) => task.status === "completed",
  ).length;
  const blockedTaskCount = snapshot.tasks.filter(
    (task) => task.status === "blocked",
  ).length;
  const updatedAt = snapshot.tasks.reduce(
    (latest, task) => Date.parse(task.updatedAt) > Date.parse(latest) ? task.updatedAt : latest,
    snapshot.plan.createdAt,
  );
  return {
    revisionNumber: snapshot.plan.revisionNumber,
    title: snapshot.plan.title,
    createdAt: snapshot.plan.createdAt,
    taskCount,
    completedTaskCount,
    blockedTaskCount,
    updatedAt,
  };
}

function scriptInput(
  snapshot: ProjectScriptSnapshot,
): ProjectOperatingScriptInput | null {
  if (!snapshot.head) return null;
  return {
    revisionNumber: snapshot.head.revisionNumber,
    title: snapshot.head.content.title,
    state: snapshot.head.state,
    format: snapshot.head.content.format,
    estimatedRuntimeSeconds: snapshot.head.content.estimatedRuntimeSeconds,
    sectionCount: snapshot.head.content.sections.length,
    createdAt: snapshot.head.createdAt,
  };
}

function canReadScript(role: string) {
  return ["owner", "admin", "producer", "editor", "member"].includes(role);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, supabase } = await requireAuthWithClient();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const access = await getProjectAccess(id, user.id, "viewer", supabase);
  if (!access.ok) {
    return NextResponse.json(
      { error: access.error },
      { status: access.status },
    );
  }

  const isolated = getSupabaseDataSchema() === "co_production";
  const assetQuery = supabase
    .from("assets")
    .select(
      "id, status, updated_at, comments(count), versions(count), approvals(status)",
    )
    .eq("project_id", id)
    .order("updated_at", { ascending: false });
  const [projectResult, assetResult] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, status, created_at, updated_at")
      .eq("id", id)
      .maybeSingle(),
    isolated ? assetQuery.is("deleted_at", null) : assetQuery,
  ]);

  if (projectResult.error || !projectResult.data) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (assetResult.error) {
    return NextResponse.json(
      { error: "Project operating record is temporarily unavailable" },
      { status: 503 },
    );
  }

  const project = projectResult.data as ProjectRow;
  const assets = (assetResult.data ?? []) as AssetRow[];
  const assetIds = assets.map((asset) => asset.id);
  let evidence = {
    currentVersionCount: isolated ? 0 : null,
    openReviewThreadCount: 0,
    resolvedReviewThreadCount: 0,
    latestCommentActivityAt: null as string | null,
  };
  if (assetIds.length > 0) {
    const [openThreadsResult, resolvedThreadsResult, latestCommentActivityResult] =
      await Promise.all([
        supabase
          .from("comments")
          .select("id", { count: "exact", head: true })
          .in("asset_id", assetIds)
          .eq("status", "open")
          .is("parent_id", null),
        supabase
          .from("comments")
          .select("id", { count: "exact", head: true })
          .in("asset_id", assetIds)
          .eq("status", "resolved")
          .is("parent_id", null),
        supabase
          .from("comments")
          .select("updated_at")
          .in("asset_id", assetIds)
          .order("updated_at", { ascending: false })
          .limit(1),
      ]);

    if (
      openThreadsResult.error ||
      resolvedThreadsResult.error ||
      latestCommentActivityResult.error
    ) {
      return NextResponse.json(
        { error: "Project review evidence is temporarily unavailable" },
        { status: 503 },
      );
    }

    const openReviewThreadCount = exactCount(openThreadsResult.count);
    const resolvedReviewThreadCount = exactCount(resolvedThreadsResult.count);
    if (openReviewThreadCount === null || resolvedReviewThreadCount === null) {
      return NextResponse.json(
        { error: "Project review evidence returned an invalid count" },
        { status: 503 },
      );
    }
    evidence = {
      ...evidence,
      openReviewThreadCount,
      resolvedReviewThreadCount,
      latestCommentActivityAt: latestCommentActivityAt(latestCommentActivityResult.data),
    };

    if (isolated) {
      const currentVersionsResult = await supabase
        .from("versions")
        .select("id", { count: "exact", head: true })
        .in("asset_id", assetIds)
        .eq("is_current", true);
      if (currentVersionsResult.error) {
        return NextResponse.json(
          { error: "Project media evidence is temporarily unavailable" },
          { status: 503 },
        );
      }
      const currentVersionCount = exactCount(currentVersionsResult.count);
      if (currentVersionCount === null) {
        return NextResponse.json(
          { error: "Project media evidence returned an invalid count" },
          { status: 503 },
        );
      }
      evidence = { ...evidence, currentVersionCount };
    }
  }

  let source: OperatingSourceRow | null = null;
  let manualOrigin: ManualOriginRow | null = null;
  let plan: ProjectOperatingPlanInput | null = null;
  let script: ProjectOperatingScriptInput | null = null;
  if (isolated) {
    const scriptResultPromise = canReadScript(access.data.access_role)
      ? supabase.rpc("get_project_script", { p_project_id: id })
      : null;
    const [sourceResult, manualOriginResult, planResult] = await Promise.all([
      supabase
        .from("project_operating_sources")
        .select(OPERATING_SOURCE_COLUMNS)
        .eq("project_id", id)
        .maybeSingle(),
      supabase
        .from("project_manual_origins")
        .select("created_at")
        .eq("project_id", id)
        .maybeSingle(),
      supabase.rpc("get_project_production_plan", { p_project_id: id }),
    ]);
    if (sourceResult.error) {
      return NextResponse.json(
        { error: "Project operating source is temporarily unavailable" },
        { status: 503 },
      );
    }
    source = sourceResult.data as OperatingSourceRow | null;
    if (manualOriginResult.error) {
      return NextResponse.json(
        { error: "Project origin is temporarily unavailable" },
        { status: 503 },
      );
    }
    manualOrigin = manualOriginResult.data as ManualOriginRow | null;
    if (planResult.error) {
      return NextResponse.json(
        { error: "Project plan is temporarily unavailable" },
        { status: 503 },
      );
    }
    const snapshot = parseProductionPlanSnapshot(planResult.data);
    if (!snapshot || snapshot.projectId !== id) {
      return NextResponse.json(
        { error: "Project plan returned an invalid snapshot" },
        { status: 503 },
      );
    }
    plan = planInput(snapshot);

    if (scriptResultPromise) {
      const scriptResult = await scriptResultPromise;
      if (scriptResult.error) {
        return NextResponse.json(
          { error: "Project script is temporarily unavailable" },
          { status: 503 },
        );
      }
      const scriptSnapshot = parseProjectScriptSnapshot(scriptResult.data);
      if (!scriptSnapshot || scriptSnapshot.projectId !== id) {
        return NextResponse.json(
          { error: "Project script returned an invalid snapshot" },
          { status: 503 },
        );
      }
      script = scriptInput(scriptSnapshot);
    }
  }

  const record = buildProjectOperatingRecord({
    project: {
      id: project.id,
      name: project.name,
      status: project.status,
      createdAt: project.created_at,
      updatedAt: project.updated_at,
    },
    accessRole: access.data.access_role,
    handoff: handoffInput(source),
    manualOrigin: manualOrigin ? { createdAt: manualOrigin.created_at } : null,
    plan,
    script,
    evidence,
    assets: assets.map((asset) => ({
      id: asset.id,
      status: asset.status,
      updatedAt: asset.updated_at,
      commentsCount: relationCount(asset.comments),
      versionsCount: relationCount(asset.versions),
      approvalStatuses: approvalStatuses(asset.approvals),
    })),
  });

  return NextResponse.json(record, {
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}
