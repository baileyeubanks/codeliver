export const REVIEW_ADMISSION_RENEWAL_INTERVAL_MS = 10 * 60 * 1_000;
const admissionFlights = new Map<
  string,
  Promise<Record<string, unknown>>
>();

type ReviewFetchOptions = {
  signal?: AbortSignal;
};

async function readPayload(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const value = (await response.json()) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function reviewRequestError(
  payload: Record<string, unknown> | null,
  fallback: string,
): Error {
  return new Error(
    typeof payload?.error === "string" && payload.error.trim()
      ? payload.error
      : fallback,
  );
}

function reviewPath(token: string, suffix = ""): string {
  return `/api/review/${encodeURIComponent(token)}${suffix}`;
}

async function performAdmission(
  token: string,
  { signal }: ReviewFetchOptions = {},
): Promise<Record<string, unknown>> {
  const response = await fetch(reviewPath(token, "/admission"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
    credentials: "same-origin",
    cache: "no-store",
    referrerPolicy: "no-referrer",
    signal,
  });
  const payload = await readPayload(response);
  if (!response.ok) {
    throw reviewRequestError(payload, "Invalid or expired review link.");
  }
  if (
    typeof payload?.admission_id !== "string" ||
    typeof payload.expires_at !== "string" ||
    typeof payload.grant_expires_at !== "string"
  ) {
    throw new Error("Review session could not be established.");
  }
  return payload;
}

export function renewPublicReviewAdmission(
  token: string,
  options: ReviewFetchOptions = {},
): Promise<Record<string, unknown>> {
  const existing = admissionFlights.get(token);
  if (existing) return existing;

  const flight = performAdmission(token, options).finally(() => {
    if (admissionFlights.get(token) === flight) {
      admissionFlights.delete(token);
    }
  });
  admissionFlights.set(token, flight);
  return flight;
}

export async function loadAdmittedPublicReview(
  token: string,
  options: ReviewFetchOptions = {},
): Promise<Record<string, unknown>> {
  await renewPublicReviewAdmission(token, options);
  const response = await fetch(reviewPath(token), {
    credentials: "same-origin",
    cache: "no-store",
    referrerPolicy: "no-referrer",
    signal: options.signal,
  });
  const payload = await readPayload(response);
  if (!response.ok) {
    throw reviewRequestError(payload, "Invalid or expired review link.");
  }
  if (!payload) throw new Error("Review response is unavailable.");
  return payload;
}
