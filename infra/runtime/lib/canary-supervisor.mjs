import { spawn } from "node:child_process";

const [runner, ...runnerArgs] = process.argv.slice(2);
if (!runner) process.exit(2);

const child = spawn(runner, runnerArgs, {
  detached: true,
  stdio: "inherit",
});

let stopping = false;
function stop(signal) {
  if (stopping) return;
  stopping = true;
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGHUP", () => stop("SIGHUP"));

child.on("error", (error) => {
  process.stderr.write(`canary supervisor: ${error.message}\n`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.exit(128 + (signal === "SIGTERM" ? 15 : signal === "SIGINT" ? 2 : 1));
  }
  process.exit(code ?? 1);
});
