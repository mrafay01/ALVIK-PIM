import { getServerSession } from "next-auth";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { authOptions } from "@/lib/auth";
import type { Role } from "@/lib/enums";
import { Sidebar, type NavItem } from "./Sidebar";
import { ThemeSwitcherButton } from "./ThemeSwitcherButton";

const NAV: (NavItem & { roles: Role[] | null })[] = [
  { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard", roles: null },
  { href: "/purchase-orders", label: "Purchase Orders", icon: "ClipboardList", roles: null },
  { href: "/payables", label: "Payables", icon: "Wallet", roles: ["administrator", "accounts_finance"] as Role[] },
  { href: "/catalog", label: "Catalog", icon: "BookOpenCheck", roles: null },
  {
    href: "/marketplace-export",
    label: "Marketplace Export",
    icon: "Store",
    roles: ["administrator", "marketplace_listing"] as Role[],
  },
  { href: "/admin/import-review", label: "Legacy Import", icon: "FileSpreadsheet", roles: ["administrator"] as Role[] },
  { href: "/admin/monday-pull", label: "Monday Import", icon: "RefreshCw", roles: ["administrator"] as Role[] },
  // Settings is the last item in the main nav list (not a separate footer
  // block) and expands as a dropdown in place — see Sidebar.tsx. Visible to
  // everyone; "Users & Roles" inside it is filtered to admins there.
  { href: "/settings", label: "Settings", icon: "Settings", roles: null },
];

export async function AppShell({
  children,
  title,
  eyebrow,
  activeHref,
  backHref,
  backLabel,
}: {
  children: React.ReactNode;
  title: string;
  eyebrow?: string;
  activeHref: string;
  // When set, renders a "back to <backLabel>" link in the header — for a
  // sub-page reached via a specific parent (an item detail page, a PO
  // detail page, a "new X" form), pointing at that parent's real URL
  // rather than relying on browser history (router.back() would land
  // wherever the user actually came from, which might not be this app's
  // own flow at all — e.g. a bookmark or a fresh tab).
  backHref?: string;
  backLabel?: string;
}) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role as Role | undefined;
  const name = session?.user?.name ?? "—";
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const visibleNav = NAV.filter((item) => !item.roles || role === "administrator" || (role && item.roles.includes(role)));

  return (
    // suppressHydrationWarning here (and on the wrapper divs inside Sidebar):
    // browser extensions that scan the DOM on load — Bitdefender's
    // Anti-tracker/Traffic Light is the common one — inject a
    // bis_skin_checked attribute onto plain wrapper <div>s before React
    // hydrates, which React otherwise (correctly, but noisily) flags as a
    // hydration mismatch even though nothing about the actual rendered
    // content differs. This only silences that one cosmetic warning class,
    // not real content/structure mismatches, which still surface normally.
    <div className="flex min-h-screen" suppressHydrationWarning>
      <Sidebar nav={visibleNav} activeHref={activeHref} role={role ?? ""} />

      <div className="flex-1 min-w-0" suppressHydrationWarning>
        <header className="flex items-start justify-between gap-6 px-10 py-5 border-b border-border bg-surface sticky top-0 z-10 backdrop-blur-sm">
          <div className="min-w-0">
            {backHref && (
              <Link
                href={backHref}
                className="inline-flex items-center gap-1.5 text-[0.8rem] font-semibold text-ink-faint no-underline mb-2.5 hover:text-brass transition-colors duration-150"
              >
                <ArrowLeft size={14} strokeWidth={2.25} />
                {backLabel ?? "Back"}
              </Link>
            )}
            {eyebrow && (
              <div className="text-xs font-bold text-brass uppercase tracking-wider mb-1">{eyebrow}</div>
            )}
            <h1 className="text-2xl">{title}</h1>
          </div>

          {/* Right side: the one place the signed-in user's identity and
              the theme switcher live — no separate identity strip above
              this any more, everything else lives in the sidebar's
              Settings dropdown. */}
          <div className="flex items-center gap-3.5 shrink-0 pt-0.5" suppressHydrationWarning>
            <ThemeSwitcherButton />
            <div className="flex items-center gap-2.5 border-l border-border pl-3.5" suppressHydrationWarning>
              <span
                className="w-7 h-7 rounded-full bg-navy-deep text-surface flex items-center justify-center text-[0.7rem] font-bold font-mono shrink-0"
                suppressHydrationWarning
              >
                {initials || "?"}
              </span>
              <div className="text-right leading-tight" suppressHydrationWarning>
                <div className="text-[0.8rem] font-semibold text-ink" suppressHydrationWarning>
                  {name}
                </div>
                <div className="text-[0.68rem] text-ink-faint capitalize" suppressHydrationWarning>
                  {role?.replace(/_/g, " ") ?? "—"}
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="px-10 pt-8 pb-16">{children}</main>
      </div>
    </div>
  );
}
