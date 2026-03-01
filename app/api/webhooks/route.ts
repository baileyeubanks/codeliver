import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { requireTeamRole } from "@/lib/middleware/rbac";
import { nanoid } from "nanoid";

interface WebhookRow {
  id: string;
  team_id: string;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
  created_at: string;
}

/* ── GET — list webhooks for a team ── */
export async function GET(request: NextRequest) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const teamId = request.nextUrl.searchParams.get("team_id");
  if (!teamId) {
    return NextResponse.json(
      { error: "team_id is required" },
      { status: 400 }
    );
  }

  const check = await requireTeamRole(teamId, user.id, "admin");
  if (!check.allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("webhooks")
    .select("*")
    .eq("team_id", teamId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: (data as WebhookRow[]) ?? [] });
}

/* ── POST — create webhook or send test ── */
export async function POST(request: NextRequest) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const supabase = getSupabase();

  // Test webhook
  if (body.webhook_id && !body.url) {
    const { webhook_id } = body as { webhook_id: string };

    const { data: webhook, error: whErr } = await supabase
      .from("webhooks")
      .select("*")
      .eq("id", webhook_id)
      .single();

    if (whErr || !webhook) {
      return NextResponse.json(
        { error: "Webhook not found" },
        { status: 404 }
      );
    }

    const check = await requireTeamRole(
      (webhook as WebhookRow).team_id,
      user.id,
      "admin"
    );
    if (!check.allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const testPayload = {
      event: "test",
      timestamp: new Date().toISOString(),
      team_id: (webhook as WebhookRow).team_id,
      data: { message: "This is a test webhook from CoDeliver" },
    };

    let responseCode = 0;
    try {
      const res = await fetch((webhook as WebhookRow).url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CoDeliver-Signature": (webhook as WebhookRow).secret,
          "X-CoDeliver-Event": "test",
        },
        body: JSON.stringify(testPayload),
      });
      responseCode = res.status;
    } catch {
      responseCode = 0;
    }

    // Log delivery
    await supabase.from("webhook_deliveries").insert({
      webhook_id,
      event: "test",
      payload: testPayload,
      response_code: responseCode,
    });

    return NextResponse.json({
      ok: true,
      response_code: responseCode,
      success: responseCode >= 200 && responseCode < 300,
    });
  }

  // Create webhook
  const { team_id, url, events } = body as {
    team_id?: string;
    url?: string;
    events?: string[];
  };

  if (!team_id || !url) {
    return NextResponse.json(
      { error: "team_id and url are required" },
      { status: 400 }
    );
  }

  // Validate URL
  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  const check = await requireTeamRole(team_id, user.id, "admin");
  if (!check.allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const secret = `whsec_${nanoid(40)}`;

  const { data, error } = await supabase
    .from("webhooks")
    .insert({
      team_id,
      url,
      events: events ?? [],
      secret,
      active: true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("activity_log").insert({
    actor_id: user.id,
    actor_name: user.email ?? "Unknown",
    action: "webhook_created",
    details: { team_id, url, events: events ?? [] },
  });

  return NextResponse.json(data, { status: 201 });
}

/* ── PATCH — update webhook ── */
export async function PATCH(request: NextRequest) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { webhook_id, url, events, active } = body as {
    webhook_id?: string;
    url?: string;
    events?: string[];
    active?: boolean;
  };

  if (!webhook_id) {
    return NextResponse.json(
      { error: "webhook_id is required" },
      { status: 400 }
    );
  }

  const supabase = getSupabase();

  const { data: webhook, error: whErr } = await supabase
    .from("webhooks")
    .select("team_id")
    .eq("id", webhook_id)
    .single();

  if (whErr || !webhook) {
    return NextResponse.json(
      { error: "Webhook not found" },
      { status: 404 }
    );
  }

  const check = await requireTeamRole(webhook.team_id, user.id, "admin");
  if (!check.allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updates: Record<string, unknown> = {};
  if (url !== undefined) {
    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }
    updates.url = url;
  }
  if (events !== undefined) updates.events = events;
  if (active !== undefined) updates.active = active;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No fields to update" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("webhooks")
    .update(updates)
    .eq("id", webhook_id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

/* ── DELETE — delete webhook ── */
export async function DELETE(request: NextRequest) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { webhook_id } = body as { webhook_id?: string };

  if (!webhook_id) {
    return NextResponse.json(
      { error: "webhook_id is required" },
      { status: 400 }
    );
  }

  const supabase = getSupabase();

  const { data: webhook, error: whErr } = await supabase
    .from("webhooks")
    .select("team_id")
    .eq("id", webhook_id)
    .single();

  if (whErr || !webhook) {
    return NextResponse.json(
      { error: "Webhook not found" },
      { status: 404 }
    );
  }

  const check = await requireTeamRole(webhook.team_id, user.id, "admin");
  if (!check.allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase
    .from("webhooks")
    .delete()
    .eq("id", webhook_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
