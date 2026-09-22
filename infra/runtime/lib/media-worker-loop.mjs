import http from "node:http";

// An empty authenticated POST asks the server to recoverAndRunNext without
// placing the worker token in argv or logs.
const token = process.env.CODELIVER_MEDIA_PIPELINE_WORKER_TOKEN?.trim() ?? "";
const origin = new URL(process.env.CODELIVER_WORKER_ORIGIN ?? "");
const host = process.env.CODELIVER_WORKER_HOST?.trim() ?? "";
if (!token || !host || origin.protocol !== "http:" || origin.hostname !== "127.0.0.1") {
  process.stderr.write("media-worker: invalid private worker configuration\n");
  process.exit(1);
}

let stopping = false;
process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runNext() {
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: origin.hostname,
      port: origin.port,
      path: "/api/transcode/worker",
      method: "POST",
      headers: {
        Host: host,
        "content-type": "application/json",
        "content-length": "2",
        "x-codeliver-media-worker-token": token,
      },
      timeout: 30 * 60 * 1000,
    }, (response) => {
      response.resume();
      response.once("end", () => {
        if (response.statusCode === 200) resolve();
        else reject(new Error(`HTTP ${response.statusCode ?? "unknown"}`));
      });
    });
    request.once("timeout", () => request.destroy(new Error("timeout")));
    request.once("error", reject);
    request.end("{}");
  });
}

while (!stopping) {
  try {
    await runNext();
    if (!stopping) await sleep(2_000);
  } catch {
    process.stderr.write("media-worker: recover-and-run-next request failed; retrying\n");
    if (!stopping) await sleep(10_000);
  }
}
