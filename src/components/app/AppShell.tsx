import { getServerSession } from "next-auth";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { authOptions } from "@/lib/auth";
import type { Role } from "@/lib/enums";
import { Sidebar, type NavItem } from "./Sidebar";

const NAV: (NavItem & { roles: Role[] | null })[] = [
  { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard", roles: null },
  { href: "/vendor-items", label: "Vendor Items", icon: "Gem", roles: null },
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
  { href: "/admin/users", label: "Users & Roles", icon: "Users", roles: ["administrator"] as Role[] },
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
      <Sidebar nav={visibleNav} activeHref={activeHref} name={name} role={role ?? ""} initials={initials} />

      <div className="flex-1 min-w-0" suppressHydrationWarning>
        <header className="px-10 py-5 border-b border-border bg-surface sticky top-0 z-10 backdrop-blur-sm">
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
        </header>

        <main className="px-10 pt-8 pb-16">{children}</main>
      </div>
    </div>
  );
}
