import { requireAuthWithClient } from "@/lib/auth-client";
import { apiError, apiJson, backendUnavailable } from "@/lib/api/responses";
import { isBackendUnavailableError } from "@/lib/api/backend";

async function session() {
  try { const value = await requireAuthWithClient(); return value.user ? value : { response: apiError("Unauthorized", "UNAUTHORIZED", 401) }; }
  catch (error) { return { response: isBackendUnavailableError(error) ? backendUnavailable() : apiError("Authentication service is unavailable", "AUTH_UNAVAILABLE", 503) }; }
}
function input(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const value = body as Record<string, unknown>;
  return typeof value.comment_id === "string" && value.comment_id && typeof value.emoji === "string" && value.emoji.length > 0 && value.emoji.length <= 32
    ? { commentId: value.comment_id, emoji: value.emoji } : null;
}

export async function GET(req: Request) {
  const auth = await session(); if ("response" in auth) return auth.response;
  const commentId = new URL(req.url).searchParams.get("comment_id");
  if (!commentId) return apiError("comment_id is required", "INVALID_REQUEST", 400);
  try {
    const result = await auth.supabase.from("comment_reactions").select("*").eq("comment_id", commentId).order("created_at", { ascending: true });
    return result.error ? backendUnavailable() : apiJson({ reactions: result.data ?? [] });
  } catch { return backendUnavailable(); }
}
export async function POST(req: Request) {
  const auth = await session(); if ("response" in auth) return auth.response;
  const value = input(await req.json().catch(() => null)); if (!value) return apiError("comment_id and emoji are required", "INVALID_REQUEST", 400);
  try {
    const result = await auth.supabase.from("comment_reactions").upsert({ comment_id: value.commentId, user_id: auth.user!.id, emoji: value.emoji }, { onConflict: "comment_id,user_id,emoji" }).select().single();
    return result.error ? backendUnavailable() : apiJson({ reaction: result.data }, { status: 201 });
  } catch { return backendUnavailable(); }
}
export async function DELETE(req: Request) {
  const auth = await session(); if ("response" in auth) return auth.response;
  const value = input(await req.json().catch(() => null)); if (!value) return apiError("comment_id and emoji are required", "INVALID_REQUEST", 400);
  try {
    const result = await auth.supabase.from("comment_reactions").delete().eq("comment_id", value.commentId).eq("user_id", auth.user!.id).eq("emoji", value.emoji);
    return result.error ? backendUnavailable() : apiJson({ ok: true });
  } catch { return backendUnavailable(); }
}
