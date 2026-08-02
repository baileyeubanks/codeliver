import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import {
  computeSourceFingerprint,
  discoverSnapshotFiles,
  discoverSourceFiles,
  readSource,
  walkFiles,
} from "./discovery.mjs";
import { JOURNEY_REQUIRED_ARRAYS, matchesSurfacePattern, routeTemplateMatches } from "./manifest.mjs";
import { createSourceSnapshot } from "./snapshot.mjs";

export const CHECK_STATUSES = ["pass", "fail", "unverified", "blocked", "expired"];

export const CHECK_IDS = new Set([
  "manifest.validity",
  "inventory.route-coverage",
  "inventory.journey-route-coverage",
  "journey.obligations-complete",
  "consistency.api-consumers",
  "consistency.schema-contract",
  "consistency.version-binding",
  "consistency.approval-status-contract",
  "security.upload-filename-boundary",
  "security.upload-tenant-authority",
  "security.review-link-row-privacy",
  "security.review-link-password",
  "security.public-file-controls",
  "security.notification-recipient-authorization",
  "security.webhook-egress-guard",
  "security.auth-redirect-boundary",
  "security.cross-tenant-attack-proof",
  "security.enterprise-identity-proof",
  "product.production-settings-authority",
  "resilience.version-transaction",
  "resilience.health-contract",
  "resilience.degraded-dependencies",
  "resilience.concurrency-idempotency",
  "resilience.outbox-delivery",
  "resilience.queue-backpressure",
  "resilience.provider-portability",
  "resilience.rollback-proof",
  "resilience.dr-restore-proof",
  "performance.runtime-budgets",
  "performance.load-scenarios",
  "operations.synthetic-monitoring",
  "operations.slo-contract",
  "governance.immutable-audit-ledger",
  "governance.data-lifecycle",
  "governance.residency-encryption",
  "governance.proof-binding",
  "governance.snapshot-stability",
  "governance.backup-integrity",
  "governance.model-prompt-lineage",
  "media.source-truth-contract",
  "media.source-checksum-invariant",
  "media.draft-publication-boundary",
  "media.analysis-lineage-proof",
  "media.deterministic-replay-proof",
  "media.av-sync-proof",
  "billing.usage-contract",
  "billing.budget-enforcement",
  "billing.receipt-audit",
  "billing.usage-at-most-once",
  "billing.client-grant-continuity",
  "billing.no-direct-payment-mutation",
  "vault.provenance-contract",
  "vault.agent-scope-policy",
  "vault.human-approval",
  "vault.cross-project-retrieval-proof",
  "evidence.auth-lifecycle",
  "evidence.ingest-review-approval",
  "evidence.settings-brand-notifications",
  "evidence.sharing-public-review",
  "evidence.viewport-proof",
  "evidence.accessibility-proof",
  "commands.lint",
  "commands.typecheck",
  "commands.product-tests",
  "commands.certification-tests",
  "commands.build",
]);

const SEVERITY_ORDER = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

function result(id, title, status, options = {}) {
  if (!CHECK_STATUSES.includes(status)) throw new Error(`Unsupported check status: ${status}`);
  return {
    id,
    title,
    status,
    severity: options.severity ?? "high",
    summary: options.summary ?? "",
    evidence: options.evidence ?? [],
    residualRisk: options.residualRisk ?? null,
    durationMs: options.durationMs ?? null,
  };
}

function lineOf(source, needle) {
  const index = typeof needle === "string" ? source.indexOf(needle) : source.search(needle);
  if (index < 0) return null;
  return source.slice(0, index).split("\n").length;
}

function sourceEvidence(file, source, needle, note) {
  const line = lineOf(source, needle);
  return { type: "source", file, ...(line ? { line } : {}), note };
}

function aggregateStatus(statuses) {
  if (statuses.includes("fail")) return "fail";
  if (statuses.includes("blocked")) return "blocked";
  if (statuses.includes("expired")) return "expired";
  if (statuses.includes("unverified")) return "unverified";
  return statuses.length > 0 ? "pass" : "unverified";
}

function allManifestCheckReferences(registry) {
  return [
    ...registry.pillars.flatMap((pillar) => pillar.obligations.flatMap((obligation) => obligation.checks)),
    ...registry.journeys.flatMap((journey) => journey.checks),
  ];
}

function manifestValidity(registry) {
  const unknown = [...new Set(allManifestCheckReferences(registry).filter((id) => !CHECK_IDS.has(id)))].sort();
  const errors = [...registry.errors, ...unknown.map((id) => `Unknown check reference: ${id}`)];
  return result(
    "manifest.validity",
    "Certification manifests are valid and fully registered",
    errors.length === 0 ? "pass" : "fail",
    {
      severity: "critical",
      summary: errors.length === 0 ? `${registry.files.length} manifests loaded by directory discovery` : errors.join("; "),
      evidence: registry.files.map((file) => ({ type: "manifest", file })),
      residualRisk: errors.length ? "Invalid or unknown obligations can create false release confidence." : null,
    }
  );
}

function routeCoverage(inventory, registry) {
  const uncovered = inventory.routes.filter(
    (route) =>
      !registry.pillars.some((pillar) =>
        pillar.surfaces.some(
          (surface) => surface.kind === route.kind && matchesSurfacePattern(route.route, surface.pattern)
        )
      )
  );
  return result(
    "inventory.route-coverage",
    "Every discovered page and API belongs to a certification pillar",
    uncovered.length === 0 ? "pass" : "fail",
    {
      severity: "critical",
      summary:
        uncovered.length === 0
          ? `${inventory.routes.length} routes classified`
          : `${uncovered.length} unclassified routes: ${uncovered.map((route) => route.route).join(", ")}`,
      evidence: uncovered.map((route) => ({ type: "route", route: route.route, file: route.file })),
      residualRisk: uncovered.length ? "Unclassified routes bypass release proof obligations." : null,
    }
  );
}

function journeyRouteCoverage(inventory, registry) {
  const missing = [];
  for (const journey of registry.journeys) {
    for (const route of journey.routes) {
      const exists = inventory.routes.some(
        (candidate) => candidate.route === route || routeTemplateMatches(candidate.route, route) || routeTemplateMatches(route, candidate.route)
      );
      if (!exists) missing.push({ journey: journey.id, route });
    }
  }
  return result(
    "inventory.journey-route-coverage",
    "Every journey route resolves to a discovered page or API",
    missing.length === 0 ? "pass" : "fail",
    {
      severity: "critical",
      summary: missing.length === 0 ? `${registry.journeys.length} journeys resolve` : `${missing.length} journey routes are missing`,
      evidence: missing.map((entry) => ({ type: "missing-route", ...entry })),
      residualRisk: missing.length ? "Journey proof can target a route that does not exist." : null,
    }
  );
}

function journeyObligations(registry) {
  const defects = [];
  for (const journey of registry.journeys) {
    for (const key of JOURNEY_REQUIRED_ARRAYS) {
      if (!Array.isArray(journey[key]) || journey[key].length === 0) defects.push(`${journey.id}.${key}`);
    }
    const viewports = new Set(journey.viewports.map((viewport) => viewport.id));
    if (!viewports.has("mobile")) defects.push(`${journey.id}.viewports.mobile`);
    if (!viewports.has("desktop")) defects.push(`${journey.id}.viewports.desktop`);
  }
  return result(
    "journey.obligations-complete",
    "Journeys declare every enterprise proof dimension",
    defects.length === 0 ? "pass" : "fail",
    {
      severity: "critical",
      summary: defects.length === 0 ? "All journey proof dimensions are declared" : `Missing: ${defects.join(", ")}`,
      evidence: registry.journeys.map((journey) => ({ type: "journey", id: journey.id, file: journey._file })),
      residualRisk: defects.length ? "An incomplete journey contract can certify only the happy path." : null,
    }
  );
}

function uploadBoundaryChecks(repoRoot) {
  const uploadFile = "app/api/media/upload/route.ts";
  const tusFile = "lib/tus/store.ts";
  const upload = readSource(repoRoot, uploadFile);
  const tus = readSource(repoRoot, tusFile);
  const guard = /sanitizeMediaFilename|sanitizeObjectFilename|normalizeObjectFilename|assertSafeObjectKey|assertSafeFilename|basename\s*\(/;
  const guarded = guard.test(upload) && guard.test(tus);
  const filenameCheck = result(
    "security.upload-filename-boundary",
    "Every ingest path constrains client filenames and object keys",
    guarded ? "pass" : "fail",
    {
      severity: "critical",
      summary: guarded ? "Multipart and resumable paths contain explicit path guards" : "One or more active ingest paths join an untrusted filename without an explicit boundary guard",
      evidence: [
        sourceEvidence(uploadFile, upload, /file\.name|fileName|filename/, "multipart filename flow"),
        sourceEvidence(tusFile, tus, /fileName|filename/, "resumable filename flow"),
      ],
      residualRisk: guarded ? null : "A crafted filename may escape the intended media root or overwrite another object.",
    }
  );

  const tusRouteFile = "app/api/media/tus/route.ts";
  const tusRoute = readSource(repoRoot, tusRouteFile);
  const authority = /getOwnedProject|getProjectAccess|requireProjectAccess|requireProjectUploadTarget|assertProjectAccess|resolveProjectAuthority|authorizeProject/;
  const uploadAuthorized = authority.test(upload);
  const tusAuthorized = authority.test(tusRoute);
  const tenantCheck = result(
    "security.upload-tenant-authority",
    "Upload project authority is verified before service-role persistence",
    uploadAuthorized && tusAuthorized ? "pass" : "fail",
    {
      severity: "critical",
      summary:
        uploadAuthorized && tusAuthorized
          ? "Multipart and resumable initiation verify project authority"
          : `Missing project authority in ${[!uploadAuthorized && uploadFile, !tusAuthorized && tusRouteFile].filter(Boolean).join(", ")}`,
      evidence: [
        sourceEvidence(uploadFile, upload, /projectId|project_id/, "multipart project id"),
        sourceEvidence(tusRouteFile, tusRoute, /projectId|project_id/, "resumable project id"),
      ],
      residualRisk: uploadAuthorized && tusAuthorized ? null : "An authenticated user may attach media to a project outside their tenant.",
    }
  );
  return [filenameCheck, tenantCheck];
}

function reviewLinkChecks(repoRoot) {
  const migrationFiles = walkFiles(join(repoRoot, "supabase", "migrations"), (path) => path.endsWith(".sql"));
  const migrationText = migrationFiles.map((file) => readFileSync(file, "utf8")).join("\n");
  const normalizedMigrations = migrationText.toLowerCase();
  const publicPolicyCreatedAt = Math.max(
    normalizedMigrations.lastIndexOf('create policy "invites public by token"'),
    normalizedMigrations.lastIndexOf("create policy 'invites public by token'"),
  );
  const publicPolicyDroppedAt = Math.max(
    normalizedMigrations.lastIndexOf('drop policy if exists "invites public by token"'),
    normalizedMigrations.lastIndexOf("drop policy if exists 'invites public by token'"),
  );
  const publicPolicy = publicPolicyCreatedAt >= 0 && publicPolicyCreatedAt > publicPolicyDroppedAt;
  const policyCheck = result(
    "security.review-link-row-privacy",
    "Review invite rows are not publicly enumerable",
    publicPolicy ? "fail" : "pass",
    {
      severity: "critical",
      summary: publicPolicy ? "A review_invites SELECT policy uses USING (true)" : "No unconditional public review_invites SELECT policy detected",
      evidence: publicPolicy
        ? migrationFiles
            .map((file) => ({ file: relative(repoRoot, file), source: readFileSync(file, "utf8") }))
            .filter(({ source }) => /review_invites[\s\S]{0,220}USING\s*\(\s*true\s*\)/i.test(source))
            .map(({ file, source }) => sourceEvidence(file, source, /USING\s*\(\s*true\s*\)/i, "unconditional public policy"))
        : [],
      residualRisk: publicPolicy ? "Tokens, recipient identity, expiry, and access policy may be enumerated outside the application." : null,
    }
  );

  const inviteLibFile = "lib/review-invites.ts";
  const publicRouteFile = "app/api/review/[token]/route.ts";
  const passwordFile = "lib/security/review-password.ts";
  const unlockRouteFile = "app/api/review/[token]/unlock/route.ts";
  const inviteLib = readSource(repoRoot, inviteLibFile);
  const publicRoute = readSource(repoRoot, publicRouteFile);
  const passwordSource = readSource(repoRoot, passwordFile);
  const unlockRoute = readSource(repoRoot, unlockRouteFile);
  const passwordFieldExists = /password_hash/i.test(migrationText);
  const passwordEnforced =
    /password_hash/.test(inviteLib) &&
    /getAuthorizedReviewInvite/.test(publicRoute) &&
    /verifyReviewPassword/.test(unlockRoute) &&
    /scrypt/.test(passwordSource) &&
    /timingSafeEqual/.test(passwordSource) &&
    /httpOnly:\s*true/.test(unlockRoute);
  const passwordCheck = result(
    "security.review-link-password",
    "Configured review-link passwords are verified server-side",
    !passwordFieldExists || passwordEnforced ? "pass" : "fail",
    {
      severity: "critical",
      summary: !passwordFieldExists ? "No password feature is declared" : passwordEnforced ? "Password hash verification detected" : "password_hash exists without a server-side verification path",
      evidence: [
        sourceEvidence(inviteLibFile, inviteLib, /getAuthorizedReviewInvite|password_hash/, "review invite validation"),
        sourceEvidence(passwordFile, passwordSource, /scrypt|timingSafeEqual/, "password verification"),
        sourceEvidence(unlockRouteFile, unlockRoute, /verifyReviewPassword|httpOnly/, "password unlock"),
        sourceEvidence(publicRouteFile, publicRoute, /getAuthorizedReviewInvite/, "public review access"),
      ],
      residualRisk: passwordFieldExists && !passwordEnforced ? "A link presented as password-protected can remain accessible with only the token." : null,
    }
  );

  const watermarkFile = "app/api/sharing/watermark/route.ts";
  const mediaRouteFile = "app/api/review/[token]/media/route.ts";
  const watermark = readSource(repoRoot, watermarkFile);
  const mediaRoute = readSource(repoRoot, mediaRouteFile);
  const exposesOriginal =
    /file_url\s*:\s*versionLookup\.version\.file_url/.test(publicRoute) ||
    /download_url\s*:\s*versionLookup\.version\.file_url/.test(publicRoute);
  const watermarkPassThrough =
    /url\s*:\s*versionLookup\.version\.(?:file_url|fileUrl)/.test(watermark);
  const deliveryBoundaryEnforced =
    /getAuthorizedReviewInvite/.test(mediaRoute) &&
    /download\s*&&\s*invite\.download_enabled\s*!==\s*true/.test(mediaRoute) &&
    /invite\.watermark_enabled\s*===\s*true/.test(mediaRoute) &&
    /streamTrustedMediaPath/.test(mediaRoute) &&
    /proxyExternalMedia/.test(mediaRoute);
  const publicControls = result(
    "security.public-file-controls",
    "Download and watermark policy is enforced at the media-delivery boundary",
    exposesOriginal || watermarkPassThrough || !deliveryBoundaryEnforced ? "fail" : "pass",
    {
      severity: "critical",
      summary:
        exposesOriginal || watermarkPassThrough
          ? "Public review or watermark response appears to expose/pass through the original media URL"
          : !deliveryBoundaryEnforced
            ? "The public media route does not enforce every review-link file control"
            : "Original media stays behind the token-scoped delivery boundary",
      evidence: [
        sourceEvidence(publicRouteFile, publicRoute, /mediaUrl|file_url/, "public media URL"),
        sourceEvidence(mediaRouteFile, mediaRoute, /download_enabled|watermark_enabled|streamTrustedMediaPath/, "public media boundary"),
        sourceEvidence(watermarkFile, watermark, /\/media|watermark_required/, "watermark response"),
      ],
      residualRisk:
        exposesOriginal || watermarkPassThrough || !deliveryBoundaryEnforced
          ? "UI-only download controls can be bypassed and required branding may not be applied."
          : null,
    }
  );

  const shareInsertions = [];
  for (const file of discoverSourceFiles(repoRoot, ["app", "lib"])) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/\.from\(["']review_invites["']\)\s*\.insert\(([\s\S]{0,1600}?)\)(?:\.|;)/g)) {
      const context = source.slice(Math.max(0, match.index - 2600), match.index + match[0].length);
      shareInsertions.push({
        file: relative(repoRoot, file),
        line: source.slice(0, match.index).split("\n").length,
        versionBound: /version_id\s*:/.test(match[1]) || /version_id\s*:/.test(context),
      });
    }
  }
  const allInsertsVersionBound = shareInsertions.length > 0 && shareInsertions.every((insertion) => insertion.versionBound);
  const reviewInviteTable = migrationText.match(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?review_invites\s*\(([\s\S]*?)\);/i)?.[1] ?? "";
  const versionNotNull =
    /version_id\s+uuid\s+not\s+null/i.test(reviewInviteTable) ||
    /alter\s+table\s+(?:public\.)?review_invites[\s\S]{0,500}?alter\s+column\s+version_id\s+set\s+not\s+null/i.test(migrationText);
  const versionBound = allInsertsVersionBound && versionNotNull;
  const versionCheck = result(
    "consistency.version-binding",
    "Every share invite is bound to an immutable asset version",
    versionBound ? "pass" : "fail",
    {
      severity: "critical",
      summary: versionBound
        ? "Every review invite insert is version-bound and the column is required"
        : !allInsertsVersionBound
          ? "One or more review invite insertions omit version_id"
          : "Review invite insertions bind versions, but review_invites.version_id remains nullable",
      evidence: shareInsertions.map((insertion) => ({ type: "share-insert", ...insertion })),
      residualRisk: versionBound ? null : "A legacy, internal, or failed backfill can leave a link without immutable version authority.",
    }
  );
  return [policyCheck, passwordCheck, publicControls, versionCheck];
}

function approvalContractCheck(repoRoot) {
  const migrationFiles = walkFiles(join(repoRoot, "supabase", "migrations"), (path) => path.endsWith(".sql"));
  const migrations = migrationFiles.map((file) => readFileSync(file, "utf8")).join("\n");
  const routeFile = "app/api/review/[token]/approvals/route.ts";
  const route = readSource(repoRoot, routeFile);
  const routeUsesStatus = /approved_with_changes/.test(route);
  const schemaAllowsStatus = /approved_with_changes/.test(migrations);
  return result(
    "consistency.approval-status-contract",
    "Approval API statuses match the database constraint",
    !routeUsesStatus || schemaAllowsStatus ? "pass" : "fail",
    {
      severity: "critical",
      summary: routeUsesStatus && !schemaAllowsStatus ? "API accepts approved_with_changes but no migration allows it" : "Approval status contract is aligned",
      evidence: [sourceEvidence(routeFile, route, "approved_with_changes", "API status")],
      residualRisk: routeUsesStatus && !schemaAllowsStatus ? "A valid UI decision can fail at persistence time." : null,
    }
  );
}

function schemaContractCheck(repoRoot) {
  const migrationFiles = walkFiles(join(repoRoot, "supabase", "migrations"), (path) => path.endsWith(".sql"));
  const relations = new Set();
  const relationDeclaration =
    /create\s+(?:or\s+replace\s+)?(?:materialized\s+)?(?:table|view)\s+(?:if\s+not\s+exists\s+)?(?:(?:"?[a-zA-Z0-9_]+"?)\s*\.\s*)?"?([a-zA-Z0-9_]+)"?/gi;
  for (const file of migrationFiles) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(relationDeclaration)) {
      relations.add(match[1]);
    }
  }
  const references = new Map();
  for (const file of discoverSourceFiles(repoRoot, ["app", "lib"])) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/\.from\(\s*["']([a-zA-Z0-9_]+)["']\s*\)/g)) {
      const prefix = source.slice(Math.max(0, match.index - 120), match.index);
      if (/\.storage\s*$|\.storage[\s\S]{0,80}$/m.test(prefix)) continue;
      const table = match[1];
      if (!references.has(table)) references.set(table, []);
      references.get(table).push({ file: relative(repoRoot, file), line: source.slice(0, match.index).split("\n").length });
    }
  }
  const missing = [...references.keys()].filter((table) => !relations.has(table)).sort();
  return result(
    "consistency.schema-contract",
    "Runtime relation references exist in repository migrations",
    missing.length === 0 ? "pass" : "fail",
    {
      severity: "critical",
      summary: missing.length === 0 ? `${references.size} referenced relations are declared` : `Missing migration declarations: ${missing.join(", ")}`,
      evidence: missing.flatMap((table) => references.get(table).map((location) => ({ type: "table-reference", table, ...location }))),
      residualRisk: missing.length ? "Runtime paths can fail after deploy because the expected table is absent." : null,
    }
  );
}

function apiConsumerCheck(repoRoot, inventory) {
  const missing = [];
  for (const file of discoverSourceFiles(repoRoot, ["app", "components", "lib"])) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/fetch\(\s*(["'`])(\/api\/[^"'`]+)\1/g)) {
      const rawPath = match[2];
      if (rawPath.includes("${")) continue;
      const path = rawPath.split("?")[0];
      const exists = inventory.apis.some((api) => routeTemplateMatches(api.route, path));
      if (!exists) {
        missing.push({ file: relative(repoRoot, file), line: source.slice(0, match.index).split("\n").length, path });
      }
    }
  }
  return result(
    "consistency.api-consumers",
    "Literal client API calls resolve to route handlers",
    missing.length === 0 ? "pass" : "fail",
    {
      severity: "high",
      summary: missing.length === 0 ? "All literal API consumers resolve" : `${missing.length} literal API consumers have no route`,
      evidence: missing.map((entry) => ({ type: "orphan-api-consumer", ...entry })),
      residualRisk: missing.length ? "Visible controls can call nonexistent endpoints and silently fail." : null,
    }
  );
}

function notificationAndWebhookChecks(repoRoot) {
  const notificationFile = "app/api/notifications/send/route.ts";
  const notification = readSource(repoRoot, notificationFile);
  const shareNotificationFile = "lib/sharing/share-api.ts";
  const shareNotification = readSource(repoRoot, shareNotificationFile);
  const acceptsTarget = /user_id/.test(notification);
  const targetAuthorized = /recipient\.user_id\s*!==\s*user\.id|user_id\s*===\s*user\.id|requireTeamRole|authorizeRecipient|assertNotificationAuthority|getOwnedProject/.test(notification);
  const managedShareFanout =
    /dataSchema\s*===\s*CO_PRODUCTION_DATA_SCHEMA/.test(shareNotification) &&
    /dispatchDurableNotification/.test(shareNotification) &&
    /authorityReference/.test(shareNotification) &&
    /delivery_status:\s*summarizeShareDeliveryStatus/.test(shareNotification);
  const notificationCheck = result(
    "security.notification-recipient-authorization",
    "Outbound notification recipients are server-authorized",
    (!acceptsTarget || targetAuthorized) && managedShareFanout ? "pass" : "fail",
    {
      severity: "critical",
      summary:
        acceptsTarget && !targetAuthorized
          ? "Authenticated callers can select user_id without a detected tenant or role check"
          : !managedShareFanout
            ? "Managed share notifications can bypass durable delivery authority"
            : "Recipient authority and managed share fanout are constrained",
      evidence: [
        sourceEvidence(notificationFile, notification, /user_id/, "caller-selected recipient"),
        sourceEvidence(
          shareNotificationFile,
          shareNotification,
          /dispatchDurableNotification/,
          "managed share delivery boundary",
        ),
      ],
      residualRisk:
        acceptsTarget && !targetAuthorized
          ? "A user can create or send a notification to another account."
          : !managedShareFanout
            ? "A share link can be created while its external notification bypasses the durable queue."
            : null,
    }
  );

  const webhookFile = "app/api/webhooks/route.ts";
  const webhook = readSource(repoRoot, webhookFile);
  const webhookDeliveryFile = "lib/security/webhook-delivery.ts";
  const webhookDelivery = readSource(repoRoot, webhookDeliveryFile);
  const webhookOutboxFile = "lib/security/webhook-outbox.ts";
  const webhookOutbox = readSource(repoRoot, webhookOutboxFile);
  const webhookMigrationFile =
    "supabase/migrations/20260715224500_webhook_delivery_outbox.sql";
  const webhookMigration = readSource(repoRoot, webhookMigrationFile);
  const approvalWebhookFile = "lib/approval-decisions.ts";
  const approvalWebhook = readSource(repoRoot, approvalWebhookFile);
  const webhookImplementation = `${webhook}\n${webhookDelivery}\n${webhookOutbox}\n${webhookMigration}\n${approvalWebhook}`;
  const protections = {
    urlValidation: /new URL\(|validateWebhookUrl|assertPublicUrl|assertSafeWebhookUrl/.test(webhookImplementation),
    privateNetworkBlock: /private|reserved|loopback|linkLocal|127\.0\.0\.1|169\.254|isPrivate|isPublicWebhookAddress/i.test(webhookImplementation),
    timeout: /AbortSignal\.timeout|AbortController|timeout/.test(webhookImplementation),
    hmac: /createHmac|timingSafeEqual|hmac|signWebhookPayload/i.test(webhookImplementation),
    deliveryIdentity:
      /X-Co-Production-Delivery-Id/.test(webhookDelivery) &&
      /deliveryId[\s\S]*attempt[\s\S]*body/.test(webhookDelivery),
    durableEnqueue:
      /enqueueWebhookOutboxDelivery/.test(webhook) &&
      /enqueueWebhookOutboxDelivery/.test(approvalWebhook),
    idempotency:
      /Idempotency-Key is required/.test(webhook) &&
      /UNIQUE\s*\(webhook_id, idempotency_key\)/.test(webhookMigration) &&
      /webhook_outbox_idempotency_conflict/.test(webhookMigration),
    leaseRetry:
      /FOR UPDATE SKIP LOCKED/.test(webhookMigration) &&
      /claim_webhook_deliveries/.test(webhookMigration) &&
      /settle_webhook_delivery/.test(webhookMigration) &&
      /webhookOutboxRetryAt/.test(webhookOutbox),
  };
  const missing = Object.entries(protections).filter(([, present]) => !present).map(([name]) => name);
  const webhookCheck = result(
    "security.webhook-egress-guard",
    "Webhook delivery is SSRF-safe, time-bounded, signed, and retryable",
    missing.length === 0 ? "pass" : "fail",
    {
      severity: "critical",
      summary: missing.length === 0 ? "Webhook egress protections detected" : `Missing webhook protections: ${missing.join(", ")}`,
      evidence: [
        { type: "source", file: webhookFile, note: "webhook delivery route" },
        { type: "source", file: webhookDeliveryFile, note: "webhook delivery boundary" },
        { type: "source", file: webhookOutboxFile, note: "webhook outbox contract" },
        { type: "source", file: webhookMigrationFile, note: "webhook queue authority" },
      ],
      residualRisk: missing.length ? "A webhook can target private infrastructure, hang a worker, be forged, or be lost." : null,
    }
  );
  return [notificationCheck, webhookCheck];
}

function authRedirectCheck(repoRoot) {
  const file = "app/login/page.tsx";
  const source = readSource(repoRoot, file);
  const readsNext = /(?:searchParams|params).*next|\.get\(["']next["']\)/s.test(source);
  const hasBoundary = /resolveSafeReturnPath|safeRedirect|sanitizeRedirect|startsWith\(["']\/["']\)|new URL\([^)]*,\s*(?:window\.)?location\.origin/.test(source);
  return result(
    "security.auth-redirect-boundary",
    "Post-authentication redirects remain same-origin",
    !readsNext || hasBoundary ? "pass" : "fail",
    {
      severity: "high",
      summary: readsNext && !hasBoundary ? "Login consumes a next parameter without a detected same-origin boundary" : "No open redirect pattern detected",
      evidence: [sourceEvidence(file, source, /next/, "redirect target")],
      residualRisk: readsNext && !hasBoundary ? "A crafted login link can redirect a user to an attacker-controlled destination." : null,
    }
  );
}

function productionSettingsCheck(repoRoot) {
  const file = "app/(dashboard)/settings/page.tsx";
  const managedFile = "components/auth/ManagedSettingsSurface.tsx";
  const demoFile = "components/auth/DemoSettingsSurface.tsx";
  const source = readSource(repoRoot, file);
  const managedSource = readSource(repoRoot, managedFile);
  const demoSource = readSource(repoRoot, demoFile);
  const explicitBoundary =
    /demoMode\s*\?\s*<DemoSettingsSurface\s*\/>\s*:\s*<ManagedSettingsSurface\s*\/>/.test(source);
  const managedUsesLocalAuthority =
    /useDemoWorkspace|demoWorkspace|localStorage|sessionStorage/.test(managedSource);
  const serverPersistence =
    /useIdentityContext\(true\)/.test(managedSource) &&
    /NotificationPreferences/.test(managedSource) &&
    /ManagedIdentitySettings/.test(managedSource);
  const demoIsExplicit = /useDemoWorkspace|useEnterpriseIdentityDemo/.test(demoSource);
  const passed =
    explicitBoundary &&
    !managedUsesLocalAuthority &&
    serverPersistence &&
    demoIsExplicit;
  return result(
    "product.production-settings-authority",
    "Production settings use a server-backed workspace authority",
    passed ? "pass" : "fail",
    {
      severity: "critical",
      summary: passed
        ? "Managed settings are isolated from explicit demo-local authority"
        : managedUsesLocalAuthority
          ? "Managed settings still consume browser-local demo authority"
          : !explicitBoundary
            ? "Settings do not expose an explicit managed/demo authority boundary"
            : !serverPersistence
              ? "Managed settings have no complete server persistence adapter"
              : "Demo authority is not isolated in an explicit module",
      evidence: [
        sourceEvidence(file, source, /DemoSettingsSurface|ManagedSettingsSurface/, "settings authority router"),
        sourceEvidence(managedFile, managedSource, /useIdentityContext|NotificationPreferences|ManagedIdentitySettings/, "managed persistence authority"),
        sourceEvidence(demoFile, demoSource, /useDemoWorkspace|useEnterpriseIdentityDemo/, "explicit demo-local authority"),
      ],
      residualRisk: passed ? null : "Users can believe preferences or branding are saved when they exist only in one browser.",
    }
  );
}

function versionTransactionCheck(repoRoot) {
  const file = "app/api/assets/[id]/versions/route.ts";
  const source = readSource(repoRoot, file);
  const multiStep = (source.match(/\.(?:insert|update|delete)\s*\(/g) ?? []).length > 1;
  const transaction =
    /\.rpc\(\s*["']create_asset_version["']/.test(source) ||
    /transaction|serializable|advisory_lock/i.test(source);
  return result(
    "resilience.version-transaction",
    "Version creation, promotion, comment carry-forward, and approval reset are atomic",
    !multiStep || transaction ? "pass" : "fail",
    {
      severity: "critical",
      summary: multiStep && !transaction ? "Multi-step version mutation has no detected transaction or transactional RPC" : "Version mutation has an atomic boundary",
      evidence: [sourceEvidence(file, source, /\.insert\(|\.update\(/, "version mutation sequence")],
      residualRisk: multiStep && !transaction ? "Concurrent or failed version creation can leave duplicate numbers and partial state." : null,
    }
  );
}

function draftPublicationBoundaryCheck(repoRoot) {
  const files = [
    "app/api/assets/[id]/edit-decisions/route.ts",
    "app/api/review/[token]/edit-decisions/route.ts",
    "app/api/ai/transcribe/route.ts",
  ];
  const sources = files.map((file) => ({ file, source: readSource(repoRoot, file) }));
  const mutation = sources.find(({ source }) =>
    /\.from\(["']assets["']\)[\s\S]{0,500}?\.update\([\s\S]{0,300}?(?:file_url|current_version|status\s*:)/i.test(source)
  );
  return result(
    "media.draft-publication-boundary",
    "Draft transcript, analysis, and edit actions do not publish or replace source media",
    mutation ? "fail" : "pass",
    {
      severity: "critical",
      summary: mutation ? `Draft path mutates publication authority in ${mutation.file}` : "No draft-path asset publication mutation detected",
      evidence: mutation ? [sourceEvidence(mutation.file, mutation.source, /\.from\(["']assets["']\)/, "draft asset mutation")] : [],
      residualRisk: mutation ? "A draft or AI action can silently replace the current source, version, or approval authority." : null,
    }
  );
}

function directPaymentMutationCheck(repoRoot) {
  const findings = [];
  for (const file of discoverSourceFiles(repoRoot, ["app/api"])) {
    const source = readFileSync(file, "utf8");
    const expression = /(?:paymentIntents|checkout\.sessions|subscriptions|invoiceItems|billing\.meterEvents|stripe\.[a-zA-Z.]+)\.create\s*\(/g;
    for (const match of source.matchAll(expression)) {
      findings.push({ file: relative(repoRoot, file), line: source.slice(0, match.index).split("\n").length });
    }
  }
  return result(
    "billing.no-direct-payment-mutation",
    "Product request handlers do not directly create payment activity",
    findings.length === 0 ? "pass" : "fail",
    {
      severity: "critical",
      summary: findings.length === 0 ? "No direct payment creation call detected in API handlers" : `${findings.length} direct payment creation calls detected`,
      evidence: findings.map((finding) => ({ type: "source", ...finding })),
      residualRisk: findings.length ? "A product request can move money without settled usage, reconciliation, or explicit payment authority." : null,
    }
  );
}

function healthContractCheck(repoRoot) {
  const files = [
    "app/api/health/live/route.ts",
    "app/api/health/ready/route.ts",
    "app/api/health/dependencies/route.ts",
    "app/api/health/_lib/checks.ts",
  ];
  const missing = files.filter((file) => !existsSync(join(repoRoot, file)));
  const source = files.map((file) => readSource(repoRoot, file)).join("\n");
  const semantics = /503/.test(source) && /dependencies|readiness/i.test(source) && /no-store/i.test(source);
  return result(
    "resilience.health-contract",
    "Liveness and dependency readiness have distinct fail-safe contracts",
    missing.length === 0 && semantics ? "pass" : "fail",
    {
      severity: "critical",
      summary: missing.length ? `Missing health files: ${missing.join(", ")}` : semantics ? "Liveness, readiness, and dependency detail routes are present" : "Health routes lack failure/status semantics",
      evidence: files.map((file) => ({ type: "source", file })),
      residualRisk: missing.length || !semantics ? "Traffic can be routed to an instance that cannot serve required dependencies." : null,
    }
  );
}

function immutableAuditCheck(repoRoot) {
  const migrations = walkFiles(join(repoRoot, "supabase", "migrations"), (path) => path.endsWith(".sql"))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  const ledger = /create\s+table[^;]*(?:audit_event|audit_ledger)/i.test(migrations);
  const immutable = /prevent.*(?:update|delete)|raise exception|append.only|revoke\s+(?:update|delete)/i.test(migrations);
  return result(
    "governance.immutable-audit-ledger",
    "Security and workflow events use an append-only audit authority",
    ledger && immutable ? "pass" : "fail",
    {
      severity: "critical",
      summary: ledger && immutable ? "Immutable audit ledger controls detected" : "No append-only audit ledger with update/delete prevention detected",
      evidence: [],
      residualRisk: ledger && immutable ? null : "Activity records may be incomplete, mutable, or insufficient for regulated traceability.",
    }
  );
}

function proofFileResult(repoRoot, journey, binding) {
  const file = join(repoRoot, "scripts", "certification", "proofs", `${journey.id}.json`);
  const display = relative(repoRoot, file);
  if (!existsSync(file)) {
    return { journeyId: journey.id, status: "unverified", summary: "No commit-bound journey proof receipt", evidence: [{ type: "expected-proof", file: display }] };
  }
  try {
    const proof = JSON.parse(readFileSync(file, "utf8"));
    if (proof.journeyId !== journey.id || proof.commit !== binding.commit || proof.sourceFingerprint !== binding.sourceFingerprint) {
      return { journeyId: journey.id, status: "fail", summary: "Proof is not bound to the current source", evidence: [{ type: "proof", file: display }] };
    }
    const ageMs = binding.now.getTime() - new Date(proof.capturedAt).getTime();
    const ttlMs = (journey.proofTtlDays ?? 7) * 24 * 60 * 60 * 1000;
    if (!Number.isFinite(ageMs) || ageMs > ttlMs) {
      return { journeyId: journey.id, status: "expired", summary: "Proof exceeded its TTL", evidence: [{ type: "proof", file: display, capturedAt: proof.capturedAt }] };
    }
    const required = [
      "desktop",
      "mobile",
      "accessibility",
      "persistence",
      "security",
      "performance",
      "degradedDependencies",
      "concurrency",
      "rollback",
    ];
    const missing = required.filter((key) => !proof.checks?.[key]);
    const failed = Object.entries(proof.checks ?? {}).filter(([, check]) => check.status !== "pass").map(([key]) => key);
    return {
      journeyId: journey.id,
      status: missing.length || failed.length ? "fail" : "pass",
      summary: missing.length ? `Missing proof dimensions: ${missing.join(", ")}` : failed.length ? `Failed proof dimensions: ${failed.join(", ")}` : "Commit-bound journey proof is current",
      evidence: [{ type: "proof", file: display, capturedAt: proof.capturedAt }],
      proof,
    };
  } catch (error) {
    return { journeyId: journey.id, status: "fail", summary: `Invalid proof JSON: ${error instanceof Error ? error.message : String(error)}`, evidence: [{ type: "proof", file: display }] };
  }
}

function evidenceChecks(repoRoot, registry, binding) {
  const proofs = new Map(registry.journeys.map((journey) => [journey.id, proofFileResult(repoRoot, journey, binding)]));
  const grouped = [
    ["evidence.auth-lifecycle", "Authentication lifecycle has current end-to-end proof", ["auth-lifecycle"]],
    ["evidence.ingest-review-approval", "Ingest, review, version, and approval have current end-to-end proof", ["project-ingest-review-approval", "review-annotation-approval"]],
    ["evidence.settings-brand-notifications", "Settings, branding, and notifications have current end-to-end proof", ["settings-brand-notifications"]],
    ["evidence.sharing-public-review", "Public sharing and review have current end-to-end proof", ["sharing-public-review"]],
  ].map(([id, title, journeyIds]) => {
    const selected = journeyIds.map((journeyId) => proofs.get(journeyId)).filter(Boolean);
    const status = aggregateStatus(selected.map((proof) => proof.status));
    return result(id, title, status, {
      severity: "critical",
      summary: selected.map((proof) => `${proof.journeyId}: ${proof.summary}`).join("; "),
      evidence: selected.flatMap((proof) => proof.evidence),
      residualRisk: status === "pass" ? null : "The current source lacks fresh, commit-bound journey evidence.",
    });
  });

  const allProofs = [...proofs.values()];
  const dimensionCheck = (id, title, dimensions) => {
    const statuses = allProofs.map((entry) => {
      if (entry.status !== "pass") return entry.status;
      return dimensions.every((dimension) => entry.proof?.checks?.[dimension]?.status === "pass") ? "pass" : "fail";
    });
    const status = aggregateStatus(statuses);
    return result(id, title, status, {
      severity: "high",
      summary: status === "pass" ? `${allProofs.length} journeys have current ${dimensions.join(" and ")} proof` : "One or more journeys lack current proof",
      evidence: allProofs.flatMap((proof) => proof.evidence),
      residualRisk: status === "pass" ? null : "Existing screenshots or manual notes are not commit-bound executable evidence.",
    });
  };

  return [
    ...grouped,
    dimensionCheck("evidence.viewport-proof", "Every journey has desktop and mobile proof", ["desktop", "mobile"]),
    dimensionCheck("evidence.accessibility-proof", "Every journey has automated and keyboard accessibility proof", ["accessibility"]),
  ];
}

function declaredButUnprovenChecks(repoRoot, binding) {
  const proofDirectory = join(repoRoot, "scripts", "certification", "proofs");
  const unproven = (id, title, severity, proofFile, residualRisk) => {
    const path = join(proofDirectory, proofFile);
    if (!existsSync(path)) {
      return result(id, title, "unverified", {
        severity,
        summary: `Expected proof receipt: scripts/certification/proofs/${proofFile}`,
        evidence: [{ type: "expected-proof", file: `scripts/certification/proofs/${proofFile}` }],
        residualRisk,
      });
    }
    let proof;
    try {
      proof = JSON.parse(readFileSync(path, "utf8"));
    } catch (error) {
      return result(id, title, "fail", {
        severity,
        summary: `Operational proof is invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
        evidence: [{ type: "proof", file: `scripts/certification/proofs/${proofFile}` }],
        residualRisk,
      });
    }
    const capturedAt = new Date(proof.capturedAt);
    const ageMs = binding.now.getTime() - capturedAt.getTime();
    const expired = !Number.isFinite(ageMs) || ageMs > 30 * 24 * 60 * 60 * 1000;
    const bound = proof.commit === binding.commit && proof.sourceFingerprint === binding.sourceFingerprint;
    const valid =
      proof.schemaVersion === 1 &&
      proof.checkId === id &&
      proof.status === "pass" &&
      Array.isArray(proof.artifacts) &&
      proof.artifacts.length > 0;
    const status = expired ? "expired" : bound && valid ? "pass" : "fail";
    return result(id, title, status, {
      severity,
      summary: expired
        ? `Operational proof expired: ${proofFile}`
        : bound && valid
          ? `Current operational proof: ${proofFile}`
          : `Operational proof is not valid and bound to current source: ${proofFile}`,
      evidence: [{ type: "proof", file: `scripts/certification/proofs/${proofFile}`, capturedAt: proof.capturedAt }],
      residualRisk: status === "pass" ? null : residualRisk,
    });
  };
  return [
    unproven("security.cross-tenant-attack-proof", "Cross-tenant attack matrix passes for every resource", "critical", "cross-tenant-attacks.json", "No executable negative authorization proof covers every resource and role."),
    unproven("security.enterprise-identity-proof", "SSO, MFA, lifecycle, and session policy are certified", "high", "enterprise-identity.json", "Enterprise identity assurance remains unverified."),
    unproven("resilience.degraded-dependencies", "Required dependency failures are fault-injected", "critical", "degraded-dependencies.json", "Dependency failure behavior is declared but not attack-tested."),
    unproven("resilience.concurrency-idempotency", "Concurrency and replay scenarios have durable proof", "critical", "concurrency-idempotency.json", "Parallel requests and retries can create duplicate or partial side effects."),
    unproven("resilience.outbox-delivery", "Outbound delivery uses a tested durable outbox", "critical", "outbox-delivery.json", "Direct provider calls can be lost or duplicated without durable retry authority."),
    unproven("resilience.queue-backpressure", "Expensive jobs use bounded queues and backpressure", "critical", "queue-backpressure.json", "Uploads, analysis, and renders can overwhelm workers or dependencies."),
    unproven("resilience.provider-portability", "Provider failover and portability are contract-tested", "high", "provider-portability.json", "Provider-specific assumptions can strand media or prevent failover."),
    unproven("resilience.rollback-proof", "Application and schema rollback are rehearsed", "critical", "rollback.json", "Release rollback remains procedural rather than proven."),
    unproven("resilience.dr-restore-proof", "Database and media restore meet RPO and RTO", "critical", "disaster-recovery.json", "Backups have not been proven restorable within objectives."),
    unproven("performance.runtime-budgets", "Journey latency and responsiveness budgets pass", "high", "performance-runtime.json", "No production-like latency evidence enforces the declared budgets."),
    unproven("performance.load-scenarios", "Scale, burst, and soak scenarios pass", "high", "performance-load.json", "Capacity limits and failure thresholds remain unknown."),
    unproven("operations.synthetic-monitoring", "Synthetic user journeys continuously measure SLOs", "high", "synthetic-monitoring.json", "User-visible failures may not page before clients notice."),
    unproven("governance.data-lifecycle", "Retention, deletion, export, and legal hold are enforced", "critical", "data-lifecycle.json", "Data lifecycle policy has no executable enforcement proof."),
    unproven("governance.residency-encryption", "Residency and encryption controls are attested", "critical", "residency-encryption.json", "Storage location and cryptographic controls remain unverified."),
    unproven("governance.backup-integrity", "Backups are encrypted, complete, and integrity-checked", "critical", "backup-integrity.json", "Backup existence does not prove completeness or restore integrity."),
    unproven("governance.model-prompt-lineage", "Model, prompt, policy, and evaluation lineage is complete", "critical", "model-prompt-lineage.json", "AI output cannot be explained or reproduced without exact execution lineage."),
    unproven("media.source-truth-contract", "Source and derived media truth objects remain distinct", "critical", "media-source-truth.json", "Transcript or edit operations may overwrite immutable source truth."),
    unproven("media.source-checksum-invariant", "Source checksums remain unchanged before explicit publication", "critical", "media-source-checksum.json", "Source mutation can destroy the ability to replay or verify a derived edit."),
    unproven("media.analysis-lineage-proof", "Analysis runs bind source checksum, pipeline, configuration, provider, and model", "critical", "media-analysis-lineage.json", "Candidates cannot be calibrated or reproduced without immutable analysis lineage."),
    unproven("media.deterministic-replay-proof", "Governed media and agent decisions replay deterministically", "critical", "deterministic-replay.json", "A decision cannot be independently reproduced from retained inputs and lineage."),
    unproven("media.av-sync-proof", "Rendered A/V sync remains within one frame and duration matches the compiled EDL", "critical", "media-av-sync.json", "A technically successful render can still drift, truncate, or violate the approved edit decision list."),
    unproven("billing.usage-contract", "Billable operations implement estimate, reserve, commit or release, and receipt", "critical", "billing-usage-contract.json", "Compute can execute without a complete commercial accounting lifecycle."),
    unproven("billing.budget-enforcement", "Tenant, project, user, and operation caps fail closed", "critical", "billing-budget-enforcement.json", "Concurrent or agent-triggered work can exceed approved budgets."),
    unproven("billing.receipt-audit", "Usage receipts preserve rate, source operation, funding authority, and settlement", "critical", "billing-receipt-audit.json", "Charges and entitlements cannot be reconstructed or disputed reliably."),
    unproven("billing.usage-at-most-once", "Retries and duplicate jobs commit customer usage at most once", "critical", "billing-usage-at-most-once.json", "A retried job can debit the customer more than once."),
    unproven("billing.client-grant-continuity", "Commissioned approved deliverables remain accessible independent of producer subscription", "critical", "billing-client-grant-continuity.json", "A client final can be paywalled or revoked by unrelated producer billing state."),
    unproven("vault.provenance-contract", "Vault objects preserve scope, provenance, checksum, permissions, and retention", "critical", "vault-provenance.json", "Knowledge can leak across projects or lose its evidentiary basis."),
    unproven("vault.agent-scope-policy", "Agent retrieval and mutation are entitlement, source, policy, and budget scoped", "critical", "vault-agent-scope.json", "Agents can retrieve unauthorized context or mutate beyond delegated capability."),
    unproven("vault.human-approval", "High-impact agent, factual, rights, and edit decisions require human acceptance", "critical", "vault-human-approval.json", "Automation can publish unsupported or rights-sensitive work without accountable approval."),
    unproven("vault.cross-project-retrieval-proof", "Vault retrieval cannot cross project authority", "critical", "vault-cross-project-retrieval.json", "An agent can expose one client's evidence, brand rules, or rights data to another project."),
  ];
}

function sloContractCheck(registry) {
  const defects = [];
  for (const pillar of registry.pillars) {
    if (!Array.isArray(pillar.slos) || pillar.slos.length === 0) defects.push(`${pillar.id}: no SLOs`);
    for (const slo of pillar.slos ?? []) {
      if (!slo.id || !slo.indicator) defects.push(`${pillar.id}: malformed SLO`);
      if (slo.target === undefined && slo.targetMs === undefined && slo.targetMinutes === undefined) {
        defects.push(`${pillar.id}.${slo.id}: no target`);
      }
    }
  }
  return result("operations.slo-contract", "Every horizon declares measurable SLIs, targets, and budgets", defects.length ? "fail" : "pass", {
    severity: "high",
    summary: defects.length ? defects.join("; ") : `${registry.pillars.reduce((count, pillar) => count + pillar.slos.length, 0)} SLO contracts declared`,
    residualRisk: defects.length ? "Release decisions cannot consume an undefined reliability budget." : null,
  });
}

function proofBindingCheck(binding) {
  const complete =
    /^[0-9a-f]{40}$/i.test(binding.commit ?? "") &&
    /^[0-9a-f]{64}$/i.test(binding.sourceFingerprint ?? "") &&
    /^[0-9a-f]{64}$/i.test(binding.dirtyFingerprint ?? "") &&
    Number.isInteger(binding.candidateFileCount) &&
    binding.candidateFileCount > 0;
  return result("governance.proof-binding", "Certification receipts bind commit and dirty source state", complete ? "pass" : "fail", {
    severity: "critical",
    summary: complete ? `Bound ${binding.candidateFileCount} files to ${binding.commit.slice(0, 12)} and source ${binding.sourceFingerprint.slice(0, 12)}` : "Source binding is incomplete",
    evidence: [{ type: "source-binding", commit: binding.commit, sourceFingerprint: binding.sourceFingerprint, dirtyFingerprint: binding.dirtyFingerprint, candidateFileCount: binding.candidateFileCount }],
    residualRisk: complete ? null : "A receipt could describe code other than the release candidate.",
  });
}

export function runStaticChecks({ repoRoot, inventory, registry, binding }) {
  return [
    manifestValidity(registry),
    routeCoverage(inventory, registry),
    journeyRouteCoverage(inventory, registry),
    journeyObligations(registry),
    apiConsumerCheck(repoRoot, inventory),
    schemaContractCheck(repoRoot),
    ...uploadBoundaryChecks(repoRoot),
    ...reviewLinkChecks(repoRoot),
    approvalContractCheck(repoRoot),
    ...notificationAndWebhookChecks(repoRoot),
    authRedirectCheck(repoRoot),
    productionSettingsCheck(repoRoot),
    versionTransactionCheck(repoRoot),
    draftPublicationBoundaryCheck(repoRoot),
    directPaymentMutationCheck(repoRoot),
    healthContractCheck(repoRoot),
    immutableAuditCheck(repoRoot),
    sloContractCheck(registry),
    proofBindingCheck(binding),
    ...evidenceChecks(repoRoot, registry, binding),
    ...declaredButUnprovenChecks(repoRoot, binding),
  ].sort((left, right) => left.id.localeCompare(right.id));
}

function trimOutput(value, max = 8000) {
  const normalized = String(value ?? "").trim();
  return normalized.length <= max ? normalized : normalized.slice(normalized.length - max);
}

export function executeBoundedCommand(repoRoot, command) {
  const started = Date.now();
  const completed = spawnSync(command.executable, command.args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, CI: "1" },
    maxBuffer: 4 * 1024 * 1024,
    timeout: command.timeoutMs ?? 180_000,
  });
  return {
    exitCode: completed.status,
    signal: completed.signal,
    error: completed.error?.message ?? null,
    stdout: trimOutput(completed.stdout),
    stderr: trimOutput(completed.stderr),
    durationMs: Date.now() - started,
  };
}

export function executeBoundCommand(sourceRoot, sourceFiles, nodeModulesRoot, binding, command) {
  const snapshot = createSourceSnapshot(sourceRoot, sourceFiles, {
    prefix: "codeliver-cert-command-",
    nodeModulesRoot,
  });
  try {
    const beforeFingerprint = computeSourceFingerprint(snapshot.root, sourceFiles);
    const execution = executeBoundedCommand(snapshot.root, command);
    const afterFiles = [...new Set([...sourceFiles, ...discoverSnapshotFiles(snapshot.root)])].sort();
    const afterFingerprint = computeSourceFingerprint(snapshot.root, afterFiles);
    return {
      ...execution,
      executionEnvironment: "isolated-source-snapshot",
      sourceFingerprintBefore: beforeFingerprint,
      sourceFingerprintAfter: afterFingerprint,
      sourceVerifiedBefore: beforeFingerprint === binding.sourceFingerprint,
      sourceMutated: beforeFingerprint !== afterFingerprint,
    };
  } finally {
    snapshot.cleanup();
  }
}

export function runCommandChecks({
  repoRoot,
  inventory,
  binding,
  sourceFiles,
  nodeModulesRoot,
  runCommands = false,
  includeBuild = false,
}) {
  const certificationTests = inventory.tests.filter((file) => file.startsWith("tests/contracts/") || file.startsWith("tests/journeys/"));
  const definitions = [
    { id: "commands.lint", title: "Repository lint passes", severity: "high", executable: "npm", args: ["run", "lint"] },
    { id: "commands.typecheck", title: "Repository typecheck passes", severity: "critical", executable: "npm", args: ["run", "typecheck"] },
    { id: "commands.product-tests", title: "Existing product tests pass", severity: "critical", executable: "npm", args: ["test"] },
    {
      id: "commands.certification-tests",
      title: "Certification contract and journey tests pass",
      severity: "critical",
      executable: process.execPath,
      args: ["--experimental-strip-types", "--test", ...certificationTests],
    },
    {
      id: "commands.build",
      title: "Production build passes",
      severity: "critical",
      executable: "npm",
      args: ["run", "build", "--", "--webpack"],
      optional: true,
      timeoutMs: 300_000,
    },
  ];

  return definitions.map((definition) => {
    const shouldRun = runCommands && (!definition.optional || includeBuild);
    if (!shouldRun) {
      return result(definition.id, definition.title, "unverified", {
        severity: definition.severity,
        summary: definition.optional ? "Not run; pass --include-build to execute" : "Not run; pass --run-commands to execute",
        evidence: [{ type: "command", executable: definition.executable, args: definition.args, executed: false }],
        residualRisk: "The current source has no fresh command proof for this gate.",
      });
    }
    if (definition.id === "commands.certification-tests" && certificationTests.length === 0) {
      return result(definition.id, definition.title, "fail", {
        severity: definition.severity,
        summary: "No nested certification tests were discovered",
        residualRisk: "The control plane has no executable self-test.",
      });
    }
    const execution = executeBoundCommand(
      repoRoot,
      sourceFiles ?? discoverSnapshotFiles(repoRoot),
      nodeModulesRoot,
      binding,
      definition
    );
    const passed =
      execution.exitCode === 0 &&
      !execution.error &&
      execution.sourceVerifiedBefore &&
      !execution.sourceMutated;
    const failureSummary = !execution.sourceVerifiedBefore
      ? "Execution snapshot did not match the certified source"
      : execution.sourceMutated
        ? "Verification command mutated candidate source"
        : `Exited ${execution.exitCode ?? execution.signal ?? "unknown"}`;
    return result(definition.id, definition.title, passed ? "pass" : "fail", {
      severity: definition.severity,
      summary: passed ? `Passed in ${execution.durationMs}ms` : failureSummary,
      durationMs: execution.durationMs,
      evidence: [
        {
          type: "command",
          executable: definition.executable,
          args: definition.args,
          executed: true,
          sourceBinding: {
            commit: binding.commit,
            dirtyFingerprint: binding.dirtyFingerprint,
            sourceFingerprint: binding.sourceFingerprint,
          },
          ...execution,
        },
      ],
      residualRisk: passed
        ? null
        : execution.sourceMutated || !execution.sourceVerifiedBefore
          ? "Command evidence does not describe the certified source state."
          : "A required repository verification command is red.",
    });
  });
}

export function sortChecksByRisk(checks) {
  return [...checks].sort(
    (left, right) =>
      (SEVERITY_ORDER[right.severity] ?? 0) - (SEVERITY_ORDER[left.severity] ?? 0) ||
      left.id.localeCompare(right.id)
  );
}
