"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Gem,
  ClipboardList,
  Wallet,
  BookOpenCheck,
  FileSpreadsheet,
  Sparkles,
} from "lucide-react";

const NAV = [
  { href: "/present", label: "Dashboard", icon: LayoutDashboard },
  { href: "/present/items", label: "Items", icon: Gem },
  { href: "/present/purchase-orders", label: "Purchase Orders", icon: ClipboardList },
  { href: "/present/payables", label: "Payables", icon: Wallet },
  { href: "/present/catalog", label: "Catalog Gate", icon: BookOpenCheck },
  { href: "/present/import-review", label: "Legacy Import", icon: FileSpreadsheet },
];

export function PresentShell({
  children,
  title,
  eyebrow,
}: {
  children: React.ReactNode;
  title: string;
  eyebrow?: string;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen">
      <aside className="w-[220px] shrink-0 border-r border-border bg-surface flex flex-col px-3.5 py-6 sticky top-0 h-screen">
        <div className="px-2.5 pb-7">
          <div className="flex items-center gap-2 font-display font-semibold text-lg text-ink">
            <span
              className="flex items-center justify-center w-[30px] h-[30px] rounded-sm"
              style={{ background: "linear-gradient(135deg, var(--brass) 0%, var(--brass-soft) 130%)" }}
            >
              <Sparkles size={16} strokeWidth={2.25} color="#1a1409" />
            </span>
            CZC PIM
          </div>
          <div className="text-[0.7rem] text-ink-faint tracking-wide uppercase mt-1 pl-0.5">Client Preview</div>
        </div>

        <nav className="flex flex-col gap-0.5">
          {NAV.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-sm no-underline text-[0.87rem] ${
                  active ? "font-semibold text-ink bg-brass-bg" : "font-medium text-ink-soft bg-transparent"
                }`}
              >
                <Icon size={17} strokeWidth={2} className={active ? "text-brass" : "text-ink-faint"} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto px-2.5">
          <div className="text-[0.72rem] text-ink-faint border-t border-border pt-3.5 leading-relaxed">
            Mock data for demonstration.
            <br />
            Live app runs on real MongoDB.
          </div>
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        <header className="flex items-center justify-between px-9 py-[18px] border-b border-border bg-surface">
          <div>
            {eyebrow && (
              <div className="text-xs font-semibold text-brass uppercase tracking-wide mb-1">{eyebrow}</div>
            )}
            <h1 className="text-2xl">{title}</h1>
          </div>
          <div className="flex items-center gap-2.5 text-[0.83rem] text-ink-soft">
            <span className="w-[30px] h-[30px] rounded-full bg-navy-deep text-brass-soft flex items-center justify-center text-[0.78rem] font-semibold font-mono">
              JM
            </span>
            Joel
          </div>
        </header>

        <main className="px-9 pt-8 pb-16">{children}</main>
      </div>
    </div>
  );
}
