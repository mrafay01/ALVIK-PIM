import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import type { Role } from "@/lib/enums";

// Route-prefix -> roles allowed there. Administrator always passes.
// Mirrors the roles table in PROJECT-REPORT.md §3/§7 and the ROLE_SETS map
// in src/lib/authz.ts (which enforces the same thing inside API handlers —
// this is the outer, defence-in-depth layer).
const PAGE_ROUTE_ROLES: [prefix: string, allowed: Role[]][] = [
  ["/payables", ["accounts_finance"]],
  ["/purchase-orders", ["buying_purchasing"]],
  ["/receiving", ["warehouse_receiving"]],
  ["/admin", []], // administrator only
  ["/marketplace-export", ["marketplace_listing"]],
];

// Middleware runs before the handler and can't see request bodies or
// distinguish "create PO from item intake" (item roles) from "advance PO
// pipeline" (buying only) — so these lists are the *loosest* role set any
// method on that prefix accepts. The precise per-method gate lives in the
// handler via requireRole() (see src/lib/authz.ts). This layer only stops
// a caller with no business anywhere near the prefix.
const API_ROUTE_ROLES: [prefix: string, allowed: Role[]][] = [
  ["/api/admin", []], // administrator only
  ["/api/monday/sync", []],
  ["/api/monday/pull", []],
  ["/api/monday", ["buying_purchasing"]],
  ["/api/payables", ["accounts_finance"]],
  ["/api/purchase-orders", ["buying_purchasing", "buyer_merchandiser", "marketplace_listing"]],
  ["/api/items", ["buyer_merchandiser", "buying_purchasing", "marketplace_listing", "photography"]],
  ["/api/marketplace-export", ["marketplace_listing"]],
];

function firstMatch(
  path: string,
  table: [string, Role[]][]
): Role[] | undefined {
  for (const [prefix, allowed] of table) {
    if (path === prefix || path.startsWith(prefix + "/")) return allowed;
  }
  return undefined;
}

export default withAuth(
  function middleware(req) {
    const path = req.nextUrl.pathname;
    const isApi = path.startsWith("/api/");
    const role = req.nextauth.token?.role as Role | undefined;

    if (!role) {
      return isApi
        ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        : NextResponse.redirect(new URL("/login", req.url));
    }

    if (role === "administrator") return NextResponse.next();

    const allowed = isApi
      ? firstMatch(path, API_ROUTE_ROLES)
      : firstMatch(path, PAGE_ROUTE_ROLES);

    if (allowed && !allowed.includes(role)) {
      return isApi
        ? NextResponse.json({ error: "Forbidden" }, { status: 403 })
        : NextResponse.redirect(new URL("/unauthorized", req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      // Always defer to the middleware function above rather than letting
      // withAuth redirect to its own default sign-in page.
      authorized: () => true,
    },
  }
);

export const config = {
  // Every real app screen and every mutating API route requires a session.
  // /login, /unauthorized, and the NextAuth endpoints are excluded so the
  // auth flow itself stays reachable; the health check is public on purpose.
  matcher: [
    "/",
    "/items/:path*",
    "/purchase-orders/:path*",
    "/payables/:path*",
    "/catalog/:path*",
    "/receiving/:path*",
    "/admin/:path*",
    "/marketplace-export/:path*",
    "/api/items/:path*",
    "/api/purchase-orders/:path*",
    "/api/payables/:path*",
    "/api/monday/:path*",
    "/api/admin/:path*",
    "/api/marketplace-export/:path*",
  ],
};
