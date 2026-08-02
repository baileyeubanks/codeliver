import type { AgentProposal } from "@/lib/vault";
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
    const run = await harness.recordOutput({
      scope,
      runId: id,
      actor: localVaultActor(request),
      proposal: body.proposal as AgentProposal,
      providerStartedAt: stringField(body, "provider_started_at", "providerStartedAt"),
      providerCompletedAt: stringField(body, "provider_completed_at", "providerCompletedAt"),
      providerResponseIdHash: stringField(
        body,
        "provider_response_id_hash",
        "providerResponseIdHash",
      ),
      idempotencyKey: stringField(body, "idempotency_key", "idempotencyKey"),
    });
    return noStoreJson({ mode: "local_demo", run });
  } catch (error) {
    return jsonError(error);
  }
}
