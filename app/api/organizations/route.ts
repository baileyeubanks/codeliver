import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

const ORGANIZATION_COLUMNS =
  "id, owner_id, name, industry, website, notes, created_at, updated_at";

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

/** Optional free-text field: absent → skip, null/empty → null, else trimmed. */
function optionalText(
  body: JsonObject,
  field: string,
  maxLength: number,
): { ok: true; value: string | null } | { ok: false } {
  const value = body[field];
  if (value === undefined) return { ok: true, value: null };
  if (value === null) return { ok: true, value: null };
  if (typeof value !== "string" || value.length > maxLength) return { ok: false };
  return { ok: true, value: value.trim() || null };
}

export async function GET() {
  const user = await requireAuth();
  if (!user) return errorResponse("Unauthorized", 401);

  const { data, error } = await getSupabase()
    .from("organizations")
    .select(ORGANIZATION_COLUMNS)
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Organizations GET error:", error.message);
    return errorResponse("Unable to load organizations", 500);
  }
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(request: Request) {
  const user = await requireAuth();
  if (!user) return errorResponse("Unauthorized", 401);

  const body = await readJsonObject(request);
  if (!body) {
    return errorResponse("Request body must be a JSON object", 400);
  }

  if (
    typeof body.name !== "string" ||
    !body.name.trim() ||
    body.name.trim().length > 240
  ) {
    return errorResponse("Organization name is required", 400);
  }
  const industry = optionalText(body, "industry", 240);
  const website = optionalText(body, "website", 500);
  const notes = optionalText(body, "notes", 10_000);
  if (!industry.ok) return errorResponse("industry is invalid", 400);
  if (!website.ok) return errorResponse("website is invalid", 400);
  if (!notes.ok) return errorResponse("notes is invalid", 400);

  // Insert is allowlisted: caller-supplied id/owner_id/timestamps are ignored.
  const { data, error } = await getSupabase()
    .from("organizations")
    .insert({
      owner_id: user.id,
      name: body.name.trim(),
      industry: industry.value,
      website: website.value,
      notes: notes.value,
    })
    .select(ORGANIZATION_COLUMNS)
    .single();

  if (error) {
    console.error("Organizations POST error:", error.message);
    return errorResponse("The organization could not be created", 500);
  }
  return NextResponse.json(data, { status: 201 });
}
