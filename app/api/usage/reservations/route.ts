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
    const result = await metering.reserve({
      scope,
      quoteId: stringField(body, "quote_id", "quoteId"),
      actor: localMeteringActor(request),
      idempotencyKey: stringField(body, "idempotency_key", "idempotencyKey"),
    });
    return noStoreJson({ mode: "local_demo", ...result }, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return jsonError(error);
  }
}
