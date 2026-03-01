import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import type { NotificationType } from "@/lib/types/codeliver";

interface PreferenceRow {
  event_type: string;
  email_enabled: boolean;
  email_frequency: string;
  in_app_enabled: boolean;
}

type PreferencePayload = Record<
  NotificationType,
  {
    email_enabled: boolean;
    in_app_enabled: boolean;
    email_frequency: string;
  }
>;

export async function GET() {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Convert array to record keyed by event_type
  const preferences: Record<string, Omit<PreferenceRow, "event_type">> = {};
  for (const row of data ?? []) {
    preferences[row.event_type] = {
      email_enabled: row.email_enabled,
      email_frequency: row.email_frequency,
      in_app_enabled: row.in_app_enabled,
    };
  }

  return NextResponse.json({ preferences });
}

export async function PUT(req: Request) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const preferences = body.preferences as PreferencePayload | undefined;

  if (!preferences || typeof preferences !== "object") {
    return NextResponse.json(
      { error: "preferences object is required" },
      { status: 400 }
    );
  }

  const supabase = getSupabase();

  const rows = Object.entries(preferences).map(([event_type, prefs]) => ({
    user_id: user.id,
    event_type,
    email_enabled: prefs.email_enabled,
    email_frequency: prefs.email_frequency,
    in_app_enabled: prefs.in_app_enabled,
  }));

  // Upsert all preferences
  const { error } = await supabase
    .from("notification_preferences")
    .upsert(rows, { onConflict: "user_id,event_type" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
