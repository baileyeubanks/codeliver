import { NextRequest, NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth";
import { resolveTrustedSurfaceRole } from "@/lib/auth/host-surface";
import { streamTrustedMediaPath } from "@/lib/storage/media-response";

/** Staff-only raw NAS media streaming. Public review delivery uses token routes. */
export async function GET(request: NextRequest) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (resolveTrustedSurfaceRole(user) !== "staff") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const requestedPath = request.nextUrl.searchParams.get("path");
  if (!requestedPath) {
    return NextResponse.json(
      { error: "Missing path parameter" },
      { status: 400 },
    );
  }

  return streamTrustedMediaPath({
    request,
    requestedPath,
    download: request.nextUrl.searchParams.get("download") === "1",
  });
}
