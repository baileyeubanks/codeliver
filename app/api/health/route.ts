import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      service: "co-deliver",
      port: 4103,
    },
    { status: 200 },
  );
}
