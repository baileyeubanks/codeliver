import type { DecideAgentRunInput } from "@/lib/vault";
import { getLocalControlPlane } from "@/lib/vault/local-control-plane";
import {
  jsonError,
  localVaultActor,
  noStoreJson,
  readJsonObject,
  scopeFromInput,
  stringField,
} from "@/lib/vault/http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const body = await readJsonObject(request);
    const scope = scopeFromInput(body);
    const { id } = await params;
    const { harness } = await getLocalControlPlane(scope);
    const run = await harness.decide({
      scope,
      runId: id,
      actor: localVaultActor(request),
      decision: stringField(body, "decision") as DecideAgentRunInput["decision"],
      reason: stringField(body, "reason"),
      idempotencyKey: stringField(body, "idempotency_key", "idempotencyKey"),
    });
    return noStoreJson({ mode: "local_demo", run });
  } catch (error) {
    return jsonError(error);
  }
}
