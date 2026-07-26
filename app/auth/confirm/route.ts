import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { buildPendingAccessPath } from "@/lib/auth/flow";
import {
  buildProtectedReturnPath,
  resolveHostSurface,
  roleCanAccessSurface,
  surfaceForRole,
} from "@/lib/auth/host-surface";
import { resolveProvisionedRole } from "@/lib/auth/provisioning";
import { createSupabaseAuth } from "@/lib/supabase-auth";

const ACCEPTED_EMAIL_OTP_TYPES = new Set<EmailOtpType>([
  "email",
  "signup",
  "recovery",
  "invite",
  "magiclink",
  "email_change",
]);

function noStoreRedirect(url: URL): NextResponse {
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function loginError(origin: string, code: string, next: string): NextResponse {
  const target = new URL("/login", origin);
  target.searchParams.set("auth_error", code);
  target.searchParams.set("next", next);
  return noStoreRedirect(target);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const requestedType = requestUrl.searchParams.get("type");
  const safeTarget = buildProtectedReturnPath(
    requestUrl.searchParams.get("next") ?? "/projects",
  );

  if (
    !tokenHash ||
    !requestedType ||
    !ACCEPTED_EMAIL_OTP_TYPES.has(requestedType as EmailOtpType)
  ) {
    return loginError(requestUrl.origin, "invalid_confirmation", safeTarget);
  }

  try {
    const supabase = await createSupabaseAuth();
    const verification = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: requestedType as EmailOtpType,
    });
    if (verification.error) {
      return loginError(requestUrl.origin, "confirmation_failed", safeTarget);
    }

    const identity = await supabase.auth.getUser();
    if (identity.error || !identity.data.user) {
      return loginError(requestUrl.origin, "session_missing", safeTarget);
    }

    if (requestedType === "recovery") {
      return noStoreRedirect(new URL("/reset-password", requestUrl.origin));
    }

    const role = resolveProvisionedRole(identity.data.user);
    if (!role) {
      return noStoreRedirect(
        new URL(buildPendingAccessPath(safeTarget), requestUrl.origin),
      );
    }

    const surface = resolveHostSurface(requestUrl.host);
    if (!surface || !roleCanAccessSurface(role, surface)) {
      await supabase.auth.signOut({ scope: "local" });
      const target = new URL("/login", requestUrl.origin);
      target.searchParams.set("access", "surface_mismatch");
      target.searchParams.set("required_surface", surfaceForRole(role));
      target.searchParams.set("next", safeTarget);
      return noStoreRedirect(target);
    }

    return noStoreRedirect(new URL(safeTarget, requestUrl.origin));
  } catch {
    return loginError(requestUrl.origin, "unavailable", safeTarget);
  }
}
