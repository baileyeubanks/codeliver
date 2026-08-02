import { NextResponse } from "next/server";
import { requireAuthWithClient } from "@/lib/auth-client";
import { getAssetAccess } from "@/lib/access-control";
import {
  CO_PRODUCTION_DATA_SCHEMA,
  getSupabaseDataSchema,
} from "@/lib/data-authority";
import { normalizeMediaReference } from "@/lib/security/media-reference";

type VersionRow = {
  id: string;
  asset_id: string;
  version_number: number;
  file_url: string;
  file_size: number | null;
  notes: string | null;
  uploaded_by: string;
  is_current: boolean;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  resolution: string | null;
  created_at: string;
  updated_at: string;
};

function asVersionRow(value: unknown): VersionRow | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }
  const row = candidate as Record<string, unknown>;
  return typeof row.id === "string" &&
    typeof row.asset_id === "string" &&
    Number.isInteger(row.version_number) &&
    typeof row.file_url === "string" &&
    typeof row.uploaded_by === "string" &&
    row.is_current === true
    ? (candidate as VersionRow)
    : null;
}

function atomicVersionError(error: { code?: string } | null) {
  if (error?.code === "23505") {
    return NextResponse.json(
      { error: "A new version was added at the same time; refresh and retry" },
      { status: 409 },
    );
  }
  if (error?.code === "42501") {
    return NextResponse.json(
      { error: "The version could not be created with the current permissions" },
      { status: 403 },
    );
  }
  if (error?.code === "22023") {
    return NextResponse.json(
      { error: "The version request was not accepted" },
      { status: 400 },
    );
  }
  if (error?.code === "28000") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(
    { error: "The version could not be created" },
    { status: 503 },
  );
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, supabase } = await requireAuthWithClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const assetAccess = await getAssetAccess(id, user.id, "viewer", supabase);
  if (!assetAccess.ok) {
    return NextResponse.json({ error: assetAccess.error }, { status: assetAccess.status });
  }

  const { data, error } = await supabase
    .from("versions")
    .select(
      "id, asset_id, version_number, file_url, file_size, notes, uploaded_by, is_current, thumbnail_url, duration_seconds, resolution, created_at, updated_at",
    )
    .eq("asset_id", id)
    .order("version_number", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, supabase } = await requireAuthWithClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const assetAccess = await getAssetAccess(id, user.id, "editor", supabase);
  if (!assetAccess.ok) {
    return NextResponse.json({ error: assetAccess.error }, { status: assetAccess.status });
  }

  let body: Record<string, unknown>;
  try {
    const value = await req.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    body = value as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "Request body must be a JSON object" },
      { status: 400 },
    );
  }

  let fileUrl: string;
  let thumbnailUrl: string | null = null;
  try {
    fileUrl = normalizeMediaReference(body.file_url, "file_url");
    if (body.thumbnail_url !== undefined && body.thumbnail_url !== null) {
      thumbnailUrl = normalizeMediaReference(body.thumbnail_url, "thumbnail_url");
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Media URL is invalid" },
      { status: 400 },
    );
  }
  const fileSize = body.file_size ?? null;
  if (
    fileSize !== null &&
    (!Number.isSafeInteger(fileSize) || Number(fileSize) < 0)
  ) {
    return NextResponse.json({ error: "file_size is invalid" }, { status: 400 });
  }
  const durationSeconds = body.duration_seconds ?? null;
  if (
    durationSeconds !== null &&
    (typeof durationSeconds !== "number" ||
      !Number.isFinite(durationSeconds) ||
      durationSeconds < 0 ||
      durationSeconds > 604_800)
  ) {
    return NextResponse.json(
      { error: "duration_seconds is invalid" },
      { status: 400 },
    );
  }
  const notes = body.notes === undefined || body.notes === null ? null : body.notes;
  if (notes !== null && (typeof notes !== "string" || notes.length > 2_000)) {
    return NextResponse.json({ error: "notes is invalid" }, { status: 400 });
  }
  const resolution =
    body.resolution === undefined || body.resolution === null
      ? null
      : body.resolution;
  if (
    resolution !== null &&
    (typeof resolution !== "string" || resolution.length > 64)
  ) {
    return NextResponse.json({ error: "resolution is invalid" }, { status: 400 });
  }

  if (getSupabaseDataSchema() === CO_PRODUCTION_DATA_SCHEMA) {
    const { data, error } = await supabase.rpc("create_asset_version", {
      target_asset_id: id,
      new_file_url: fileUrl,
      new_file_size: fileSize,
      new_notes: typeof notes === "string" ? notes.trim() || null : null,
      new_thumbnail_url: thumbnailUrl,
      new_duration_seconds: durationSeconds,
      new_resolution: resolution,
    });
    if (error) return atomicVersionError(error);

    const version = asVersionRow(data);
    if (!version || version.asset_id !== id) {
      return NextResponse.json(
        { error: "The created version could not be confirmed" },
        { status: 503 },
      );
    }
    return NextResponse.json(version, { status: 201 });
  }

  // Legacy development schema only. Production is transactionally owned by
  // co_production.create_asset_version above.
  const { data: existing } = await supabase
    .from("versions")
    .select("id, version_number")
    .eq("asset_id", id)
    .order("version_number", { ascending: false })
    .limit(1);

  const nextVersion = (existing?.[0]?.version_number ?? 0) + 1;
  const previousVersionId = existing?.[0]?.id ?? null;

  const { data, error } = await supabase
    .from("versions")
    .insert({
      asset_id: id,
      version_number: nextVersion,
      file_url: fileUrl,
      file_size: fileSize,
      notes: typeof notes === "string" ? notes.trim() || null : null,
      uploaded_by: user.id,
      is_current: false,
      thumbnail_url: thumbnailUrl,
      duration_seconds: durationSeconds,
      resolution,
    })
    .select()
    .single();

  if (error?.code === "23505") {
    return NextResponse.json(
      { error: "A new version was added at the same time; refresh and retry" },
      { status: 409 },
    );
  }
  if (error || !data) {
    return NextResponse.json(
      { error: "The version could not be created" },
      { status: 503 },
    );
  }

  const currentReset = await supabase
    .from("versions")
    .update({ is_current: false, updated_at: new Date().toISOString() })
    .eq("asset_id", id);
  if (currentReset.error) {
    return NextResponse.json(
      { error: "The version could not be activated" },
      { status: 503 },
    );
  }
  const currentUpdate = await supabase
    .from("versions")
    .update({ is_current: true, updated_at: new Date().toISOString() })
    .eq("id", data.id);
  if (currentUpdate.error) {
    if (previousVersionId) {
      await supabase
        .from("versions")
        .update({ is_current: true, updated_at: new Date().toISOString() })
        .eq("id", previousVersionId);
    }
    return NextResponse.json(
      { error: "The version could not be activated" },
      { status: 503 },
    );
  }

  // Update asset file_url to latest version
  const assetUpdate = await supabase
    .from("assets")
    .update({
      file_url: fileUrl,
      file_size: fileSize,
      duration_seconds:
        durationSeconds ?? assetAccess.data.duration_seconds ?? null,
      status: "in_review",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (assetUpdate.error) {
    return NextResponse.json(
      { error: "The asset could not be advanced to the new version" },
      { status: 503 },
    );
  }

  // Comments are immutable review evidence for the version where they were
  // authored. A new version starts a new discussion; moving threads forward
  // requires an explicit, provenance-preserving command rather than a silent
  // root-only copy that loses replies and invite visibility.
  let clonedApprovalSteps = 0;
  if (previousVersionId) {
    const [previousWorkflowResult, previousStepsResult] = await Promise.all([
      supabase
        .from("approval_workflows")
        .select("id, mode")
        .eq("asset_id", id)
        .eq("version_id", previousVersionId)
        .eq("status", "active")
        .maybeSingle(),
      supabase
        .from("approvals")
        .select("step_order, role_label, assignee_email, assignee_id")
        .eq("asset_id", id)
        .eq("version_id", previousVersionId)
        .order("step_order", { ascending: true }),
    ]);

    if (previousWorkflowResult.error || previousStepsResult.error) {
      return NextResponse.json(
        { error: "The previous version review round could not be read" },
        { status: 503 },
      );
    }

    const previousWorkflow = previousWorkflowResult.data;
    const previousSteps = previousStepsResult.data ?? [];

    if (previousWorkflow || previousSteps.length > 0) {
      const supersedePreviousRound = await supabase
        .from("approval_workflows")
        .update({ status: "superseded", updated_at: new Date().toISOString() })
        .eq("asset_id", id)
        .eq("version_id", previousVersionId)
        .eq("status", "active");
      if (supersedePreviousRound.error) {
        return NextResponse.json(
          { error: "The previous version review round could not be preserved" },
          { status: 503 },
        );
      }

      const newWorkflow = await supabase
        .from("approval_workflows")
        .insert({
          asset_id: id,
          version_id: data.id,
          mode: previousWorkflow?.mode ?? "sequential",
          created_by: user.id,
          status: "active",
        })
        .select("id")
        .single();
      if (newWorkflow.error || !newWorkflow.data) {
        return NextResponse.json(
          { error: "The new version review round could not be created" },
          { status: 503 },
        );
      }

      if (previousSteps.length > 0) {
        const clonedSteps = previousSteps.map((step) => ({
          asset_id: id,
          version_id: data.id,
          workflow_id: newWorkflow.data.id,
          step_order: step.step_order,
          role_label: step.role_label,
          assignee_email: step.assignee_email,
          assignee_id: step.assignee_id,
          status: "pending",
        }));
        const insertedSteps = await supabase.from("approvals").insert(clonedSteps);
        if (insertedSteps.error) {
          return NextResponse.json(
            { error: "The new version approval steps could not be created" },
            { status: 503 },
          );
        }
        clonedApprovalSteps = clonedSteps.length;
      }
    }
  }

  await supabase.from("activity_log").insert([
    {
      asset_id: id,
      actor_id: user.id,
      actor_name: user.email,
      action: "uploaded_version",
      details: {
        version_id: data.id,
        version_number: nextVersion,
        notes,
      },
    },
    {
      asset_id: id,
      actor_id: user.id,
      actor_name: user.email,
      action: "review_round_started",
      details: {
        previous_version_id: previousVersionId,
        version_id: data.id,
        version_number: nextVersion,
        cloned_approval_steps: clonedApprovalSteps,
        comments_retained_on_previous_version: true,
      },
    },
  ]);

  return NextResponse.json({ ...data, is_current: true }, { status: 201 });
}
