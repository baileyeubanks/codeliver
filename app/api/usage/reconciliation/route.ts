import { getLocalControlPlane } from "@/lib/vault/local-control-plane";
import {
  jsonError,
  localMeteringActor,
  noStoreJson,
  readJsonObject,
  scopeFromInput,
} from "@/lib/vault/http";

export async function POST(request: Request) {
  try {
    const body = await readJsonObject(request);
    const scope = scopeFromInput(body);
    const { metering } = await getLocalControlPlane(scope);
    const report = await metering.reconcile(scope, localMeteringActor(request));
    return noStoreJson({ mode: "local_demo", report });
  } catch (error) {
    return jsonError(error);
  }
}
