import type { StorageAdapter, StorageReadiness } from "./contracts";
// @ts-expect-error Node's native TypeScript test runner requires explicit extensions.
import { readStorageConfig, type StorageRuntimeConfig } from "./config.ts";
// @ts-expect-error Node's native TypeScript test runner requires explicit extensions.
import { FilesystemStorageAdapter } from "./filesystem-adapter.ts";
// @ts-expect-error Node's native TypeScript test runner requires explicit extensions.
import { ReadinessOnlyStorageAdapter } from "./remote-adapter.ts";

export interface StorageRuntime {
  config: StorageRuntimeConfig;
  adapter: StorageAdapter;
}

export function createStorageRuntime(
  env: NodeJS.ProcessEnv = process.env
): StorageRuntime {
  const config = readStorageConfig(env);
  let adapter: StorageAdapter;

  switch (config.provider) {
    case "local":
    case "ccnas":
      adapter = new FilesystemStorageAdapter(config.provider, config);
      break;
    case "google-drive":
      adapter = new ReadinessOnlyStorageAdapter(
        "google-drive",
        "Google Drive storage",
        config
      );
      break;
    case "object-store":
      adapter = new ReadinessOnlyStorageAdapter(
        "object-store",
        "Object storage",
        config
      );
      break;
    default:
      adapter = new ReadinessOnlyStorageAdapter(
        "unconfigured",
        "Unconfigured storage",
        config
      );
  }
  return { config, adapter };
}

export async function getStorageReadiness(
  env: NodeJS.ProcessEnv = process.env
): Promise<StorageReadiness> {
  return createStorageRuntime(env).adapter.diagnose();
}
