import { MeteringError, type MeteredOperation } from "@/lib/metering";
import {
  getLocalControlPlane,
} from "@/lib/vault/local-control-plane";
import {
  jsonError,
  noStoreJson,
  scopeFromSearchParams,
} from "@/lib/vault/http";

export async function GET(request: Request) {
  try {
    const scope = scopeFromSearchParams(new URL(request.url).searchParams);
    const { metering } = await getLocalControlPlane(scope);
    const operations = Object.values(metering.catalog.rates).map((rate) => ({
      operation: rate.operation as MeteredOperation,
      meterClass: rate.meterClass,
      displayName: rate.displayName,
      customerBoundary: rate.customerBoundary,
      rateVersion: metering.catalog.version,
    }));
    return noStoreJson({
      mode: "local_demo",
      paymentMutation: "none",
      rateCatalogVersion: metering.catalog.version,
      rateCatalogHash: metering.catalog.integrityHash,
      commercialPricing: metering.pricing,
      operations,
    });
  } catch (error) {
    return jsonError(error);
  }
}
