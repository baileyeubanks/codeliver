import type { PublicInquiryUploadMimeType } from "./intake-upload-shared";

const SIGNATURE_SAMPLE_BYTES = 512;

export class IntakeUploadSignatureError extends Error {
  constructor() {
    super("Uploaded bytes do not match the declared file type");
    this.name = "IntakeUploadSignatureError";
  }
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

function startsWith(bytes: Uint8Array, expected: readonly number[]): boolean {
  return expected.every((value, index) => bytes[index] === value);
}

function looksLikeIsoMedia(bytes: Uint8Array): boolean {
  return bytes.length >= 12 && ascii(bytes, 4, 4) === "ftyp";
}

function looksLikeMp3(bytes: Uint8Array): boolean {
  return (
    ascii(bytes, 0, 3) === "ID3" ||
    (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
  );
}

export function intakeUploadSignatureMatches(
  mimeType: PublicInquiryUploadMimeType,
  bytes: Uint8Array,
): boolean {
  if (bytes.length === 0) return false;
  switch (mimeType) {
    case "video/mp4":
    case "video/quicktime":
    case "video/x-m4v":
    case "audio/m4a":
    case "audio/mp4":
    case "image/heic":
    case "image/heif":
      return looksLikeIsoMedia(bytes);
    case "video/webm":
      return startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
    case "audio/aac":
      return bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0;
    case "audio/flac":
      return ascii(bytes, 0, 4) === "fLaC";
    case "audio/mpeg":
      return looksLikeMp3(bytes);
    case "audio/ogg":
      return ascii(bytes, 0, 4) === "OggS";
    case "audio/wav":
    case "audio/x-wav":
      return ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WAVE";
    case "image/jpeg":
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case "image/png":
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/tiff":
      return (
        startsWith(bytes, [0x49, 0x49, 0x2a, 0x00]) ||
        startsWith(bytes, [0x4d, 0x4d, 0x00, 0x2a])
      );
    case "image/webp":
      return ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP";
    case "application/pdf":
      return ascii(bytes, 0, 5) === "%PDF-";
    case "application/msword":
    case "application/vnd.ms-powerpoint":
      return startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]);
    case "text/plain":
      return !bytes.includes(0);
  }
}

export async function* validateIntakeUploadSignature(
  chunks: AsyncIterable<Uint8Array>,
  mimeType: PublicInquiryUploadMimeType,
  offset: number,
): AsyncIterable<Uint8Array> {
  if (offset !== 0) {
    yield* chunks;
    return;
  }

  const buffered: Uint8Array[] = [];
  let bufferedBytes = 0;
  const iterator = chunks[Symbol.asyncIterator]();
  while (bufferedBytes < SIGNATURE_SAMPLE_BYTES) {
    const result = await iterator.next();
    if (result.done) break;
    buffered.push(result.value);
    bufferedBytes += result.value.byteLength;
  }
  const sample = new Uint8Array(Math.min(bufferedBytes, SIGNATURE_SAMPLE_BYTES));
  let copied = 0;
  for (const chunk of buffered) {
    const remaining = sample.byteLength - copied;
    if (remaining <= 0) break;
    const take = Math.min(chunk.byteLength, remaining);
    sample.set(chunk.subarray(0, take), copied);
    copied += take;
  }
  if (!intakeUploadSignatureMatches(mimeType, sample)) {
    throw new IntakeUploadSignatureError();
  }
  for (const chunk of buffered) yield chunk;
  while (true) {
    const result = await iterator.next();
    if (result.done) return;
    yield result.value;
  }
}
