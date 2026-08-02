import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ingressRoute = readFileSync(
  resolve(
    repositoryRoot,
    "app/api/integrations/hermes/notification-proposals/route.ts",
  ),
  "utf8",
);
const decisionRoute = readFileSync(
  resolve(
    repositoryRoot,
    "app/api/integrations/hermes/proposals/[id]/decision/route.ts",
  ),
  "utf8",
);
const orchestrationContract = readFileSync(
  resolve(repositoryRoot, "lib/integrations/hermes-orchestration.ts"),
  "utf8",
);

function routeHandler(source: string): string {
  const start = source.indexOf("export async function POST");
  assert.notEqual(start, -1, "missing POST route handler");
  return source.slice(start);
}

function assertOrdered(source: string, markers: readonly string[]) {
  let previous = -1;
  for (const marker of markers) {
    const current = source.indexOf(marker);
    assert.notEqual(current, -1, `missing route marker: ${marker}`);
    assert.ok(current > previous, `${marker} is out of fail-closed order`);
    previous = current;
  }
}

const ingressHandler = routeHandler(ingressRoute);
const decisionHandler = routeHandler(decisionRoute);

test("Hermes ingress is production-admin-only before parsing or database access", () => {
  assert.match(
    ingressRoute,
    /function productionAdminHost\(request: Request\): boolean \{[\s\S]*process\.env\.NODE_ENV !== "production"[\s\S]*resolveHostSurface\(requestHost\) === "admin"/,
  );
  assert.match(ingressRoute, /request\.headers\.get\("host"\)/);
  assertOrdered(ingressHandler, [
    "if (!productionAdminHost(request))",
    'request.headers.get("content-type")',
    "await request.text()",
    "parseHermesOrchestrationRequest(body)",
    'supabase.rpc("get_active_hermes_signing_key"',
  ]);
  assert.match(ingressHandler, /code: "HOST_FORBIDDEN"[\s\S]*403/);
});

test("both routes enforce exact JSON media types and declared plus actual byte limits", () => {
  assert.match(
    orchestrationContract,
    /HERMES_ORCHESTRATION_MAX_BYTES = 24 \* 1024/,
  );
  assert.match(
    ingressRoute,
    /request\.headers\.get\("content-type"\)\?\.split\(";", 1\)\[0\]\.trim\(\)\.toLowerCase\(\) !==[\s\S]*"application\/json"/,
  );
  assert.match(
    ingressRoute,
    /declaredLength > HERMES_ORCHESTRATION_MAX_BYTES/,
  );
  assert.match(
    ingressRoute,
    /Buffer\.byteLength\(rawBody, "utf8"\) > HERMES_ORCHESTRATION_MAX_BYTES/,
  );
  assert.match(ingressRoute, /HERMES_PROPOSAL_TOO_LARGE/);

  assert.match(decisionRoute, /const MAX_DECISION_BYTES = 8 \* 1024/);
  assert.match(
    decisionRoute,
    /request\.headers\.get\("content-type"\)\?\.split\(";", 1\)\[0\]\.trim\(\)\.toLowerCase\(\) !==[\s\S]*"application\/json"/,
  );
  assert.match(decisionRoute, /declaredLength > MAX_DECISION_BYTES/);
  assert.match(
    decisionRoute,
    /Buffer\.byteLength\(raw, "utf8"\) > MAX_DECISION_BYTES/,
  );
  assert.match(ingressRoute, /\}, 415\)/);
  assert.match(ingressRoute, /\}, 413\)/);
  assert.match(decisionRoute, /\}, 415\)/);
  assert.match(decisionRoute, /\}, 413\)/);
});

test("Ed25519 verification succeeds before the durable proposal-record RPC", () => {
  assert.match(ingressRoute, /runtime = "nodejs"/);
  assertOrdered(ingressHandler, [
    "parseHermesOrchestrationRequest(body)",
    'supabase.rpc("get_active_hermes_signing_key"',
    "typeof key.public_key_pem",
    "verifyHermesOrchestrationAttestation({",
    'supabase.rpc("record_hermes_orchestration_proposal"',
  ]);
  assert.match(
    ingressHandler,
    /verifyHermesOrchestrationAttestation\(\{[\s\S]*request: parsed,[\s\S]*publicKey: key\.public_key_pem/,
  );
  assert.match(
    ingressHandler,
    /p_payload_hash: verified\.payloadHash,[\s\S]*p_payload: parsed\.payload/,
  );
  assert.doesNotMatch(
    ingressHandler.slice(
      ingressHandler.indexOf('supabase.rpc("record_hermes_orchestration_proposal"'),
    ),
    /p_payload:\s*body\b/,
  );
});

test("database RPC, not process memory, owns durable nonce replay claims", () => {
  assert.match(
    ingressRoute,
    /Durable replay protection is claimed atomically by the database RPC below/,
  );
  assert.match(
    ingressHandler,
    /p_nonce_hash: sha256\(parsed\.attestation\.nonce\)/,
  );
  assert.match(
    ingressHandler,
    /p_signature_hash: sha256\(parsed\.attestation\.signature\)/,
  );
  assert.match(
    ingressHandler,
    /p_attestation_issued_at: parsed\.attestation\.issuedAt/,
  );
  assert.match(
    ingressHandler,
    /p_attestation_expires_at: parsed\.attestation\.expiresAt/,
  );
  assert.match(
    ingressRoute,
    /message\.includes\("hermes_attestation_replay"\)[\s\S]*HERMES_PROPOSAL_CONFLICT[\s\S]*409/,
  );
  assert.match(ingressHandler, /replayed: receipt\.replayed === true|const replayed = receipt\.replayed === true/);
  assert.match(ingressHandler, /replayed \? 200 : 201/);
});

test("human decisions require staff identity before IDs, bodies, or writes are processed", () => {
  assertOrdered(decisionHandler, [
    "await requireStaffWithClient()",
    "if (!user)",
    "if (!staff)",
    'getSupabaseDataSchema() !== "co_production"',
    "(await params).id.toLowerCase()",
    'request.headers.get("content-type")',
    "await request.text()",
    "parseBody(body)",
    'supabase.rpc("decide_hermes_orchestration_proposal"',
  ]);
  assert.match(decisionHandler, /if \(!user\)[\s\S]*401/);
  assert.match(decisionHandler, /if \(!staff\)[\s\S]*403/);
  assert.match(decisionRoute, /requireStaffWithClient/);
  assert.doesNotMatch(decisionRoute, /getSupabaseServiceClient|getSupabase\(\)/);
});

test("decision payload is exact, hash-bound, channel-bounded, and mapped without drift", () => {
  assert.match(
    decisionRoute,
    /!\["decision", "expectedPayloadHash", "reasonCode", "selectedChannels"\]\.includes\(key\)/,
  );
  assert.match(decisionRoute, /const HASH_PATTERN = \/\^sha256:\[0-9a-f\]\{64\}\$\//);
  assert.match(
    decisionRoute,
    /body\.decision !== "approve" && body\.decision !== "reject"/,
  );
  assert.match(
    decisionRoute,
    /HERMES_CANDIDATE_CHANNELS[\s\S]*includes\(channel\)/,
  );
  assert.match(
    decisionRoute,
    /new Set\(selectedChannels\)\.size !== selectedChannels\.length/,
  );
  assert.match(
    decisionRoute,
    /body\.decision === "approve"[\s\S]*selectedChannels\.length < 1[\s\S]*body\.decision === "reject"[\s\S]*selectedChannels\.length !== 0/,
  );
  assert.match(
    decisionHandler,
    /p_proposal_id: proposalId,[\s\S]*p_expected_payload_hash: decision\.expectedPayloadHash,[\s\S]*p_decision: decision\.decision,[\s\S]*p_reason_code: decision\.reasonCode,[\s\S]*p_selected_channels: decision\.selectedChannels/,
  );
});

test("request data cannot introduce raw recipients, content, commerce, or tool execution", () => {
  assert.match(
    ingressHandler,
    /body = JSON\.parse\(rawBody\)[\s\S]*parseHermesOrchestrationRequest\(body\)/,
  );
  assert.match(ingressHandler, /p_payload: parsed\.payload/);
  assert.doesNotMatch(
    ingressHandler,
    /parsed\.payload\.(?:email|phone|address|recipient|subject|body|content|message|amount|currency|price|payment|invoice|tool|command|action|mutation)/i,
  );
  assert.doesNotMatch(
    decisionRoute,
    /\["(?:email|phone|address|recipient|subject|body|content|message|amount|currency|price|payment|invoice|tool|command|action|mutation)"/i,
  );
  assert.doesNotMatch(
    decisionHandler,
    /decision\.(?:email|phone|address|recipient|subject|body|content|message|amount|currency|price|payment|invoice|tool|command|action|mutation)/i,
  );
});

test("routes expose proposal and decision receipts only, with delivery held", () => {
  for (const source of [ingressRoute, decisionRoute]) {
    assert.doesNotMatch(
      source,
      /enqueue_notification_outbox|notification_outbox|dispatchNotification|sendEmail|sendSms|sendMessage|providerAdapter|fetch\(|child_process|exec\(|spawn\(|eval\(/i,
    );
    assert.match(source, /deliveryState: "not_dispatched"/);
    assert.match(source, /"X-Content-Type-Options": "nosniff"/);
  }
  assert.match(ingressRoute, /"Cache-Control": "no-store"/);
  assert.match(decisionRoute, /"Cache-Control": "private, no-store"/);
  assert.match(ingressHandler, /humanApprovalRequired: true/);
  assert.doesNotMatch(ingressHandler, /deliveryState: "(?:queued|sent|dispatched)"/);
  assert.doesNotMatch(decisionHandler, /deliveryState: "(?:queued|sent|dispatched)"/);
});
