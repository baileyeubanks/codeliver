"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderOpen,
  Image,
  Activity,
  LogOut,
  Plus,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase-browser";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderOpen },
  { href: "/library", label: "Library", icon: Image },
  { href: "/activity", label: "Activity", icon: Activity },
] as const;

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  async function handleLogout() {
    const supabase = createSupabaseBrowser();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside
        style={{
          width: collapsed ? 64 : 220,
          background: "var(--surface)",
          borderRight: "1px solid var(--line)",
          display: "flex",
          flexDirection: "column",
          transition: "width 0.2s",
          flexShrink: 0,
        }}
      >
        {/* ── Brand header ── */}
        <div
          style={{
            padding: collapsed ? "1.25rem 0.5rem" : "1.25rem 1rem",
            borderBottom: "1px solid var(--line)",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: "var(--accent)",
              boxShadow: "0 0 0 4px var(--accent-dim)",
              flexShrink: 0,
            }}
          />
          {!collapsed && (
            <span
              style={{
                fontWeight: 700,
                fontSize: "0.9rem",
                fontFamily: "var(--font-display, inherit)",
                letterSpacing: "-0.02em",
              }}
            >
              co-deliver
            </span>
          )}
        </div>

        {/* ── CTA button ── */}
        {!collapsed && (
          <Link
            href="/projects/new"
            className="btn btn-primary btn-sm"
            style={{ margin: "0.75rem 1rem 0" }}
          >
            <Plus size={14} /> New Project
          </Link>
        )}

        {/* ── Navigation ── */}
        <nav style={{ flex: 1, padding: "0.75rem 0.5rem" }}>
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.625rem",
                  padding: collapsed ? "0.5rem" : "0.5rem 0.75rem",
                  borderRadius: "var(--radius-sm)",
                  marginBottom: "0.125rem",
                  fontSize: "0.85rem",
                  fontWeight: active ? 600 : 400,
                  color: active ? "var(--accent)" : "var(--muted)",
                  background: active ? "var(--accent-dim)" : "transparent",
                  justifyContent: collapsed ? "center" : "flex-start",
                  transition: "all 0.15s",
                  textDecoration: "none",
                }}
              >
                <Icon size={18} />
                {!collapsed && label}
              </Link>
            );
          })}
        </nav>

        {/* ── Bottom controls ── */}
        <div style={{ padding: "0.75rem 0.5rem", borderTop: "1px solid var(--line)" }}>
          <button
            onClick={handleLogout}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.625rem",
              padding: collapsed ? "0.5rem" : "0.5rem 0.75rem",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.85rem",
              color: "var(--muted)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              width: "100%",
              justifyContent: collapsed ? "center" : "flex-start",
            }}
          >
            <LogOut size={18} />
            {!collapsed && "Log out"}
          </button>
          <button
            onClick={() => setCollapsed(!collapsed)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0.5rem",
              borderRadius: "var(--radius-sm)",
              color: "var(--muted)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              width: "100%",
              marginTop: "0.25rem",
            }}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, overflow: "auto" }}>{children}</main>
    </div>
  );
}
