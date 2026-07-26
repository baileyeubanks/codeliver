import { requireAuthWithClient } from "@/lib/auth-client";
import { apiError, apiJson, backendUnavailable } from "@/lib/api/responses";
import { isBackendUnavailableError } from "@/lib/api/backend";

async function getSession() {
  try {
    const session = await requireAuthWithClient();
    return session.user
      ? session
      : { response: apiError("Unauthorized", "UNAUTHORIZED", 401) };
  } catch (error) {
    return {
      response: isBackendUnavailableError(error)
        ? backendUnavailable()
        : apiError("Authentication service is unavailable", "AUTH_UNAVAILABLE", 503),
    };
  }
}

export async function GET(req: Request) {
  const session = await getSession();
  if ("response" in session) return session.response;
  const { supabase } = session;
  const user = session.user!;

  const requestedLimit = Number.parseInt(new URL(req.url).searchParams.get("limit") ?? "50", 10);
  const limit = Number.isInteger(requestedLimit) ? Math.min(100, Math.max(1, requestedLimit)) : 50;
  try {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) return backendUnavailable();
    return apiJson({ items: data ?? [] });
  } catch {
    return backendUnavailable();
  }
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if ("response" in session) return session.response;
  const { supabase } = session;
  const user = session.user!;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return apiError("A JSON object is required", "INVALID_REQUEST", 400);
  }

  // Mark all as read
  if (body.all === true) {
    try {
      const { error } = await supabase
        .from("notifications")
        .update({ read: true })
        .eq("user_id", user.id)
        .eq("read", false);

      if (error) return backendUnavailable();
      return apiJson({ ok: true });
    } catch {
      return backendUnavailable();
    }
  }

  // Mark single notification as read
  const { id, read } = body as { id?: unknown; read?: unknown };

  if (typeof id !== "string" || !id || id.length > 128) {
    return apiError("id is required", "INVALID_REQUEST", 400);
  }
  if (read !== undefined && typeof read !== "boolean") {
    return apiError("read must be boolean", "INVALID_REQUEST", 400);
  }

  try {
    const { error } = await supabase
      .from("notifications")
      .update({ read: read ?? true })
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) return backendUnavailable();
    return apiJson({ ok: true });
  } catch {
    return backendUnavailable();
  }
}
