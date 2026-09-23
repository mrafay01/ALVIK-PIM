import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import type { Role } from "@/lib/enums";

// The Edge runtime (where middleware always executes) doesn't support
// Node's `fs`/`path` modules, which the shared Winston logger (@/lib/logger)
// depends on — importing it here breaks every request with a 500. Use
// plain console logging instead for this file only.
const logger = {
  debug: (...args: unknown[]) => console.debug(...args),
  warn: (...args: unknown[]) => console.warn(...args),
};

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
  // /catalog itself is read-only for any signed-in user; only the
  // hand-entry form is gated.
  ["/catalog/new", ["marketplace_listing"]],
  // /settings deliberately has no entry here — firstMatch() returning
  // undefined means "any signed-in role passes" (see the call site below).
  // It's every user's own account page; the admin-only bits it links to
  // (Users & Roles) are still gated by their own /admin prefix above.
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
  ["/api/quotations", ["buying_purchasing", "buyer_merchandiser", "marketplace_listing"]],
  ["/api/items", ["buyer_merchandiser", "buying_purchasing", "marketplace_listing", "photography"]],
  ["/api/marketplace-export", ["marketplace_listing"]],
  // /api/catalog: create is marketplace_listing; the approve sub-route is
  // admin-only, enforced in the handler itself.
  ["/api/catalog", ["marketplace_listing"]],
  // /api/users (self-service notification prefs) deliberately has no entry
  // — any signed-in role passes, same reasoning as /settings above.
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
    const userId = req.nextauth.token?.id as string | undefined;

    if (!role) {
      if (isApi) {
        logger.warn("API request without role", { path, method: req.method });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.redirect(new URL("/login", req.url));
    }

    if (role === "administrator") {
      if (isApi) {
        logger.debug("API request", { path, method: req.method, userId, role });
      }
      return NextResponse.next();
    }

    const allowed = isApi
      ? firstMatch(path, API_ROUTE_ROLES)
      : firstMatch(path, PAGE_ROUTE_ROLES);

    if (allowed && !allowed.includes(role)) {
      if (isApi) {
        logger.warn("API request forbidden by role", { path, method: req.method, userId, role, required: allowed });
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/unauthorized", req.url));
    }

    if (isApi) {
      logger.debug("API request", { path, method: req.method, userId, role });
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
    "/dashboard/:path*",
    "/items/:path*",
    "/purchase-orders/:path*",
    "/payables/:path*",
    "/catalog/:path*",
    "/receiving/:path*",
    "/admin/:path*",
    "/marketplace-export/:path*",
    "/settings/:path*",
    "/api/items/:path*",
    "/api/catalog/:path*",
    "/api/purchase-orders/:path*",
    "/api/quotations/:path*",
    "/api/payables/:path*",
    "/api/monday/:path*",
    "/api/admin/:path*",
    "/api/marketplace-export/:path*",
    "/api/users/:path*",
  ],
};
