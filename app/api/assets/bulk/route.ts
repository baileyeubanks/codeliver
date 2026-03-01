import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

type BulkAction = "move" | "tag" | "delete" | "restore";

interface BulkPayload {
  action: BulkAction;
  asset_ids: string[];
  folder_id?: string;
  tag_id?: string;
}

export async function POST(request: NextRequest) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: BulkPayload = await request.json();
  const { action, asset_ids, folder_id, tag_id } = body;

  if (!action || !asset_ids || asset_ids.length === 0) {
    return NextResponse.json(
      { error: "action and asset_ids are required" },
      { status: 400 }
    );
  }

  const supabase = getSupabase();

  switch (action) {
    case "move": {
      const { error } = await supabase
        .from("assets")
        .update({ folder_id: folder_id || null })
        .in("id", asset_ids);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({
        ok: true,
        message: `Moved ${asset_ids.length} asset(s)`,
      });
    }

    case "tag": {
      if (!tag_id) {
        return NextResponse.json(
          { error: "tag_id is required for tag action" },
          { status: 400 }
        );
      }

      const rows = asset_ids.map((asset_id) => ({
        asset_id,
        tag_id,
      }));

      const { error } = await supabase
        .from("asset_tags")
        .upsert(rows, { onConflict: "asset_id,tag_id" });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({
        ok: true,
        message: `Tagged ${asset_ids.length} asset(s)`,
      });
    }

    case "delete": {
      const { error } = await supabase
        .from("assets")
        .update({ deleted_at: new Date().toISOString() })
        .in("id", asset_ids);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({
        ok: true,
        message: `Deleted ${asset_ids.length} asset(s)`,
      });
    }

    case "restore": {
      const { error } = await supabase
        .from("assets")
        .update({ deleted_at: null })
        .in("id", asset_ids);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({
        ok: true,
        message: `Restored ${asset_ids.length} asset(s)`,
      });
    }

    default:
      return NextResponse.json(
        { error: `Unknown action: ${action}` },
        { status: 400 }
      );
  }
}
