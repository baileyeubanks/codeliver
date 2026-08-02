import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { registerHooks } from "node:module";
import test, { after } from "node:test";

import {
  PROPOSAL_HANDOFF_ACTIVATION_SCHEMA_VERSION,
  PROPOSAL_HANDOFF_SCHEMA_VERSION,
  PROPOSAL_PRODUCTION_AUTHORIZATION_SCHEMA_VERSION,
  proposalHandoffAttestationMessage,
  proposalHandoffCanonicalPayload,
  proposalHandoffPayloadHash,
  proposalHandoffReceiverProof,
  type ProposalHandoffPayload,
  type ProposalHandoffRequest,
} from "../lib/integrations/proposal-handoff.ts";

interface Binding {
  source_tenant_id: string;
  signing_key_id: string;
  public_key_pem: string;
}

interface BindingResult {
  data: Binding | null;
  error: { message: string; code?: string } | null;
}

interface RpcResult {
  data: unknown;
  error: { message: string; code?: string } | null;
}

interface QueryHarness {
  select(...args: unknown[]): QueryHarness;
  eq(...args: unknown[]): QueryHarness;
  maybeSingle(): Promise<BindingResult>;
  insert(...args: unknown[]): QueryHarness;
  update(...args: unknown[]): QueryHarness;
  upsert(...args: unknown[]): QueryHarness;
  delete(...args: unknown[]): QueryHarness;
}

interface DatabaseHarness {
  client: {
    from(table: string): QueryHarness;
    rpc(name: string, args: unknown): Promise<RpcResult>;
  };
  fromCalls: string[];
  rpcCalls: Array<{ name: string; args: unknown }>;
  writes: Array<
    | { kind: "table"; table: string; operation: string; args: unknown[] }
    | { kind: "rpc"; name: string; args: unknown }
  >;
}

interface RouteHarnessState {
  schema: string;
  supabase: DatabaseHarness["client"] | null;
  getSupabaseCalls: number;
}

type HarnessGlobal = typeof globalThis & {
  __ccoProposalHandoffRouteHarness?: RouteHarnessState;
};

const harnessGlobal = globalThis as HarnessGlobal;
const originalHarness = harnessGlobal.__ccoProposalHandoffRouteHarness;
const originalWriteFlag = process.env.PROPOSAL_HANDOFF_WRITES_ENABLED;
const originalReceiverSecret = process.env.PROPOSAL_HANDOFF_RECEIVER_HMAC_SECRET;
const receiverSecret = Buffer.alloc(32, 7).toString("base64url");

harnessGlobal.__ccoProposalHandoffRouteHarness = {
  schema: "co_production",
  supabase: null,
  getSupabaseCalls: 0,
};

const dataAuthorityMock = `data:text/javascript,${encodeURIComponent(`
  export function getSupabaseDataSchema() {
    return globalThis.__ccoProposalHandoffRouteHarness.schema;
  }
`)}`;
const supabaseMock = `data:text/javascript,${encodeURIComponent(`
  export function getSupabase() {
    const harness = globalThis.__ccoProposalHandoffRouteHarness;
    harness.getSupabaseCalls += 1;
    return harness.supabase;
  }
`)}`;
const contractUrl = new URL(
  "../lib/integrations/proposal-handoff.ts",
  import.meta.url,
).href;
const nextServerUrl = import.meta.resolve("next/server.js");

const moduleHooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") {
      return { url: nextServerUrl, shortCircuit: true };
    }
    if (specifier === "@/lib/data-authority") {
      return { url: dataAuthorityMock, shortCircuit: true };
    }
    if (specifier === "@/lib/supabase") {
      return { url: supabaseMock, shortCircuit: true };
    }
    if (specifier === "@/lib/integrations/proposal-handoff") {
      return { url: contractUrl, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const { POST } = await import(
  "../app/api/integrations/proposal-handoffs/route.ts"
);

after(() => {
  moduleHooks.deregister();
  if (originalHarness === undefined) {
    delete harnessGlobal.__ccoProposalHandoffRouteHarness;
  } else {
    harnessGlobal.__ccoProposalHandoffRouteHarness = originalHarness;
  }
  if (originalWriteFlag === undefined) {
    delete process.env.PROPOSAL_HANDOFF_WRITES_ENABLED;
  } else {
    process.env.PROPOSAL_HANDOFF_WRITES_ENABLED = originalWriteFlag;
  }
  if (originalReceiverSecret === undefined) {
    delete process.env.PROPOSAL_HANDOFF_RECEIVER_HMAC_SECRET;
  } else {
    process.env.PROPOSAL_HANDOFF_RECEIVER_HMAC_SECRET = originalReceiverSecret;
  }
});

const signingKeys = generateKeyPairSync("ed25519");
const alternateKeys = generateKeyPairSync("ed25519");
const publicKeyPem = signingKeys.publicKey.export({
  format: "pem",
  type: "spki",
}).toString();

const authorityIds = {
  inquiry: "10000000-0000-4000-8000-000000000001",
  account: "20000000-0000-4000-8000-000000000002",
  contact: "30000000-0000-4000-8000-000000000003",
  opportunity: "40000000-0000-4000-8000-000000000004",
  brief: "50000000-0000-4000-8000-000000000005",
  proposalRequestReceipt: "60000000-0000-4000-8000-000000000006",
  authorizationReceipt: "70000000-0000-4000-8000-000000000007",
} as const;
const briefContentHash = `sha256:${"4".repeat(64)}` as const;

function validPayload(intent: ProposalHandoffPayload["intent"]): ProposalHandoffPayload {
  const payload: ProposalHandoffPayload = {
    intent,
    sourceTenantId: "content-co-op",
    idempotencyKey: "cco:proposal-package-schneider-first-layer:v1:b",
    packageId: "proposal-package-schneider-first-layer",
    packageVersion: 1,
    proposalVersionId: "proposal-version-schneider-first-layer-r1",
    proposalContentHash: `sha256:${"1".repeat(64)}`,
    quoteVersionId: "quote-version-schneider-0000189-b-r1",
    quoteContentHash: `sha256:${"2".repeat(64)}`,
    displayNumber: "0000189-B",
    approvalReceiptIds: ["approval-schneider-b-r1"],
    decisionReceipt: {
      id: "decision-schneider-b-r1",
      decision: "accepted",
      actorId: "client-contact-madeline",
      decidedAt: "2026-07-15T16:02:00Z",
      consentTextVersion: "cco-client-acceptance@1",
      viewReceiptId: "view-schneider-b-r1",
      requestId: "decision-request-schneider-b-r1",
    },
    clientId: intent === "activate" ? authorityIds.account : "client-schneider-electric",
    opportunityId:
      intent === "activate" ? authorityIds.opportunity : "opportunity-first-layer",
    briefId: intent === "activate" ? authorityIds.brief : "brief-first-layer",
    project: {
      title: "The First Layer",
      description: "Production project activated from 0000189-B.",
      productionWindow: {
        startDate: "2026-08-03",
        dueDate: "2026-09-18",
        constraints: ["Client site access requires advance approval"],
      },
    },
    scopeItemIds: ["b-development", "b-production", "b-editorial"],
    deliverables: [
      {
        id: "deliverable-hero-film",
        title: "The First Layer hero film",
        acceptanceCriteria: ["2.5 to 3.5 minute master"],
      },
    ],
    productionModules: ["Co-Script", "Co-Edit", "Co-Deliver"],
    artifactRefs: [
      {
        kind: "production_manifest",
        artifactId: "artifact-production-manifest-schneider-b-r1",
        sha256: "3".repeat(64),
        classification: "production_safe",
      },
    ],
    coCreditBudget: {
      credits: 25_000,
      policyVersion: "co-credit-production@1",
    },
  };

  if (intent === "activate") {
    payload.proposalRequestReceiptId = authorityIds.proposalRequestReceipt;
    payload.origin = {
      authority: "co-videopro-crm",
      inquiryId: authorityIds.inquiry,
      accountId: authorityIds.account,
      accountAuthorityVersion: 3,
      primaryContactId: authorityIds.contact,
      contactAuthorityVersion: 2,
      opportunityId: authorityIds.opportunity,
      opportunityAuthorityVersion: 7,
      briefRevisionId: authorityIds.brief,
      briefRevisionNumber: 4,
      briefContentHash,
    };
    payload.artifactRefs.push({
      kind: "brief",
      artifactId: authorityIds.brief,
      sha256: "4".repeat(64),
      classification: "production_safe",
    });
    payload.productionAuthorization = {
      schemaVersion: PROPOSAL_PRODUCTION_AUTHORIZATION_SCHEMA_VERSION,
      receiptId: authorityIds.authorizationReceipt,
      status: "authorized",
      policyVersion: "cco-production-activation@1",
      authorizedAt: "2026-07-16T14:05:00.000Z",
      subject: {
        proposalRequestReceiptId: authorityIds.proposalRequestReceipt,
        packageId: payload.packageId,
        packageVersion: payload.packageVersion,
        proposalVersionId: payload.proposalVersionId,
        proposalContentHash: payload.proposalContentHash,
        quoteVersionId: payload.quoteVersionId,
        quoteContentHash: payload.quoteContentHash,
        decisionReceiptId: payload.decisionReceipt.id,
        opportunityId: authorityIds.opportunity,
        readyBriefId: authorityIds.brief,
        readyBriefContentHash: briefContentHash,
      },
      gates: [
        {
          gate: "acceptance",
          status: "satisfied",
          evidenceReceiptId: payload.decisionReceipt.id,
        },
        {
          gate: "contract",
          status: "satisfied",
          evidenceReceiptId: "contract-authorization-schneider-b-r1",
        },
        {
          gate: "invoice",
          status: "not_required",
          evidenceReceiptId: "invoice-waiver-schneider-b-r1",
        },
        {
          gate: "deposit",
          status: "not_required",
          evidenceReceiptId: "deposit-waiver-schneider-b-r1",
        },
        {
          gate: "payment",
          status: "not_required",
          evidenceReceiptId: "payment-waiver-schneider-b-r1",
        },
      ],
    };
  }

  return payload;
}

function signedPayloadRequest(
  payload: ProposalHandoffPayload,
  schemaVersion: ProposalHandoffRequest["schemaVersion"],
  privateKey = signingKeys.privateKey,
): ProposalHandoffRequest {
  const now = Date.now();
  const request: ProposalHandoffRequest = {
    schemaVersion,
    attestation: {
      keyId: "cco-proposal-ed25519-2026-01",
      issuedAt: new Date(now - 60_000).toISOString(),
      expiresAt: new Date(now + 9 * 60_000).toISOString(),
      nonce: "hKJ9BU9s5bZ0aNeRz9H7bg",
      payloadHash: proposalHandoffPayloadHash(payload),
      signature: "x".repeat(86),
    },
    payload,
  };
  request.attestation.signature = sign(
    null,
    Buffer.from(proposalHandoffAttestationMessage(request), "utf8"),
    privateKey,
  ).toString("base64url");
  return request;
}

function signedRequest(
  intent: ProposalHandoffPayload["intent"],
  privateKey = signingKeys.privateKey,
) {
  return signedPayloadRequest(
    validPayload(intent),
    intent === "activate"
      ? PROPOSAL_HANDOFF_ACTIVATION_SCHEMA_VERSION
      : PROPOSAL_HANDOFF_SCHEMA_VERSION,
    privateKey,
  );
}

function signedLegacyActivationRequest() {
  const payload = validPayload("validate");
  payload.intent = "activate";
  return signedPayloadRequest(payload, PROPOSAL_HANDOFF_SCHEMA_VERSION);
}

function createDatabaseHarness({
  binding = {
    source_tenant_id: "content-co-op",
    signing_key_id: "cco-proposal-ed25519-2026-01",
    public_key_pem: publicKeyPem,
  },
  bindingError = null,
  rpcResult = {
    data: {
      receipt_id: "receipt-schneider-b-r1",
      project_id: "project-schneider-first-layer",
      replayed: false,
    },
    error: null,
  },
}: {
  binding?: Binding | null;
  bindingError?: BindingResult["error"];
  rpcResult?: RpcResult;
} = {}): DatabaseHarness {
  const fromCalls: string[] = [];
  const rpcCalls: Array<{ name: string; args: unknown }> = [];
  const writes: DatabaseHarness["writes"] = [];
  let currentTable = "";
  const query: QueryHarness = {
    select() {
      return query;
    },
    eq() {
      return query;
    },
    async maybeSingle() {
      return { data: binding, error: bindingError };
    },
    insert(...args) {
      writes.push({ kind: "table", table: currentTable, operation: "insert", args });
      return query;
    },
    update(...args) {
      writes.push({ kind: "table", table: currentTable, operation: "update", args });
      return query;
    },
    upsert(...args) {
      writes.push({ kind: "table", table: currentTable, operation: "upsert", args });
      return query;
    },
    delete(...args) {
      writes.push({ kind: "table", table: currentTable, operation: "delete", args });
      return query;
    },
  };

  return {
    fromCalls,
    rpcCalls,
    writes,
    client: {
      from(table) {
        currentTable = table;
        fromCalls.push(table);
        return query;
      },
      async rpc(name, args) {
        const call = { name, args };
        rpcCalls.push(call);
        writes.push({ kind: "rpc", ...call });
        return rpcResult;
      },
    },
  };
}

async function postHandoff({
  request,
  database,
  writesEnabled,
}: {
  request: ProposalHandoffRequest;
  database: DatabaseHarness;
  writesEnabled: boolean;
}) {
  const routeHarness = harnessGlobal.__ccoProposalHandoffRouteHarness;
  assert.ok(routeHarness);
  routeHarness.schema = "co_production";
  routeHarness.supabase = database.client;
  routeHarness.getSupabaseCalls = 0;
  process.env.PROPOSAL_HANDOFF_WRITES_ENABLED = String(writesEnabled);
  process.env.PROPOSAL_HANDOFF_RECEIVER_HMAC_SECRET = receiverSecret;

  const response = await POST(
    new Request("http://localhost/api/integrations/proposal-handoffs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    }),
  );

  return { response, getSupabaseCalls: routeHarness.getSupabaseCalls };
}

function assertZeroDatabaseWrites(database: DatabaseHarness) {
  assert.deepEqual(database.writes, []);
  assert.deepEqual(database.rpcCalls, []);
}

test("invalid signatures perform zero database writes", async () => {
  const database = createDatabaseHarness();
  const { response } = await postHandoff({
    request: signedRequest("activate", alternateKeys.privateKey),
    database,
    writesEnabled: true,
  });

  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "invalid_attestation_signature");
  assert.deepEqual(database.fromCalls, ["proposal_integration_public_keys"]);
  assertZeroDatabaseWrites(database);
});

test("missing integration bindings perform zero database writes", async () => {
  const database = createDatabaseHarness({ binding: null });
  const { response } = await postHandoff({
    request: signedRequest("activate"),
    database,
    writesEnabled: true,
  });

  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "invalid_integration_binding");
  assertZeroDatabaseWrites(database);
});

test("validate intent remains a zero-write dry run when activation is enabled", async () => {
  const database = createDatabaseHarness();
  const request = signedRequest("validate");
  const { response } = await postHandoff({
    request,
    database,
    writesEnabled: true,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    mode: "dry_run",
    status: "validated",
    target: "Co-VideoPro",
    commercialAuthority: "CCO_OS",
    payloadHash: request.attestation.payloadHash,
    idempotencyKey: request.payload.idempotencyKey,
    productionModules: request.payload.productionModules,
    activationEnabled: true,
  });
  assertZeroDatabaseWrites(database);
});

test("legacy accepted-only activation stops before database access", async () => {
  const database = createDatabaseHarness();
  const { response, getSupabaseCalls } = await postHandoff({
    request: signedLegacyActivationRequest(),
    database,
    writesEnabled: true,
  });

  assert.equal(response.status, 422);
  assert.equal((await response.json()).code, "activation_schema_required");
  assert.equal(getSupabaseCalls, 0);
  assert.deepEqual(database.fromCalls, []);
  assertZeroDatabaseWrites(database);
});

test("missing or incomplete production authorization is terminal before database access", async () => {
  const missingDatabase = createDatabaseHarness();
  const missingAuthorization = signedRequest("activate");
  delete missingAuthorization.payload.productionAuthorization;
  const missing = await postHandoff({
    request: missingAuthorization,
    database: missingDatabase,
    writesEnabled: true,
  });

  assert.equal(missing.response.status, 422);
  assert.equal((await missing.response.json()).code, "production_authorization_required");
  assert.equal(missing.getSupabaseCalls, 0);
  assert.deepEqual(missingDatabase.fromCalls, []);
  assertZeroDatabaseWrites(missingDatabase);

  const incompleteDatabase = createDatabaseHarness();
  const incompleteAuthorization = signedRequest("activate");
  const contractGate = incompleteAuthorization.payload.productionAuthorization?.gates.find(
    (gate) => gate.gate === "contract",
  ) as { status: string };
  contractGate.status = "pending";
  const incomplete = await postHandoff({
    request: incompleteAuthorization,
    database: incompleteDatabase,
    writesEnabled: true,
  });

  assert.equal(incomplete.response.status, 409);
  assert.equal(
    (await incomplete.response.json()).code,
    "production_authorization_gate_not_complete",
  );
  assert.equal(incomplete.getSupabaseCalls, 0);
  assert.deepEqual(incompleteDatabase.fromCalls, []);
  assertZeroDatabaseWrites(incompleteDatabase);
});

test("disabled activation performs zero database writes", async () => {
  const database = createDatabaseHarness();
  const { response } = await postHandoff({
    request: signedRequest("activate"),
    database,
    writesEnabled: false,
  });

  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "proposal_activation_disabled");
  assertZeroDatabaseWrites(database);
});

test("missing receiver proof authority performs zero database writes", async () => {
  const database = createDatabaseHarness();
  const request = signedRequest("activate");
  const routeHarness = harnessGlobal.__ccoProposalHandoffRouteHarness;
  assert.ok(routeHarness);
  routeHarness.schema = "co_production";
  routeHarness.supabase = database.client;
  delete process.env.PROPOSAL_HANDOFF_RECEIVER_HMAC_SECRET;
  process.env.PROPOSAL_HANDOFF_WRITES_ENABLED = "true";

  const response = await POST(
    new Request("http://localhost/api/integrations/proposal-handoffs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    }),
  );

  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "proposal_receiver_unavailable");
  assertZeroDatabaseWrites(database);
});

test("stale CRM proposal origins are terminal conflicts instead of retryable outages", async () => {
  const database = createDatabaseHarness({
    rpcResult: {
      data: null,
      error: { message: "stale_or_mismatched_preproject_origin" },
    },
  });
  const { response } = await postHandoff({
    request: signedRequest("activate"),
    database,
    writesEnabled: true,
  });

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: "The CRM source changed after this proposal was prepared",
    code: "stale_preproject_origin",
    retryable: false,
  });
});

test("stale production readiness is a terminal CRM conflict", async () => {
  const database = createDatabaseHarness({
    rpcResult: {
      data: null,
      error: { message: "stale_or_mismatched_activation_readiness" },
    },
  });
  const { response } = await postHandoff({
    request: signedRequest("activate"),
    database,
    writesEnabled: true,
  });

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: "The CRM source changed after this proposal was prepared",
    code: "stale_preproject_origin",
    retryable: false,
  });
});

test("database authorization binding conflicts are deterministic and non-retryable", async () => {
  for (const message of [
    "production_authorization_binding_conflict",
    "authorization_payload_binding_mismatch",
    "authorization_handoff_binding_mismatch",
    "proposal_activation_authorization_conflict",
  ]) {
    const database = createDatabaseHarness({
      rpcResult: { data: null, error: { message } },
    });
    const { response } = await postHandoff({
      request: signedRequest("activate"),
      database,
      writesEnabled: true,
    });

    assert.equal(response.status, 409, message);
    assert.deepEqual(await response.json(), {
      error: "Production authorization no longer matches this proposal",
      code: "production_authorization_conflict",
      retryable: false,
    });
  }
});

test("valid enabled activation invokes the service-only RPC exactly once", async () => {
  const database = createDatabaseHarness();
  const request = signedRequest("activate");
  const { response, getSupabaseCalls } = await postHandoff({
    request,
    database,
    writesEnabled: true,
  });

  assert.equal(response.status, 201);
  assert.equal(getSupabaseCalls, 1);
  assert.equal(database.rpcCalls.length, 1);
  const canonicalPayload = proposalHandoffCanonicalPayload(request.payload);
  assert.deepEqual(database.rpcCalls[0], {
    name: "activate_authorized_proposal_handoff",
    args: {
      p_source_tenant_id: request.payload.sourceTenantId,
      p_signing_key_id: request.attestation.keyId,
      p_schema_version: request.schemaVersion,
      p_attestation: request.attestation,
      p_canonical_payload: canonicalPayload,
      p_receiver_proof: proposalHandoffReceiverProof({
        canonicalPayload,
        secret: receiverSecret,
      }),
    },
  });
  assert.deepEqual(database.writes, [
    { kind: "rpc", ...database.rpcCalls[0] },
  ]);
});
