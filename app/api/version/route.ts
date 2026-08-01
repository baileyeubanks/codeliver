import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// G2 — deployment truth (CCO_GOAL §0). A deployed surface must expose its build
// SHA at a known endpoint so the source↔deploy gap is measurable with one
// command, never inferred from docs (§2 #5: the live site shipped a title
// defect the source had already fixed, and nobody could tell).
//
// Resolution order:
//   1. VERCEL_GIT_COMMIT_SHA — set automatically by Vercel at build time.
//   2. GIT_SHA / NEXT_PUBLIC_GIT_SHA — settable in any other CI/host.
//   3. "unknown" — local dev without injection; callers must treat this as
//      "gap not measurable here", not as a crash.
const sha =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.GIT_SHA ||
  process.env.NEXT_PUBLIC_GIT_SHA ||
  "unknown";

export async function GET() {
  return NextResponse.json(
    {
      sha,
      branch: process.env.VERCEL_GIT_COMMIT_REF || "unknown",
      product: "co-videopro",
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
