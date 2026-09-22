const REVIEW_RETURN = /^\/review\/[A-Za-z0-9_-]{16,256}$/;

/** Authentication returns here; the independent review admission still grants access. */
export function resolveReviewAuthReturn(value: unknown): string | null {
  return typeof value === "string" && !/[\r\n]/.test(value) && REVIEW_RETURN.test(value) ? value : null;
}

/** Enable only after the Google provider and callback allowlist are verified. */
export function googleReviewAuthEnabled(env: Record<string, string | undefined>): boolean {
  return env.CODELIVER_GOOGLE_AUTH_ENABLED === "true";
}
