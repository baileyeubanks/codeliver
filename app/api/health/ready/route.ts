import { NextResponse } from "next/server";

import { collectDependencySnapshot } from "../_lib/checks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const snapshot = await collectDependencySnapshot();
  return NextResponse.json(
    {
      status: snapshot.status,
      ready: snapshot.ready,
      service: snapshot.service,
      probe: "readiness",
      observedAt: snapshot.observedAt,
      durationMs: snapshot.durationMs,
      failedDependencies: snapshot.checks.filter((check) => check.status === "fail").map((check) => check.id),
    },
    { status: snapshot.ready ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}
