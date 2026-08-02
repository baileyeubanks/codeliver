import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function source(path: string): string {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

function classRule(sourceText: string, className: string): string {
  const match = sourceText.match(new RegExp(`\\.${className}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `missing .${className} rule`);
  return match[1];
}

function requiredSection(sourceText: string, start: RegExp, end: RegExp): string {
  const startMatch = sourceText.match(start);
  assert.ok(startMatch?.index != null, `missing section start ${start}`);
  const rest = sourceText.slice(startMatch.index);
  const endMatch = rest.match(end);
  assert.ok(endMatch?.index != null, `missing section end ${end}`);
  return rest.slice(0, endMatch.index);
}

test("settings notification tab exposes honest channel readiness before controls", () => {
  const settingsPage = source("app/(dashboard)/settings/page.tsx");

  assert.match(settingsPage, /title="Notification authority"/);
  assert.match(settingsPage, /never implies a message was sent when no provider is connected/);
  assert.match(settingsPage, /notificationReadiness/);
  assert.match(settingsPage, /Needs number/);
  assert.match(settingsPage, /Dry run/);
  assert.match(settingsPage, /Valid \+number required/);
  assert.match(settingsPage, /Provider checked/);
  assert.match(settingsPage, /Consent required/);
  assert.match(settingsPage, /Preview only/);
  assert.match(settingsPage, /StatusBadge tone=\{demoMode \? "info" : "good"\}/);
  assert.match(settingsPage, /API backed/);
  assert.match(settingsPage, /title="Managed preferences"/);
  assert.match(settingsPage, /authenticated notification preferences API/);
  assert.match(settingsPage, /<NotificationPreferences \/>/);
  assert.match(settingsPage, /demoMode \? \(\s*<>\s*<NotificationSection/);
  assert.doesNotMatch(settingsPage, /disabled=\{!demoMode\}/);
  assert.doesNotMatch(settingsPage, /text-\[var\(--\$\{/);
});

test("settings frame keeps compact tabs and route-backed notification preferences", () => {
  const settingsFrame = source("components/auth/SettingsFrame.tsx");
  const settingsRoute = source("components/auth/settings-route.ts");
  const notificationPreferences = source("components/notifications/NotificationPreferences.tsx");
  const notificationPreferencesRoute = source("app/api/notifications/preferences/route.ts");

  assert.match(settingsFrame, /role="tablist"/);
  assert.match(settingsFrame, /aria-controls="settings-panel"/);
  assert.match(settingsFrame, /Notifications/);
  assert.match(settingsFrame, /Systems/);
  assert.match(settingsRoute, /"notifications"/);
  assert.match(settingsRoute, /"systems"/);
  assert.match(notificationPreferences, /fetch\("\/api\/notifications\/preferences"\)/);
  assert.match(notificationPreferences, /method: "PUT"/);
  assert.match(notificationPreferences, /email_frequency/);
  assert.match(notificationPreferencesRoute, /requireAuth/);
  assert.match(notificationPreferencesRoute, /notification_preferences/);
  assert.match(notificationPreferencesRoute, /upsert/);
});

test("brand settings expose product identity and honest asset readiness", () => {
  const brandSettings = source("components/auth/BrandSettings.tsx");
  const settingsStyles = source("components/auth/SettingsPillar.module.css");

  assert.match(brandSettings, /CoProductionBrand/);
  assert.match(brandSettings, /Product identity/);
  assert.match(brandSettings, /Co‑VideoPro/);
  assert.match(brandSettings, /Supplied raster lockup/);
  assert.match(brandSettings, /Review portal/);
  assert.match(brandSettings, /Backend gated/);
  assert.match(brandSettings, /Tenant storage and scan required/);
  assert.match(brandSettings, /Workspace brand layers apply to client review chrome/);

  assert.match(settingsStyles, /\.brandReadinessStrip/);
  assert.match(settingsStyles, /grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(settingsStyles, /\.productLockupPanel/);
  assert.match(settingsStyles, /--co-production-brand-width:\s*min\(100%, 224px\)/);
  assert.doesNotMatch(classRule(settingsStyles, "brandReadinessStrip"), /border-radius:\s*(?:9999px|999px|1rem|12px)/);
  assert.doesNotMatch(classRule(settingsStyles, "productLockupPanel"), /border-radius:\s*(?:9999px|999px|1rem|12px)/);
});

test("studio systems tab exposes dense capability cockpit without fake controls", () => {
  const settingsPage = source("app/(dashboard)/settings/page.tsx");
  const studioSystems = source("components/auth/StudioSystemsSettings.tsx");
  const settingsStyles = source("components/auth/SettingsPillar.module.css");

  assert.match(settingsPage, /StudioSystemsSettings/);
  assert.match(settingsPage, /tab === "systems"/);
  assert.match(studioSystems, /title="Studio systems"/);
  assert.match(studioSystems, /GitHub repositories/);
  assert.match(studioSystems, /SSH \/ SFTP remotes/);
  assert.match(studioSystems, /Plugin marketplace/);
  assert.match(studioSystems, /FFmpeg media workers/);
  assert.match(studioSystems, /Screen share edit session/);
  assert.match(studioSystems, /Connection quality gauge/);
  assert.match(studioSystems, /Browser and screen capture/);
  assert.match(studioSystems, /System readiness/);
  assert.match(studioSystems, /No full-access toggle/);
  assert.match(studioSystems, /SOURCE_OPERATIONS/);
  assert.match(studioSystems, /title="Source operations"/);
  assert.match(studioSystems, /Source operations contract state/);
  assert.match(studioSystems, /Current route, authority, and contract state/);
  assert.match(studioSystems, /Read-only/);
  assert.match(studioSystems, /GitHub selected-file import/);
  assert.match(studioSystems, /State:|SOURCE_STATE_LABEL/);
  assert.match(studioSystems, /Unavailable/);
  assert.match(studioSystems, /Guarded; unverified/);
  assert.match(studioSystems, /No product route/);
  assert.match(studioSystems, /No install route/);
  assert.match(studioSystems, /Machine API only; no user route/);
  assert.match(studioSystems, /Planned: integrations:manage \+ storage:manage/);
  assert.match(studioSystems, /media:write \+ worker token/);
  assert.match(studioSystems, /No repo write path/);
  assert.match(studioSystems, /No secret access by default/);
  assert.match(studioSystems, /Worker readiness still required/);
  assert.match(studioSystems, /contents:read, pinned commit SHA, path allowlist/);
  assert.match(studioSystems, /pinned host key, scoped root/);
  assert.match(studioSystems, /signed manifest, publisher trust/);
  assert.match(studioSystems, /repository and base SHA/);
  assert.match(studioSystems, /worker identity, FFmpeg\/FFprobe versions/);
  assert.match(studioSystems, /CO_PRODUCE_CAPABILITY_GROUPS/);
  assert.match(studioSystems, /CO_PRODUCE_PERMISSION_CONTRACTS/);
  assert.match(studioSystems, /useOnlineStatus/);
  assert.match(studioSystems, /Browser signal/);
  assert.match(studioSystems, /Not measured/);
  assert.match(studioSystems, /metric\.sampled && typeof metric\.meter === "number"/);
  assert.doesNotMatch(studioSystems, /meter:\s*(?:78|28|24|18|8)/);
  assert.match(studioSystems, /activeSystemsGroup/);
  assert.match(studioSystems, /disabled=\{disabled\}/);
  assert.match(studioSystems, /capability\.permission/);
  assert.match(studioSystems, /systemsRowAction/);
  assert.doesNotMatch(studioSystems, /SettingsToggle/);
  assert.doesNotMatch(studioSystems, /Source operations pipeline|Guarded intake|Selected files only/i);
  assert.doesNotMatch(studioSystems, /Repository write enabled|Repo connected|Worker ready|Secrets mounted/i);
  assert.doesNotMatch(studioSystems, /routeHref:\s*"\/api\/transcode\/worker"|href="\/api\/transcode\/worker"/);

  const sourceOperationsSection = requiredSection(
    studioSystems,
    /title="Source operations"/,
    /title="Capability matrix"/,
  );
  assert.doesNotMatch(sourceOperationsSection, /<a\s|<button|href=|onClick=/);

  assert.match(settingsStyles, /\.systemsReadinessStrip/);
  assert.match(settingsStyles, /\.systemsSourceOps/);
  assert.match(settingsStyles, /\.systemsSourceStep/);
  assert.match(settingsStyles, /\.systemsSourceGuard/);
  assert.match(settingsStyles, /\.systemsSourceState/);
  assert.match(settingsStyles, /\.systemsSourceAuthority/);
  assert.match(settingsStyles, /\.systemsSourceContract/);
  assert.match(settingsStyles, /\.systemsCapabilityRow/);
  assert.match(settingsStyles, /\.systemsQualityGrid/);
  assert.match(settingsStyles, /\.systemsProofGrid/);
  assert.match(settingsStyles, /\.systemsQualityPending/);
  assert.match(settingsStyles, /@media \(max-width: 640px\) \{[\s\S]*?\.systemsReadinessStrip,[\s\S]*?\.systemsQualityGrid,[\s\S]*?\.systemsProofGrid \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(settingsStyles, /@media \(max-width: 640px\) \{[\s\S]*?\.systemsReadinessCopy small \{[\s\S]*?white-space: normal;/);
  assert.match(settingsStyles, /@media \(max-width: 640px\) \{[\s\S]*?\.systemsSourceStep \{[\s\S]*?grid-template-columns: 24px minmax\(0, 1fr\);/);
  assert.match(settingsStyles, /\.systemsSourceOps \{[\s\S]*?gap: 1px;[\s\S]*?border-radius: 8px;/);
  assert.match(settingsStyles, /\.systemsSourceGuard \{[\s\S]*?gap: 1px;[\s\S]*?border-radius: 8px;/);
  assert.match(settingsStyles, /@media \(max-width: 640px\) \{[\s\S]*?\.systemsSourceGuard \{[\s\S]*?display: flex;[\s\S]*?overflow-x: auto;/);
  assert.match(settingsStyles, /\.systemsCapabilityContract span,[\s\S]*?\.systemsCapabilityContract small \{[\s\S]*?display: none;/);
  assert.match(settingsStyles, /\.systemsCapabilityCopy small \{[\s\S]*?-webkit-line-clamp: 1;/);
  assert.doesNotMatch(classRule(settingsStyles, "systemsReadinessStrip"), /border-radius:\s*(?:9999px|999px|1rem|12px)/);
  assert.match(classRule(settingsStyles, "systemsSourceOps"), /border-radius:\s*8px/);
  assert.doesNotMatch(classRule(settingsStyles, "systemsSourceStep"), /border-radius:|box-shadow:/);
  const sourceOperationStyles = requiredSection(settingsStyles, /\.systemsSourceOps \{/, /\.systemsCapabilityRow \{/);
  assert.doesNotMatch(sourceOperationStyles, /text-overflow:|white-space:\s*nowrap|-webkit-line-clamp|display:\s*none/);
  assert.doesNotMatch(sourceOperationStyles, /repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.doesNotMatch(classRule(settingsStyles, "systemsCapabilityRow"), /border-radius:\s*(?:9999px|999px|1rem|12px)/);
});
