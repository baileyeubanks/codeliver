import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const { data, error } = await supabase
    .from("asset_versions")
    .select("*")
    .eq("asset_id", id)
    .order("version_number", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch versions" }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const payload = await req.json().catch(() => ({}));

  const { data: latest } = await supabase
    .from("asset_versions")
    .select("version_number")
    .eq("asset_id", id)
    .order("version_number", { ascending: false })
    .limit(1)
    .single();

  const nextVersion = (latest?.version_number ?? 0) + 1;

  const { data, error } = await supabase
    .from("asset_versions")
    .insert({
      asset_id: id,
      version_number: nextVersion,
      media_asset_id: payload.media_asset_id || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to create version" }, { status: 500 });
  }

  await supabase.from("review_events").insert({
    asset_id: id,
    event_type: "version_uploaded",
    payload: { version_number: nextVersion, version_id: data.id },
  });

  return NextResponse.json(data);
}
