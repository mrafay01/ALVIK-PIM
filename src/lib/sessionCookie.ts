import type { NextRequest, NextResponse } from "next/server";
import { getToken, encode } from "next-auth/jwt";
import { authOptions } from "@/lib/auth";

// Signing out every other device means bumping the user's sessionVersion,
// which also revokes this browser's own cookie. These helpers read the
// caller's current token (from a request authenticated before the bump) and
// write a fresh cookie carrying the new version, so only this device stays
// signed in. Used by "Sign out of all other devices" and by password change.

function cookieSettings() {
  const secureCookie = (process.env.NEXTAUTH_URL ?? "").startsWith("https://");
  return { secureCookie, name: `${secureCookie ? "__Secure-" : ""}next-auth.session-token` };
}

export async function readSessionToken(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET, secureCookie: cookieSettings().secureCookie });
  if (!token || token.invalid || typeof token.id !== "string") return null;
  return token;
}

export async function setFreshSessionCookie(
  res: NextResponse,
  token: NonNullable<Awaited<ReturnType<typeof readSessionToken>>>,
  sessionVersion: number
): Promise<void> {
  const { secureCookie, name } = cookieSettings();
  const maxAge = authOptions.session?.maxAge ?? 30 * 24 * 60 * 60;
  const value = await encode({ token: { ...token, sessionVersion }, secret: process.env.NEXTAUTH_SECRET!, maxAge });
  res.cookies.set(name, value, { httpOnly: true, sameSite: "lax", path: "/", secure: secureCookie, maxAge });
}
