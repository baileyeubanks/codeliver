"use client";

import DemoSettingsSurface from "@/components/auth/DemoSettingsSurface";
import ManagedSettingsSurface from "@/components/auth/ManagedSettingsSurface";
import { useDemoMode } from "@/lib/demo/mode";

export default function SettingsPage() {
  const demoMode = useDemoMode();
  return demoMode ? <DemoSettingsSurface /> : <ManagedSettingsSurface />;
}
