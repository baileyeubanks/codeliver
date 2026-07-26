import { getLocalControlPlane } from "@/lib/vault/local-control-plane";
import {
  jsonError,
  localMeteringActor,
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
    const { metering } = await getLocalControlPlane(scope);
    const result = await metering.release({
      scope,
      reservationId: id,
      reason: stringField(body, "reason"),
      actor: localMeteringActor(request),
      idempotencyKey: stringField(body, "idempotency_key", "idempotencyKey"),
    });
    return noStoreJson({ mode: "local_demo", ...result });
  } catch (error) {
    return jsonError(error);
  }
}
