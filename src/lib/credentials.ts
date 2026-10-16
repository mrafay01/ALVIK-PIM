import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db";
import User from "@/models/User";

// The one place a sign-in email + password is checked. Used by both the OTP
// request step and NextAuth's authorize(), so the two can never disagree on
// normalization or on which accounts may sign in.

// Hash of a random string, cost 12 to match real password hashes. Compared
// against when no account exists, so "no such user" takes as long as
// "wrong password" and response timing can't be used to discover accounts.
const DUMMY_HASH = "$2a$12$KUI11wX4XZCJVSu7N/l66.7RpbHSB.ENIMWoNmvTF7bNBsWuK2Y.6";

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export async function verifyCredentials(rawEmail: string, password: string) {
  const email = normalizeEmail(rawEmail);
  if (!email || !password) return null;

  await connectDB();
  const user = await User.findOne({ email, active: true });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  return user && ok ? user : null;
}
