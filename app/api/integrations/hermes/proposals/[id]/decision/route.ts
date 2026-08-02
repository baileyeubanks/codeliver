import { NextResponse } from "next/server";
import { requireStaffWithClient } from "@/lib/auth/staff-client";
import { getSupabaseDataSchema } from "@/lib/data-authority";
import { HERMES_CANDIDATE_CHANNELS } from "@/lib/integrations/hermes-orchestration";

const MAX_DECISION_BYTES = 8 * 1024;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const REASON_CODE_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,119}$/;
const HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

type Decision = "approve" | "reject";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: HEADERS });
}

function parseBody(value: unknown): {
  decision: Decision;
  expectedPayloadHash: string;
  reasonCode: string;
  selectedChannels: string[];
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid_body");
  }
  const body = value as Record<string, unknown>;
  if (
    Object.keys(body).some(
      (key) =>
        !["decision", "expectedPayloadHash", "reasonCode", "selectedChannels"].includes(key),
    )
  ) {
    throw new Error("unknown_field");
  }
  if (body.decision !== "approve" && body.decision !== "reject") {
    throw new Error("invalid_decision");
  }
  if (
    typeof body.expectedPayloadHash !== "string" ||
    !HASH_PATTERN.test(body.expectedPayloadHash)
  ) {
    throw new Error("invalid_payload_hash");
  }
  if (typeof body.reasonCode !== "string" || !REASON_CODE_PATTERN.test(body.reasonCode)) {
    throw new Error("invalid_reason_code");
  }
  if (!Array.isArray(body.selectedChannels)) throw new Error("invalid_channels");
  const selectedChannels = body.selectedChannels.map((channel) => {
    if (
      typeof channel !== "string" ||
      !(HERMES_CANDIDATE_CHANNELS as readonly string[]).includes(channel)
    ) {
      throw new Error("invalid_channels");
    }
    return channel;
  });
  if (new Set(selectedChannels).size !== selectedChannels.length) {
    throw new Error("invalid_channels");
  }
  if (
    (body.decision === "approve" &&
      (selectedChannels.length < 1 || selectedChannels.length > 4)) ||
    (body.decision === "reject" && selectedChannels.length !== 0)
  ) {
    throw new Error("invalid_channels");
  }
  return {
    decision: body.decision,
    expectedPayloadHash: body.expectedPayloadHash,
    reasonCode: body.reasonCode,
    selectedChannels,
  };
}

function databaseError(error: { code?: string; message?: string } | null) {
  const message = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
  if (
    message.includes("hermes_decision_conflict") ||
    message.includes("hermes_payload_hash_conflict")
  ) {
    return json(
      { error: "This proposal changed or already has a decision", code: "HERMES_DECISION_CONFLICT" },
      409,
    );
  }
  if (message.includes("not_found")) {
    return json({ error: "Hermes proposal not found" }, 404);
  }
  if (message.includes("forbidden") || message.includes("permission")) {
    return json({ error: "Forbidden" }, 403);
  }
  if (message.includes("invalid_hermes")) {
    return json({ error: "Hermes decision is invalid" }, 400);
  }
  return json({ error: "Hermes decision authority is temporarily unavailable" }, 503);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, staff, supabase } = await requireStaffWithClient();
  if (!user) return json({ error: "Unauthorized" }, 401);
  if (!staff) return json({ error: "Forbidden" }, 403);
  if (getSupabaseDataSchema() !== "co_production") {
    return json({ error: "Hermes decision authority is temporarily unavailable" }, 503);
  }

  const proposalId = (await params).id.toLowerCase();
  if (!UUID_PATTERN.test(proposalId)) {
    return json({ error: "Hermes proposal not found" }, 404);
  }
  if (
    request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !==
    "application/json"
  ) {
    return json({ error: "Request must use application/json" }, 415);
  }
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_DECISION_BYTES) {
    return json({ error: "Hermes decision is too large" }, 413);
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_DECISION_BYTES) {
    return json({ error: "Hermes decision is too large" }, 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Request must be valid JSON" }, 400);
  }

  let decision;
  try {
    decision = parseBody(body);
  } catch {
    return json({ error: "Hermes decision is invalid" }, 400);
  }

  const result = await supabase.rpc("decide_hermes_orchestration_proposal", {
    p_proposal_id: proposalId,
    p_expected_payload_hash: decision.expectedPayloadHash,
    p_decision: decision.decision,
    p_reason_code: decision.reasonCode,
    p_selected_channels: decision.selectedChannels,
  });
  if (result.error) return databaseError(result.error);
  const receipt = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) {
    return json({ error: "Hermes decision returned no durable receipt" }, 503);
  }
  return json({ ...receipt, deliveryState: "not_dispatched" }, 201);
}
