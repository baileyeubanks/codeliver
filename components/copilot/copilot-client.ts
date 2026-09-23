export interface CopilotHistoryItem {
  role: "user" | "assistant";
  content: string;
}

export interface CopilotAnswer {
  answer: string;
  model: string;
  sources: Array<{ id: string; type: "project" | "asset" | "comment"; label: string }>;
  read_only: true;
}

/* Internal tooling: never on auth pages or public client review surfaces. */
const EXCLUDED_PATHS = new Set(["/login", "/signup"]);
const EXCLUDED_PREFIXES = ["/review"];

/**
 * Pure mount gate for the Copilot. The internal review stage is a query
 * state (`?view=review`) — the film-first stage never carries the panel
 * (VA-022). Kept synchronous and hook-free for node tests.
 */
export function copilotAllowedOnPath(pathname: string, search?: string): boolean {
  if (EXCLUDED_PATHS.has(pathname)) return false;
  if (
    EXCLUDED_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  ) {
    return false;
  }
  if (search && new URLSearchParams(search).get("view") === "review") return false;
  return true;
}

export function copilotProjectFromPath(pathname: string): string | null {
  const match = /^\/projects\/([^/]+)(?:\/|$)/.exec(pathname);
  if (!match || ["new", "archive", "trash"].includes(match[1])) return null;
  try {
    const id = decodeURIComponent(match[1]);
    return /^[a-zA-Z0-9_-]+$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function copilotHistory(messages: Array<{ role: "user" | "copilot"; text: string }>): CopilotHistoryItem[] {
  return messages.slice(-8).map((message) => ({
    role: message.role === "copilot" ? "assistant" : "user",
    content: message.text.slice(0, 2000),
  }));
}

const ERROR_COPY: Record<string, string> = {
  UNAUTHENTICATED: "Sign in again to use Copilot.",
  FORBIDDEN: "You no longer have access to this project.",
  INVALID_REQUEST: "Keep your question under 4,000 characters and try again.",
  NOT_CONFIGURED: "Copilot is not connected yet. An administrator needs to configure its API connection.",
  RATE_LIMITED: "Copilot is busy. Wait a moment and try again.",
  PROVIDER_UNAVAILABLE: "Copilot could not answer just now. Your question is saved; try again.",
};

function isAnswer(value: unknown): value is CopilotAnswer {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<CopilotAnswer>;
  return typeof result.answer === "string" && result.answer.trim().length > 0 &&
    typeof result.model === "string" && result.model.trim().length > 0 &&
    result.read_only === true && Array.isArray(result.sources) && result.sources.every((source) =>
      source && typeof source.id === "string" && typeof source.label === "string" &&
      ["project", "asset", "comment"].includes(source.type));
}

export async function requestCopilotReply(
  projectId: string,
  prompt: string,
  history: CopilotHistoryItem[],
  signal: AbortSignal,
  transport: typeof fetch = fetch,
): Promise<CopilotAnswer> {
  if (!projectId || !prompt.trim() || prompt.trim().length > 4000) {
    throw new Error(ERROR_COPY.INVALID_REQUEST);
  }
  const response = await transport("/api/ai/copilot", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id: projectId, prompt: prompt.trim(), history }),
    signal,
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const code = body && typeof body === "object" && "code" in body ? String(body.code) : "";
    throw new Error(ERROR_COPY[code] ?? ERROR_COPY.PROVIDER_UNAVAILABLE);
  }
  if (!isAnswer(body)) throw new Error(ERROR_COPY.PROVIDER_UNAVAILABLE);
  return body;
}
