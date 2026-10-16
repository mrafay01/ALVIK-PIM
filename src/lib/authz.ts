import { cache } from "react";
import { NextResponse } from "next/server";
import { getServerSession, type Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import type { Role } from "@/lib/enums";

// Central authorization for API route handlers.
//
// Route-prefix gating in src/middleware.ts only covers page navigations —
// it does not run for /api/* requests, so every mutating API handler must
// check the caller's role itself. This is the one place that logic lives.
//
// An `administrator` always passes. A missing/expired session is 401;
// a valid session without an allowed role is 403.

export type AuthOk = { session: Session; role: Role };
export type AuthFail = { response: NextResponse };

// Resolving a session re-checks the user's sessionVersion in the database
// (see the jwt callback in auth.ts). A page render calls this from AppShell
// and usually from the page itself too; cache() makes that one lookup per
// request instead of one per caller. Outside a React render (route
// handlers) cache() is a plain pass-through.
export const getSession = cache(() => getServerSession(authOptions));

function isAdmin(role: Role | undefined): boolean {
  return role === "administrator";
}

// Require only that the caller is signed in (any role). Use for read
// endpoints that every authenticated user may hit.
export async function requireSession(): Promise<AuthOk | AuthFail> {
  const session = await getSession();
  const role = session?.user?.role as Role | undefined;
  if (!session || !role) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { session: session as Session, role };
}

// Require that the caller's role is in `allowed` (administrator always
// passes). Use for every write endpoint and for reads of role-restricted
// sections.
export async function requireRole(
  allowed: readonly Role[]
): Promise<AuthOk | AuthFail> {
  const gate = await requireSession();
  if ("response" in gate) return gate;
  if (isAdmin(gate.role) || allowed.includes(gate.role)) return gate;
  return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
}

// Narrowing helper so callers can write:
//   const gate = await requireRole([...]);
//   if (isAuthFail(gate)) return gate.response;
export function isAuthFail(gate: AuthOk | AuthFail): gate is AuthFail {
  return "response" in gate;
}

// For Server Components that need the current role to decide what UI to
// render (e.g. hide an action a role would only get a 403 from). Never the
// security boundary — that's requireRole in the API handlers.
export async function getSessionRole(): Promise<Role | undefined> {
  const session = await getSession();
  return session?.user?.role as Role | undefined;
}

export function roleCan(role: Role | undefined, allowed: readonly Role[]): boolean {
  return role === "administrator" || (!!role && allowed.includes(role));
}

// The role matrix, mirroring src/middleware.ts ROUTE_ROLES and the roles
// table in PROJECT-REPORT.md §3/§7. Referenced by the API handlers so the
// allow-lists are defined once.
export const ROLE_SETS = {
  // Item intake / review / lifecycle. Buyers and buying/purchasing own
  // this; marketplace_listing edits catalog content fields on the same doc.
  items: ["buyer_merchandiser", "buying_purchasing", "marketplace_listing"],
  // Image upload workflow.
  media: ["photography", "buying_purchasing"],
  // PO / PI pipeline: who may change a PO (advance stage, checklist, sync).
  purchaseOrders: ["buying_purchasing"],
  // Who may intake and review vendor quotes, and view the Purchase Orders
  // list and detail pages (read-only unless also in purchaseOrders).
  quotes: ["buying_purchasing", "buyer_merchandiser", "marketplace_listing"],
  // Admin-only areas: legacy import, Monday sync/pull.
  adminOnly: [] as Role[],
  // Marketplace listing review + bulk-import file export.
  marketplaceExport: ["marketplace_listing"],
} satisfies Record<string, readonly Role[]>;
