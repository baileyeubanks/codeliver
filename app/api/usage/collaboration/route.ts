import { MeteringError, type MeteredOperation } from "@/lib/metering";
import { getLocalControlPlane } from "@/lib/vault/local-control-plane";
import {
  jsonError,
  localMeteringActor,
  noStoreJson,
  readJsonObject,
  scopeFromInput,
  stringField,
} from "@/lib/vault/http";

export async function POST(request: Request) {
  try {
    const body = await readJsonObject(request);
    const scope = scopeFromInput(body);
    const { metering } = await getLocalControlPlane(scope);
    const operation = stringField(body, "operation") as MeteredOperation;
    if (!metering.getOperation(operation)) {
      throw new MeteringError("operation_unknown", "Operation is not in the metering catalog");
    }
    const result = await metering.recordCollaboration({
      scope,
      operation,
      actor: localMeteringActor(request),
      idempotencyKey: stringField(body, "idempotency_key", "idempotencyKey"),
      details: (body.details ?? undefined) as never,
    });
    return noStoreJson({ mode: "local_demo", ...result }, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return jsonError(error);
  }
}
