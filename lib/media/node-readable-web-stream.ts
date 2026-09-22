import type { Readable } from "node:stream";

type BinaryAsyncIterator = AsyncIterator<Uint8Array>;

function binaryChunk(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (typeof value === "string") return new TextEncoder().encode(value);
  throw new TypeError("Node media stream emitted a non-binary chunk");
}

/**
 * Converts a Node binary readable into a cancellation-safe WHATWG stream.
 *
 * Node 24's Readable.toWeb() can enqueue after a browser cancels a
 * backpressured media request. ReadableStream.from() avoids that race after
 * reading starts, but does not destroy a source cancelled before its first
 * pull. This explicit bridge owns cancellation at both boundaries.
 */
export function nodeReadableToWebStream(
  stream: Readable,
): ReadableStream<Uint8Array> {
  let cancelled = false;
  let iterator: BinaryAsyncIterator | null = null;

  function sourceIterator(): BinaryAsyncIterator {
    if (!iterator) {
      iterator = stream[Symbol.asyncIterator]() as BinaryAsyncIterator;
    }
    return iterator;
  }

  function destroySource(): void {
    if (!stream.destroyed) stream.destroy();
    void iterator?.return?.().catch(() => undefined);
  }

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (cancelled) return;
      try {
        const next = await sourceIterator().next();
        if (cancelled) return;
        if (next.done) {
          controller.close();
          return;
        }
        controller.enqueue(binaryChunk(next.value));
      } catch (error) {
        if (!cancelled) controller.error(error);
      }
    },
    cancel() {
      cancelled = true;
      destroySource();
    },
  });
}
