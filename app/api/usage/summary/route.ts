import { getLocalControlPlane } from "@/lib/vault/local-control-plane";
import { jsonError, noStoreJson, scopeFromSearchParams } from "@/lib/vault/http";

export async function GET(request: Request) {
  try {
    const scope = scopeFromSearchParams(new URL(request.url).searchParams);
    const { metering } = await getLocalControlPlane(scope);
    const summary = await metering.summary(scope);
    return noStoreJson({ mode: "local_demo", summary });
  } catch (error) {
    return jsonError(error);
  }
}
