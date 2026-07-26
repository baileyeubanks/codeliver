import type { AgentRunRequest } from "@/lib/vault";
import { getLocalControlPlane } from "@/lib/vault/local-control-plane";
import {
  jsonError,
  localVaultActor,
  noStoreJson,
  readJsonObject,
  scopeFromInput,
  scopeFromSearchParams,
  stringField,
} from "@/lib/vault/http";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const scope = scopeFromSearchParams(params);
    const { vaultRepository, harness } = await getLocalControlPlane(scope);
    const actor = localVaultActor(request);
    const runs = await Promise.all(
      vaultRepository.listAgentRuns(scope).map((run) => harness.getRun(scope, run.id, actor)),
    );
    return noStoreJson({ mode: "local_demo", runs });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJsonObject(request);
    const scope = scopeFromInput(body);
    const { harness } = await getLocalControlPlane(scope);
    const run = await harness.plan({
      ...(body as unknown as Omit<AgentRunRequest, "scope" | "actor" | "idempotencyKey">),
      scope,
      actor: localVaultActor(request),
      idempotencyKey: stringField(body, "idempotency_key", "idempotencyKey"),
    });
    return noStoreJson({ mode: "local_demo", run }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
