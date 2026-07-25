import { NextResponse } from "next/server";
import { nanoid } from "nanoid";

import { requireAuth } from "@/lib/auth";
import { backendUnavailable } from "@/lib/api/responses";
import { getSupabaseDataSchema } from "@/lib/data-authority";
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
import { getSupabase } from "@/lib/supabase";

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
  | { ok: false; response: Response };

type ManagementContext = {
  user: {
    id: string;
    email?: string | null;
  };
  teamId: string;
  supabase: ReturnType<typeof getSupabase>;
};

type ManagementAuthorization =
  | { ok: true; context: ManagementContext }
  | { ok: false; response: Response };

const ALLOWED_METHODS = "GET, POST, PATCH, DELETE";
const PROVIDER_SIGNATURE_HEADER = "x-cco-notification-signature";
const MAX_REQUEST_BODY_BYTES = 65_536;
const WEBHOOK_RATE_LIMIT = 60;
const WEBHOOK_RATE_WINDOW_SECONDS = 60;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function apiJson(
  body: Record<string, unknown>,
  status = 200,
  headers?: HeadersInit,
) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

function methodNotAllowed() {
  return apiJson(
    { error: "Method not allowed", code: "METHOD_NOT_ALLOWED" },
    405,
    { Allow: ALLOWED_METHODS },
  );
}

function webhookServiceUnavailable() {
  return apiJson(
    {
      error: "Webhook service is unavailable",
      code: "BACKEND_UNAVAILABLE",
    },
    503,
  );
}

async function authorizeWebhookManagement(
  request: Request,
): Promise<ManagementAuthorization> {
  let user: Awaited<ReturnType<typeof requireAuth>>;
  try {
    user = await requireAuth();
  } catch {
    return {
      ok: false,
      response: apiJson(
        {
          error: "Authentication service is unavailable",
          code: "AUTH_UNAVAILABLE",
        },
        503,
      ),
    };
  }
  if (!user) {
    return {
      ok: false,
      response: apiJson(
        { error: "Authentication required", code: "AUTH_REQUIRED" },
        401,
      ),
    };
  }

  const teamId = new URL(request.url).searchParams.get("team_id")?.trim();
  if (!teamId || !UUID_PATTERN.test(teamId)) {
    return {
      ok: false,
      response: apiJson(
        {
          error: "A valid team_id query parameter is required",
          code: "INVALID_TEAM_ID",
        },
        400,
      ),
    };
  }

  let teamAccess: Awaited<ReturnType<typeof requireTeamRole>>;
  try {
    teamAccess = await requireTeamRole(teamId, user.id, "admin");
  } catch {
    return {
      ok: false,
      response: apiJson(
        {
          error: "Team authority is unavailable",
          code: "BACKEND_UNAVAILABLE",
        },
        503,
      ),
    };
  }
  if (!teamAccess.allowed) {
    if (teamAccess.status === 503) return { ok: false, response: backendUnavailable() };
    return {
      ok: false,
      response: apiJson(
        {
          error: "Team administrator access required",
          code: "TEAM_ADMIN_REQUIRED",
        },
        403,
      ),
    };
  }

  let supabase: ReturnType<typeof getSupabase>;
  try {
    supabase = getSupabase();
    const reservation = await supabase.rpc(
      "reserve_webhook_management_rate_limit",
      {
        p_actor_id: user.id,
        p_team_id: teamId,
        p_operation: request.method,
        p_limit: WEBHOOK_RATE_LIMIT,
        p_window_seconds: WEBHOOK_RATE_WINDOW_SECONDS,
      },
    );
    if (reservation.error) throw new Error("Rate authority failed");

    const row = Array.isArray(reservation.data)
      ? reservation.data[0]
      : reservation.data;
    if (
      !row ||
      typeof row.allowed !== "boolean" ||
      typeof row.retry_after_seconds !== "number"
    ) {
      throw new Error("Invalid rate authority result");
    }
    if (!row.allowed) {
      return {
        ok: false,
        response: apiJson(
          {
            error: "Webhook management rate exceeded",
            code: "WEBHOOK_RATE_LIMITED",
          },
          429,
          {
            "Retry-After": String(
              Math.max(1, Math.ceil(row.retry_after_seconds)),
            ),
          },
        ),
      };
    }
  } catch {
    return {
      ok: false,
      response: apiJson(
        {
          error: "Webhook rate authority is unavailable",
          code: "WEBHOOK_RATE_LIMIT_UNAVAILABLE",
        },
        503,
      ),
    };
  }

  return { ok: true, context: { user, teamId, supabase } };
}

async function readJsonObject(request: Request): Promise<JsonObjectResult> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 65_536) {
    return {
      ok: false,
      response: apiJson(
        { error: "Request body is too large", code: "REQUEST_TOO_LARGE" },
        413,
      ),
    };
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return {
      ok: false,
      response: apiJson(
        { error: "Request body is invalid", code: "INVALID_JSON" },
        400,
      ),
    };
  }
  if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BODY_BYTES) {
    return {
      ok: false,
      response: apiJson(
        { error: "Request body is too large", code: "REQUEST_TOO_LARGE" },
        413,
      ),
    };
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return {
      ok: false,
      response: apiJson(
        { error: "Request body must be valid JSON", code: "INVALID_JSON" },
        400,
      ),
    };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      response: apiJson(
        { error: "Request body must be an object", code: "INVALID_REQUEST" },
        400,
      ),
    };
  }
  return { ok: true, body: body as Record<string, unknown> };
}

function serializeWebhook(row: Record<string, unknown>) {
  return {
    ...withoutPersistedWebhookSecrets(row),
    signing_secret_configured: Boolean(row.secret || row.secret_ciphertext),
  };
}

function validWebhookId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

async function listWebhooks(context: ManagementContext) {
  const { data, error } = await context.supabase
    .from("webhooks")
    .select("*")
    .eq("team_id", context.teamId)
    .order("created_at", { ascending: false });
  if (error) throw new Error("Webhook list failed");

  return apiJson({
    items: ((data as WebhookRow[]) ?? []).map((webhook) =>
      serializeWebhook(webhook as unknown as Record<string, unknown>),
    ),
  });
}

async function sendTestWebhook(
  context: ManagementContext,
  webhookId: string,
) {
  const lookup = await context.supabase
    .from("webhooks")
    .select("*")
    .eq("id", webhookId)
    .eq("team_id", context.teamId)
    .maybeSingle();
  if (lookup.error) throw new Error("Webhook lookup failed");
  if (!lookup.data) {
    return apiJson(
      { error: "Webhook not found", code: "WEBHOOK_NOT_FOUND" },
      404,
    );
  }

  const webhook = lookup.data as WebhookRow;
  const testPayload = {
    event: "test",
    timestamp: new Date().toISOString(),
    team_id: context.teamId,
    data: { message: "This is a test webhook from Co‑ProVideo" },
  };

  let responseCode = 0;
  let deliveryFailed = false;
  try {
    const result = await deliverSignedWebhook({
      url: webhook.url,
      secret: recoverWebhookSecret(
        webhook as unknown as Record<string, unknown>,
      ),
      event: "test",
      payload: testPayload,
    });
    responseCode = result.responseCode;
  } catch {
    deliveryFailed = true;
  }

  const success =
    !deliveryFailed && responseCode >= 200 && responseCode < 300;
  const deliveryLog = await context.supabase
    .from("webhook_deliveries")
    .insert({
      webhook_id: webhookId,
      event: "test",
      payload: testPayload,
      response_code: responseCode,
      ...(getSupabaseDataSchema() === "co_production" && !success
        ? {
            error_code: deliveryFailed
              ? "delivery_failed"
              : "http_failure",
          }
        : {}),
    });
  if (deliveryLog.error) throw new Error("Webhook delivery audit failed");

  return apiJson({
    ok: success,
    response_code: responseCode,
    success,
    error: success ? null : "Webhook delivery failed",
  });
}

async function createOrTestWebhook(
  request: Request,
  context: ManagementContext,
) {
  const bodyResult = await readJsonObject(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.body;

  if (body.webhook_id !== undefined && body.url === undefined) {
    if (
      !validWebhookId(body.webhook_id) ||
      Object.keys(body).some((key) => key !== "webhook_id")
    ) {
      return apiJson(
        {
          error: "A valid webhook_id is required",
          code: "INVALID_REQUEST",
        },
        400,
      );
    }
    return sendTestWebhook(context, body.webhook_id);
  }

  if (
    typeof body.url !== "string" ||
    Object.keys(body).some((key) => key !== "url" && key !== "events")
  ) {
    return apiJson(
      {
        error: "Request must contain only url and optional events",
        code: "INVALID_REQUEST",
      },
      400,
    );
  }

  const parsedEvents = normalizeWebhookEvents(body.events);
  if (!parsedEvents.ok) {
    return apiJson(
      { error: parsedEvents.error, code: "INVALID_EVENTS" },
      400,
    );
  }

  let safeUrl: string;
  try {
    safeUrl = await assertSafeWebhookUrl(body.url);
  } catch {
    return apiJson(
      { error: "Invalid webhook URL", code: "INVALID_WEBHOOK_URL" },
      400,
    );
  }

  const secret = `whsec_${nanoid(40)}`;
  const dataSchema = getSupabaseDataSchema();
  const insert = await context.supabase
    .from("webhooks")
    .insert({
      team_id: context.teamId,
      url: safeUrl,
      events: parsedEvents.events,
      ...persistedWebhookSecretFields(secret, dataSchema),
      active: true,
      ...(dataSchema === "co_production"
        ? { created_by: context.user.id }
        : {}),
    })
    .select()
    .single();
  if (insert.error || !insert.data) {
    throw new Error("Webhook creation failed");
  }

  const audit = await context.supabase.from("activity_log").insert({
    actor_id: context.user.id,
    actor_name: context.user.email ?? "Authenticated operator",
    action: "webhook_created",
    details: {
      team_id: context.teamId,
      url: safeUrl,
      events: parsedEvents.events,
    },
  });
  if (audit.error) throw new Error("Webhook creation audit failed");

  return apiJson(
    {
      webhook: serializeWebhook(
        insert.data as unknown as Record<string, unknown>,
      ),
      signing_secret: secret,
    },
    201,
  );
}

async function updateWebhook(
  request: Request,
  context: ManagementContext,
) {
  const bodyResult = await readJsonObject(request);
  if (!bodyResult.ok) return bodyResult.response;
  const { webhook_id: webhookId, url, events, active } = bodyResult.body;

  if (
    !validWebhookId(webhookId) ||
    Object.keys(bodyResult.body).some(
      (key) =>
        key !== "webhook_id" &&
        key !== "url" &&
        key !== "events" &&
        key !== "active",
    )
  ) {
    return apiJson(
      { error: "A valid webhook_id is required", code: "INVALID_REQUEST" },
      400,
    );
  }

  const updates: Record<string, unknown> = {};
  if (url !== undefined) {
    if (typeof url !== "string") {
      return apiJson(
        { error: "url must be a string", code: "INVALID_REQUEST" },
        400,
      );
    }
    try {
      updates.url = await assertSafeWebhookUrl(url);
    } catch {
      return apiJson(
        { error: "Invalid webhook URL", code: "INVALID_WEBHOOK_URL" },
        400,
      );
    }
  }
  if (events !== undefined) {
    const parsedEvents = normalizeWebhookEvents(events);
    if (!parsedEvents.ok) {
      return apiJson(
        { error: parsedEvents.error, code: "INVALID_EVENTS" },
        400,
      );
    }
    updates.events = parsedEvents.events;
  }
  if (active !== undefined) {
    if (typeof active !== "boolean") {
      return apiJson(
        { error: "active must be a boolean", code: "INVALID_REQUEST" },
        400,
      );
    }
    updates.active = active;
  }
  if (Object.keys(updates).length === 0) {
    return apiJson(
      { error: "No fields to update", code: "INVALID_REQUEST" },
      400,
    );
  }

  const update = await context.supabase
    .from("webhooks")
    .update(updates)
    .eq("id", webhookId)
    .eq("team_id", context.teamId)
    .select()
    .maybeSingle();
  if (update.error) throw new Error("Webhook update failed");
  if (!update.data) {
    return apiJson(
      { error: "Webhook not found", code: "WEBHOOK_NOT_FOUND" },
      404,
    );
  }

  return apiJson({
    webhook: serializeWebhook(
      update.data as unknown as Record<string, unknown>,
    ),
  });
}

async function deleteWebhook(
  request: Request,
  context: ManagementContext,
) {
  const bodyResult = await readJsonObject(request);
  if (!bodyResult.ok) return bodyResult.response;
  const { webhook_id: webhookId } = bodyResult.body;
  if (
    !validWebhookId(webhookId) ||
    Object.keys(bodyResult.body).some((key) => key !== "webhook_id")
  ) {
    return apiJson(
      { error: "A valid webhook_id is required", code: "INVALID_REQUEST" },
      400,
    );
  }

  const deletion = await context.supabase
    .from("webhooks")
    .delete()
    .eq("id", webhookId)
    .eq("team_id", context.teamId)
    .select("id")
    .maybeSingle();
  if (deletion.error) throw new Error("Webhook deletion failed");
  if (!deletion.data) {
    return apiJson(
      { error: "Webhook not found", code: "WEBHOOK_NOT_FOUND" },
      404,
    );
  }

  return apiJson({ ok: true });
}

async function handleManagementRequest(
  request: Request,
  handler: (context: ManagementContext) => Promise<Response>,
) {
  const authorization = await authorizeWebhookManagement(request);
  if (!authorization.ok) return authorization.response;

  if (request.headers.has(PROVIDER_SIGNATURE_HEADER)) {
    return apiJson(
      {
        error: "Provider events are not accepted at this endpoint",
        code: "WRONG_WEBHOOK_ENDPOINT",
      },
      404,
    );
  }

  try {
    return await handler(authorization.context);
  } catch {
    return webhookServiceUnavailable();
  }
}

export async function GET(request: Request) {
  return handleManagementRequest(request, (context) =>
    listWebhooks(context),
  );
}

export async function POST(request: Request) {
  return handleManagementRequest(request, (context) =>
    createOrTestWebhook(request, context),
  );
}

export async function PATCH(request: Request) {
  return handleManagementRequest(request, (context) =>
    updateWebhook(request, context),
  );
}

export async function DELETE(request: Request) {
  return handleManagementRequest(request, (context) =>
    deleteWebhook(request, context),
  );
}

export async function HEAD() {
  return methodNotAllowed();
}

export async function OPTIONS() {
  return methodNotAllowed();
}

export async function PUT() {
  return methodNotAllowed();
}
