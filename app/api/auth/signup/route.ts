import { apiError, apiJson } from "@/lib/api/responses";
import {
  AUTH_PASSWORD_MIN_LENGTH,
  isValidCredentialEmail,
  isValidCredentialPassword,
  normalizeCredentialEmail,
} from "@/lib/auth/credentials";
import {
  buildEmailFlowRedirect,
  buildPendingAccessPath,
} from "@/lib/auth/flow";
import { createSupabaseAuth } from "@/lib/supabase-auth";

function signupBody(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export async function POST(req: Request) {
  let body: Record<string, unknown> | null;
  try {
    body = signupBody(await req.json());
  } catch {
    return apiError("Invalid request", "AUTH_INVALID_REQUEST", 400);
  }

  if (!body) {
    return apiError("Invalid request", "AUTH_INVALID_REQUEST", 400);
  }

  const email = typeof body.email === "string" ? normalizeCredentialEmail(body.email) : "";
  const password = typeof body.password === "string" ? body.password : "";
  const displayName = typeof body.display_name === "string" ? body.display_name.trim() : "";
  const requestedTarget = body.next;

  if (!isValidCredentialEmail(email) || !password || !displayName) {
    return apiError(
      "Name, email, and password are required.",
      "AUTH_CREDENTIALS_REQUIRED",
      400,
    );
  }
  if (displayName.length > 120) {
    return apiError("Name must be 120 characters or fewer.", "AUTH_NAME_INVALID", 400);
  }
  if (!isValidCredentialPassword(password)) {
    return apiError(
      `Password must be at least ${AUTH_PASSWORD_MIN_LENGTH} characters.`,
      "AUTH_PASSWORD_INVALID",
      400,
    );
  }

  const emailRedirectTo = buildEmailFlowRedirect(req, "signup", requestedTarget);

  try {
    const supabase = await createSupabaseAuth();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
        ...(emailRedirectTo ? { emailRedirectTo } : {}),
      },
    });

    if (error) {
      // Keep account existence private.
      return apiError(
        "Account creation could not be completed.",
        "AUTH_SIGNUP_REJECTED",
        400,
      );
    }

    const confirmationRequired = !data.session;
    return apiJson(
      {
        success: true,
        access: { state: "pending", authorityGranted: false },
        confirmation_required: confirmationRequired,
        destination: confirmationRequired ? null : buildPendingAccessPath(requestedTarget),
        message: confirmationRequired
          ? "Check your email to confirm your account."
          : "Account created. Workspace access is pending approval.",
      },
      { status: 202 },
    );
  } catch {
    return apiError("Account service is unavailable.", "AUTH_UNAVAILABLE", 503);
  }
}
