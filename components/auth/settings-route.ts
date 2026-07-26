export const SETTINGS_TAB_VALUES = [
  "account",
  "organization",
  "security",
  "preferences",
  "notifications",
  "systems",
  "brand",
] as const;

export type SettingsTab = (typeof SETTINGS_TAB_VALUES)[number];

export function resolveSettingsTab(value: string | null | undefined): SettingsTab {
  return SETTINGS_TAB_VALUES.includes(value as SettingsTab)
    ? (value as SettingsTab)
    : "account";
}

export function buildSettingsHref(tab: SettingsTab, demoMode: boolean): string {
  const params = new URLSearchParams({ section: tab });
  if (demoMode) params.set("demo", "1");
  return `/settings?${params.toString()}`;
}
