import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";

import { nodeReadableToWebStream } from "../lib/media/node-readable-web-stream.ts";

function within<T>(promise: Promise<T>, milliseconds = 250): Promise<T | "timeout"> {
  return Promise.race([
    promise,
    new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), milliseconds)),
  ]);
}

test("cancelling a web-media reader destroys its still-open Node source", async () => {
  let emitted = false;
  const source = new Readable({
    read() {
      if (!emitted) {
        emitted = true;
        this.push(Buffer.from("one media chunk"));
      }
    },
  });

  const reader = nodeReadableToWebStream(source).getReader();
  const first = await reader.read();
  assert.equal(Buffer.from(first.value ?? []).toString(), "one media chunk");
  assert.equal(source.destroyed, false);

  await reader.cancel("client cancelled media request");
  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.equal(source.destroyed, true);
});

test("cancelling before the first pull closes a real file stream", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cvp-stream-cancel-"));
  const path = join(directory, "media.bin");
  await writeFile(path, "real file stream cancellation");
  const source = createReadStream(path);
  const closed = new Promise<void>((resolve) => source.once("close", resolve));

  try {
    const reader = nodeReadableToWebStream(source).getReader();
    await reader.cancel("client cancelled before first pull");
    assert.equal(await within(closed), undefined);
    assert.equal(source.destroyed, true);
  } finally {
    source.destroy();
    await rm(directory, { recursive: true, force: true });
  }
});

test("cancelling during a pending read settles promptly and destroys the source", async () => {
  const source = new Readable({ read() {} });
  const reader = nodeReadableToWebStream(source).getReader();
  const pendingRead = reader.read().catch(() => undefined);

  try {
    const cancellation = reader.cancel("client cancelled during backpressure");
    assert.notEqual(await within(cancellation), "timeout");
    assert.equal(source.destroyed, true);
  } finally {
    source.destroy();
    await pendingRead;
  }
});
