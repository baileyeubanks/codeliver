import { NextResponse } from "next/server";
import { requireAuthWithClient } from "@/lib/auth-client";

export async function GET(req: Request) {
  const { user, supabase } = await requireAuthWithClient();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requestedLimit = Number.parseInt(new URL(req.url).searchParams.get("limit") ?? "50", 10);
  const limit = Number.isInteger(requestedLimit) ? Math.min(100, Math.max(1, requestedLimit)) : 50;
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json(
      { error: "Notifications are temporarily unavailable" },
      { status: 503 },
    );
  }

  return NextResponse.json({ items: data ?? [] });
}

export async function PATCH(req: Request) {
  const { user, supabase } = await requireAuthWithClient();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "A JSON object is required" }, { status: 400 });
  }
  // Mark all as read
  if (body.all === true) {
    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", user.id)
      .eq("read", false);

    if (error) {
      return NextResponse.json(
        { error: "Notifications could not be updated" },
        { status: 503 },
      );
    }

    return NextResponse.json({ ok: true });
  }

  // Mark single notification as read
  const { id, read } = body as { id?: unknown; read?: unknown };

  if (typeof id !== "string" || !id || id.length > 128) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  if (read !== undefined && typeof read !== "boolean") {
    return NextResponse.json({ error: "read must be boolean" }, { status: 400 });
  }

  const { error } = await supabase
    .from("notifications")
    .update({ read: read ?? true })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json(
      { error: "Notification could not be updated" },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true });
}
