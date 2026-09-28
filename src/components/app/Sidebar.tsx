"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  LayoutDashboard,
  ClipboardList,
  Wallet,
  BookOpenCheck,
  FileSpreadsheet,
  Store,
  Users,
  ChevronsLeft,
  ChevronsRight,
  Settings,
  BellRing,
  LogOut,
  ChevronUp,
} from "lucide-react";
import { signOut } from "next-auth/react";

const COLLAPSE_KEY = "czc-pim-sidebar-collapsed";

// Icons are looked up by name here rather than passed as component
// references from AppShell (a Server Component) — RSC can only serialize
// plain data across that boundary, and a component/function reference
// (what `icon: ClipboardList` would be) fails with "Only plain objects can
// be passed to Client Components from Server Components."
const ICONS = {
  LayoutDashboard,
  ClipboardList,
  Wallet,
  BookOpenCheck,
  FileSpreadsheet,
  Store,
  Users,
  Settings,
};

export type NavIconName = keyof typeof ICONS;

export type NavItem = {
  href: string;
  label: string;
  icon: NavIconName;
};

export function Sidebar({
  nav,
  activeHref,
  role,
}: {
  nav: NavItem[];
  activeHref: string;
  role: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  const isAdmin = role === "administrator";
  const settingsActive = activeHref === "/settings" || activeHref.startsWith("/settings/") || activeHref.startsWith("/admin/users");

  // The dropdown starts open when landing directly on one of its own pages
  // (e.g. a deep link or refresh on /settings) so the active item isn't
  // hidden behind a collapsed menu.
  useEffect(() => {
    if (settingsActive) setSettingsOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = window.localStorage.getItem(COLLAPSE_KEY);
      if (stored === "1") setCollapsed(true);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!settingsOpen || collapsed) return;
    function onClickAway(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, [settingsOpen, collapsed]);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return (
    <aside
      className={`relative shrink-0 border-r border-border bg-surface sticky top-0 h-screen ${
        collapsed ? "w-[76px]" : "w-[248px]"
      } ${mounted ? "transition-[width] duration-[220ms] ease-[cubic-bezier(0.4,0,0.2,1)]" : ""}`}
    >
      {/* Everything but the floating collapse button below is clipped here
          — the button itself sits outside this wrapper, straddling the
          aside's right border, which needs the aside's own overflow left
          open so the button isn't cut in half. */}
      <div className="flex flex-col h-full px-3 py-5 overflow-hidden">
        <div
          className={`flex items-center gap-2 pb-6 px-1 ${collapsed ? "justify-center" : "justify-between"}`}
          suppressHydrationWarning
        >
          <Link href="/" className="no-underline overflow-hidden">
            <div className="flex items-center gap-2.5 font-display font-bold text-xl text-ink whitespace-nowrap" suppressHydrationWarning>
              <span className="flex items-center justify-center w-[34px] h-[34px] shrink-0">
                <Image src="/logos/PIM-transparent.png" alt="" width={1254} height={1254} priority className="w-full h-full object-contain" />
              </span>
              {!collapsed && <span>CZC PIM</span>}
            </div>
          </Link>
        </div>

        {!collapsed && (
          <div className="text-[0.66rem] font-bold text-ink-faint uppercase tracking-wider px-3 pb-2" suppressHydrationWarning>
            Workspace
          </div>
        )}

        <nav className="flex flex-col gap-[3px] flex-1 overflow-y-auto">
        {nav.map((item) => {
          const active = activeHref === item.href || activeHref.startsWith(item.href + "/");
          const Icon = ICONS[item.icon];

          // Settings is a real link to /settings (clicking the row
          // navigates there, same as every other nav item) plus a separate
          // chevron that only opens/closes the dropdown below it — the two
          // actions don't share a click target. The dropdown itself only
          // exists in the expanded sidebar — when collapsed there's no room
          // to show its items sensibly, so Settings collapses to a plain
          // icon link like every other nav item instead of gaining a
          // flyout menu.
          if (item.href === "/settings") {
            if (collapsed) {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  className={`relative flex items-center justify-center rounded-sm no-underline text-[0.87rem] whitespace-nowrap transition-[background,color] duration-150 border p-[11px] ${
                    settingsActive
                      ? "font-bold text-ink bg-brass-bg border-[color:var(--brass-glow)]"
                      : "font-medium text-ink-soft bg-transparent border-transparent"
                  }`}
                >
                  <Icon size={18} strokeWidth={2} className={`shrink-0 ${settingsActive ? "text-brass" : "text-ink-faint"}`} />
                </Link>
              );
            }

            return (
              <div key={item.href} ref={settingsRef} className="relative">
                <div
                  className={`relative flex items-center gap-1 rounded-sm text-[0.87rem] whitespace-nowrap transition-[background,color] duration-150 border justify-start pl-3 pr-1.5 py-1 ${
                    settingsActive || settingsOpen
                      ? "font-bold text-ink bg-brass-bg border-[color:var(--brass-glow)]"
                      : "font-medium text-ink-soft bg-transparent border-transparent"
                  }`}
                >
                  {(settingsActive || settingsOpen) && (
                    <span className="absolute -left-3 top-1/2 -translate-y-1/2 w-[3px] h-[18px] rounded-full bg-brass" />
                  )}
                  <Link
                    href={item.href}
                    className="relative flex items-center gap-3 no-underline flex-1 min-w-0 justify-start py-1.5"
                  >
                    <Icon
                      size={18}
                      strokeWidth={2}
                      className={`shrink-0 ${settingsActive || settingsOpen ? "text-brass" : "text-ink-faint"}`}
                    />
                    <span>{item.label}</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => setSettingsOpen((v) => !v)}
                    aria-label={settingsOpen ? "Collapse settings menu" : "Expand settings menu"}
                    aria-expanded={settingsOpen}
                    className="shrink-0 flex items-center justify-center w-7 h-7 rounded-sm bg-transparent border-0 cursor-pointer text-ink-faint hover:text-ink hover:bg-surface-overlay"
                  >
                    <ChevronUp
                      size={14}
                      className={`transition-transform duration-150 ${settingsOpen ? "" : "rotate-180"}`}
                    />
                  </button>
                </div>

                {settingsOpen && (
                  <div className="flex flex-col mt-[3px] ml-3 pl-3 border-l border-border gap-[3px]">
                    {isAdmin && (
                      <Link
                        href="/admin/users"
                        className={`flex items-center gap-2.5 no-underline text-[0.83rem] whitespace-nowrap rounded-sm px-3 py-2 ${
                          activeHref.startsWith("/admin/users")
                            ? "font-semibold text-ink bg-brass-bg"
                            : "text-ink-soft hover:text-ink hover:bg-surface-overlay"
                        }`}
                      >
                        <Users size={14} className="shrink-0 text-ink-faint" />
                        Users &amp; Roles
                      </Link>
                    )}
                    <Link
                      href="/settings/notifications"
                      className={`flex items-center gap-2.5 no-underline text-[0.83rem] whitespace-nowrap rounded-sm px-3 py-2 ${
                        activeHref.startsWith("/settings/notifications")
                          ? "font-semibold text-ink bg-brass-bg"
                          : "text-ink-soft hover:text-ink hover:bg-surface-overlay"
                      }`}
                    >
                      <BellRing size={14} className="shrink-0 text-ink-faint" />
                      Notifications
                    </Link>
                    <div className="h-px bg-border my-0.5" />
                    <button
                      type="button"
                      onClick={() => {
                        setSettingsOpen(false);
                        signOut({ callbackUrl: "/login" });
                      }}
                      className="flex items-center gap-2.5 text-left bg-transparent border-0 cursor-pointer text-critical text-[0.83rem] whitespace-nowrap rounded-sm px-3 py-2 hover:bg-critical-bg"
                    >
                      <LogOut size={14} className="shrink-0" />
                      Log out
                    </button>
                  </div>
                )}
              </div>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={`relative flex items-center gap-3 rounded-sm no-underline text-[0.87rem] whitespace-nowrap transition-[background,color] duration-150 border ${
                collapsed ? "justify-center p-[11px]" : "justify-start px-3 py-2.5"
              } ${active ? "font-bold text-ink bg-brass-bg border-[color:var(--brass-glow)]" : "font-medium text-ink-soft bg-transparent border-transparent"}`}
            >
              {active && !collapsed && (
                <span className="absolute -left-3 top-1/2 -translate-y-1/2 w-[3px] h-[18px] rounded-full bg-brass" />
              )}
              <Icon size={18} strokeWidth={2} className={`shrink-0 ${active ? "text-brass" : "text-ink-faint"}`} />
              {!collapsed && item.label}
            </Link>
          );
        })}
        </nav>
      </div>

      {/* Collapse toggle — a small round button straddling the sidebar's
          right border, vertically centered, rather than a full-width
          button at the bottom. Flips which chevron it shows based on
          state, same as before. */}
      <button
        onClick={toggle}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="absolute top-1/2 -right-3 -translate-y-1/2 flex items-center justify-center w-6 h-6 rounded-full bg-surface-raised border border-border-strong text-ink-faint hover:text-ink hover:border-brass cursor-pointer shadow-sm z-10"
      >
        {collapsed ? <ChevronsRight size={13} /> : <ChevronsLeft size={13} />}
      </button>
    </aside>
  );
}
