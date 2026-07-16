import type { CreateVaultRecordInput, VaultRecordFamily } from "@/lib/vault";
import { getLocalControlPlane } from "@/lib/vault/local-control-plane";
import {
  jsonError,
  localVaultActor,
  noStoreJson,
  readJsonObject,
  scopeFromInput,
  scopeFromSearchParams,
  stringField,
} from "@/lib/vault/http";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const scope = scopeFromSearchParams(params);
    const { vault } = await getLocalControlPlane(scope);
    const families = (params.get("families") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean) as VaultRecordFamily[];
    const records = await vault.listRecords(scope, localVaultActor(request), families);
    return noStoreJson({ mode: "local_demo", records });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJsonObject(request);
    const scope = scopeFromInput(body);
    const { vault } = await getLocalControlPlane(scope);
    const result = await vault.createRecord({
      ...(body as unknown as Omit<CreateVaultRecordInput, "scope" | "author" | "idempotencyKey">),
      scope,
      author: localVaultActor(request),
      idempotencyKey: stringField(body, "idempotency_key", "idempotencyKey"),
    });
    return noStoreJson({ mode: "local_demo", ...result }, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return jsonError(error);
  }
}
