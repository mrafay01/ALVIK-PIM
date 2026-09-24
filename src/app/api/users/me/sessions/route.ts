import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireSession, isAuthFail } from "@/lib/authz";
import User from "@/models/User";

// DELETE: "Sign out of all other devices" (Settings > Security). Bumps
// sessionVersion so every JWT stamped with the old value fails the
// per-request check in auth.ts's jwt callback and gets treated as signed
// out (see middleware.ts). This includes the CALLER's own current cookie —
// NextAuth doesn't rotate a JWT mid-life on its own — so the client must
// immediately force a session refresh (next-auth/react's getSession() or
// useSession().update()) right after this succeeds to stay logged in on
// this device; every other device only finds out on its next request.
export async function DELETE() {
  const gate = await requireSession();
  if (isAuthFail(gate)) return gate.response;

  await connectDB();
  const user = await User.findById(gate.session.user?.id).select("sessionVersion");
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  user.sessionVersion = (user.sessionVersion ?? 0) + 1;
  await user.save();

  return NextResponse.json({ ok: true });
}
