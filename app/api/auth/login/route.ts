import { createSupabaseAuth } from "@/lib/supabase-auth";
import { apiJson } from "@/lib/api/responses";

const INVALID_CREDENTIALS = {
  error: "Email or password was not accepted.",
  code: "AUTH_INVALID_CREDENTIALS",
} as const;

const AUTH_UNAVAILABLE = {
  error: "Authentication is temporarily unavailable.",
  code: "AUTH_UNAVAILABLE",
} as const;

const INVALID_REQUEST = {
  error: "Invalid authentication request.",
  code: "AUTH_INVALID_REQUEST",
} as const;

const CREDENTIALS_REQUIRED = {
  error: "Email and password are required.",
  code: "AUTH_CREDENTIALS_REQUIRED",
} as const;

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    // Fallback to form data for non-JSON requests
    const form = await req.formData().catch(() => null);
    if (!form) return apiJson(INVALID_REQUEST, { status: 400 });
    body = {
      email: String(form.get("email") || ""),
      password: String(form.get("password") || ""),
    };
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return apiJson(INVALID_REQUEST, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) {
    return apiJson(CREDENTIALS_REQUIRED, { status: 400 });
  }

  try {
    const supabase = await createSupabaseAuth();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase(),
      password,
    });

    if (error) {
      return apiJson(INVALID_CREDENTIALS, { status: 401 });
    }
  } catch {
    return apiJson(AUTH_UNAVAILABLE, { status: 503 });
  }

  return apiJson({ success: true });
}
