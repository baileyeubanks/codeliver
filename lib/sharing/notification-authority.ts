export type ShareEmailAuthority = "not_requested" | "missing_recipient" | "authorized";

export function resolveShareEmailAuthority(
  sendNotification: unknown,
  reviewerEmail: string | null,
): ShareEmailAuthority {
  if (sendNotification !== true) return "not_requested";
  if (!reviewerEmail) return "missing_recipient";
  return "authorized";
}
