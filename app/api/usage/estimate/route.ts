import { MeteringError, type MeteredOperation, type NativeUsage } from "@/lib/metering";
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

export async function POST(request: Request) {
  try {
    const body = await readJsonObject(request);
    const scope = scopeFromInput(body);
    const { metering } = await getLocalControlPlane(scope);
    const operation = stringField(body, "operation") as MeteredOperation;
    if (!metering.getOperation(operation)) {
      throw new MeteringError("operation_unknown", "Operation is not in the metering catalog");
    }
    const quote = await metering.estimate({
      scope,
      operation,
      nativeUsage: objectField(body, "native_usage", "nativeUsage") as NativeUsage,
      requestedBy: localMeteringActor(request),
      idempotencyKey: stringField(body, "idempotency_key", "idempotencyKey"),
    });
    return noStoreJson({ mode: "local_demo", quote }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
