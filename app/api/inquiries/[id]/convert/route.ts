import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { transitionInquiry } from "@/lib/covideopro/transitions";
import { getSupabase } from "@/lib/supabase";

const INQUIRY_COLUMNS =
  "id, owner_id, project_id, organization_id, contact_id, source, summary, received_at, status, created_at, updated_at";
const PROJECT_COLUMNS =
  "id, team_id, owner_id, name, description, status, stage, organization_id, primary_contact_id, thumbnail_url, created_at, updated_at";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type JsonObject = Record<string, unknown>;

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

async function readJsonObject(request: Request): Promise<JsonObject | null> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as JsonObject)
      : null;
  } catch {
    return null;
  }
}

/**
 * Mirrors convertInquiryToProject in lib/demo/workspace-store.ts: creates the
 * project at stage 'intake' with the inquiry's organization/contact links and
 * marks the inquiry converted. The transition validator runs before any
 * write, so converting an already-converted (or otherwise ineligible) inquiry
 * is a 422 with zero writes — repeat calls are idempotent.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!user) return errorResponse("Unauthorized", 401);

  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return errorResponse("Inquiry id is invalid", 400);
  }
  const body = await readJsonObject(req);
  if (!body) {
    return errorResponse("Request body must be a JSON object", 400);
  }
  if (
    typeof body.projectName !== "string" ||
    !body.projectName.trim() ||
    body.projectName.trim().length > 240
  ) {
    return errorResponse("Name the project to convert.", 400);
  }

  const supabase = getSupabase();
  const { data: inquiry, error: loadError } = await supabase
    .from("inquiries")
    .select(INQUIRY_COLUMNS)
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (loadError) {
    console.error("Inquiry convert load error:", loadError.message);
    return errorResponse("Unable to load the inquiry", 500);
  }
  if (!inquiry) return errorResponse("Inquiry not found", 404);

  const projectId = randomUUID();
  const verdict = transitionInquiry({ ...inquiry, project_id: projectId }, "converted");
  if (!verdict.ok) {
    return errorResponse(verdict.reason, 422);
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      id: projectId,
      owner_id: user.id,
      name: body.projectName.trim(),
      stage: "intake",
      organization_id: inquiry.organization_id ?? null,
      primary_contact_id: inquiry.contact_id ?? null,
    })
    .select(PROJECT_COLUMNS)
    .single();

  if (projectError) {
    console.error("Inquiry convert project error:", projectError.message);
    return errorResponse("The inquiry could not be converted", 500);
  }

  const { data: updated, error: inquiryError } = await supabase
    .from("inquiries")
    .update({
      status: "converted",
      project_id: projectId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("owner_id", user.id)
    .select(INQUIRY_COLUMNS);

  if (inquiryError) {
    console.error("Inquiry convert link error:", inquiryError.message);
    return errorResponse("The inquiry could not be converted", 500);
  }
  const converted = Array.isArray(updated) ? updated[0] : null;
  if (!converted) return errorResponse("Inquiry not found", 404);

  return NextResponse.json({ project, inquiry: converted }, { status: 201 });
}
