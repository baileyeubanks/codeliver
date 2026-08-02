import { NextResponse } from "next/server";
import {
  buildProtectedReturnPath,
  isInviteReturnPath,
  resolveHostSurface,
  resolveTrustedSurfaceRole,
  roleCanAccessSurface,
  surfaceForRole,
} from "@/lib/auth/host-surface";
import { createSupabaseAuth } from "@/lib/supabase-auth";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const;

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

const ACCESS_PENDING = {
  error: "Account access is pending approval.",
  code: "AUTH_ACCESS_PENDING",
} as const;

const SURFACE_MISMATCH = {
  error: "This account uses a different Co-VideoPro portal.",
  code: "AUTH_SURFACE_MISMATCH",
} as const;

function json(body: unknown, init?: { status?: number }) {
  return NextResponse.json(body, {
    ...init,
    headers: NO_STORE_HEADERS,
  });
}

async function clearUnauthorizedSession(
  supabase: Awaited<ReturnType<typeof createSupabaseAuth>>,
): Promise<boolean> {
  const { error } = await supabase.auth.signOut({ scope: "local" });
  return !error;
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    // Fallback to form data for non-JSON requests
    const form = await req.formData().catch(() => null);
    if (!form) return json(INVALID_REQUEST, { status: 400 });
    body = {
      email: String(form.get("email") || ""),
      password: String(form.get("password") || ""),
      next: String(form.get("next") || ""),
    };
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json(INVALID_REQUEST, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";
  const safeTarget = buildProtectedReturnPath(
    typeof body.next === "string" ? body.next : "/projects",
  );
  if (!email || !password) {
    return json(CREDENTIALS_REQUIRED, { status: 400 });
  }

  try {
    const supabase = await createSupabaseAuth();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase(),
      password,
    });

    if (error) {
      return json(INVALID_CREDENTIALS, { status: 401 });
    }

    const surface = resolveHostSurface(new URL(req.url).host);
    if (surface) {
      const user = data.user ?? data.session?.user ?? null;
      const role = resolveTrustedSurfaceRole(user);

      if (!role) {
        if (isInviteReturnPath(safeTarget)) {
          return json({
            success: true,
            access: {
              state: "invite_pending",
              authorityGranted: false,
            },
          });
        }
        if (!(await clearUnauthorizedSession(supabase))) {
          return json(AUTH_UNAVAILABLE, { status: 503 });
        }
        return json(ACCESS_PENDING, { status: 403 });
      }

      if (!roleCanAccessSurface(role, surface)) {
        if (!(await clearUnauthorizedSession(supabase))) {
          return json(AUTH_UNAVAILABLE, { status: 503 });
        }
        return json(
          {
            ...SURFACE_MISMATCH,
            requiredSurface: surfaceForRole(role),
          },
          { status: 409 },
        );
      }
    }
  } catch {
    return json(AUTH_UNAVAILABLE, { status: 503 });
  }

  return json({ success: true });
}
