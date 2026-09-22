import { readReviewJsonObject } from "@/lib/review/request-boundary";
import { apiError, apiJson } from "@/lib/api/responses";
import { resolveAuthRequestOrigin } from "@/lib/auth/flow";
import { googleReviewAuthEnabled, resolveReviewAuthReturn } from "@/lib/auth/review-return";
import { createSupabaseAuth } from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  return apiJson({ enabled: googleReviewAuthEnabled(process.env) }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  if (!googleReviewAuthEnabled(process.env)) {
    return apiError("Google sign-in is not available yet. You can continue with your review link.", "AUTH_PROVIDER_UNAVAILABLE", 503);
  }
  const origin = resolveAuthRequestOrigin(request);
  if (!origin || request.headers.get("origin") !== origin) {
    return apiError("Sign-in request is not allowed.", "AUTH_ORIGIN_INVALID", 403);
  }
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    return apiError("JSON is required.", "AUTH_INVALID_REQUEST", 415);
  }
  let parsed: Awaited<ReturnType<typeof readReviewJsonObject>>;
  try { parsed = await readReviewJsonObject(request, { maxBytes: 2048 }); } catch {
    return apiError("Invalid sign-in request.", "AUTH_INVALID_REQUEST", 400);
  }
  if (!parsed.ok) return apiError("Invalid sign-in request.", "AUTH_INVALID_REQUEST", parsed.status);
  const body = parsed.value;
  const next = resolveReviewAuthReturn(
    body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>).next : null,
  );
  if (!next) return apiError("A valid review link is required.", "AUTH_REVIEW_RETURN_INVALID", 400);
  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set("next", next);
  try {
    // createSupabaseAuth uses the SSR client's cookie-backed PKCE verifier.
    const supabase = await createSupabaseAuth();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback.toString(), skipBrowserRedirect: true },
    });
    if (error || !data.url) return apiError("Google sign-in could not be started. Continue with your review link.", "AUTH_PROVIDER_UNAVAILABLE", 503);
    return apiJson({ url: data.url }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return apiError("Google sign-in is temporarily unavailable. Continue with your review link.", "AUTH_PROVIDER_UNAVAILABLE", 503);
  }
}
