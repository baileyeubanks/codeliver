import { lstat, mkdir, realpath } from "node:fs/promises";
import {
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;
const WINDOWS_ABSOLUTE_PATH = /^(?:[A-Za-z]:[\\/]|\\\\)/;
const MAX_RELATIVE_PATH_LENGTH = 4096;
const MAX_PATH_SEGMENT_LENGTH = 255;
const MAX_UPLOAD_FILENAME_LENGTH = 180;

export type SafeMediaPathErrorCode =
  | "MEDIA_ROOT_UNCONFIGURED"
  | "MEDIA_ROOT_UNAVAILABLE"
  | "MEDIA_PATH_INVALID"
  | "MEDIA_PATH_NOT_FOUND"
  | "MEDIA_PATH_NOT_DIRECTORY"
  | "MEDIA_PATH_NOT_FILE"
  | "MEDIA_PATH_EXISTS";

export class SafeMediaPathError extends Error {
  readonly code: SafeMediaPathErrorCode;

  constructor(code: SafeMediaPathErrorCode) {
    super(code);
    this.name = "SafeMediaPathError";
    this.code = code;
  }
}

export interface ResolvedMediaPath {
  root: string;
  absolutePath: string;
  relativePath: string;
}

function errnoCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | undefined)?.code;
}

function isContainedPath(root: string, target: string): boolean {
  const relation = relative(root, target);
  return (
    relation === "" ||
    (relation !== ".." &&
      !relation.startsWith(`..${sep}`) &&
      !isAbsolute(relation))
  );
}

function assertContainedPath(root: string, target: string): void {
  if (!isContainedPath(root, target)) {
    throw new SafeMediaPathError("MEDIA_PATH_INVALID");
  }
}

export function normalizeMediaRelativePath(input: string): string {
  if (input === "") return "";
  if (
    input.length > MAX_RELATIVE_PATH_LENGTH ||
    isAbsolute(input) ||
    WINDOWS_ABSOLUTE_PATH.test(input) ||
    input.includes("\\") ||
    CONTROL_CHARACTERS.test(input)
  ) {
    CONTROL_CHARACTERS.lastIndex = 0;
    throw new SafeMediaPathError("MEDIA_PATH_INVALID");
  }
  CONTROL_CHARACTERS.lastIndex = 0;

  const segments = input.split("/");
  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        segment.length > MAX_PATH_SEGMENT_LENGTH
    )
  ) {
    throw new SafeMediaPathError("MEDIA_PATH_INVALID");
  }

  return segments.join("/");
}

export function normalizeMediaDirectoryName(input: string): string {
  const name = input.trim();
  if (
    !name ||
    name === "." ||
    name === ".." ||
    name.length > MAX_PATH_SEGMENT_LENGTH ||
    name.includes("/") ||
    name.includes("\\") ||
    CONTROL_CHARACTERS.test(name)
  ) {
    CONTROL_CHARACTERS.lastIndex = 0;
    throw new SafeMediaPathError("MEDIA_PATH_INVALID");
  }
  CONTROL_CHARACTERS.lastIndex = 0;
  return name;
}

export function sanitizeMediaFilename(input: string): string {
  const normalized = input
    .normalize("NFKC")
    .replace(CONTROL_CHARACTERS, "_")
    .replace(/\\/g, "/");
  const leaf = normalized.split("/").pop()?.trim() ?? "";
  const cleaned = leaf
    .replace(/[^A-Za-z0-9._ -]+/g, "_")
    .replace(/\s+/g, " ")
    .replace(/_+/g, "_")
    .replace(/^[. ]+|[. ]+$/g, "");

  if (!cleaned || cleaned === "." || cleaned === "..") {
    return "upload";
  }

  const candidateExtension = extname(cleaned);
  const extension = /^\.[A-Za-z0-9]{1,12}$/.test(candidateExtension)
    ? candidateExtension
    : "";
  const rawStem = extension
    ? cleaned.slice(0, -extension.length)
    : cleaned;
  const stem = rawStem.replace(/^[. ]+|[. ]+$/g, "") || "upload";
  const maxStemLength = MAX_UPLOAD_FILENAME_LENGTH - extension.length;
  const boundedStem = stem
    .slice(0, maxStemLength)
    .replace(/[. ]+$/g, "") || "upload";

  return `${boundedStem}${extension}`;
}

export async function requireCanonicalMediaRoot(
  configuredRoot = process.env.NAS_MEDIA_ROOT
): Promise<string> {
  const value = configuredRoot?.trim();
  if (!value || !isAbsolute(value)) {
    throw new SafeMediaPathError("MEDIA_ROOT_UNCONFIGURED");
  }

  try {
    const requestedRoot = resolve(/* turbopackIgnore: true */ value);
    const canonicalRoot = await realpath(
      /* turbopackIgnore: true */ requestedRoot
    );
    const status = await lstat(/* turbopackIgnore: true */ canonicalRoot);
    if (!status.isDirectory()) {
      throw new SafeMediaPathError("MEDIA_ROOT_UNAVAILABLE");
    }
    return canonicalRoot;
  } catch (error) {
    if (error instanceof SafeMediaPathError) throw error;
    throw new SafeMediaPathError("MEDIA_ROOT_UNAVAILABLE");
  }
}

async function checkedStatus(path: string) {
  try {
    return await lstat(/* turbopackIgnore: true */ path);
  } catch (error) {
    if (errnoCode(error) === "ENOENT") {
      throw new SafeMediaPathError("MEDIA_PATH_NOT_FOUND");
    }
    throw new SafeMediaPathError("MEDIA_PATH_INVALID");
  }
}

export async function resolveExistingMediaPath(
  input: string,
  expected: "directory" | "file",
  configuredRoot = process.env.NAS_MEDIA_ROOT
): Promise<ResolvedMediaPath> {
  const root = await requireCanonicalMediaRoot(configuredRoot);
  const relativePath = normalizeMediaRelativePath(input);
  let current = root;

  for (const segment of relativePath ? relativePath.split("/") : []) {
    const candidate = join(/* turbopackIgnore: true */ current, segment);
    const status = await checkedStatus(candidate);
    if (status.isSymbolicLink()) {
      throw new SafeMediaPathError("MEDIA_PATH_INVALID");
    }

    try {
      current = await realpath(/* turbopackIgnore: true */ candidate);
    } catch {
      throw new SafeMediaPathError("MEDIA_PATH_INVALID");
    }
    assertContainedPath(root, current);
  }

  const status = await checkedStatus(current);
  if (expected === "directory" && !status.isDirectory()) {
    throw new SafeMediaPathError("MEDIA_PATH_NOT_DIRECTORY");
  }
  if (expected === "file" && !status.isFile()) {
    throw new SafeMediaPathError("MEDIA_PATH_NOT_FILE");
  }

  return { root, absolutePath: current, relativePath };
}

export async function ensureMediaDirectory(
  input: string,
  configuredRoot = process.env.NAS_MEDIA_ROOT
): Promise<ResolvedMediaPath> {
  const root = await requireCanonicalMediaRoot(configuredRoot);
  const relativePath = normalizeMediaRelativePath(input);
  let current = root;

  for (const segment of relativePath ? relativePath.split("/") : []) {
    const candidate = join(/* turbopackIgnore: true */ current, segment);
    let status;

    try {
      status = await lstat(/* turbopackIgnore: true */ candidate);
    } catch (error) {
      if (errnoCode(error) !== "ENOENT") {
        throw new SafeMediaPathError("MEDIA_PATH_INVALID");
      }
      try {
        await mkdir(/* turbopackIgnore: true */ candidate, { mode: 0o750 });
      } catch (mkdirError) {
        if (errnoCode(mkdirError) !== "EEXIST") {
          throw new SafeMediaPathError("MEDIA_PATH_INVALID");
        }
      }
      status = await checkedStatus(candidate);
    }

    if (status.isSymbolicLink() || !status.isDirectory()) {
      throw new SafeMediaPathError("MEDIA_PATH_INVALID");
    }

    try {
      current = await realpath(/* turbopackIgnore: true */ candidate);
    } catch {
      throw new SafeMediaPathError("MEDIA_PATH_INVALID");
    }
    assertContainedPath(root, current);
  }

  return { root, absolutePath: current, relativePath };
}

export async function createMediaDirectory(
  parentInput: string,
  directoryName: string,
  configuredRoot = process.env.NAS_MEDIA_ROOT
): Promise<ResolvedMediaPath> {
  const parent = await resolveExistingMediaPath(
    parentInput,
    "directory",
    configuredRoot
  );
  const safeName = normalizeMediaDirectoryName(directoryName);
  const candidate = join(
    /* turbopackIgnore: true */ parent.absolutePath,
    safeName
  );
  assertContainedPath(parent.root, candidate);

  try {
    await mkdir(/* turbopackIgnore: true */ candidate, { mode: 0o750 });
  } catch (error) {
    if (errnoCode(error) === "EEXIST") {
      throw new SafeMediaPathError("MEDIA_PATH_EXISTS");
    }
    throw new SafeMediaPathError("MEDIA_PATH_INVALID");
  }

  const status = await checkedStatus(candidate);
  if (status.isSymbolicLink() || !status.isDirectory()) {
    throw new SafeMediaPathError("MEDIA_PATH_INVALID");
  }

  let absolutePath: string;
  try {
    absolutePath = await realpath(/* turbopackIgnore: true */ candidate);
  } catch {
    throw new SafeMediaPathError("MEDIA_PATH_INVALID");
  }
  assertContainedPath(parent.root, absolutePath);

  const relativePath = parent.relativePath
    ? `${parent.relativePath}/${safeName}`
    : safeName;
  return { root: parent.root, absolutePath, relativePath };
}
