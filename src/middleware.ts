import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import type { Role } from "@/lib/enums";

// Route-prefix -> roles allowed to write there. Administrator always passes.
// Matches the roles table in the blueprint (§7) — reads still flow through,
// this only gates the write-focused sections a role has no business in.
const ROUTE_ROLES: Record<string, Role[]> = {
  "/payables": ["administrator", "accounts_finance"],
  "/purchase-orders": ["administrator", "buying_purchasing"],
  "/receiving": ["administrator", "warehouse_receiving"],
  "/items/*/media": ["administrator", "photography"],
  "/admin": ["administrator"],
};

export default withAuth(
  function middleware(req) {
    const role = req.nextauth.token?.role as Role | undefined;
    if (!role) return NextResponse.redirect(new URL("/login", req.url));

    if (role === "administrator") return NextResponse.next();

    const path = req.nextUrl.pathname;
    for (const [prefix, allowed] of Object.entries(ROUTE_ROLES)) {
      const pattern = prefix.replace("*", "[^/]+");
      if (new RegExp(`^${pattern}`).test(path) && !allowed.includes(role)) {
        return NextResponse.redirect(new URL("/unauthorized", req.url));
      }
    }
    return NextResponse.next();
  },
  {
    callbacks: {
      // Always defer to the middleware function above rather than letting
      // withAuth redirect to its own default sign-in page — the function
      // already redirects missing sessions to our /login page itself.
      authorized: () => true,
    },
  }
);

export const config = {
  // Every real app screen requires a session — previously this list only
  // covered role-restricted prefixes, so /items, /catalog, and / itself
  // rendered for anyone with the URL, no login required. /login and
  // /unauthorized are excluded so the redirect target itself stays reachable.
  matcher: [
    "/",
    "/items/:path*",
    "/purchase-orders/:path*",
    "/payables/:path*",
    "/catalog/:path*",
    "/receiving/:path*",
    "/admin/:path*",
  ],
};
