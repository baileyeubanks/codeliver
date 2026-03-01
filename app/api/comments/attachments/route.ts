import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

const BUCKET = "deliverables";
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const commentId = searchParams.get("comment_id");

  if (!commentId) {
    return NextResponse.json(
      { error: "comment_id is required" },
      { status: 400 }
    );
  }

  const { data, error } = await getSupabase()
    .from("comment_attachments")
    .select("*")
    .eq("comment_id", commentId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ attachments: data });
}

export async function POST(req: Request) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const commentId = formData.get("comment_id") as string | null;

  if (!file || !commentId) {
    return NextResponse.json(
      { error: "file and comment_id are required" },
      { status: 400 }
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "File size exceeds 25 MB limit" },
      { status: 400 }
    );
  }

  const supabase = getSupabase();

  // Upload to Supabase Storage
  const ext = file.name.split(".").pop() || "bin";
  const storagePath = `comments/${commentId}/${crypto.randomUUID()}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: `Upload failed: ${uploadError.message}` },
      { status: 500 }
    );
  }

  // Get public URL
  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);

  // Insert attachment record
  const { data, error: insertError } = await supabase
    .from("comment_attachments")
    .insert({
      comment_id: commentId,
      file_url: publicUrl,
      file_name: file.name,
      file_type: file.type || null,
      file_size: file.size,
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json(
      { error: insertError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ attachment: data }, { status: 201 });
}
