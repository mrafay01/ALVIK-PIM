import { getSession } from "@/lib/authz";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { Role } from "@/lib/enums";
import { Sidebar, type NavItem } from "./Sidebar";
import { ThemeSwitcherButton } from "./ThemeSwitcherButton";

// `children` render as a dropdown under their parent in the sidebar. Each
// entry (parent or child) has its own role list; a child whose parent the
// user can't see is shown as a top-level item instead, so nobody loses a
// page they're allowed to open.
type NavEntry = Omit<NavItem, "children"> & {
  roles: Role[] | null;
  children?: (Omit<NavItem, "children"> & { roles: Role[] | null })[];
};

const NAV: NavEntry[] = [
  { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard", roles: null },
  // Matches middleware's /purchase-orders gate — warehouse and photography
  // roles would only ever get "Not authorized" from this link.
  {
    href: "/purchase-orders",
    label: "Purchase Orders",
    icon: "ClipboardList",
    roles: ["buying_purchasing", "buyer_merchandiser", "catalog_manager"] as Role[],
    children: [
      // Quotes list; importing a file or entering a quote by hand starts from there.
      {
        href: "/purchase-orders/quotes",
        label: "Quotes",
        icon: "FileSpreadsheet",
        roles: ["buying_purchasing", "buyer_merchandiser", "catalog_manager"] as Role[],
      },
      { href: "/items", label: "Un-Verified Items", icon: "PackageSearch", roles: null },
      // Admin only, same as middleware's /admin gate.
      { href: "/admin/monday-pull", label: "Monday Import", icon: "RefreshCw", roles: [] },
    ],
  },
  {
    href: "/catalog",
    label: "Catalog",
    icon: "BookOpenCheck",
    roles: null,
    // Role lists match middleware's /catalog/new, /catalog/import,
    // /catalog/flagged and /catalog/export gates ([] = administrator only).
    children: [
      { href: "/catalog/new", label: "New catalog item", icon: "Plus", roles: ["catalog_manager"] as Role[] },
      { href: "/catalog/import", label: "Import Master File", icon: "FileUp", roles: [] },
      { href: "/catalog/flagged", label: "Flagged Items", icon: "Flag", roles: [] },
      {
        href: "/catalog/export",
        label: "Export catalog",
        icon: "FileDown",
        roles: ["buyer_merchandiser", "buying_purchasing", "catalog_manager"] as Role[],
      },
    ],
  },
  { href: "/images", label: "Images", icon: "Images", roles: null },
  // Master File import lives on the Catalog page ("Import Master File",
  // admin only) rather than its own nav entry.
  // Settings is the last item in the main nav list (not a separate footer
  // block) and expands as a dropdown in place — see Sidebar.tsx. Visible to
  // everyone; "Users & Roles" inside it is filtered to admins there.
  { href: "/help", label: "Help & Support", icon: "LifeBuoy", roles: null },
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
  const session = await getSession();
  const role = session?.user?.role as Role | undefined;

  // Server-side backstop. Middleware only decodes the cookie, so a session
  // revoked moments ago ("sign out of all other devices", or a deactivated
  // account) still looks valid there until the cookie is rewritten.
  // getServerSession re-checks the database, so no app page renders for a
  // revoked session. The ?session=expired marker tells middleware to clear
  // the stale cookie on /login — otherwise it would bounce straight back here.
  if (!role) redirect("/login?session=expired");
  const name = session?.user?.name ?? "—";
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const allowed = (roles: Role[] | null) => !roles || role === "administrator" || roles.includes(role);
  const visibleNav: NavItem[] = NAV.flatMap(({ roles, children, ...item }) => {
    const kids = (children ?? []).filter((c) => allowed(c.roles)).map((c) => ({ href: c.href, label: c.label, icon: c.icon }));
    if (!allowed(roles)) return kids;
    return [kids.length > 0 ? { ...item, children: kids } : item];
  });

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
