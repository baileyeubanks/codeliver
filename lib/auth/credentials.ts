export const AUTH_PASSWORD_MIN_LENGTH = 8;

export function normalizeCredentialEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidCredentialEmail(value: string): boolean {
  const email = normalizeCredentialEmail(value);
  const at = email.indexOf("@");
  return (
    at > 0 &&
    at === email.lastIndexOf("@") &&
    at < email.length - 1 &&
    !/\s/.test(email)
  );
}

export function isValidCredentialPassword(value: string): boolean {
  return value.length >= AUTH_PASSWORD_MIN_LENGTH;
}
