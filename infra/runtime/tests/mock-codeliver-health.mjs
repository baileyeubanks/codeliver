import http from "node:http";

const requestedPort = Number.parseInt(process.argv[2] ?? "0", 10);
const release = process.argv[3] ?? "";
const mode = process.argv[4] ?? "ready";
const allowedHosts = new Set(["admin.contentco-op.com", "client.contentco-op.com"]);

if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65535) {
  process.exit(2);
}
if (!/^[0-9a-f]{40}$/.test(release)) {
  process.exit(3);
}

function send(response, status, body) {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

const server = http.createServer((request, response) => {
  const host = request.headers.host ?? "";
  if (!allowedHosts.has(host)) {
    send(response, 403, {
      error: "This hostname is not an approved Content Co-op surface",
      code: "HOST_FORBIDDEN",
    });
    return;
  }

  if (request.url === "/api/health/live") {
    send(response, 200, {
      status: "ok",
      service: "co-deliver",
      probe: "liveness",
      release,
    });
    return;
  }

  if (request.url === "/api/health/ready") {
    const ready = !(mode === "client-not-ready" && host === "client.contentco-op.com");
    send(response, ready ? 200 : 503, {
      status: ready ? "degraded" : "unhealthy",
      ready,
      service: "co-deliver",
      probe: "readiness",
    });
    return;
  }

  send(response, 404, { error: "not found" });
});

server.listen(requestedPort, "127.0.0.1", () => {
  const address = server.address();
  if (!address || typeof address === "string") process.exit(4);
  process.stdout.write(`${address.port}\n`);
});

process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT", () => server.close(() => process.exit(0)));
