export const DEFAULT_TIMECODE_FPS = 24;

/**
 * Floor-based non-drop-frame SMPTE timecode (HH:MM:SS:FF). Count elapsed
 * frames at the measured rate first, then lay them out at the nominal display
 * rate (24 for 24000/1001, 30 for 30000/1001). This keeps fractional-rate
 * sources on their real frame boundary without applying a drop-frame rule.
 */
export function formatSmpteTimecode(seconds: number, fps = DEFAULT_TIMECODE_FPS) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const safeFps = Number.isFinite(fps) && fps > 0 ? fps : DEFAULT_TIMECODE_FPS;
  const nominalFps = Math.max(1, Math.round(safeFps));
  const totalFrames = Math.floor(safeSeconds * safeFps);
  const framesPerHour = nominalFps * 60 * 60;
  const framesPerMinute = nominalFps * 60;
  const hours = Math.floor(totalFrames / framesPerHour);
  const minutes = Math.floor((totalFrames % framesPerHour) / framesPerMinute);
  const secs = Math.floor((totalFrames % framesPerMinute) / nominalFps);
  const frames = totalFrames % nominalFps;
  return [hours, minutes, secs, frames]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}
