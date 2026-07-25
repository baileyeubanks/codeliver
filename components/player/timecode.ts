export const DEFAULT_TIMECODE_FPS = 24;

/**
 * Floor-based SMPTE timecode (HH:MM:SS:FF). Flooring both the whole-second
 * and frame components keeps the chip stable while scrubbing — a frame never
 * rounds up into the next second before the playhead actually reaches it.
 */
export function formatSmpteTimecode(seconds: number, fps = DEFAULT_TIMECODE_FPS) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const safeFps = Number.isFinite(fps) && fps > 0 ? fps : DEFAULT_TIMECODE_FPS;
  const whole = Math.floor(safeSeconds);
  const frames = Math.floor((safeSeconds - whole) * safeFps);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;
  return [hours, minutes, secs, frames]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}
