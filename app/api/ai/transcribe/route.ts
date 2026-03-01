import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

export async function GET(req: Request) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const assetId = searchParams.get("asset_id");

  if (!assetId) {
    return NextResponse.json({ error: "asset_id required" }, { status: 400 });
  }

  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("transcriptions")
    .select("*")
    .eq("asset_id", assetId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ transcription: null });
  }

  return NextResponse.json({ transcription: data });
}

export async function POST(req: Request) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { asset_id } = body as { asset_id?: string };

  if (!asset_id) {
    return NextResponse.json({ error: "asset_id required" }, { status: 400 });
  }

  const supabase = getSupabase();

  // Verify asset exists
  const { data: asset, error: assetErr } = await supabase
    .from("assets")
    .select("id, file_type")
    .eq("id", asset_id)
    .single();

  if (assetErr || !asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  // Check for existing processing transcription
  const { data: existing } = await supabase
    .from("transcriptions")
    .select("id, status")
    .eq("asset_id", asset_id)
    .in("status", ["pending", "processing"])
    .maybeSingle();

  if (existing) {
    return NextResponse.json({
      id: (existing as { id: string }).id,
      status: (existing as { status: string }).status,
      message: "Transcription already in progress",
    });
  }

  // Create placeholder transcription record
  // In production, this would trigger a Whisper API call
  const { data: transcription, error: insertErr } = await supabase
    .from("transcriptions")
    .insert({
      asset_id,
      status: "processing",
      segments: [],
      language: "en",
    })
    .select("id, status")
    .single();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  const result = transcription as { id: string; status: string };

  return NextResponse.json({
    id: result.id,
    status: result.status,
    message: "Transcription job started",
  });
}
