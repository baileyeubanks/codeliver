import { NextResponse } from "next/server";

import {
  HEALTH_BRAND_NAME,
  HEALTH_PRODUCT_NAME,
  HEALTH_SERVICE_ID,
  currentHealthPort,
} from "./_lib/identity";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      service: HEALTH_SERVICE_ID,
      product: HEALTH_PRODUCT_NAME,
      brand: HEALTH_BRAND_NAME,
      port: currentHealthPort(),
    },
    { status: 200 },
  );
}
