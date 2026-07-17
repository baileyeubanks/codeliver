import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabaseDataSchema } from "@/lib/data-authority";
import { getSupabase } from "@/lib/supabase";
import { requireTeamRole } from "@/lib/middleware/rbac";
import {
  assertSafeWebhookUrl,
  deliverSignedWebhook,
  normalizeWebhookEvents,
} from "@/lib/security/webhook-delivery";
import {
  persistedWebhookSecretFields,
  recoverWebhookSecret,
  withoutPersistedWebhookSecrets,
} from "@/lib/security/webhook-secret";
import { nanoid } from "nanoid";

interface WebhookRow {
  id: string;
  team_id: string;
  url: string;
  events: string[];
  secret?: string;
  secret_ciphertext?: string;
  active: boolean;
  created_at: string;
}

type JsonObjectResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: number; error: string };

async function readJsonObject(request: Request): Promise<JsonObjectResult> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 65_536) {
    return { ok: false, status: 413, error: "Request body is too large" };
  }
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { ok: false, status: 400, error: "Request body must be an object" };
    }
    return { ok: true, body: body as Record<string, unknown> };
  } catch {
    return { ok: false, status: 400, error: "Request body must be valid JSON" };
  }
}

function invalidBody(result: Extract<JsonObjectResult, { ok: false }>) {
  return NextResponse.json({ error: result.error }, { status: result.status });
}

function serializeWebhook(row: Record<string, unknown>) {
  return {
    ...withoutPersistedWebhookSecrets(row),
    signing_secret_configured: Boolean(row.secret || row.secret_ciphertext),
  };
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

  return NextResponse.json({
    items: ((data as WebhookRow[]) ?? []).map((webhook) =>
      serializeWebhook(webhook as unknown as Record<string, unknown>),
    ),
  });
}

/* ── POST — create webhook or send test ── */
export async function POST(request: NextRequest) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bodyResult = await readJsonObject(request);
  if (!bodyResult.ok) return invalidBody(bodyResult);
  const body = bodyResult.body;
  const supabase = getSupabase();

  // Test webhook
  if (body.webhook_id && !body.url) {
    const webhook_id = body.webhook_id;
    if (typeof webhook_id !== "string") {
      return NextResponse.json(
        { error: "webhook_id must be a string" },
        { status: 400 },
      );
    }

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
      data: { message: "This is a test webhook from Webster" },
    };

    let responseCode = 0;
    let deliveryError: string | null = null;
    try {
      const result = await deliverSignedWebhook({
        url: (webhook as WebhookRow).url,
        secret: recoverWebhookSecret(webhook as Record<string, unknown>),
        event: "test",
        payload: testPayload,
      });
      responseCode = result.responseCode;
    } catch (error) {
      deliveryError =
        error instanceof Error ? error.message : "Webhook delivery failed";
    }

    // Log delivery
    const success = responseCode >= 200 && responseCode < 300;
    await supabase.from("webhook_deliveries").insert({
      webhook_id,
      event: "test",
      payload: testPayload,
      response_code: responseCode,
      ...(getSupabaseDataSchema() === "co_production" && !success
        ? { error_code: deliveryError ? "delivery_failed" : "http_failure" }
        : {}),
    });

    return NextResponse.json({
      ok: success,
      response_code: responseCode,
      success,
      error: deliveryError ? "Webhook delivery failed" : null,
    });
  }

  // Create webhook
  const { team_id, url, events } = body;

  if (typeof team_id !== "string" || typeof url !== "string") {
    return NextResponse.json(
      { error: "team_id and url are required" },
      { status: 400 }
    );
  }

  const parsedEvents = normalizeWebhookEvents(events);
  if (!parsedEvents.ok) {
    return NextResponse.json({ error: parsedEvents.error }, { status: 400 });
  }

  const check = await requireTeamRole(team_id, user.id, "admin");
  if (!check.allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let safeUrl: string;
  try {
    safeUrl = await assertSafeWebhookUrl(url);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid webhook URL" },
      { status: 400 },
    );
  }

  const secret = `whsec_${nanoid(40)}`;
  const dataSchema = getSupabaseDataSchema();

  const { data, error } = await supabase
    .from("webhooks")
    .insert({
      team_id,
      url: safeUrl,
      events: parsedEvents.events,
      ...persistedWebhookSecretFields(secret, dataSchema),
      active: true,
      ...(dataSchema === "co_production" ? { created_by: user.id } : {}),
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
    details: { team_id, url: safeUrl, events: parsedEvents.events },
  });

  return NextResponse.json(
    {
      webhook: serializeWebhook(data as Record<string, unknown>),
      signing_secret: secret,
    },
    { status: 201 },
  );
}

/* ── PATCH — update webhook ── */
export async function PATCH(request: NextRequest) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bodyResult = await readJsonObject(request);
  if (!bodyResult.ok) return invalidBody(bodyResult);
  const { webhook_id, url, events, active } = bodyResult.body;

  if (typeof webhook_id !== "string") {
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
    if (typeof url !== "string") {
      return NextResponse.json({ error: "url must be a string" }, { status: 400 });
    }
    try {
      updates.url = await assertSafeWebhookUrl(url);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Invalid webhook URL" },
        { status: 400 },
      );
    }
  }
  if (events !== undefined) {
    const parsedEvents = normalizeWebhookEvents(events);
    if (!parsedEvents.ok) {
      return NextResponse.json({ error: parsedEvents.error }, { status: 400 });
    }
    updates.events = parsedEvents.events;
  }
  if (active !== undefined) {
    if (typeof active !== "boolean") {
      return NextResponse.json(
        { error: "active must be a boolean" },
        { status: 400 },
      );
    }
    updates.active = active;
  }

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

  return NextResponse.json({
    webhook: serializeWebhook(data as Record<string, unknown>),
  });
}

/* ── DELETE — delete webhook ── */
export async function DELETE(request: NextRequest) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bodyResult = await readJsonObject(request);
  if (!bodyResult.ok) return invalidBody(bodyResult);
  const { webhook_id } = bodyResult.body;

  if (typeof webhook_id !== "string") {
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
