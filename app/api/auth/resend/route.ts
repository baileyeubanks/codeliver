import { apiError, apiJson } from "@/lib/api/responses";
import {
  isValidCredentialEmail,
  normalizeCredentialEmail,
} from "@/lib/auth/credentials";
import { buildEmailFlowRedirect } from "@/lib/auth/flow";
import { createSupabaseAuth } from "@/lib/supabase-auth";

const ACCEPTED_RESPONSE = {
  success: true,
  message: "If confirmation is still required, a new email is on its way.",
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

  const emailRedirectTo = buildEmailFlowRedirect(request, "signup", body.next);
  if (!emailRedirectTo) {
    return apiError("Account confirmation is temporarily unavailable.", "AUTH_UNAVAILABLE", 503);
  }

  try {
    const supabase = await createSupabaseAuth();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo },
    });
    if (error && typeof error.status === "number" && error.status >= 500) {
      return apiError("Account confirmation is temporarily unavailable.", "AUTH_UNAVAILABLE", 503);
    }
    return apiJson(ACCEPTED_RESPONSE, { status: 202 });
  } catch {
    return apiError("Account confirmation is temporarily unavailable.", "AUTH_UNAVAILABLE", 503);
  }
}
