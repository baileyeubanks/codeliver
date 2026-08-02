import fs from "node:fs";
import http from "node:http";

const portFile = process.env.PORT_FILE;
if (!portFile) throw new Error("PORT_FILE is required");

const allowedHosts = new Set(["admin.contentco-op.com", "client.contentco-op.com"]);
const server = http.createServer((request, response) => {
  if (request.url === "/ready") {
    response.writeHead(200, { "Content-Type": "text/plain" });
    response.end("ready\n");
    return;
  }
  if (request.url === "/metrics") {
    response.writeHead(200, { "Content-Type": "text/plain" });
    response.end("cloudflared_tunnel_ha_connections 4\n");
    return;
  }
  if (!allowedHosts.has(request.headers.host ?? "")) {
    response.writeHead(421, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "unexpected host" }));
    return;
  }
  if (request.url === "/api/health/live") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ status: "ok", service: "co-deliver", probe: "liveness" }));
    return;
  }
  if (request.url === "/api/health/ready") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({ status: "healthy", ready: true, service: "co-deliver", probe: "readiness" }),
    );
    return;
  }
  response.writeHead(404, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ error: "not found" }));
});

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("unexpected listen address");
  fs.writeFileSync(portFile, `${address.port}\n`, { mode: 0o600 });
});

function close() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", close);
process.on("SIGTERM", close);

