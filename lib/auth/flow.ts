import {
  buildProtectedReturnPath,
  resolveApprovedSurfaceHost,
} from "@/lib/auth/host-surface";

export type AuthEmailFlow = "signup" | "recovery";

const LOCAL_AUTH_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function resolveAuthRequestOrigin(request: Request): string | null {
  const requestUrl = new URL(request.url);
  const approvedHost = resolveApprovedSurfaceHost(requestUrl.host);
  if (approvedHost) return `https://${approvedHost}`;

  if (
    process.env.NODE_ENV !== "production" &&
    LOCAL_AUTH_HOSTS.has(requestUrl.hostname.toLowerCase()) &&
    (requestUrl.protocol === "http:" || requestUrl.protocol === "https:")
  ) {
    return requestUrl.origin;
  }

  return null;
}

export function resolveRequestedAuthTarget(value: unknown): string {
  return buildProtectedReturnPath(
    typeof value === "string" ? value : "/projects",
  );
}

export function buildEmailFlowRedirect(
  request: Request,
  flow: AuthEmailFlow,
  requestedTarget?: unknown,
): string | undefined {
  const origin = resolveAuthRequestOrigin(request);
  if (!origin) return undefined;

  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set("flow", flow);
  if (flow === "signup") {
    callback.searchParams.set("next", resolveRequestedAuthTarget(requestedTarget));
  }
  return callback.toString();
}

export function buildPendingAccessPath(requestedTarget?: unknown): string {
  const params = new URLSearchParams({
    next: resolveRequestedAuthTarget(requestedTarget),
  });
  return `/onboarding?${params.toString()}`;
}
