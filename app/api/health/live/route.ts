import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      service: "co-videopro",
      probe: "liveness",
      observedAt: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      release: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_SHA ?? "unknown",
    },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
