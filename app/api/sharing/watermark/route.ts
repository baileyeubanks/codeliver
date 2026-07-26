import { apiError } from "@/lib/api/responses";

// Watermark-required review links now fail closed at atomic admission. This
// legacy helper previously returned a provider URL for unwatermarked media;
// keeping it as a tombstone prevents that bypass while the real rendered
// watermark delivery capability remains unavailable.
export async function POST() {
  return apiError(
    "Legacy watermark delivery is retired",
    "WATERMARK_ROUTE_RETIRED",
    410,
  );
}
