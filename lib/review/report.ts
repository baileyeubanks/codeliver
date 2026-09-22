import type { Comment } from "../types/codeliver.ts";
import { annotationPath, clamp01 } from "./annotation.ts";

export interface ReviewReportInput {
  assetId: string;
  assetTitle: string;
  projectName: string;
  versionId: string;
  versionNumber: number;
  approvalLabel: string;
  comments: Comment[];
  generatedAt?: string;
}

/** Defense in depth: export never broadens the admitted review's scope. */
export function selectReportComments(input: ReviewReportInput): Comment[] {
  const all = new Map<string, Comment>();
  function collect(comments: Comment[]) {
    for (const comment of comments) {
      if (all.has(comment.id)) continue;
      all.set(comment.id, comment);
      collect(comment.replies ?? []);
    }
  }
  collect(input.comments);
  const permitted = [...all.values()].filter(comment =>
    comment.asset_id === input.assetId && comment.visibility === "external" &&
    (comment.version_id === input.versionId || comment.version_id === null),
  );
  const result: Comment[] = [];
  const visited = new Set<string>();
  function append(parentId: string | null) {
    for (const comment of permitted) {
      if (comment.parent_id !== parentId || visited.has(comment.id)) continue;
      visited.add(comment.id);
      result.push(comment);
      append(comment.id);
    }
  }
  append(null);
  return result;
}

const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, character =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
);

function imageUrl(value: string): string | null {
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function timecode(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "General note";
  const milliseconds = Math.max(0, Math.round(seconds * 1000));
  const minutes = Math.floor(milliseconds / 60_000);
  const remainder = ((milliseconds % 60_000) / 1000).toFixed(3).padStart(6, "0");
  return `${String(minutes).padStart(2, "0")}:${remainder}`;
}

function drawing(comment: Comment, input: ReviewReportInput): string {
  const shapes = (comment.annotations ?? []).filter(annotation =>
    annotation.comment_id === comment.id && annotation.asset_id === input.assetId &&
    (annotation.version_id === input.versionId || annotation.version_id === null),
  ).map(annotation => {
    const data = annotation.data;
    if (data.kind === "pin") return `<circle cx="${clamp01(data.x)}" cy="${clamp01(data.y)}" r=".02" fill="#156bff"/>`;
    if (data.kind === "text") return `<text x="${clamp01(data.x)}" y="${clamp01(data.y)}" font-size=".045" fill="#156bff">${escape(data.text)}</text>`;
    const path = annotationPath(data);
    return path ? `<path d="${escape(path)}" fill="none" stroke="#156bff" stroke-width=".008"/>` : "";
  });
  if (comment.pin_x !== null && comment.pin_y !== null && Number.isFinite(comment.pin_x) && Number.isFinite(comment.pin_y)) {
    shapes.push(`<circle cx="${clamp01(comment.pin_x / 100)}" cy="${clamp01(comment.pin_y / 100)}" r=".02" fill="#156bff"/>`);
  }
  return shapes.some(Boolean) ? `<figure><svg viewBox="0 0 1 1" preserveAspectRatio="none" role="img" aria-label="Comment drawing">${shapes.join("")}</svg><figcaption>Drawing overlay · see the referenced frame at ${timecode(comment.timecode_seconds)}</figcaption></figure>` : "";
}

/** Escaped standalone HTML: no tokens, emails, rich HTML, scripts, or media download links. */
export function renderReviewReport(input: ReviewReportInput): string {
  const comments = selectReportComments(input);
  const generated = new Date(input.generatedAt ?? Date.now()).toISOString();
  const cards = comments.map((comment, index) => {
    const images = (comment.attachments ?? []).filter(attachment => attachment.comment_id === comment.id)
      .map(attachment => {
        const url = imageUrl(attachment.file_url);
        return url && ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(attachment.file_type)
          ? `<figure><img src="${escape(url)}" alt="${escape(attachment.file_name)}" referrerpolicy="no-referrer"/><figcaption>${escape(attachment.file_name)}</figcaption></figure>`
          : `<p class="attachment">Reference: ${escape(attachment.file_name)} (not embedded)</p>`;
      }).join("");
    return `<article class="${comment.parent_id ? "reply" : "note"}"><header><strong>${comment.parent_id ? "Reply" : `Note ${index + 1}`} · ${escape(comment.author_name || "Reviewer")}</strong><span>${escape(comment.status)}</span></header><p class="meta">${timecode(comment.timecode_seconds)}${comment.frame_number != null ? ` · Frame ${escape(comment.frame_number)}` : ""}${comment.version_id === null ? " · Asset-wide note" : ""}</p><p class="body">${escape(comment.body)}</p><div class="images">${images}${drawing(comment, input)}</div></article>`;
  }).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><meta name="referrer" content="no-referrer"/><title>${escape(input.assetTitle)} — V${escape(input.versionNumber)} review</title><style>
@font-face{font-family:Inter;src:url('/fonts/inter-medium.ttf') format('truetype');font-weight:500;font-style:normal;font-display:swap}
*{box-sizing:border-box}body{margin:0;color:#18263b;background:#edf2f8;font:500 12px/1.55 Inter,Arial,sans-serif}.page{max-width:820px;margin:28px auto;background:white;padding:40px}.toolbar{max-width:820px;margin:20px auto;padding:0 16px;display:flex;flex-wrap:wrap;align-items:center;gap:12px}.toolbar button{border:0;border-radius:8px;background:#156bff;color:white;font:inherit;padding:12px 18px;cursor:pointer}h1{font-size:25px;line-height:1.2;margin:8px 0 12px;overflow-wrap:anywhere}.eyebrow{color:#156bff;text-transform:uppercase;font-size:10px;letter-spacing:.1em}.summary{border-bottom:2px solid #156bff;padding-bottom:20px;margin-bottom:24px}.meta,figcaption{font-size:10px;color:#53647b}.note,.reply{border:1px solid #dbe3ed;border-radius:8px;padding:16px;margin:0 0 14px;break-inside:avoid}.reply{margin-left:20px}article header{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}article header span{color:#53647b}.body{white-space:pre-wrap;overflow-wrap:anywhere}.images{display:flex;flex-wrap:wrap;gap:12px}figure{margin:8px 0;max-width:100%;width:320px}figure img,figure svg{display:block;max-width:100%;width:100%;height:auto;max-height:320px;object-fit:contain;border:1px solid #dbe3ed}figure svg{height:180px;background:#f4f7fb}figcaption{padding-top:5px;overflow-wrap:anywhere}footer{margin-top:24px;border-top:1px solid #dbe3ed;padding-top:12px;font-size:9px;color:#53647b}.attachment{overflow-wrap:anywhere}.empty{padding:24px 0}.toolbar p{margin:0;color:#53647b}@media(max-width:600px){.page{margin:0;padding:20px}.reply{margin-left:10px}}@page{size:A4;margin:16mm}@media print{body{background:white}.page{max-width:none;margin:0;padding:0}.toolbar{display:none}article{box-shadow:none}a{color:inherit}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body><div class="toolbar"><button type="button" id="print-review">Print or save PDF</button><p id="report-status">Selected-version review notes and reference images.</p></div><main class="page"><section class="summary"><div class="eyebrow">Co-VideoPro · Review report</div><h1>${escape(input.assetTitle)}</h1><p>${escape(input.projectName)} · Version ${escape(input.versionNumber)} · ${escape(input.approvalLabel)}</p><p class="meta">${comments.length} notes and replies · Generated ${escape(generated)}</p></section>${cards || '<p class="empty">No external comments for this version.</p>'}<footer>Snapshot of the admitted review. Includes selected-version and asset-wide notes; excludes internal comments and other versions. Approval status is a snapshot, not a new decision.</footer></main></body></html>`;
}
