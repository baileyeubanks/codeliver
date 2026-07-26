/**
 * Co‑ProVideo — caption export (SRT/VTT) from transcript segments.
 * Truthful generation from the segment model; no provider dependency.
 */

export interface CaptionSegment {
  id: string;
  start_seconds: number;
  end_seconds: number;
  speaker: string;
  text: string;
}

function captionTime(seconds: number, separator: string): string {
  const totalMs = Math.round(Math.max(0, seconds) * 1000);
  const ms = totalMs % 1000;
  const totalSeconds = Math.floor(totalMs / 1000);
  const ss = totalSeconds % 60;
  const mm = Math.floor(totalSeconds / 60) % 60;
  const hh = Math.floor(totalSeconds / 3600);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}${separator}${String(ms).padStart(3, "0")}`;
}

function ordered(segments: CaptionSegment[]): CaptionSegment[] {
  return [...segments].sort((a, b) => a.start_seconds - b.start_seconds || a.id.localeCompare(b.id));
}

/** CMX-style speaker prefix kept inside the text for SRT readers. */
export function segmentsToSrt(segments: CaptionSegment[]): string {
  if (segments.length === 0) return "";
  return (
    ordered(segments)
      .map((segment, index) =>
        [
          String(index + 1),
          `${captionTime(segment.start_seconds, ",")} --> ${captionTime(segment.end_seconds, ",")}`,
          `${segment.speaker}: ${segment.text}`,
        ].join("\n"),
      )
      .join("\n\n") + "\n"
  );
}

export function segmentsToVtt(segments: CaptionSegment[]): string {
  if (segments.length === 0) return "WEBVTT\n";
  return (
    "WEBVTT\n\n" +
    ordered(segments)
      .map((segment) =>
        [
          `${captionTime(segment.start_seconds, ".")} --> ${captionTime(segment.end_seconds, ".")}`,
          `<v ${segment.speaker}>${segment.text}</v>`,
        ].join("\n"),
      )
      .join("\n\n") +
    "\n"
  );
}

export function captionsFilename(name: string, extension: "srt" | "vtt"): string {
  const base = name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
  return `${base || "captions"}.${extension}`;
}
