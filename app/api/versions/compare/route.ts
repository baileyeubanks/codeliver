import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

export async function GET(req: Request) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const versionAId = searchParams.get("a");
  const versionBId = searchParams.get("b");

  if (!versionAId || !versionBId) {
    return NextResponse.json({ error: "Both version IDs (a, b) required" }, { status: 400 });
  }

  const sb = getSupabase();

  // Fetch both versions
  const [resA, resB] = await Promise.all([
    sb.from("versions").select("*").eq("id", versionAId).single(),
    sb.from("versions").select("*").eq("id", versionBId).single(),
  ]);

  if (resA.error || resB.error) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
  }

  // Fetch annotations for both versions
  const [annotA, annotB] = await Promise.all([
    sb.from("annotations").select("*").eq("version_id", versionAId),
    sb.from("annotations").select("*").eq("version_id", versionBId),
  ]);

  return NextResponse.json({
    versionA: { ...resA.data, annotations: annotA.data ?? [] },
    versionB: { ...resB.data, annotations: annotB.data ?? [] },
  });
}
