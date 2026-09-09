import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db";
import { rateLimit } from "@/lib/rateLimit";
import User from "@/models/User";
import type { Role } from "@/lib/enums";

class LoginRateLimitError extends Error {
  constructor() {
    super("Too many sign-in attempts. Wait a minute and try again.");
    this.name = "LoginRateLimitError";
  }
}

// NextAuth silently falls back to an unstable/insecure signing behavior if
// NEXTAUTH_SECRET is missing. Fail loudly in production instead — a
// mis-deployed instance should not boot rather than issue forgeable JWTs.
if (process.env.NODE_ENV === "production" && !process.env.NEXTAUTH_SECRET) {
  throw new Error("NEXTAUTH_SECRET must be set in production");
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = credentials.email.toLowerCase();

        // Throttle credential-stuffing: cap attempts per email and per
        // client IP over a 1-minute window. Throwing here surfaces to the
        // client as a CredentialsSignin error (the form shows a message);
        // NextAuth doesn't distinguish error kinds for this provider.
        const ip =
          (req?.headers?.["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
          (req?.headers?.["x-real-ip"] as string | undefined) ||
          "unknown";
        const perEmail = rateLimit(`login:email:${email}`, { limit: 5, windowMs: 60_000 });
        const perIp = rateLimit(`login:ip:${ip}`, { limit: 20, windowMs: 60_000 });
        if (!perEmail.allowed || !perIp.allowed) {
          throw new LoginRateLimitError();
        }

        await connectDB();
        const user = await User.findOne({
          email,
          active: true,
        });
        if (!user) return null;

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role as Role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role: Role }).role;
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role as Role;
        session.user.id = token.id as string;
      }
      return session;
    },
  },
};
