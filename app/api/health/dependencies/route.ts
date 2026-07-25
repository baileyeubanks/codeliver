import { NextResponse } from "next/server";

import { authorizeDetailedHealth } from "../_lib/access.ts";
import { collectDependencySnapshot } from "../_lib/checks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const denied = await authorizeDetailedHealth();
  if (denied) return denied;

  const snapshot = await collectDependencySnapshot();
  return NextResponse.json(
    { ...snapshot, probe: "dependencies" },
    { status: snapshot.ready ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}
