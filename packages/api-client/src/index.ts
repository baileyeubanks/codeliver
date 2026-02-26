import type { ScriptBrief, TimecodedComment } from "@contentco-op/types";

async function request<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

export const api = {
  auth: {
    session: (baseUrl: string) => request<{ authenticated: boolean; email?: string }>(baseUrl, "/api/auth/session"),
    logout: (baseUrl: string) => request<{ success: boolean }>(baseUrl, "/api/auth/logout", { method: "POST" }),
    acceptInvite: (baseUrl: string, email: string, inviteToken: string) =>
      request<{ accepted: boolean }>(baseUrl, "/api/auth/invite/accept", {
        method: "POST",
        body: JSON.stringify({ email, invite_token: inviteToken })
      })
  },
  media: {
    queueHeroTranscode: (baseUrl: string) =>
      request<{ status: string; worker: string }>(baseUrl, "/api/media/hero/transcode", { method: "POST" }),
    queueThumbnailExtract: (
      baseUrl: string,
      payload: { source_video: string; asset_id: string; role_tag: string; frame_timecode?: string }
    ) =>
      request<{ status: string }>(baseUrl, "/api/media/thumbnail/extract", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    approveThumbnail: (
      baseUrl: string,
      payload: {
        asset_id: string;
        frame_timecode: string;
        role_tag: "context" | "trust" | "process" | "texture";
        image_path: string;
        approved_by: string;
      }
    ) =>
      request<{ status: string }>(baseUrl, "/api/media/thumbnail/approve", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    approvedFrames: (baseUrl: string) =>
      request<{ items: Array<Record<string, string>> }>(baseUrl, "/api/media/thumbnail/approved?surface=home")
  },
  coedit: {
    projects: (baseUrl: string) => request<{ items: Array<Record<string, string>> }>(baseUrl, "/api/coedit/projects"),
    asset: (baseUrl: string, id: string) => request<Record<string, unknown>>(baseUrl, `/api/coedit/assets/${id}`),
    uploadVersion: (baseUrl: string, id: string, payload: Record<string, unknown>) =>
      request<Record<string, unknown>>(baseUrl, `/api/coedit/assets/${id}/versions`, {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    addComment: (baseUrl: string, payload: Pick<TimecodedComment, "body"> & { asset_id: string; at: string }) =>
      request<Record<string, unknown>>(baseUrl, "/api/coedit/comments", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    patchComment: (baseUrl: string, id: string, payload: { state: "open" | "resolved" }) =>
      request<Record<string, unknown>>(baseUrl, `/api/coedit/comments/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      }),
    decideApproval: (
      baseUrl: string,
      gateId: string,
      payload: { decision: "approved" | "needs_change"; role: string; note?: string }
    ) =>
      request<Record<string, unknown>>(baseUrl, `/api/coedit/approvals/${gateId}/decision`, {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    auditLog: (baseUrl: string, id: string) =>
      request<{ items: Array<Record<string, string>> }>(baseUrl, `/api/coedit/assets/${id}/audit-log`)
  },
  coscript: {
    createWatchlist: (baseUrl: string, payload: { name: string; platform: "youtube" | "tiktok" }) =>
      request<Record<string, unknown>>(baseUrl, "/api/coscript/watchlists", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    syncWatchlist: (baseUrl: string, id: string) =>
      request<Record<string, unknown>>(baseUrl, `/api/coscript/watchlists/${id}/sync`, { method: "POST" }),
    outliers: (baseUrl: string) => request<{ items: Array<Record<string, unknown>> }>(baseUrl, "/api/coscript/outliers"),
    createBrief: (
      baseUrl: string,
      payload: Omit<ScriptBrief, "id"> & { script_type: string; key_points: string }
    ) =>
      request<Record<string, unknown>>(baseUrl, "/api/coscript/briefs", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    generate: (baseUrl: string, payload: { brief_id: string; source_outlier_id: string }) =>
      request<Record<string, unknown>>(baseUrl, "/api/coscript/scripts/generate", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    fix: (baseUrl: string, scriptId: string, payload: { fix_request: string }) =>
      request<Record<string, unknown>>(baseUrl, `/api/coscript/scripts/${scriptId}/fix`, {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    history: (baseUrl: string, scriptId: string) =>
      request<{ items: Array<Record<string, unknown>> }>(baseUrl, `/api/coscript/scripts/${scriptId}/history`),
    saveVault: (baseUrl: string, payload: { script_id: string }) =>
      request<Record<string, unknown>>(baseUrl, "/api/coscript/vault/save", {
        method: "POST",
        body: JSON.stringify(payload)
      })
  }
};

