import { NextResponse } from "next/server";

import {
  HEALTH_BRAND_NAME,
  HEALTH_PRODUCT_NAME,
  HEALTH_SERVICE_ID,
} from "../_lib/identity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      service: HEALTH_SERVICE_ID,
      product: HEALTH_PRODUCT_NAME,
      brand: HEALTH_BRAND_NAME,
      probe: "liveness",
      observedAt: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      release: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_SHA ?? "unknown",
    },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
