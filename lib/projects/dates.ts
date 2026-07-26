/**
 * Locale-stable date helpers for the project workspace. All formatting goes
 * through explicit UTC math so tests and server/client renders agree.
 */

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Reduce an ISO date or datetime to its `YYYY-MM-DD` date key. */
export function toDateKey(iso: string): string {
  return iso.slice(0, 10);
}

/** "2026-03-09" (or a full ISO datetime) → "Mar 9, 2026". Null → em dash. */
export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const key = toDateKey(iso);
  const [year, month, day] = key.split("-").map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day) return "—";
  return `${MONTH_NAMES[month - 1]} ${day}, ${year}`;
}

/** "2026-07-14T21:56:00.000Z" → "Jul 14, 2026, 9:56 PM" (UTC, stable). */
export function formatDateTimeShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return formatDateShort(iso);
  const hours = date.getUTCHours();
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${formatDateShort(iso)}, ${hour12}:${minutes} ${suffix}`;
}

/** Seconds → "1:11" duration label. Null → em dash. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return "—";
  const whole = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = String(whole % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}
