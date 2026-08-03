import { apiJson } from "@/lib/api/responses";
import {
  isValidCredentialEmail,
  normalizeCredentialEmail,
} from "@/lib/auth/credentials";
import {
  buildPendingAccessPath,
  resolveRequestedAuthTarget,
} from "@/lib/auth/flow";
import {
  resolveHostSurface,
  roleCanAccessSurface,
  surfaceForRole,
} from "@/lib/auth/host-surface";
import { resolveProvisionedRole } from "@/lib/auth/provisioning";
import { createSupabaseAuth } from "@/lib/supabase-auth";

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
    const form = await req.formData().catch(() => null);
    if (!form) return apiJson(INVALID_REQUEST, { status: 400 });
    body = {
      email: String(form.get("email") || ""),
      password: String(form.get("password") || ""),
      next: String(form.get("next") || ""),
    };
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return apiJson(INVALID_REQUEST, { status: 400 });
  }

  const email = typeof body.email === "string" ? normalizeCredentialEmail(body.email) : "";
  const password = typeof body.password === "string" ? body.password : "";
  const requestedTarget = resolveRequestedAuthTarget(body.next);
  if (!isValidCredentialEmail(email) || !password) {
    return apiJson(CREDENTIALS_REQUIRED, { status: 400 });
  }

  try {
    const supabase = await createSupabaseAuth();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return apiJson(INVALID_CREDENTIALS, { status: 401 });

    // Authorization always uses a fresh provider-verified identity.
    const identity = await supabase.auth.getUser();
    if (identity.error || !identity.data.user) {
      return apiJson(AUTH_UNAVAILABLE, { status: 503 });
    }

    const role = resolveProvisionedRole(identity.data.user);
    if (!role) {
      return apiJson({
        success: true,
        access: { state: "pending" },
        destination: buildPendingAccessPath(requestedTarget),
      });
    }

    const surface = resolveHostSurface(new URL(req.url).host);
    if (surface && !roleCanAccessSurface(role, surface)) {
      await supabase.auth.signOut({ scope: "local" });
      return apiJson(
        {
          error: "This account belongs to a different Co‑VideoPro portal.",
          code: "AUTH_SURFACE_FORBIDDEN",
          required_surface: surfaceForRole(role),
        },
        { status: 403 },
      );
    }

    return apiJson({
      success: true,
      access: { state: "provisioned" },
      destination: requestedTarget,
    });
  } catch {
    return apiJson(AUTH_UNAVAILABLE, { status: 503 });
  }
}
