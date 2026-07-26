import { apiError, apiJson } from "@/lib/api/responses";
import {
  isValidCredentialEmail,
  normalizeCredentialEmail,
} from "@/lib/auth/credentials";
import { buildEmailFlowRedirect } from "@/lib/auth/flow";
import { createSupabaseAuth } from "@/lib/supabase-auth";

const ACCEPTED_RESPONSE = {
  success: true,
  message: "If an account exists for that email, a recovery link is on its way.",
} as const;

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid request.", "AUTH_INVALID_REQUEST", 400);
  }

  const email = typeof body?.email === "string"
    ? normalizeCredentialEmail(body.email)
    : "";
  if (!isValidCredentialEmail(email)) {
    return apiError("Enter a valid email address.", "AUTH_EMAIL_INVALID", 400);
  }

  const redirectTo = buildEmailFlowRedirect(request, "recovery");
  if (!redirectTo) {
    return apiError("Password recovery is temporarily unavailable.", "AUTH_UNAVAILABLE", 503);
  }

  try {
    const supabase = await createSupabaseAuth();
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error && typeof error.status === "number" && error.status >= 500) {
      return apiError("Password recovery is temporarily unavailable.", "AUTH_UNAVAILABLE", 503);
    }

    // Provider rejections remain indistinguishable from success to prevent
    // account enumeration.
    return apiJson(ACCEPTED_RESPONSE, { status: 202 });
  } catch {
    return apiError("Password recovery is temporarily unavailable.", "AUTH_UNAVAILABLE", 503);
  }
}
