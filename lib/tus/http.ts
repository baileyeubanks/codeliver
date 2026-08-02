export async function* requestBodyChunks(
  request: Request,
): AsyncIterable<Uint8Array> {
  const reader = request.body?.getReader();
  if (!reader) return;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) return;
      if (result.value.byteLength > 0) yield result.value;
    }
  } finally {
    reader.releaseLock();
  }
}
