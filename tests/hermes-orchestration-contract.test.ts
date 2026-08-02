import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";

import {
  HERMES_ORCHESTRATION_MAX_BYTES,
  HERMES_ORCHESTRATION_SCHEMA_VERSION,
  HermesOrchestrationValidationError,
  hermesOrchestrationAttestationMessage,
  hermesOrchestrationCanonicalPayload,
  hermesOrchestrationPayloadHash,
  InMemoryHermesNonceRegistry,
  parseHermesOrchestrationRequest,
  type HermesOrchestrationPayload,
  type HermesOrchestrationRequest,
  verifyHermesOrchestrationAttestation,
} from "../lib/integrations/hermes-orchestration.ts";

const signingKeys = generateKeyPairSync("ed25519");
const alternateKeys = generateKeyPairSync("ed25519");
const publicKeyPem = signingKeys.publicKey.export({
  format: "pem",
  type: "spki",
}).toString();

function validPayload(): HermesOrchestrationPayload {
  return {
    orchestrationMode: "proposal_only",
    communicationClass: "notification",
    tenantId: "11111111-2222-4333-8444-555555555555",
    sourceRecord: {
      kind: "review",
      id: "review-first-layer-r2",
    },
    eventType: "review_requested",
    template: {
      id: "review-requested-customer",
      revision: 3,
    },
    recipientContactIds: ["contact-customer-madeline"],
    candidateChannels: ["in_app", "email", "sms"],
    purpose: "transactional",
    requestedSchedule: {
      notBefore: "2026-07-15T17:01:00.000Z",
      expiresAt: "2026-07-16T17:01:00.000Z",
    },
    idempotencyKey: "hermes:review-first-layer-r2:requested:r3",
    correlationId: "correlation:first-layer:review-r2",
    humanApprovalRequired: true,
    audience: "customer",
  };
}

function commandPayload(): HermesOrchestrationPayload {
  return {
    ...validPayload(),
    communicationClass: "private_operator_imessage_command_response",
    sourceRecord: {
      kind: "operator_command",
      id: "operator-command-status-0189",
    },
    eventType: "operator_command_response",
    template: {
      id: "operator-command-status-response",
      revision: 1,
    },
    recipientContactIds: ["contact-operator-bailey"],
    candidateChannels: ["imessage"],
    purpose: "operational",
    idempotencyKey: "hermes:operator-command-status-0189:response:r1",
    correlationId: "correlation:operator-command-status-0189",
    audience: "operator",
  };
}

function signedRequest({
  payload = validPayload(),
  issuedAt = "2026-07-15T17:00:00.000Z",
  expiresAt = "2026-07-15T17:05:00.000Z",
  nonce = "EjRWeJCrze8SNFZ4mrze8Q",
  privateKey = signingKeys.privateKey,
}: {
  payload?: HermesOrchestrationPayload;
  issuedAt?: string;
  expiresAt?: string;
  nonce?: string;
  privateKey?: typeof signingKeys.privateKey;
} = {}): HermesOrchestrationRequest {
  const unsigned: HermesOrchestrationRequest = {
    schemaVersion: HERMES_ORCHESTRATION_SCHEMA_VERSION,
    attestation: {
      algorithm: "Ed25519",
      keyId: "cco-hermes-ed25519-2026-01",
      issuedAt,
      expiresAt,
      nonce,
      payloadHash: hermesOrchestrationPayloadHash(payload),
      signature: Buffer.alloc(64).toString("base64url"),
    },
    payload,
  };
  const signature = sign(
    null,
    Buffer.from(hermesOrchestrationAttestationMessage(unsigned), "utf8"),
    privateKey,
  ).toString("base64url");
  return {
    ...unsigned,
    attestation: { ...unsigned.attestation, signature },
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function expectCode(code: string) {
  return (error: unknown) =>
    error instanceof HermesOrchestrationValidationError && error.code === code;
}

test("valid proposals have a canonical signed roundtrip", () => {
  const wireRequest = clone(signedRequest());
  const parsed = parseHermesOrchestrationRequest(wireRequest);
  const canonical = hermesOrchestrationCanonicalPayload(parsed.payload);
  const roundtrip = JSON.parse(canonical) as HermesOrchestrationPayload;

  assert.deepEqual(roundtrip, parsed.payload);
  assert.equal(
    hermesOrchestrationPayloadHash(roundtrip),
    parsed.attestation.payloadHash,
  );
  assert.ok(Object.isFrozen(parsed));
  assert.ok(Object.isFrozen(parsed.payload));

  const verified = verifyHermesOrchestrationAttestation({
    request: wireRequest,
    publicKey: publicKeyPem,
    nonceRegistry: new InMemoryHermesNonceRegistry(),
    now: new Date("2026-07-15T17:02:00.000Z"),
  });
  assert.equal(verified.payloadHash, parsed.attestation.payloadHash);
  assert.equal(verified.request.payload.orchestrationMode, "proposal_only");
  assert.equal(verified.request.payload.humanApprovalRequired, true);
  assert.deepEqual(verified.request.payload.recipientContactIds, [
    "contact-customer-madeline",
  ]);
});

test("unknown, deeply nested, oversized, and forbidden fields fail closed", () => {
  const unknown = clone(signedRequest()) as unknown as Record<string, unknown>;
  (unknown.payload as Record<string, unknown>).provider = "twilio";
  assert.throws(() => parseHermesOrchestrationRequest(unknown), expectCode("unknown_field"));

  const deep = clone(signedRequest()) as unknown as Record<string, unknown>;
  let cursor = deep.payload as Record<string, unknown>;
  for (let index = 0; index < 8; index += 1) {
    cursor.extra = {};
    cursor = cursor.extra as Record<string, unknown>;
  }
  assert.throws(
    () => parseHermesOrchestrationRequest(deep),
    expectCode("payload_too_deep"),
  );

  const oversized = clone(signedRequest()) as unknown as Record<string, unknown>;
  (oversized.payload as Record<string, unknown>).padding = "x".repeat(
    HERMES_ORCHESTRATION_MAX_BYTES,
  );
  assert.throws(
    () => parseHermesOrchestrationRequest(oversized),
    expectCode("request_too_large"),
  );

  const forbiddenCases: Array<[string, string, unknown]> = [
    ["messageBody", "message_content_forbidden", "Render this message"],
    ["subject", "message_content_forbidden", "Review requested"],
    ["accessToken", "secret_field_forbidden", "secret"],
    ["paymentIntent", "commercial_field_forbidden", "pi_123"],
    ["toolCall", "tool_execution_field_forbidden", { name: "send_email" }],
    ["statePatch", "tool_execution_field_forbidden", { status: "sent" }],
  ];
  for (const [field, code, value] of forbiddenCases) {
    const request = clone(signedRequest()) as unknown as Record<string, unknown>;
    (request.payload as Record<string, unknown>)[field] = value;
    assert.throws(
      () => parseHermesOrchestrationRequest(request),
      expectCode(code),
      field,
    );
  }
});

test("raw recipient fields and email or phone recipients are never accepted", () => {
  for (const rawContact of ["client@example.com", "+13125550199", "312-555-0199"]) {
    const payload = clone(validPayload()) as unknown as Record<string, unknown>;
    payload.recipientContactIds = [rawContact];
    assert.throws(
      () =>
        parseHermesOrchestrationRequest(
          signedRequest({ payload: payload as unknown as HermesOrchestrationPayload }),
        ),
      expectCode("raw_recipient_forbidden"),
      rawContact,
    );
  }

  for (const field of ["email", "phone", "rawRecipient", "recipients"]) {
    const request = clone(signedRequest()) as unknown as Record<string, unknown>;
    (request.payload as Record<string, unknown>)[field] = "client@example.com";
    assert.throws(
      () => parseHermesOrchestrationRequest(request),
      expectCode("raw_recipient_forbidden"),
      field,
    );
  }
});

test("replay, freshness, payload binding, and Ed25519 signatures fail closed", () => {
  const replayRegistry = new InMemoryHermesNonceRegistry();
  const request = signedRequest();
  verifyHermesOrchestrationAttestation({
    request,
    publicKey: publicKeyPem,
    nonceRegistry: replayRegistry,
    now: new Date("2026-07-15T17:02:00.000Z"),
  });
  assert.throws(
    () =>
      verifyHermesOrchestrationAttestation({
        request,
        publicKey: publicKeyPem,
        nonceRegistry: replayRegistry,
        now: new Date("2026-07-15T17:02:01.000Z"),
      }),
    expectCode("attestation_replay"),
  );

  const expired = signedRequest();
  assert.throws(
    () =>
      verifyHermesOrchestrationAttestation({
        request: expired,
        publicKey: publicKeyPem,
        nonceRegistry: new InMemoryHermesNonceRegistry(),
        now: new Date("2026-07-15T17:05:00.000Z"),
      }),
    expectCode("invalid_attestation_window"),
  );

  const future = signedRequest({
    issuedAt: "2026-07-15T17:02:00.000Z",
    expiresAt: "2026-07-15T17:07:00.000Z",
  });
  assert.throws(
    () =>
      verifyHermesOrchestrationAttestation({
        request: future,
        publicKey: publicKeyPem,
        nonceRegistry: new InMemoryHermesNonceRegistry(),
        now: new Date("2026-07-15T17:00:00.000Z"),
      }),
    expectCode("invalid_attestation_window"),
  );

  const tampered = clone(signedRequest()) as unknown as Record<string, unknown>;
  (tampered.payload as Record<string, unknown>).correlationId =
    "correlation:tampered";
  assert.throws(
    () =>
      verifyHermesOrchestrationAttestation({
        request: tampered,
        publicKey: publicKeyPem,
        nonceRegistry: new InMemoryHermesNonceRegistry(),
        now: new Date("2026-07-15T17:02:00.000Z"),
      }),
    expectCode("attestation_payload_mismatch"),
  );

  assert.throws(
    () =>
      verifyHermesOrchestrationAttestation({
        request: signedRequest(),
        publicKey: alternateKeys.publicKey
          .export({ format: "pem", type: "spki" })
          .toString(),
        nonceRegistry: new InMemoryHermesNonceRegistry(),
        now: new Date("2026-07-15T17:02:00.000Z"),
      }),
    expectCode("invalid_attestation_signature"),
  );
});

test("private operator iMessage command responses stay separate from messaging", () => {
  const command = parseHermesOrchestrationRequest(
    signedRequest({ payload: commandPayload() }),
  );
  assert.equal(command.payload.audience, "operator");
  assert.deepEqual(command.payload.candidateChannels, ["imessage"]);
  assert.equal(
    command.payload.communicationClass,
    "private_operator_imessage_command_response",
  );

  const customerImessage = clone(validPayload()) as unknown as Record<
    string,
    unknown
  >;
  customerImessage.candidateChannels = ["imessage"];
  assert.throws(
    () =>
      parseHermesOrchestrationRequest(
        signedRequest({
          payload: customerImessage as unknown as HermesOrchestrationPayload,
        }),
      ),
    expectCode("command_channel_separation_violation"),
  );

  const customerCommand = clone(commandPayload()) as unknown as Record<
    string,
    unknown
  >;
  customerCommand.audience = "customer";
  assert.throws(
    () =>
      parseHermesOrchestrationRequest(
        signedRequest({
          payload: customerCommand as unknown as HermesOrchestrationPayload,
        }),
      ),
    expectCode("command_channel_separation_violation"),
  );

  const mixedCommandChannels = clone(commandPayload()) as unknown as Record<
    string,
    unknown
  >;
  mixedCommandChannels.candidateChannels = ["imessage", "sms"];
  assert.throws(
    () =>
      parseHermesOrchestrationRequest(
        signedRequest({
          payload: mixedCommandChannels as unknown as HermesOrchestrationPayload,
        }),
      ),
    expectCode("command_channel_separation_violation"),
  );

  const disguisedCommand = clone(validPayload()) as unknown as Record<
    string,
    unknown
  >;
  disguisedCommand.eventType = "operator_command_response";
  assert.throws(
    () =>
      parseHermesOrchestrationRequest(
        signedRequest({
          payload: disguisedCommand as unknown as HermesOrchestrationPayload,
        }),
      ),
    expectCode("command_channel_separation_violation"),
  );
});
