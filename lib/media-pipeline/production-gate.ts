import { NextResponse } from "next/server";

export function paidComputeProductionGate() {
  if (process.env.NODE_ENV !== "production") return null;

  return NextResponse.json(
    {
      error: "Paid compute is not enabled for this production surface",
      code: "PAID_COMPUTE_AUTHORITY_REQUIRED",
    },
    {
      status: 403,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
