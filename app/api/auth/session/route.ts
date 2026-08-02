import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { resolveTrustedSurfaceRole } from "@/lib/auth/host-surface";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

export async function GET() {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json(
      { authenticated: false, code: "AUTH_UNAVAILABLE" },
      { status: 503, headers: NO_STORE },
    );
  }

  if (!user) {
    return NextResponse.json(
      { authenticated: false },
      { status: 401, headers: NO_STORE },
    );
  }

  return NextResponse.json({
    authenticated: true,
    email: user.email,
    id: user.id,
    surfaceRole: resolveTrustedSurfaceRole(user),
  }, { headers: NO_STORE });
}
