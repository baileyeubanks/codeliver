import { NextResponse } from "next/server";
import { getSupabaseDataSchema } from "@/lib/data-authority";
import { getSupabase } from "@/lib/supabase";

const FORM_KEY_PATTERN = /^ifm_[0-9a-f]{64}$/;
const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: RESPONSE_HEADERS });
}

function formNotFound() {
  return json({ error: "Intake form not found" }, 404);
}

function authorityUnavailable() {
  return json({ error: "Intake form metadata is temporarily unavailable" }, 503);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ formKey: string }> },
) {
  const formKey = (await params).formKey.trim().toLowerCase();
  if (!FORM_KEY_PATTERN.test(formKey)) return formNotFound();

  try {
    if (getSupabaseDataSchema() !== "co_production") {
      return authorityUnavailable();
    }
  } catch {
    return authorityUnavailable();
  }

  try {
    // This public opaque-key capability intentionally uses the service client;
    // the select and response adapter are the complete disclosure allowlist.
    const { data, error } = await getSupabase()
      .from("intake_forms")
      .select("name, success_message")
      .eq("opaque_key", formKey)
      .eq("status", "active")
      .maybeSingle();

    if (error) return authorityUnavailable();
    if (!data) return formNotFound();
    if (
      typeof data.name !== "string" ||
      (data.success_message !== null &&
        typeof data.success_message !== "string")
    ) {
      return authorityUnavailable();
    }

    return json({
      schemaVersion: "cco.public-intake-form-metadata.v1",
      form: {
        name: data.name,
        successMessage: data.success_message,
      },
    });
  } catch {
    return authorityUnavailable();
  }
}
