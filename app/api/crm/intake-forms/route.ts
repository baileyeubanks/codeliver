import { NextRequest, NextResponse } from "next/server";
import { requireStaffWithClient } from "@/lib/auth/staff-client";
import {
  parseIntakeFormMutation,
  parseIntakeFormReceipt,
  PreProjectValidationError,
  normalizeCrmUuid,
} from "@/lib/crm/preproject";
import { getSupabaseDataSchema } from "@/lib/data-authority";

const HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: HEADERS });
}

function authorityUnavailable() {
  return json(
    { error: "CRM authority is temporarily unavailable", code: "CRM_AUTHORITY_UNAVAILABLE" },
    503,
  );
}

function mutationError(error: unknown) {
  if (error instanceof PreProjectValidationError) {
    return json(
      {
        error: error.message,
        code: error.code,
        ...(error.field ? { field: error.field } : {}),
      },
      400,
    );
  }
  return json({ error: "Intake form request is invalid" }, 400);
}

export async function GET(request: NextRequest) {
  const { user, staff, supabase } = await requireStaffWithClient();
  if (!user) return json({ error: "Unauthorized" }, 401);
  if (!staff) return json({ error: "Forbidden" }, 403);
  if (getSupabaseDataSchema() !== "co_production") return authorityUnavailable();

  let teamId: string;
  try {
    teamId = normalizeCrmUuid(request.nextUrl.searchParams.get("team_id"), "team_id");
  } catch (error) {
    return mutationError(error);
  }

  const { data, error } = await supabase
    .from("intake_forms")
    .select(
      "id, team_id, opaque_key, name, status, success_message, rate_limit_window_seconds, rate_limit_max_submissions, authority_version, created_at, updated_at",
    )
    .eq("team_id", teamId)
    .order("created_at", { ascending: false });
  if (error) return authorityUnavailable();
  return json({ items: data ?? [] });
}

export async function POST(request: Request) {
  const { user, staff, supabase } = await requireStaffWithClient();
  if (!user) return json({ error: "Unauthorized" }, 401);
  if (!staff) return json({ error: "Forbidden" }, 403);
  if (getSupabaseDataSchema() !== "co_production") return authorityUnavailable();
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return json({ error: "Request must use application/json" }, 415);
  }

  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > 16 * 1024) {
    return json({ error: "Intake form request is too large" }, 413);
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Request must be valid JSON" }, 400);
  }

  let mutation;
  try {
    mutation = parseIntakeFormMutation(body);
  } catch (error) {
    return mutationError(error);
  }

  const { data, error } = await supabase.rpc("create_public_intake_form", {
    p_team_id: mutation.teamId,
    p_name: mutation.name,
    p_success_message: mutation.successMessage,
    p_request_id: mutation.requestId,
  });
  if (error) {
    const message = error.message?.toLowerCase() ?? "";
    if (message.includes("crm_forbidden")) return json({ error: "Forbidden" }, 403);
    if (message.includes("crm_idempotency_conflict")) {
      return json({ error: "This request ID is already bound to different content" }, 409);
    }
    if (message.includes("invalid_crm_intake_form")) {
      return json({ error: "Intake form request is invalid" }, 400);
    }
    return authorityUnavailable();
  }
  const receipt = parseIntakeFormReceipt(data);
  if (!receipt) return authorityUnavailable();
  return json(
    {
      form: {
        id: receipt.formId,
        teamId: receipt.teamId,
        formKey: receipt.formKey,
        name: receipt.name,
        status: receipt.status,
        successMessage: receipt.successMessage,
        authorityVersion: receipt.authorityVersion,
        createdAt: receipt.createdAt,
      },
      requestId: receipt.requestId,
      replayed: receipt.replayed,
    },
    receipt.replayed ? 200 : 201,
  );
}
