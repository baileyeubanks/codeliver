import { NextResponse } from "next/server";
import {
  buildProtectedReturnPath,
  resolveHostSurface,
  roleCanAccessSurface,
  surfaceForRole,
  type HostSurface,
} from "@/lib/auth/host-surface";
import { resolveProvisionedRole } from "@/lib/auth/provisioning";
import { buildPendingAccessPath } from "@/lib/auth/flow";
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

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const { searchParams, origin } = requestUrl;
  const code = searchParams.get("code");
  const flow = searchParams.get("flow");
  const requestedTarget = searchParams.get("next") ?? searchParams.get("redirect");
  const safeTarget = buildProtectedReturnPath(requestedTarget ?? "/projects");

  if (!code) {
    return loginRedirect(origin, "auth_error", "missing_code", safeTarget);
  }

  try {
    const supabase = await createSupabaseAuth();
    const exchange = await supabase.auth.exchangeCodeForSession(code);
    if (exchange.error) {
      return loginRedirect(origin, "auth_error", "exchange_failed", safeTarget);
    }

    // Do not authorize from callback payloads or user-controlled metadata.
    const identity = await supabase.auth.getUser();
    if (identity.error || !identity.data.user) {
      return loginRedirect(origin, "auth_error", "session_missing", safeTarget);
    }

    if (flow === "recovery") {
      return noStoreRedirect(new URL("/reset-password", origin));
    }

    const role = resolveProvisionedRole(identity.data.user);
    if (!role) {
      return noStoreRedirect(new URL(buildPendingAccessPath(safeTarget), origin));
    }

    const currentSurface = resolveHostSurface(requestUrl.host);
    if (!currentSurface || !roleCanAccessSurface(role, currentSurface)) {
      await supabase.auth.signOut({ scope: "local" });
      return surfaceMismatchRedirect(origin, surfaceForRole(role), safeTarget);
    }

    return noStoreRedirect(new URL(safeTarget, origin));
  } catch {
    return loginRedirect(origin, "auth_error", "unavailable", safeTarget);
  }
}
