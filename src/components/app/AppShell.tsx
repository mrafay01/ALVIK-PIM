import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import type { Role } from "@/lib/enums";
import { Sidebar, type NavItem } from "./Sidebar";

const NAV: (NavItem & { roles: Role[] | null })[] = [
  { href: "/items", label: "Items", icon: "Gem", roles: null },
  { href: "/purchase-orders", label: "Purchase Orders", icon: "ClipboardList", roles: null },
  { href: "/payables", label: "Payables", icon: "Wallet", roles: ["administrator", "accounts_finance"] as Role[] },
  { href: "/catalog", label: "Catalog", icon: "BookOpenCheck", roles: null },
  { href: "/admin/import-review", label: "Legacy Import", icon: "FileSpreadsheet", roles: ["administrator"] as Role[] },
  { href: "/admin/monday-pull", label: "Monday Import", icon: "RefreshCw", roles: ["administrator"] as Role[] },
];

export async function AppShell({
  children,
  title,
  eyebrow,
  activeHref,
}: {
  children: React.ReactNode;
  title: string;
  eyebrow?: string;
  activeHref: string;
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
    <div className="flex min-h-screen">
      <Sidebar nav={visibleNav} activeHref={activeHref} name={name} role={role ?? ""} initials={initials} />

      <div className="flex-1 min-w-0">
        <header className="px-10 py-5 border-b border-border bg-surface sticky top-0 z-10 backdrop-blur-sm">
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
