export type AuthHostKind = "admin" | "client" | "workspace";

export interface AuthHostContext {
  kind: AuthHostKind;
  label: string;
}

export const DEFAULT_AUTH_HOST_CONTEXT: AuthHostContext = {
  kind: "workspace",
  label: "Shared workspace",
};

const ADMIN_AUTH_HOST_CONTEXT: AuthHostContext = {
  kind: "admin",
  label: "Content Co-op team",
};

const CLIENT_AUTH_HOST_CONTEXT: AuthHostContext = {
  kind: "client",
  label: "Client collaboration",
};

const ADMIN_HOST = "admin.contentco-op.com";
const CLIENT_HOST = "client.contentco-op.com";

function normalizedHostname(value: string): string {
  return value.trim().toLowerCase();
}

// Host context changes presentation only. Server-side identity remains authoritative.
export function resolveAuthHostContext(hostname: string): AuthHostContext {
  const normalized = normalizedHostname(hostname);

  if (normalized === ADMIN_HOST) {
    return ADMIN_AUTH_HOST_CONTEXT;
  }

  if (normalized === CLIENT_HOST) {
    return CLIENT_AUTH_HOST_CONTEXT;
  }

  return DEFAULT_AUTH_HOST_CONTEXT;
}
