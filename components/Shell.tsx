"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderOpen,
  PlayCircle,
  Image,
  Activity,
  Settings,
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
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`flex flex-col border-r border-[var(--border)] bg-[var(--surface)] transition-all duration-200 ${
          collapsed ? "w-16" : "w-56"
        }`}
      >
        {/* Brand */}
        <div className="flex items-center gap-2 px-4 py-4 border-b border-[var(--border)]">
          <div className="w-2 h-2 rounded-full bg-[var(--accent)] shadow-[0_0_0_4px_rgba(59,130,246,0.15)] flex-shrink-0" />
          {!collapsed && (
            <span className="text-sm font-bold tracking-wide text-[var(--ink)]">
              Co-Deliver
            </span>
          )}
        </div>

        {/* New Project */}
        <div className="px-3 py-3">
          <Link
            href="/projects/new"
            className={`flex items-center gap-2 rounded-lg bg-[var(--accent)] text-white text-xs font-semibold px-3 py-2 hover:bg-[var(--accent-hover)] transition-colors ${
              collapsed ? "justify-center" : ""
            }`}
          >
            <Plus size={16} />
            {!collapsed && "New Project"}
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 space-y-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                    : "text-[var(--muted)] hover:text-[var(--ink)] hover:bg-white/5"
                } ${collapsed ? "justify-center" : ""}`}
              >
                <Icon size={18} />
                {!collapsed && label}
              </Link>
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="px-3 py-3 border-t border-[var(--border)] space-y-1">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-[var(--muted)] hover:text-[var(--ink)] hover:bg-white/5 transition-colors w-full ${
              collapsed ? "justify-center" : ""
            }`}
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            {!collapsed && "Collapse"}
          </button>
          <button
            onClick={handleLogout}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-[var(--muted)] hover:text-[var(--red)] hover:bg-white/5 transition-colors w-full ${
              collapsed ? "justify-center" : ""
            }`}
          >
            <LogOut size={18} />
            {!collapsed && "Log out"}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
