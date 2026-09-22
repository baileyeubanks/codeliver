import { lstat, readdir, rename } from "node:fs/promises";
import { dirname } from "node:path";

import { syncDurableDirectory } from "./durable-files.ts";
import { StorageError } from "./errors.ts";

export async function publishImmutableDirectory(
  sourceDirectory: string,
  destinationDirectory: string,
): Promise<void> {
  if (dirname(sourceDirectory) !== dirname(destinationDirectory)) {
    throw new StorageError(
      "STORAGE_PATH_INVALID",
      "Immutable directory publication requires sibling paths",
    );
  }
  const sourceStatus = await lstat(sourceDirectory);
  if (sourceStatus.isSymbolicLink() || !sourceStatus.isDirectory()) {
    throw new StorageError(
      "STORAGE_PATH_INVALID",
      "Immutable publication source is not a safe directory",
    );
  }
  if ((await readdir(sourceDirectory)).length === 0) {
    throw new StorageError(
      "STORAGE_PATH_INVALID",
      "Immutable publication source directory is empty",
    );
  }

  try {
    await rename(sourceDirectory, destinationDirectory);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST" || code === "ENOTEMPTY") {
      throw new StorageError(
        "STORAGE_CONFLICT",
        "Versioned object directory already exists; overwrite refused",
      );
    }
    throw error;
  }
  await syncDurableDirectory(dirname(destinationDirectory));
}
