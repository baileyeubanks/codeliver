import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      service: "co-videopro",
      port: 4103,
    },
    { status: 200 },
  );
}
