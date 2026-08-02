import { NextResponse } from "next/server";
import {
  ADMIN_SURFACE_HOST,
  CANONICAL_PRODUCT_HOST,
  CANONICAL_PRODUCT_WWW_HOST,
  CLIENT_SURFACE_HOST,
  buildProtectedReturnPath,
  isInviteReturnPath,
} from "@/lib/auth/host-surface";
import { createSupabaseAuth } from "@/lib/supabase-auth";

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

function confirmationRedirect(
  request: Request,
  requestedTarget: unknown,
): string | undefined {
  const requestUrl = new URL(request.url);
  const allowedHost =
    requestUrl.hostname === ADMIN_SURFACE_HOST ||
    requestUrl.hostname === CLIENT_SURFACE_HOST ||
    requestUrl.hostname === CANONICAL_PRODUCT_HOST ||
    requestUrl.hostname === CANONICAL_PRODUCT_WWW_HOST ||
    requestUrl.hostname === "localhost" ||
    requestUrl.hostname === "127.0.0.1";

  if (!allowedHost) return undefined;

  const target = new URL("/auth/callback", requestUrl.origin);
  const safeTarget = buildProtectedReturnPath(
    typeof requestedTarget === "string" ? requestedTarget : "/projects",
  );
  if (isInviteReturnPath(safeTarget)) {
    target.searchParams.set("next", safeTarget);
  }
  return target.toString();
}

export async function POST(req: Request) {
  let body: Record<string, unknown> | null;
  try {
    body = signupBody(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!body) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const requestedDisplayName =
    typeof body.display_name === "string" ? body.display_name.trim() : "";
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  const emailRedirectTo = confirmationRedirect(req, body.next);
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
    return NextResponse.json(
      { error: "Account creation could not be completed." },
      { status: 400 },
    );
  }

  return NextResponse.json(PENDING_ACCESS_RESPONSE, { status: 202 });
}
