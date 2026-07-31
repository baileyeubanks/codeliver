import { getSupabase } from "@/lib/supabase";
import { opaqueTokenLookup } from "@/lib/security/opaque-token";

export type ReviewDocumentAuthority =
  | { ok: true }
  | {
      ok: false;
      status: 404 | 503;
      error: string;
    };

/**
 * Read-only document probe for a bearer-token review URL.
 *
 * This deliberately selects only the invite id. It does not admit the viewer,
 * increment view counts, enforce the final-view limit, or return review data.
 * Those responsibilities remain in the browser admission exchange. The probe
 * exists solely so the HTML document can return a truthful 404 or fail closed
 * when record authority is unavailable.
 */
export async function probeReviewDocumentAuthority(
  token: string,
): Promise<ReviewDocumentAuthority> {
  try {
    const lookup = opaqueTokenLookup(token);
    const { data, error } = await getSupabase()
      .from("review_invites")
      .select("id")
      .eq(lookup.column, lookup.value)
      .maybeSingle();

    if (error) {
      return {
        ok: false,
        status: 503,
        error: "Review service is unavailable",
      };
    }

    if (!data) {
      return {
        ok: false,
        status: 404,
        error: "Invalid or expired review link",
      };
    }

    return { ok: true };
  } catch {
    return {
      ok: false,
      status: 503,
      error: "Review service is unavailable",
    };
  }
}
