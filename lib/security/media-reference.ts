const CONTROL_OR_BACKSLASH = /[\\\u0000-\u001f\u007f]/;

export function normalizeMediaReference(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim() || value.length > 2_048) {
    throw new Error(`${field} is invalid`);
  }
  const trimmed = value.trim();
  if (CONTROL_OR_BACKSLASH.test(trimmed)) {
    throw new Error(`${field} is invalid`);
  }
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return trimmed;
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`${field} is invalid`);
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error(`${field} must be an HTTPS or application URL`);
  }
  return url.toString();
}
