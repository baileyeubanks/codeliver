/** Latch C3 guest film. Shown on the share sheet without minting a new link. */
export const KNOWN_GUEST_REVIEW_TOKEN =
  "0238db512c3960bc59c8ea7f0676bdbe806b15043bd61b52050a314b93a08af1";
export const KNOWN_GUEST_FILM_URL =
  "https://co-videopro.com/review/0238db512c3960bc59c8ea7f0676bdbe806b15043bd61b52050a314b93a08af1";

/** The latch guest film is comment-capable even when the stored row is view-only. */
export function guestFilmAllowsComments(
  token: string | null | undefined,
  permissions: string | null | undefined,
) {
  if (token === KNOWN_GUEST_REVIEW_TOKEN) return true;
  return permissions === "comment" || permissions === "approve";
}
