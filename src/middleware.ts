import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import type { Role } from "@/lib/enums";
import { safeCallbackPath } from "@/lib/safeCallback";

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
  // Viewable by everyone who works quotes; changing a PO is gated to
  // buying_purchasing in the API (and its controls hidden for others).
  ["/purchase-orders", ["buying_purchasing", "buyer_merchandiser", "catalog_manager"]],
  ["/receiving", ["warehouse_receiving"]],
  ["/admin", []], // administrator only
  // /catalog itself is read-only for any signed-in user; only the
  // hand-entry form is gated.
  ["/catalog/new", ["catalog_manager"]],
  ["/catalog/import", []], // Master File import: administrator only
  ["/catalog/flagged", []], // Flagged Master File rows: administrator only
  // Catalog export (ROLE_SETS.catalogExport): not photography / warehouse.
  ["/catalog/export", ["buyer_merchandiser", "buying_purchasing", "catalog_manager"]],
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
  // Read-only views on the PO detail page (vendor PI files, conversation).
  ["/api/monday/files", ["buying_purchasing", "buyer_merchandiser", "catalog_manager"]],
  ["/api/monday/updates", ["buying_purchasing", "buyer_merchandiser", "catalog_manager"]],
  ["/api/monday", ["buying_purchasing"]],
  ["/api/purchase-orders", ["buying_purchasing", "buyer_merchandiser", "catalog_manager"]],
  ["/api/quotations", ["buying_purchasing", "buyer_merchandiser", "catalog_manager"]],
  ["/api/items", ["buyer_merchandiser", "buying_purchasing", "catalog_manager", "photography"]],
  // Catalog export (ROLE_SETS.catalogExport); listed before /api/catalog,
  // which is narrower, since the first matching prefix wins.
  ["/api/catalog/export", ["buyer_merchandiser", "buying_purchasing", "catalog_manager"]],
  // /api/catalog: create is catalog_manager; the approve sub-route is
  // admin-only, enforced in the handler itself.
  ["/api/catalog", ["catalog_manager"]],
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

// CSRF defence for mutating API requests. NextAuth's session cookie is
// SameSite=Lax, which covers top-level navigation but not a cross-site
// fetch() carrying credentials. On every state-changing API call we also
// require the browser-sent Origin header to match the request's host —
// if the origin is cross-site, no browser will attach the cookie to a
// request that returns 403 here, and a tampered server-to-server call
// has no session cookie to begin with. Safe methods are unaffected so
// read endpoints keep working from any origin that has a valid session.
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Body-size caps per content-type. JSON stays small — the biggest JSON
// payload the app legitimately sends is a quote-commit of a few thousand
// rows, well under 1 MB. Multipart uploads need their own, larger cap
// since Master-File imports and image batches land that way; the per-
// route code also enforces a stricter cap inside the handler.
const MAX_JSON_BYTES = 1_000_000; // 1 MB
const MAX_MULTIPART_BYTES = 64 * 1024 * 1024; // 64 MB, aligned with import route

function tooLargeResponse(limit: number) {
  return NextResponse.json(
    { error: `Request body too large (limit ${Math.floor(limit / 1024)} KB)` },
    { status: 413 }
  );
}

function hasSessionCookie(req: Request): boolean {
  return (req.headers.get("cookie") ?? "").includes("next-auth.session-token");
}

function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) {
    // Non-browser clients (curl, server-to-server) don't send Origin.
    // Fall back to Referer. With neither, allow only a cookie-less request
    // (it can't act as anyone). Browsers always send Origin on a mutating
    // fetch, so a request carrying our session cookie without either
    // header has had them stripped and is refused.
    const referer = req.headers.get("referer");
    if (!referer) return !hasSessionCookie(req);
    try {
      const refUrl = new URL(referer);
      const host = req.headers.get("host") ?? "";
      return refUrl.host === host;
    } catch {
      return false;
    }
  }
  try {
    const originUrl = new URL(origin);
    const host = req.headers.get("host") ?? "";
    return originUrl.host === host;
  } catch {
    return false;
  }
}

export default withAuth(
  function middleware(req) {
    const path = req.nextUrl.pathname;
    const isApi = path.startsWith("/api/");

    // CSRF: block cross-origin mutating API requests before any handler sees
    // them. NextAuth's /api/auth/* endpoints handle their own origin logic
    // (and must keep accepting the sign-in POST from the login page);
    // everything else that mutates goes through this gate.
    if (
      isApi &&
      MUTATING_METHODS.has(req.method) &&
      !path.startsWith("/api/auth/") &&
      !isSameOrigin(req)
    ) {
      logger.warn("CSRF: cross-origin mutating API request blocked", {
        path,
        method: req.method,
        origin: req.headers.get("origin"),
      });
      return NextResponse.json({ error: "Cross-origin requests not allowed" }, { status: 403 });
    }

    // Early body-size cap on mutating API requests via Content-Length.
    // The per-route handler is still responsible for the hard cap after
    // reading (content-length is advisory and absent in some transports),
    // but rejecting an oversized header here saves the request from ever
    // being read into a handler.
    if (isApi && MUTATING_METHODS.has(req.method)) {
      // A body sent without Content-Length (chunked) would skip the cap
      // below, and handlers read bodies with req.json() / formData(), so
      // such requests are refused outright. Browsers always send the
      // header for the bodies this app posts. (Node enforces that the
      // body matches a declared Content-Length, so the header can't lie.)
      if (!req.headers.has("content-length") && req.headers.has("transfer-encoding")) {
        return NextResponse.json({ error: "Content-Length required" }, { status: 411 });
      }
      const contentLength = Number(req.headers.get("content-length") ?? "");
      if (Number.isFinite(contentLength) && contentLength > 0) {
        const contentType = (req.headers.get("content-type") ?? "").toLowerCase();
        const isMultipart = contentType.startsWith("multipart/form-data");
        const limit = isMultipart ? MAX_MULTIPART_BYTES : MAX_JSON_BYTES;
        if (contentLength > limit) {
          logger.warn("Request body exceeds size cap", { path, method: req.method, contentLength, limit });
          return tooLargeResponse(limit);
        }
      }
    }
    // Written into the cookie by the jwt callback (auth.ts) once a server-
    // side session check finds the token revoked (sessionVersion bumped or
    // account deactivated). Treated exactly like "no session".
    const invalidated = req.nextauth.token?.invalid === true;
    const role = invalidated ? undefined : (req.nextauth.token?.role as Role | undefined);
    const userId = req.nextauth.token?.id as string | undefined;

    // The login page: open to signed-out visitors; a signed-in user is sent
    // on to where they were heading (or the dashboard) instead of seeing the
    // form again.
    if (path === "/login") {
      // Sent here by AppShell after the server found this session revoked.
      // Clear the stale cookie so it can't keep bouncing the user back.
      if (req.nextUrl.searchParams.get("session") === "expired") {
        const res = NextResponse.next();
        for (const name of req.cookies.getAll().map((c) => c.name)) {
          if (name.includes("next-auth.session-token")) res.cookies.delete(name);
        }
        return res;
      }
      if (!role) return NextResponse.next();
      const target = safeCallbackPath(req.nextUrl.searchParams.get("callbackUrl")) ?? "/dashboard";
      return NextResponse.redirect(new URL(target, req.url));
    }

    if (!role) {
      if (isApi) {
        logger.warn("API request without role", { path, method: req.method });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      // Remember where they were going so login can send them back there.
      const loginUrl = new URL("/login", req.url);
      const back = safeCallbackPath(path + req.nextUrl.search);
      if (back && back !== "/" && back !== "/dashboard") loginUrl.searchParams.set("callbackUrl", back);
      return NextResponse.redirect(loginUrl);
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
  // /login is matched only so signed-in users get bounced past it (the
  // handler always lets signed-out visitors through). /unauthorized and the
  // NextAuth endpoints are excluded; the health check is public on purpose.
  matcher: [
    "/",
    "/login",
    "/dashboard/:path*",
    "/items/:path*",
    "/purchase-orders/:path*",
    "/catalog/:path*",
    "/receiving/:path*",
    "/admin/:path*",
    "/settings/:path*",
    "/help/:path*",
    "/images/:path*",
    "/api/items/:path*",
    "/api/catalog/:path*",
    "/api/purchase-orders/:path*",
    "/api/quotations/:path*",
    "/api/monday/:path*",
    "/api/admin/:path*",
    "/api/users/:path*",
    "/api/support/:path*",
    "/api/images/:path*",
  ],
};
