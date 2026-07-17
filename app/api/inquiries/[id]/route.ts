import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { INQUIRY_STATUSES, type InquiryStatus } from "@/lib/covideopro/record";
import { transitionInquiry } from "@/lib/covideopro/transitions";
import { getSupabase } from "@/lib/supabase";

const INQUIRY_COLUMNS =
  "id, owner_id, project_id, organization_id, contact_id, source, summary, received_at, status, created_at, updated_at";
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

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!user) return errorResponse("Unauthorized", 401);

  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return errorResponse("Inquiry id is invalid", 400);
  }

  const { data, error } = await getSupabase()
    .from("inquiries")
    .select(INQUIRY_COLUMNS)
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Inquiries GET [id] error:", error.message);
    return errorResponse("Unable to load the inquiry", 500);
  }
  if (!data) return errorResponse("Inquiry not found", 404);
  return NextResponse.json(data);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
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
    typeof body.status !== "string" ||
    !(INQUIRY_STATUSES as readonly string[]).includes(body.status)
  ) {
    return errorResponse("status is invalid", 400);
  }
  const to = body.status as InquiryStatus;

  const supabase = getSupabase();
  const { data: inquiry, error: loadError } = await supabase
    .from("inquiries")
    .select(INQUIRY_COLUMNS)
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (loadError) {
    console.error("Inquiries PATCH load error:", loadError.message);
    return errorResponse("Unable to load the inquiry", 500);
  }
  if (!inquiry) return errorResponse("Inquiry not found", 404);

  // The state machine is the only way status changes; a rejected transition
  // writes nothing.
  const verdict = transitionInquiry(inquiry, to);
  if (!verdict.ok) {
    return errorResponse(verdict.reason, 422);
  }

  const { data, error } = await supabase
    .from("inquiries")
    .update({ status: to, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_id", user.id)
    .select(INQUIRY_COLUMNS);

  if (error) {
    console.error("Inquiries PATCH error:", error.message);
    return errorResponse("The inquiry could not be updated", 500);
  }
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return errorResponse("Inquiry not found", 404);
  return NextResponse.json(row);
}
