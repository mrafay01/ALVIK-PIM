"use client";

import { useEffect, useState } from "react";
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
} from "lucide-react";
import { SignOutButton } from "./SignOutButton";

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
  name,
  role,
  initials,
}: {
  nav: NavItem[];
  activeHref: string;
  name: string;
  role: string;
  initials: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = window.localStorage.getItem(COLLAPSE_KEY);
      if (stored === "1") setCollapsed(true);
    } catch {
      /* ignore */
    }
  }, []);

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

      <div className={`mt-3.5 ${collapsed ? "p-0" : "px-0.5"}`} suppressHydrationWarning>
        <div
          className={`flex items-center gap-2.5 border-t border-border pt-3.5 ${
            collapsed ? "justify-center" : "justify-start"
          }`}
          suppressHydrationWarning
        >
          <span
            title={collapsed ? name : undefined}
            className="w-8 h-8 rounded-full bg-navy-deep text-surface flex items-center justify-center text-[0.76rem] font-bold font-mono shrink-0"
          >
            {initials || "?"}
          </span>
          {!collapsed && (
            <div className="min-w-0 flex-1" suppressHydrationWarning>
              <div className="text-[0.82rem] font-semibold text-ink overflow-hidden text-ellipsis whitespace-nowrap" suppressHydrationWarning>
                {name}
              </div>
              <div className="text-[0.7rem] text-ink-faint capitalize" suppressHydrationWarning>
                {role?.replace(/_/g, " ") ?? "—"}
              </div>
            </div>
          )}
        </div>
        {!collapsed && <SignOutButton />}
      </div>
    </aside>
  );
}
