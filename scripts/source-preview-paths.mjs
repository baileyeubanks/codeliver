import { realpathSync, statSync } from "node:fs";
import { relative, isAbsolute } from "node:path";

export function verifiedSourcePath(root, asset) {
  const resolvedRoot = realpathSync(root);
  const resolvedPath = realpathSync(asset.path);
  const child = relative(resolvedRoot, resolvedPath);
  if (!child || child === ".." || child.startsWith("../") || isAbsolute(child)) throw new Error(`Source outside archive: ${asset.id}`);
  const info = statSync(resolvedPath);
  if (!info.isFile() || info.size !== asset.bytes) throw new Error(`Source identity changed: ${asset.id}`);
  return resolvedPath;
}
