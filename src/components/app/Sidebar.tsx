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
  RefreshCw,
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
  RefreshCw,
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
      className={`shrink-0 border-r border-border bg-surface flex flex-col px-3 py-5 sticky top-0 h-screen overflow-hidden ${
        collapsed ? "w-[76px]" : "w-[248px]"
      } ${mounted ? "transition-[width] duration-[220ms] ease-[cubic-bezier(0.4,0,0.2,1)]" : ""}`}
    >
      <div
        className={`flex items-center gap-2 pb-6 px-1 ${collapsed ? "justify-center" : "justify-between"}`}
        suppressHydrationWarning
      >
        <Link href="/" className="no-underline overflow-hidden">
          <div className="flex items-center gap-2.5 font-display font-bold text-xl text-ink whitespace-nowrap" suppressHydrationWarning>
            <span className="flex items-center justify-center w-[34px] h-[34px] shrink-0">
              <Image src="/logos/only logo.png" alt="" width={306} height={333} priority className="w-full h-full object-contain" />
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
          // actions don't share a click target.
          if (item.href === "/settings") {
            return (
              <div key={item.href} ref={settingsRef} className="relative">
                <div
                  className={`relative flex items-center gap-1 rounded-sm text-[0.87rem] whitespace-nowrap transition-[background,color] duration-150 border ${
                    collapsed ? "justify-center p-[11px]" : "justify-start pl-3 pr-1.5 py-1"
                  } ${
                    settingsActive || settingsOpen
                      ? "font-bold text-ink bg-brass-bg border-[color:var(--brass-glow)]"
                      : "font-medium text-ink-soft bg-transparent border-transparent"
                  }`}
                >
                  {(settingsActive || settingsOpen) && !collapsed && (
                    <span className="absolute -left-3 top-1/2 -translate-y-1/2 w-[3px] h-[18px] rounded-full bg-brass" />
                  )}
                  <Link
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={`relative flex items-center gap-3 no-underline flex-1 min-w-0 ${
                      collapsed ? "justify-center" : "justify-start py-1.5"
                    }`}
                  >
                    <Icon
                      size={18}
                      strokeWidth={2}
                      className={`shrink-0 ${settingsActive || settingsOpen ? "text-brass" : "text-ink-faint"}`}
                    />
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                  <button
                    type="button"
                    onClick={() => setSettingsOpen((v) => !v)}
                    aria-label={settingsOpen ? "Collapse settings menu" : "Expand settings menu"}
                    aria-expanded={settingsOpen}
                    className={
                      collapsed
                        ? "absolute -bottom-0.5 -right-0.5 flex items-center justify-center w-4 h-4 rounded-full bg-surface-raised border border-border-strong cursor-pointer text-ink-faint hover:text-ink"
                        : "shrink-0 flex items-center justify-center w-7 h-7 rounded-sm bg-transparent border-0 cursor-pointer text-ink-faint hover:text-ink hover:bg-surface-overlay"
                    }
                  >
                    <ChevronUp
                      size={collapsed ? 10 : 14}
                      className={`transition-transform duration-150 ${settingsOpen ? "" : "rotate-180"}`}
                    />
                  </button>
                </div>

                {settingsOpen && (
                  <div
                    className={
                      collapsed
                        ? "absolute left-[calc(100%+8px)] top-0 w-[190px] bg-surface-raised border border-border-strong rounded-sm shadow-lg py-1.5 z-20"
                        : "flex flex-col mt-[3px] ml-3 pl-3 border-l border-border gap-[3px]"
                    }
                  >
                    {isAdmin && (
                      <Link
                        href="/admin/users"
                        onClick={() => collapsed && setSettingsOpen(false)}
                        className={`flex items-center gap-2.5 no-underline text-[0.83rem] whitespace-nowrap ${
                          collapsed
                            ? "text-ink-soft hover:text-ink hover:bg-surface-overlay px-3.5 py-2.5"
                            : `rounded-sm px-3 py-2 ${
                                activeHref.startsWith("/admin/users")
                                  ? "font-semibold text-ink bg-brass-bg"
                                  : "text-ink-soft hover:text-ink hover:bg-surface-overlay"
                              }`
                        }`}
                      >
                        <Users size={14} className="shrink-0 text-ink-faint" />
                        Users &amp; Roles
                      </Link>
                    )}
                    <Link
                      href="/settings"
                      onClick={() => collapsed && setSettingsOpen(false)}
                      className={`flex items-center gap-2.5 no-underline text-[0.83rem] whitespace-nowrap ${
                        collapsed
                          ? "text-ink-soft hover:text-ink hover:bg-surface-overlay px-3.5 py-2.5"
                          : `rounded-sm px-3 py-2 ${
                              activeHref === "/settings"
                                ? "font-semibold text-ink bg-brass-bg"
                                : "text-ink-soft hover:text-ink hover:bg-surface-overlay"
                            }`
                      }`}
                    >
                      <BellRing size={14} className="shrink-0 text-ink-faint" />
                      Notifications
                    </Link>
                    <div className={collapsed ? "h-px bg-border my-1.5" : "h-px bg-border my-0.5"} />
                    <button
                      type="button"
                      onClick={() => {
                        setSettingsOpen(false);
                        signOut({ callbackUrl: "/login" });
                      }}
                      className={`flex items-center gap-2.5 text-left bg-transparent border-0 cursor-pointer text-critical text-[0.83rem] whitespace-nowrap ${
                        collapsed ? "w-full hover:bg-critical-bg px-3.5 py-2.5" : "rounded-sm px-3 py-2 hover:bg-critical-bg"
                      }`}
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

      <button
        onClick={toggle}
        className={`flex items-center gap-2.5 mt-2 bg-transparent border border-border rounded-sm text-ink-faint text-[0.78rem] font-body cursor-pointer ${
          collapsed ? "justify-center p-[9px]" : "justify-start px-3 py-2.5"
        }`}
      >
        {collapsed ? <ChevronsRight size={15} /> : <ChevronsLeft size={15} />}
        {!collapsed && "Collapse"}
      </button>
    </aside>
  );
}
