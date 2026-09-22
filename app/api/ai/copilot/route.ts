import { getProjectAccess } from "@/lib/access-control";
import {
  COPILOT_MAX_REQUEST_BYTES,
  loadCopilotContext,
  normalizeCopilotRequest,
  requestCopilotResponse,
  reserveCopilotRateLimit,
  resolveCopilotConfig,
} from "@/lib/ai/copilot";
import { apiError, apiJson, backendUnavailable } from "@/lib/api/responses";
import { requireAuth } from "@/lib/auth";
import { resolveTrustedSurfaceRole } from "@/lib/auth/host-surface";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

async function readRequestBody(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > COPILOT_MAX_REQUEST_BYTES) {
    return { ok: false as const, response: apiError("Request body is too large", "INVALID_REQUEST", 413) };
  }

  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > COPILOT_MAX_REQUEST_BYTES) {
      return { ok: false as const, response: apiError("Request body is too large", "INVALID_REQUEST", 413) };
    }
    const parsed = normalizeCopilotRequest(JSON.parse(raw));
    if (!parsed.ok) {
      return { ok: false as const, response: apiError(parsed.error, "INVALID_REQUEST", 400) };
    }
    return { ok: true as const, value: parsed.value };
  } catch {
    return { ok: false as const, response: apiError("A valid JSON body is required", "INVALID_REQUEST", 400) };
  }
}

export async function POST(request: Request) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return backendUnavailable();
  }
  if (!user) {
    return apiError("Authentication is required", "UNAUTHENTICATED", 401);
  }
  if (resolveTrustedSurfaceRole(user) !== "staff") {
    return apiError("Staff access is required", "FORBIDDEN", 403);
  }

  const body = await readRequestBody(request);
  if (!body.ok) return body.response;

  let supabase;
  try {
    supabase = getSupabase();
  } catch {
    return backendUnavailable();
  }

  let access;
  try {
    access = await getProjectAccess(body.value.projectId, user.id, "viewer", supabase);
  } catch {
    return backendUnavailable();
  }
  if (!access.ok) {
    return access.status >= 500
      ? backendUnavailable()
      : apiError("Project access is denied", "FORBIDDEN", 403);
  }

  const config = resolveCopilotConfig();
  if (!config.ok) {
    return apiError(config.error, "NOT_CONFIGURED", 503);
  }

  const rateLimit = reserveCopilotRateLimit(user.id);
  if (!rateLimit.allowed) {
    return apiError("Copilot rate limit exceeded", "RATE_LIMITED", 429, {
      "Retry-After": String(rateLimit.retryAfterSeconds),
    });
  }

  const context = await loadCopilotContext(supabase, body.value.projectId);
  if (!context.ok) {
    return backendUnavailable();
  }

  try {
    const result = await requestCopilotResponse({
      config: config.value,
      request: body.value,
      context: context.value,
    });
    if (!result.ok) {
      return apiError(result.error, "PROVIDER_UNAVAILABLE", 502);
    }
    return apiJson({
      answer: result.value.answer,
      model: result.value.model,
      sources: result.value.sources,
      read_only: true,
    });
  } catch {
    return apiError("OpenAI is temporarily unavailable", "PROVIDER_UNAVAILABLE", 502);
  }
}
