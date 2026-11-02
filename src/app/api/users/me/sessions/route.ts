import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireSession, isAuthFail } from "@/lib/authz";
import { readSessionToken, setFreshSessionCookie } from "@/lib/sessionCookie";
import User from "@/models/User";

// DELETE: "Sign out of all other devices" (Settings > Security).
//
// Bumps sessionVersion, which revokes every JWT stamped with the old value —
// including this browser's own. To keep THIS device signed in, the response
// re-issues the caller's session cookie with the new sessionVersion.
//
// That re-issue has to happen here, server-side, from a request that was
// authenticated before the bump. The old approach (calling getSession() on
// the client afterwards) never updated the stamped version, so the caller
// was signed out too — and a client-triggered "re-validate my token" path
// would let anyone holding a stolen cookie un-revoke it.
export async function DELETE(req: NextRequest) {
  const gate = await requireSession();
  if (isAuthFail(gate)) return gate.response;

  const token = await readSessionToken(req);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const user = await User.findByIdAndUpdate(token.id, { $inc: { sessionVersion: 1 } }, { new: true }).select("sessionVersion");
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const res = NextResponse.json({ ok: true });
  await setFreshSessionCookie(res, token, user.sessionVersion);
  return res;
}
