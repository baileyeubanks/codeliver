import type { VaultRecordFamily, VaultRetrievalRequest } from "@/lib/vault";
import { getLocalControlPlane } from "@/lib/vault/local-control-plane";
import {
  arrayField,
  jsonError,
  localVaultActor,
  noStoreJson,
  readJsonObject,
  scopeFromInput,
  stringField,
} from "@/lib/vault/http";

export async function POST(request: Request) {
  try {
    const body = await readJsonObject(request);
    const scope = scopeFromInput(body);
    const { vault } = await getLocalControlPlane(scope);
    const result = await vault.retrieve({
      scope,
      actor: localVaultActor(request),
      query: stringField(body, "query"),
      families: arrayField<VaultRecordFamily>(body, "families"),
      sourceSetIds: arrayField<string>(body, "source_set_ids", "sourceSetIds"),
      purpose: stringField(body, "purpose") as VaultRetrievalRequest["purpose"],
      processingRegion: stringField(body, "processing_region", "processingRegion"),
      limit: Number(body.limit),
      idempotencyKey: stringField(body, "idempotency_key", "idempotencyKey"),
    });
    return noStoreJson({ mode: "local_demo", receipt: result }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
