import { CatalogService } from "./service";
import { MemoryCatalogRepository } from "./memory-repository";
import type { CatalogReceipt } from "./contracts";

interface CatalogRuntime {
  repository: MemoryCatalogRepository;
  service: CatalogService;
}

declare global {
  var __codeliverCatalogRuntime: CatalogRuntime | undefined;
}

function writeReceipt(receipt: CatalogReceipt): void {
  console.info(JSON.stringify({
    event: "catalog.control_plane.receipt",
    ...receipt,
  }));
}

export function getCatalogRuntime(): CatalogRuntime {
  if (!globalThis.__codeliverCatalogRuntime) {
    const repository = new MemoryCatalogRepository();
    globalThis.__codeliverCatalogRuntime = {
      repository,
      service: new CatalogService({ repository, onReceipt: writeReceipt }),
    };
  }
  return globalThis.__codeliverCatalogRuntime;
}
