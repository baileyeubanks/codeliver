const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCAL_DEMO_PROJECT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*-(?=[a-z0-9]{6,}$)(?=[a-z0-9]*[0-9])[a-z0-9]+$/;
const LOCAL_DEMO_ASSET_ID_PATTERN = /^local-upload-[0-9]{10,16}-[0-9]+$/;
const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,256}$/;
const LOCAL_DEMO_SHARE_TOKEN_PATTERN =
  /^review-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SEEDED_DEMO_PROJECT_IDS = new Set(["ica", "schneider-epc", "bp", "conexon", "el-paso"]);
// Keep in sync with the seeded shareLinks in lib/demo/workspace-store.ts.
const SEEDED_DEMO_SHARE_TOKENS = new Set(["demo-ica-final", "demo-ceraweek-cuts"]);
// Seeded demo shares predate share_intent, so the canonical short route
// re-supplies the asset/intent the long query form used to carry.
// Keep in sync with the seeded shareLinks in lib/demo/workspace-store.ts.
const SEEDED_DEMO_SHARE_ROUTES = new Map<string, { asset: string; intent: string }>([
  ["demo-ica-final", { asset: "ica-roadshow-final", intent: "approval_needed" }],
  ["demo-ceraweek-cuts", { asset: "denie-mcdonald-v4", intent: "client_review" }],
]);
// Query flag the proxy sets when it rewrites a canonical short demo share URL
// back to the long form, so the page does not redirect it in a loop.
export const DEMO_SHORT_SHARE_QUERY_FLAG = "demo-short";
const SEEDED_DEMO_ASSET_ROUTES = new Set([
  "ica/denie-mcdonald-v4",
  "ica/charles-drummond-v5",
  "ica/kevin-bowers-v2",
  "ica/ica-roadshow-final",
  "schneider-epc/mclaren-podcast-v3",
  "schneider-epc/epc-recap-v6",
  "bp/bp-rodeo-v2",
  "conexon/conexon-workshop-v1",
]);

export function isProductionRecordId(value: string): boolean {
  return UUID_V4_PATTERN.test(value);
}

export function isKnownDemoProjectRoute(projectId: string): boolean {
  return SEEDED_DEMO_PROJECT_IDS.has(projectId) || LOCAL_DEMO_PROJECT_ID_PATTERN.test(projectId);
}

export function isKnownDemoAssetRoute(projectId: string, assetId: string): boolean {
  return SEEDED_DEMO_ASSET_ROUTES.has(`${projectId}/${assetId}`)
    || (isKnownDemoProjectRoute(projectId) && LOCAL_DEMO_ASSET_ID_PATTERN.test(assetId));
}

export function isKnownDemoShareRoute(token: string): boolean {
  return SEEDED_DEMO_SHARE_TOKENS.has(token) || LOCAL_DEMO_SHARE_TOKEN_PATTERN.test(token);
}

export function seededDemoShareRoute(token: string): { asset: string; intent: string } | null {
  return SEEDED_DEMO_SHARE_ROUTES.get(token) ?? null;
}

export function isOpaqueRouteToken(value: string): boolean {
  return OPAQUE_TOKEN_PATTERN.test(value);
}
