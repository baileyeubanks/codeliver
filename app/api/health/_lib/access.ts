import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth";
import { resolveTrustedSurfaceRole } from "@/lib/auth/host-surface";

const NO_STORE = { "Cache-Control": "no-store" };

export async function authorizeDetailedHealth(): Promise<NextResponse | null> {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json(
      {
        error: "Health detail is unavailable",
        code: "HEALTH_AUTH_UNAVAILABLE",
      },
      { status: 503, headers: NO_STORE },
    );
  }

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required", code: "AUTH_REQUIRED" },
      { status: 401, headers: NO_STORE },
    );
  }

  if (resolveTrustedSurfaceRole(user) !== "staff") {
    return NextResponse.json(
      { error: "Staff access required", code: "STAFF_REQUIRED" },
      { status: 403, headers: NO_STORE },
    );
  }

  return null;
}
