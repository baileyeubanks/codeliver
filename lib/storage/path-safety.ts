import { lstat, mkdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import { StorageError } from "./errors.ts";

export function resolvePathInsideRoot(root: string, relativePath: string): string {
  if (!isAbsolute(root) || !relativePath || isAbsolute(relativePath)) {
    throw new StorageError(
      "STORAGE_PATH_INVALID",
      "Storage paths require an absolute root and a relative child path"
    );
  }

  const canonicalRoot = resolve(root);
  const target = resolve(canonicalRoot, relativePath);
  const relation = relative(canonicalRoot, target);
  if (!relation || relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
    throw new StorageError("STORAGE_PATH_INVALID", "Storage path escapes its configured root");
  }
  return target;
}

export async function resolveExistingRoot(root: string): Promise<string> {
  if (!isAbsolute(root)) {
    throw new StorageError("STORAGE_PATH_INVALID", "Storage root must be absolute");
  }
  const canonical = await realpath(root);
  const status = await lstat(canonical);
  if (!status.isDirectory()) {
    throw new StorageError("STORAGE_NOT_READY", "Configured storage root is not a directory");
  }
  return canonical;
}

export async function ensureSafeDirectoryTree(
  root: string,
  relativeDirectory: string
): Promise<string> {
  const target = resolvePathInsideRoot(root, relativeDirectory);
  const relation = relative(root, target);
  let current = root;

  for (const segment of relation.split(sep)) {
    current = join(current, segment);
    try {
      const status = await lstat(current);
      if (status.isSymbolicLink() || !status.isDirectory()) {
        throw new StorageError(
          "STORAGE_PATH_INVALID",
          "Storage directory contains a symlink or non-directory segment"
        );
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      try {
        await mkdir(current, { mode: 0o700 });
      } catch (mkdirError) {
        if ((mkdirError as NodeJS.ErrnoException).code !== "EEXIST") {
          throw mkdirError;
        }
      }
      const created = await lstat(current);
      if (created.isSymbolicLink() || !created.isDirectory()) {
        throw new StorageError("STORAGE_PATH_INVALID", "Storage directory creation was unsafe");
      }
    }
  }
  return target;
}

export async function assertSafeRegularFile(path: string): Promise<void> {
  const status = await lstat(path);
  if (status.isSymbolicLink() || !status.isFile()) {
    throw new StorageError("STORAGE_PATH_INVALID", "Storage object is not a regular file");
  }
}
