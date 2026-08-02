import {
  APP_SURFACE_HOST,
  CLIENT_SURFACE_HOST,
} from "@/lib/auth/host-surface";
import { createSupabaseAuth } from "@/lib/supabase-auth";
import { apiError, apiJson } from "@/lib/api/responses";

const PENDING_ACCESS_RESPONSE = {
  success: true,
  access: {
    state: "pending",
    authorityGranted: false,
  },
  message: "Account created. Access is pending approval.",
} as const;

function signupBody(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function confirmationRedirect(request: Request): string | undefined {
  const requestUrl = new URL(request.url);
  const hostname = requestUrl.hostname.toLowerCase();
  const allowedHost =
    hostname === CLIENT_SURFACE_HOST ||
    hostname === APP_SURFACE_HOST ||
    hostname === `www.${APP_SURFACE_HOST}` ||
    hostname === "localhost" ||
    hostname === "127.0.0.1";

  return allowedHost
    ? new URL("/auth/callback", requestUrl.origin).toString()
    : undefined;
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

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const requestedDisplayName =
    typeof body.display_name === "string" ? body.display_name.trim() : "";
  if (!email || !password) {
    return apiError("Email and password required", "AUTH_CREDENTIALS_REQUIRED", 400);
  }

  if (password.length < 6) {
    return apiError("Password must be at least 6 characters", "AUTH_PASSWORD_INVALID", 400);
  }

  const emailRedirectTo = confirmationRedirect(req);

  try {
    const supabase = await createSupabaseAuth();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: requestedDisplayName || email.split("@")[0] },
        ...(emailRedirectTo ? { emailRedirectTo } : {}),
      },
    });

    if (error) {
      // User-facing errors stay generic on purpose (no account enumeration).
      return apiError("Account creation could not be completed.", "AUTH_SIGNUP_REJECTED", 400);
    }
  } catch {
    // The auth backend itself is missing or unreachable — say so honestly
    // instead of implying the request was at fault.
    return apiError("Account service is unavailable.", "AUTH_UNAVAILABLE", 503);
  }

  return apiJson(PENDING_ACCESS_RESPONSE, { status: 202 });
}
