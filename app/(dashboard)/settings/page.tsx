"use client";

import { useState } from "react";
import { User, Palette, Save, Moon, Bell, ExternalLink } from "lucide-react";

const REVIEWER_COLORS = [
  "#3b82f6", "#2563eb", "#1d4ed8", "#22c55e", "#14b8a6", "#ef4444",
  "#f97316", "#ec4899", "#a855f7", "#f59e0b", "#6366f1", "#06b6d4",
];

export default function SettingsPage() {
  const [tab, setTab] = useState<"profile" | "preferences">("profile");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [selectedColor, setSelectedColor] = useState(REVIEWER_COLORS[0]);
  const [darkMode, setDarkMode] = useState(true);
  const [emailNotifs, setEmailNotifs] = useState(true);

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold tracking-tight mb-6" style={{ fontFamily: "var(--font-display)" }}>
        Settings
      </h1>

      {/* Tabs */}
      <div className="tabs mb-6">
        <button
          className={`tab ${tab === "profile" ? "active" : ""}`}
          onClick={() => setTab("profile")}
        >
          <User size={14} className="inline mr-2" />
          Profile
        </button>
        <button
          className={`tab ${tab === "preferences" ? "active" : ""}`}
          onClick={() => setTab("preferences")}
        >
          Preferences
        </button>
      </div>

      {tab === "profile" ? (
        <div className="card p-6 space-y-6">
          {/* Avatar */}
          <div>
            <label className="kicker block mb-3">Avatar</label>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-[var(--blue)] flex items-center justify-center">
                <User size={24} className="text-white" />
              </div>
              <div className="flex gap-2">
                <button className="btn btn-secondary">Update</button>
                <button className="btn btn-ghost">Remove</button>
              </div>
            </div>
          </div>

          {/* Reviewer color */}
          <div>
            <label className="kicker block mb-3">Reviewer Color</label>
            <div className="flex flex-wrap gap-2">
              {REVIEWER_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setSelectedColor(color)}
                  className="w-8 h-8 rounded-full transition-transform"
                  style={{
                    backgroundColor: color,
                    transform: selectedColor === color ? "scale(1.2)" : "scale(1)",
                    boxShadow: selectedColor === color ? `0 0 0 2px var(--bg), 0 0 0 4px ${color}` : "none",
                  }}
                />
              ))}
            </div>
          </div>

          {/* Name */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="kicker block mb-2">First Name</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="input"
                placeholder="First name"
              />
            </div>
            <div>
              <label className="kicker block mb-2">Last Name</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="input"
                placeholder="Last name"
              />
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <button className="btn btn-secondary">Cancel</button>
            <button className="btn btn-primary">
              <Save size={14} /> Save
            </button>
          </div>
        </div>
      ) : (
        <div className="card p-6 space-y-6">
          {/* App Settings */}
          <div>
            <p className="kicker mb-4">App Settings</p>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Moon size={16} className="text-[var(--muted)]" />
                <div>
                  <p className="text-sm font-medium">Dark mode</p>
                  <p className="text-xs text-[var(--muted)]">Use dark color scheme</p>
                </div>
              </div>
              <button
                className={`toggle ${darkMode ? "on" : ""}`}
                onClick={() => setDarkMode(!darkMode)}
              />
            </div>
          </div>

          {/* Email Notifications */}
          <div className="border-t border-[var(--border)] pt-6">
            <p className="kicker mb-4">Email Notifications</p>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Bell size={16} className="text-[var(--muted)]" />
                <div>
                  <p className="text-sm font-medium">New comments</p>
                  <p className="text-xs text-[var(--muted)]">
                    Hourly email digest for feedback on reviews you&apos;re part of
                  </p>
                </div>
              </div>
              <button
                className={`toggle ${emailNotifs ? "on" : ""}`}
                onClick={() => setEmailNotifs(!emailNotifs)}
              />
            </div>
          </div>

          {/* Adobe Integration */}
          <div className="border-t border-[var(--border)] pt-6">
            <p className="kicker mb-4">Integrations</p>
            <a
              href="#"
              className="flex items-center gap-2 text-sm text-[var(--blue)] hover:underline"
            >
              <ExternalLink size={14} /> Adobe Premiere Pro integration
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
