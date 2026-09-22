import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawn } from "node:child_process";
import { verifiedSourcePath } from "./source-preview-paths.mjs";

const [catalogPath, port] = process.argv.slice(2);
if (!catalogPath || !/^\d{4,5}$/.test(port ?? "") || Number(port) > 65535) throw new Error("Usage: node scripts/schneider-preview.mjs <source-manifest.json> <port>");
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
const sourceRoot = "/Users/baileyeubanks/CCO/clients/schneider-electric";
const posterRoot = join(dirname(catalogPath), "schneider-preview-posters");
mkdirSync(posterRoot, {recursive:true});
if (!catalog.assets?.length || catalog.assets.length > 100) throw new Error("Source manifest must contain 1–100 verified preview assets.");
for (const asset of catalog.assets) {
  if (!/^[a-z0-9-]+$/.test(asset.id)) throw new Error("Invalid source id");
  asset.path = verifiedSourcePath(sourceRoot, asset);
  const poster = join(posterRoot, `${asset.id}.jpg`);
  if (!existsSync(poster)) {
    execFileSync("ffmpeg", ["-v","error","-nostdin","-ss","1","-i",asset.path,"-frames:v","1","-vf","scale=640:-2","-q:v","3","-threads","1",poster], {timeout:30_000,stdio:["ignore","ignore","pipe"]});
  }
  asset.poster_path = poster;
}
const runtimePath = join(dirname(catalogPath), "schneider-preview-runtime.json");
writeFileSync(runtimePath, `${JSON.stringify(catalog,null,2)}\n`, {mode:0o600});
const label = (path) => path?.startsWith(sourceRoot) ? path.slice(sourceRoot.length + 1) : basename(path ?? "");
const frameRate = (rate) => {
  if (typeof rate === "number") return rate;
  const parts = String(rate).split("/").map(Number);
  return parts.length === 2 ? parts[0] / parts[1] : parts[0];
};
const publicCatalog = {
  imported_at: catalog.generated_at,
  projects: catalog.projects.map((project) => ({id:project.id,name:project.name,summary:project.summary,source_label:label(project.source_root)})),
  assets: catalog.assets.map((asset) => ({id:asset.id,project_id:asset.project_id,title:asset.title,bytes:asset.bytes,
    duration_seconds:asset.duration_seconds,width:asset.width,height:asset.height,frame_rate:frameRate(asset.frame_rate),created_at:asset.modified_at,
    source_label:asset.source_relative_path,has_poster:Boolean(asset.poster_path)})),
  contacts: (catalog.contacts ?? []).map(({id,name,documented_role,project_ids}) => ({id,name,documented_role,project_ids})),
  review_notes: (catalog.review_notes ?? []).map(({id,project_id,media_title,reviewer,timecode,note,source,status_at_source}) =>
    ({id,project_id,media_title,reviewer,timecode,note,source_label:label(source),status_at_source})),
};
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next","dev","--webpack","--hostname","127.0.0.1","--port",port], {
  cwd:repo, stdio:"inherit", env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,
    CODELIVER_DEMO_MODE:"1",NEXT_TELEMETRY_DISABLED:"1",CODELIVER_SOURCE_CATALOG:runtimePath,CODELIVER_SOURCE_ROOT:sourceRoot,
    CODELIVER_SOURCE_POSTER_ROOT:posterRoot,NEXT_PUBLIC_CVP_SOURCE_CATALOG:JSON.stringify(publicCatalog)},
});
for (const signal of ["SIGTERM","SIGINT"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
