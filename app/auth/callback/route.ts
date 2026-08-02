import { NextResponse } from "next/server";
import {
  buildProtectedReturnPath,
  isInviteReturnPath,
  resolveHostSurface,
  roleCanAccessSurface,
  surfaceForRole,
  type HostSurface,
} from "@/lib/auth/host-surface";
import { resolveProvisionedRole } from "@/lib/auth/provisioning";
import { createSupabaseAuth } from "@/lib/supabase-auth";

function noStoreRedirect(url: URL): NextResponse {
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function loginRedirect(
  origin: string,
  key: "access" | "auth_error",
  value: string,
  next: string,
): NextResponse {
  const target = new URL("/login", origin);
  target.searchParams.set(key, value);
  target.searchParams.set("next", next);
  return noStoreRedirect(target);
}

function surfaceMismatchRedirect(
  origin: string,
  requiredSurface: HostSurface,
  next: string,
): NextResponse {
  const target = new URL("/login", origin);
  target.searchParams.set("access", "surface_mismatch");
  target.searchParams.set("required_surface", requiredSurface);
  target.searchParams.set("next", next);
  return noStoreRedirect(target);
}

async function clearLocalSession(
  supabase: Awaited<ReturnType<typeof createSupabaseAuth>>,
): Promise<boolean> {
  const { error } = await supabase.auth.signOut({ scope: "local" });
  return !error;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const { searchParams, origin } = requestUrl;
  const code = searchParams.get("code");
  const requestedTarget = searchParams.get("next") ?? searchParams.get("redirect");
  const safeTarget = buildProtectedReturnPath(requestedTarget ?? "/projects");

  if (!code) {
    return loginRedirect(origin, "auth_error", "missing_code", safeTarget);
  }

  const supabase = await createSupabaseAuth();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return loginRedirect(origin, "auth_error", "exchange_failed", safeTarget);
  }

  const user = data.user ?? data.session?.user ?? null;
  if (!user) {
    return loginRedirect(origin, "auth_error", "session_missing", safeTarget);
  }

  const role = resolveProvisionedRole(user);
  if (!role) {
    if (isInviteReturnPath(safeTarget)) {
      return noStoreRedirect(new URL(safeTarget, origin));
    }
    if (!(await clearLocalSession(supabase))) {
      return loginRedirect(origin, "auth_error", "session_clear_failed", safeTarget);
    }
    return loginRedirect(origin, "access", "pending", safeTarget);
  }

  const currentSurface = resolveHostSurface(requestUrl.host);
  if (!currentSurface || !roleCanAccessSurface(role, currentSurface)) {
    if (!(await clearLocalSession(supabase))) {
      return loginRedirect(origin, "auth_error", "session_clear_failed", safeTarget);
    }
    return surfaceMismatchRedirect(origin, surfaceForRole(role), safeTarget);
  }

  return noStoreRedirect(new URL(safeTarget, origin));
}
