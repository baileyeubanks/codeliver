import { NextResponse } from "next/server";

import { collectDependencySnapshot } from "../_lib/checks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const snapshot = await collectDependencySnapshot();
  return NextResponse.json(
    { ...snapshot, probe: "dependencies" },
    { status: snapshot.ready ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}
