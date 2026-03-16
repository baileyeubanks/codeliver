"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import {
  Menu,
  ChevronDown,
  User,
  Settings,
  LogOut,
  SmilePlus,
  Search,
} from "lucide-react";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import SearchModal from "./SearchModal";

const TABS = [
  { href: "/", label: "Dashboard" },
  { href: "/projects", label: "Projects" },
  { href: "/reviews", label: "Reviews" },
] as const;

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function handleLogout() {
    const supabase = createSupabaseBrowser();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Top Nav — matches Wipster exactly */}
      <header className="topnav">
        {/* Left: hamburger + logo + chevron */}
        <div className="topnav-brand">
          <button className="topnav-hamburger" title="Menu">
            <Menu size={18} />
          </button>
          <Link href="/" className="topnav-logo">
            <div className="topnav-logo-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <span style={{ letterSpacing: "0.08em" }}>Content Co-op</span>
          </Link>
          <ChevronDown size={14} className="text-[var(--muted)]" />
        </div>

        {/* Center: tabs (pill style) */}
        <nav className="topnav-tabs">
          {TABS.map(({ href, label }) => {
            const active =
              href === "/"
                ? pathname === "/"
                : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`topnav-tab ${active ? "active" : ""}`}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Right: smiley + search (matching Wipster) */}
        <div className="topnav-actions">
          <button className="btn-icon" title="Help & Feedback">
            <SmilePlus size={18} />
          </button>
          <button
            className="btn-icon"
            onClick={() => setSearchOpen(true)}
            title="Search"
          >
            <Search size={18} />
          </button>

          {/* User menu */}
          <div className="relative" ref={menuRef}>
            <button
              className="btn-icon"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <User size={18} />
            </button>

            {menuOpen && (
              <div
                className="dropdown"
                style={{ right: 0, top: "calc(100% + 4px)" }}
              >
                <div className="px-3 py-2 border-b border-[var(--border)]">
                  <div className="text-xs font-semibold text-[var(--ink)]">
                    Content Co-op
                  </div>
                  <div className="text-xs text-[var(--muted)]">bailey@contentco-op.com</div>
                </div>

                <Link href="/settings" className="dropdown-item">
                  <User size={15} /> Profile
                </Link>
                <Link href="/settings" className="dropdown-item">
                  <Settings size={15} /> Preferences
                </Link>
                <div className="dropdown-divider" />
                <button
                  onClick={handleLogout}
                  className="dropdown-item danger"
                >
                  <LogOut size={15} /> Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 overflow-y-auto bg-[var(--bg)] flex flex-col">
        <div className="flex-1 flex flex-col">{children}</div>
      </main>

      {/* Search Modal */}
      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}
    </div>
  );
}
