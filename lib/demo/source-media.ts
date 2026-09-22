import { open, readFile, realpath, stat } from "node:fs/promises";
import { extname, relative, isAbsolute } from "node:path";
import { nodeReadableToWebStream } from "../media/node-readable-web-stream.ts";
import { isLocalDemoServerRequest } from "./server-mode.ts";

export function sourceByteRange(header: string | null, size: number) {
  if (!header) return { start: 0, end: size - 1, partial: false };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start || (!match[1] && Number(match[2]) <= 0)) return null;
  return { start, end, partial: true };
}

export async function localSourceMedia(request: Request, id: string, environment = process.env): Promise<Response> {
  const url = new URL(request.url);
  if (!isLocalDemoServerRequest({host: request.headers.get("host") ?? "", demo: url.searchParams.get("demo") ?? undefined, environment})
    || request.headers.get("sec-fetch-site") === "cross-site"
    || !environment.CODELIVER_SOURCE_CATALOG || !environment.CODELIVER_SOURCE_ROOT
    || !/^[a-z0-9-]+$/.test(id)) return new Response(null, {status:404});
  try {
    const catalogStat = await stat(environment.CODELIVER_SOURCE_CATALOG);
    if (catalogStat.size > 2_000_000) return new Response(null, {status:503});
    const catalog = JSON.parse(await readFile(environment.CODELIVER_SOURCE_CATALOG, "utf8")) as { assets: Array<{ id: string; path: string; bytes: number; poster_path?: string }> };
    const asset = catalog.assets.find((candidate) => candidate.id === id);
    if (!asset) return new Response(null, {status:404});
    const poster = url.searchParams.get("poster") === "1";
    const requestedPath = poster ? asset.poster_path : asset.path;
    if (!requestedPath) return new Response(null, {status:404});
    const root = await realpath(poster ? environment.CODELIVER_SOURCE_POSTER_ROOT ?? environment.CODELIVER_SOURCE_ROOT : environment.CODELIVER_SOURCE_ROOT);
    const path = await realpath(requestedPath);
    const rel = relative(root, path);
    if (!rel || rel.startsWith("..") || isAbsolute(rel) || !(poster ? [".jpg", ".png"] : [".mp4", ".m4v", ".mov"]).includes(extname(path).toLowerCase())) return new Response(null, {status:404});
    const file = await open(path, "r");
    try {
      const info = await file.stat();
      if (!info.isFile() || (!poster && info.size !== asset.bytes)) {
        await file.close(); return new Response(null, {status:409});
      }
      const range = sourceByteRange(request.headers.get("range"), info.size);
      const headers = new Headers({"Accept-Ranges":"bytes", "Cache-Control":"private, no-store", "Cross-Origin-Resource-Policy":"same-origin", "X-Content-Type-Options":"nosniff",
        "Content-Type":poster ? extname(path) === ".png" ? "image/png" : "image/jpeg" : "video/mp4"});
      if (!range) { await file.close(); headers.set("Content-Range", `bytes */${info.size}`); return new Response(null, {status:416,headers}); }
      headers.set("Content-Length", String(range.end - range.start + 1));
      if (range.partial) headers.set("Content-Range", `bytes ${range.start}-${range.end}/${info.size}`);
      if (request.method === "HEAD") { await file.close(); return new Response(null,{status:range.partial?206:200,headers}); }
      const stream = file.createReadStream({start:range.start,end:range.end,autoClose:true});
      return new Response(nodeReadableToWebStream(stream), {status:range.partial?206:200,headers});
    } catch (error) { await file.close().catch(() => undefined); throw error; }
  } catch { return new Response(null, {status:503}); }
}
