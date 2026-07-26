import { apiError, apiJson } from "@/lib/api/responses";
import {
  AUTH_PASSWORD_MIN_LENGTH,
  isValidCredentialPassword,
} from "@/lib/auth/credentials";
import { createSupabaseAuth } from "@/lib/supabase-auth";

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid request.", "AUTH_INVALID_REQUEST", 400);
  }

  const password = typeof body?.password === "string" ? body.password : "";
  if (!isValidCredentialPassword(password)) {
    return apiError(
      `Password must be at least ${AUTH_PASSWORD_MIN_LENGTH} characters.`,
      "AUTH_PASSWORD_INVALID",
      400,
    );
  }

  try {
    const supabase = await createSupabaseAuth();
    const identity = await supabase.auth.getUser();
    if (identity.error || !identity.data.user) {
      return apiError(
        "Open a new recovery link and try again.",
        "AUTH_RECOVERY_SESSION_REQUIRED",
        401,
      );
    }

    const update = await supabase.auth.updateUser({ password });
    if (update.error) {
      return apiError(
        "Password could not be updated. Open a new recovery link and try again.",
        "AUTH_PASSWORD_UPDATE_REJECTED",
        400,
      );
    }

    await supabase.auth.signOut({ scope: "local" });
    return apiJson({ success: true });
  } catch {
    return apiError("Password reset is temporarily unavailable.", "AUTH_UNAVAILABLE", 503);
  }
}
