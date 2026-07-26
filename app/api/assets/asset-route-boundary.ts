/**
 * Last-resort boundary for authenticated asset handlers. Individual handlers
 * preserve expected 4xx outcomes; dependency and query throws must never
 * escape as framework/provider error text.
 */
export function withAssetRouteBoundary<TArgs extends unknown[]>(
  handler: (...args: TArgs) => Promise<Response>,
) {
  return async (...args: TArgs): Promise<Response> => {
    try {
      return await handler(...args);
    } catch {
      return Response.json(
        { error: "Service temporarily unavailable", code: "BACKEND_UNAVAILABLE" },
        {
          status: 503,
          headers: {
            "Cache-Control": "no-store, max-age=0",
            "X-Content-Type-Options": "nosniff",
          },
        },
      );
    }
  };
}
