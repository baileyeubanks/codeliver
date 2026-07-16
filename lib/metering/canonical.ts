import { createHash } from "node:crypto";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

function normalize(value: unknown, seen: Set<object>): JsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Canonical values must contain only finite numbers");
    }
    return Object.is(value, -0) ? 0 : value;
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) throw new TypeError("Canonical values cannot contain cycles");
    seen.add(value);
    const normalized = value.map((item) => normalize(item, seen));
    seen.delete(value);
    return normalized;
  }

  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    if (seen.has(object)) throw new TypeError("Canonical values cannot contain cycles");
    seen.add(object);

    const normalized: Record<string, JsonValue> = {};
    for (const key of Object.keys(object).sort()) {
      const item = object[key];
      if (item !== undefined) normalized[key] = normalize(item, seen);
    }

    seen.delete(object);
    return normalized;
  }

  throw new TypeError(`Unsupported canonical value: ${typeof value}`);
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value, new Set()));
}

export function sha256(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function deterministicId(prefix: string, value: unknown): string {
  return `${prefix}_${sha256(value).slice(0, 24)}`;
}

export function compositeKey(...parts: readonly string[]): string {
  return canonicalJson(parts);
}

export function immutableClone<T>(value: T): T {
  return structuredClone(value);
}
