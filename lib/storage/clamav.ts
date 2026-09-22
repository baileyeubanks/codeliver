import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { accessSync, constants } from "node:fs";
import { isAbsolute } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { MalwareScanHook, MalwareScanInput, MalwareScanResult } from "./malware.ts";
import { CLAMAV_MAX_SCAN_BYTES } from "./scanner-limits.ts";

// ClamAV has a 2 GB engine boundary. Never silently skip a larger upload.
const MAX_OUTPUT_BYTES = 64 * 1024;
export const CLAMAV_STDIN_SCAN_ARGS = [
  "--no-summary",
  "--stdout",
  "--alert-exceeds-max=yes",
  // ClamAV's 120s default skips the rest of a long scan and assumes it clean.
  // Disable that engine shortcut; the caller's AbortSignal is the fail-closed
  // wall-clock boundary for the full byte stream.
  "--max-scantime=0",
  "--max-filesize=2000M",
  "--max-scansize=2000M",
  "-",
] as const;

export class ClamAvScanHook implements MalwareScanHook {
  readonly readiness;
  private readonly executable: string;

  constructor(executable: string) {
    this.executable = executable;
    let configured = false;
    try {
      if (isAbsolute(executable)) {
        accessSync(executable, constants.X_OK);
        configured = true;
      }
    } catch { /* Missing scanners must keep uploads quarantined. */ }
    this.readiness = {
      mode: "clamav",
      configured,
      automaticReleaseReady: configured,
      message: configured
        ? "ClamAV is configured; release requires a successful scan of the exact uploaded bytes"
        : "The configured ClamAV executable is unavailable",
    };
  }

  async scan(input: MalwareScanInput): Promise<MalwareScanResult> {
    const result = (verdict: MalwareScanResult["verdict"], detail: string): MalwareScanResult => ({
      verdict, detail, engine: "clamav", signature: null, scannedAt: new Date().toISOString(),
    });
    if (!this.readiness.configured || input.signal?.aborted || !Number.isSafeInteger(input.size) || input.size <= 0 || input.size > CLAMAV_MAX_SCAN_BYTES) {
      return result("error", "Scanner unavailable, scan cancelled, or file exceeds scanner limits");
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    input.signal?.addEventListener("abort", abort, { once: true });
    const hash = createHash("sha256");
    let bytes = 0;
    let output = "";
    let outputBytes = 0;
    let child: ReturnType<typeof spawn> | undefined;
    try {
      child = spawn(this.executable, [...CLAMAV_STDIN_SCAN_ARGS], {
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
        signal: controller.signal,
        killSignal: "SIGKILL",
      });
      const exit = new Promise<number | null>((resolve, reject) => {
        child!.once("error", reject);
        child!.once("close", resolve);
      });
      // Attach a rejection handler immediately while the source stream opens.
      void exit.catch(() => undefined);
      const collect = (chunk: Buffer) => {
        outputBytes += chunk.length;
        if (outputBytes > MAX_OUTPUT_BYTES) { abort(); return; }
        output += chunk.toString("utf8");
      };
      child.stdout!.on("data", collect);
      child.stderr!.on("data", collect);
      const source = await input.openStream();
      const meter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          bytes += chunk.length;
          if (bytes > input.size) { callback(new Error("Scan byte count exceeded declared size")); return; }
          hash.update(chunk);
          callback(null, chunk);
        },
      });
      const [, code] = await Promise.all([
        pipeline(source, meter, child.stdin!, { signal: controller.signal }), exit,
      ]);
      if (controller.signal.aborted || bytes !== input.size || hash.digest("hex") !== input.sha256) {
        return result("error", "Scan did not verify the complete uploaded bytes");
      }
      if (code === 1) return result("infected", "ClamAV rejected the file or its scan limits were exceeded");
      if (code !== 0 || !/^stdin: OK\s*$/m.test(output) || /ERROR|WARNING|FOUND|Limits\.Exceeded/i.test(output)) {
        return result("error", "ClamAV did not return an unambiguous clean result");
      }
      return result("clean", "ClamAV verified the complete uploaded bytes");
    } catch {
      return result("error", "ClamAV scan failed or was cancelled");
    } finally {
      input.signal?.removeEventListener("abort", abort);
      if (child && child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }
  }
}
