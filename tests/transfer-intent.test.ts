import assert from "node:assert/strict";
import test from "node:test";
import { TransferIntent, setTransferTimeout } from "../lib/uploads/transfer-intent.ts";

test("pause beats delayed discovery, explicit resume starts only after discovery", async () => {
  const intent = new TransferIntent(); let starts = 0;
  let finish!: () => void;
  const discovery = new Promise<void>(resolve => { finish = resolve; }).then(() => {
    intent.ready("a"); if (intent.canStart("a")) starts++;
  });
  intent.pause("a"); finish(); await discovery;
  assert.equal(starts, 0);
  intent.resume("a"); if (intent.canStart("a")) starts++;
  assert.equal(starts, 1);
});

test("resume before discovery cannot start early, cancellation wins immediately", () => {
  const intent = new TransferIntent(); intent.pause("a"); intent.resume("a");
  assert.equal(intent.canStart("a"), false);
  intent.cancel("a"); intent.ready("a");
  assert.equal(intent.canStart("a"), false);
  intent.resume("a"); assert.equal(intent.canStart("a"), false);
  intent.reset("a"); assert.equal(intent.canStart("a"), false);
  intent.ready("a"); assert.equal(intent.canStart("a"), true);
});

test("timeout settles through the existing XHR error listener", () => {
  class Request extends EventTarget { timeout = 0; ontimeout: (() => void) | null = null; }
  const request = new Request(); let failures = 0;
  request.addEventListener("error", () => { failures++; });
  setTransferTimeout(request as unknown as XMLHttpRequest);
  assert.equal(request.timeout, 180_000); request.ontimeout?.();
  assert.equal(failures, 1);
});
