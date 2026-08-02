import { getLocalControlPlane } from "@/lib/vault/local-control-plane";
import {
  jsonError,
  localVaultActor,
  noStoreJson,
  scopeFromSearchParams,
} from "@/lib/vault/http";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const scope = scopeFromSearchParams(new URL(request.url).searchParams);
    const { id } = await params;
    const { harness } = await getLocalControlPlane(scope);
    const replay = await harness.verifyReplay(scope, id, localVaultActor(request));
    return noStoreJson({ mode: "local_demo", replay });
  } catch (error) {
    return jsonError(error);
  }
}
