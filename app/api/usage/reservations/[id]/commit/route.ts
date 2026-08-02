import type { ProviderCostAttribution, UsageOutcome, NativeUsage } from "@/lib/metering";
import { getLocalControlPlane } from "@/lib/vault/local-control-plane";
import {
  jsonError,
  localMeteringActor,
  noStoreJson,
  objectField,
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
    const { metering } = await getLocalControlPlane(scope);
    const providerCost = body.provider_cost ?? body.providerCost;
    const result = await metering.commit({
      scope,
      operationExecutionId: stringField(
        body,
        "operation_execution_id",
        "operationExecutionId",
      ),
      reservationId: id,
      outcome: stringField(body, "outcome") as UsageOutcome,
      actualUsage: objectField(body, "actual_usage", "actualUsage") as NativeUsage,
      providerCost:
        providerCost === null || providerCost === undefined
          ? null
          : (providerCost as ProviderCostAttribution),
      actor: localMeteringActor(request),
      idempotencyKey: stringField(body, "idempotency_key", "idempotencyKey"),
    });
    return noStoreJson({ mode: "local_demo", ...result });
  } catch (error) {
    return jsonError(error);
  }
}
