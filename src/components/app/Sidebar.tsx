"use client";

import { hasFullAccess } from "@/lib/enums";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  LayoutDashboard,
  ClipboardList,
  PackageSearch,
  BookOpenCheck,
  FileSpreadsheet,
  Users,
  ChevronsLeft,
  ChevronsRight,
  Settings,
  BellRing,
  LogOut,
  ChevronUp,
  LifeBuoy,
  Images,
  Flag,
  RefreshCw,
  Plus,
  FileUp,
  FileDown,
  X,
} from "lucide-react";
import { signOut } from "next-auth/react";

const COLLAPSE_KEY = "czc-pim-sidebar-collapsed";

// The header's menu button (MobileNavButton, phones/tablets) opens the
// sidebar as a slide-in drawer by dispatching this event.
export const OPEN_NAV_EVENT = "alvik:open-nav";

// Icons are looked up by name here rather than passed as component
// references from AppShell (a Server Component) — RSC can only serialize
// plain data across that boundary, and a component/function reference
// (what `icon: ClipboardList` would be) fails with "Only plain objects can
// be passed to Client Components from Server Components."
const ICONS = {
  LayoutDashboard,
  ClipboardList,
  PackageSearch,
  BookOpenCheck,
  FileSpreadsheet,
  Users,
  Settings,
  LifeBuoy,
  Images,
  Flag,
  RefreshCw,
  Plus,
  FileUp,
  FileDown,
};

export type NavIconName = keyof typeof ICONS;

export type NavItem = {
  href: string;
  label: string;
  icon: NavIconName;
  // Sub-pages shown as a dropdown under this item (e.g. Un-Verified Items
  // under Purchase Orders).
  children?: NavItem[];
};

function isActive(activeHref: string, href: string): boolean {
  return activeHref === href || activeHref.startsWith(href + "/");
}

const ROW_ACTIVE = "font-semibold text-ink bg-brand-bg border-transparent";
const ROW_IDLE = "font-medium text-ink-soft bg-transparent border-transparent hover:text-ink hover:bg-surface-overlay";
const SUB_ACTIVE = "font-semibold text-ink bg-brand-bg";
const SUB_IDLE = "text-ink-soft hover:text-ink hover:bg-surface-overlay";

// The small green bar at the left edge of the current page's row.
function ActiveBar() {
  return <span className="absolute -left-3 top-1/2 -translate-y-1/2 w-[4px] h-5 rounded-r-full bg-brand-fill" />;
}

// A nav item with sub-pages: the row links to the parent page, a separate
// chevron opens/closes the list. Starts open when one of its sub-pages is
// the current page. In the collapsed sidebar the sub-pages show as their
// own icon links under the parent, so they stay one click away.
function NavGroup({
  item,
  activeHref,
  collapsed,
}: {
  item: NavItem & { children: NavItem[] };
  activeHref: string;
  collapsed: boolean;
}) {
  const childActive = item.children.some((c) => isActive(activeHref, c.href));
  const [open, setOpen] = useState(childActive);
  const Icon = ICONS[item.icon];
  // A sub-page under the parent's path (/catalog/flagged) highlights the
  // sub-item, not the parent too.
  const parentActive = isActive(activeHref, item.href) && !childActive;
  const highlighted = parentActive || childActive;

  if (collapsed) {
    return (
      <>
        {[item, ...item.children].map((entry) => {
          const EntryIcon = ICONS[entry.icon];
          const on = entry === item ? parentActive : isActive(activeHref, entry.href);
          return (
            <Link
              key={entry.href}
              href={entry.href}
              title={entry.label}
              className={`relative flex items-center justify-center rounded-sm no-underline border p-[11px] transition-[background,color] duration-150 ${
                on ? ROW_ACTIVE : ROW_IDLE
              }`}
            >
              <EntryIcon size={entry === item ? 18 : 15} strokeWidth={2} className={`shrink-0 ${on ? "text-brand" : "text-ink-faint"}`} />
            </Link>
          );
        })}
      </>
    );
  }

  return (
    <div className="relative">
      <div
        className={`relative flex items-center gap-1 rounded-sm text-[0.9rem] whitespace-nowrap transition-[background,color] duration-150 border justify-start pl-3 pr-1.5 py-1 ${
          parentActive ? ROW_ACTIVE : ROW_IDLE
        }`}
      >
        {highlighted && <ActiveBar />}
        <Link href={item.href} className="relative flex items-center gap-3 no-underline flex-1 min-w-0 justify-start py-1.5">
          <Icon size={18} strokeWidth={2} className={`shrink-0 ${highlighted ? "text-brand" : "text-ink-faint"}`} />
          <span className={highlighted ? "font-semibold text-ink" : ""}>{item.label}</span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? `Collapse ${item.label} menu` : `Expand ${item.label} menu`}
          aria-expanded={open}
          className="shrink-0 flex items-center justify-center w-7 h-7 rounded-full bg-transparent border-0 cursor-pointer text-ink-faint hover:text-ink hover:bg-surface-overlay"
        >
          <ChevronUp size={14} className={`transition-transform duration-150 ${open ? "" : "rotate-180"}`} />
        </button>
      </div>

      {open && (
        <div className="flex flex-col mt-[3px] ml-[21px] pl-3 border-l border-border gap-[3px]">
          {item.children.map((child) => {
            const ChildIcon = ICONS[child.icon];
            const on = isActive(activeHref, child.href);
            return (
              <Link
                key={child.href}
                href={child.href}
                className={`flex items-center gap-2.5 no-underline text-[0.85rem] whitespace-nowrap rounded-sm px-3 py-2 ${on ? SUB_ACTIVE : SUB_IDLE}`}
              >
                <ChildIcon size={14} className={`shrink-0 ${on ? "text-brand" : "text-ink-faint"}`} />
                {child.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// The Alvik wordmark (expanded) or mark (collapsed), each in a white-text
// version for the dark theme and a dark-text version for the light theme;
// globals.css shows the one that matches the current theme.
function Brand({ collapsed }: { collapsed: boolean }) {
  if (collapsed) {
    return (
      <span className="flex items-center justify-center w-9 h-9 shrink-0">
        <Image src="/logos/Alvik FavIcon White.png" alt="Alvik PIM" width={859} height={720} priority className="logo-on-dark w-full h-auto" />
        <Image src="/logos/Alvik FavIcon Black.png" alt="Alvik PIM" width={907} height={720} priority className="logo-on-light w-full h-auto" />
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2.5 whitespace-nowrap">
      <span className="block w-[96px] shrink-0">
        <Image src="/logos/Alvik Logo v2 - Dark.png" alt="Alvik" width={1244} height={355} priority className="logo-on-dark w-full h-auto" />
        <Image src="/logos/Alvik Logo v2 - Light.png" alt="Alvik" width={1246} height={359} priority className="logo-on-light w-full h-auto" />
      </span>
      <span className="font-display font-bold text-[0.7rem] tracking-[0.12em] text-brand bg-brand-bg rounded-full px-2 py-[3px] leading-none">
        PIM
      </span>
    </span>
  );
}

export function Sidebar({
  nav,
  activeHref,
  role,
}: {
  nav: NavItem[];
  activeHref: string;
  role: string;
}) {
  const [collapsedPref, setCollapsedPref] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  // The phone/tablet drawer always shows the full sidebar; "collapsed" is a
  // desktop-only preference.
  const collapsed = collapsedPref && !mobileOpen;

  const isAdmin = hasFullAccess(role);
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
      if (stored === "1") setCollapsedPref(true);
    } catch {
      /* ignore */
    }
  }, []);

  // Drawer: opened by the header's menu button; closes on Escape, and when
  // the window grows to desktop width (where the sidebar is always shown).
  useEffect(() => {
    const open = () => setMobileOpen(true);
    window.addEventListener(OPEN_NAV_EVENT, open);
    const desktop = window.matchMedia("(min-width: 1024px)");
    const onWidth = (e: MediaQueryListEvent) => {
      if (e.matches) setMobileOpen(false);
    };
    desktop.addEventListener("change", onWidth);
    return () => {
      window.removeEventListener(OPEN_NAV_EVENT, open);
      desktop.removeEventListener("change", onWidth);
    };
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [mobileOpen]);

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
    setCollapsedPref((prev) => {
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
    <>
      {/* Dimmed backdrop behind the phone/tablet drawer. */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`shrink-0 border-r border-border bg-surface h-[100dvh] fixed inset-y-0 left-0 z-50 w-[280px] max-w-[85vw] lg:sticky lg:top-0 lg:bottom-auto lg:z-auto lg:max-w-none lg:visible ${
          mobileOpen ? "translate-x-0 shadow-lg" : "-translate-x-full invisible"
        } lg:translate-x-0 lg:shadow-none ${collapsedPref ? "lg:w-[76px]" : "lg:w-[256px]"} ${
          mounted ? "transition-[width,transform,visibility] duration-[220ms] ease-[cubic-bezier(0.4,0,0.2,1)]" : ""
        }`}
        aria-label="Main navigation"
      >
        {/* Everything but the floating collapse button below is clipped here
            — the button itself sits outside this wrapper, straddling the
            aside's right border, which needs the aside's own overflow left
            open so the button isn't cut in half. */}
        <div className="flex flex-col h-full px-3 py-5 overflow-hidden">
          <div
            className={`flex items-center gap-2 pb-6 px-2 min-h-[44px] ${collapsed ? "justify-center" : "justify-between"}`}
            suppressHydrationWarning
          >
            <Link href="/" className="no-underline overflow-hidden" aria-label="Alvik PIM home">
              <Brand collapsed={collapsed} />
            </Link>
            {mobileOpen && (
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="lg:hidden flex items-center justify-center w-9 h-9 rounded-full border border-border bg-surface-raised text-ink-soft hover:text-ink cursor-pointer"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {!collapsed && (
            <div className="text-[0.7rem] font-semibold text-ink-faint uppercase tracking-[0.1em] px-3 pb-2" suppressHydrationWarning>
              Workspace
            </div>
          )}

          <nav className="flex flex-col gap-[3px] flex-1 overflow-y-auto overflow-x-hidden pl-3 -ml-3" onClick={(e) => {
            // Picking a page in the drawer closes it (the new page renders a
            // fresh sidebar anyway; this makes the tap feel immediate).
            if ((e.target as HTMLElement).closest("a")) setMobileOpen(false);
          }}>
          {nav.map((item) => {
            const active = isActive(activeHref, item.href);
            const Icon = ICONS[item.icon];

            if (item.children && item.children.length > 0) {
              return (
                <NavGroup
                  key={item.href}
                  item={item as NavItem & { children: NavItem[] }}
                  activeHref={activeHref}
                  collapsed={collapsed}
                />
              );
            }

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
                    className={`relative flex items-center justify-center rounded-sm no-underline text-[0.9rem] whitespace-nowrap transition-[background,color] duration-150 border p-[11px] ${
                      settingsActive ? ROW_ACTIVE : ROW_IDLE
                    }`}
                  >
                    <Icon size={18} strokeWidth={2} className={`shrink-0 ${settingsActive ? "text-brand" : "text-ink-faint"}`} />
                  </Link>
                );
              }

              const on = settingsActive || settingsOpen;
              return (
                <div key={item.href} ref={settingsRef} className="relative">
                  <div
                    className={`relative flex items-center gap-1 rounded-sm text-[0.9rem] whitespace-nowrap transition-[background,color] duration-150 border justify-start pl-3 pr-1.5 py-1 ${
                      on ? ROW_ACTIVE : ROW_IDLE
                    }`}
                  >
                    {on && <ActiveBar />}
                    <Link
                      href={item.href}
                      className="relative flex items-center gap-3 no-underline flex-1 min-w-0 justify-start py-1.5"
                    >
                      <Icon size={18} strokeWidth={2} className={`shrink-0 ${on ? "text-brand" : "text-ink-faint"}`} />
                      <span>{item.label}</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => setSettingsOpen((v) => !v)}
                      aria-label={settingsOpen ? "Collapse settings menu" : "Expand settings menu"}
                      aria-expanded={settingsOpen}
                      className="shrink-0 flex items-center justify-center w-7 h-7 rounded-full bg-transparent border-0 cursor-pointer text-ink-faint hover:text-ink hover:bg-surface-overlay"
                    >
                      <ChevronUp size={14} className={`transition-transform duration-150 ${settingsOpen ? "" : "rotate-180"}`} />
                    </button>
                  </div>

                  {settingsOpen && (
                    <div className="flex flex-col mt-[3px] ml-[21px] pl-3 border-l border-border gap-[3px]">
                      {isAdmin && (
                        <Link
                          href="/admin/users"
                          className={`flex items-center gap-2.5 no-underline text-[0.85rem] whitespace-nowrap rounded-sm px-3 py-2 ${
                            activeHref.startsWith("/admin/users") ? SUB_ACTIVE : SUB_IDLE
                          }`}
                        >
                          <Users size={14} className="shrink-0 text-ink-faint" />
                          Users &amp; Roles
                        </Link>
                      )}
                      <Link
                        href="/settings/notifications"
                        className={`flex items-center gap-2.5 no-underline text-[0.85rem] whitespace-nowrap rounded-sm px-3 py-2 ${
                          activeHref.startsWith("/settings/notifications") ? SUB_ACTIVE : SUB_IDLE
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
                        className="flex items-center gap-2.5 text-left bg-transparent border-0 cursor-pointer text-critical text-[0.85rem] whitespace-nowrap rounded-sm px-3 py-2 hover:bg-critical-bg"
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
                className={`relative flex items-center gap-3 rounded-sm no-underline text-[0.9rem] whitespace-nowrap transition-[background,color] duration-150 border ${
                  collapsed ? "justify-center p-[11px]" : "justify-start px-3 py-2.5"
                } ${active ? ROW_ACTIVE : ROW_IDLE}`}
              >
                {active && !collapsed && <ActiveBar />}
                <Icon size={18} strokeWidth={2} className={`shrink-0 ${active ? "text-brand" : "text-ink-faint"}`} />
                {!collapsed && item.label}
              </Link>
            );
          })}
          </nav>
        </div>

        {/* Collapse toggle (desktop only) — a small round button straddling
            the sidebar's right border, vertically centered. */}
        <button
          onClick={toggle}
          title={collapsedPref ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsedPref ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden lg:flex absolute top-1/2 -right-3 -translate-y-1/2 items-center justify-center w-6 h-6 rounded-full bg-surface-raised border border-border-strong text-ink-faint hover:text-brand cursor-pointer shadow-btn-quiet z-10"
        >
          {collapsedPref ? <ChevronsRight size={13} /> : <ChevronsLeft size={13} />}
        </button>
      </aside>
    </>
  );
}
