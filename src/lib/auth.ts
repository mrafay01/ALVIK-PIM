import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db";
import { rateLimit } from "@/lib/rateLimit";
import { redeemSessionTicket } from "@/lib/otp";
import logger from "@/lib/logger";
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

// Email-OTP second factor — off while it's in testing. The /api/auth/otp/*
// routes, the LoginOtp model, and the login page's two-step UI are all
// still in place; this is the one switch that turns the requirement back
// on (set OTP_2FA_ENABLED=true) without touching any of that code.
const OTP_2FA_ENABLED = process.env.OTP_2FA_ENABLED === "true";

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
        sessionTicket: { label: "Session ticket", type: "text" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) {
          logger.warn("Login attempt with missing credentials", { email: credentials?.email });
          return null;
        }
        if (OTP_2FA_ENABLED && !credentials?.sessionTicket) {
          logger.warn("Login attempt with missing OTP ticket", { email: credentials.email });
          return null;
        }

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
          logger.warn("Login rate limit exceeded", { email, ip, perEmailRemaining: perEmail.remaining, perIpRemaining: perIp.remaining });
          throw new LoginRateLimitError();
        }

        await connectDB();
        const user = await User.findOne({
          email,
          active: true,
        });
        if (!user) {
          logger.warn("Login failed: user not found", { email, ip });
          return null;
        }

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) {
          logger.warn("Login failed: invalid password", { email, ip });
          return null;
        }

        // When enabled, password alone is never enough — a session only
        // mints once the caller also holds a session ticket proving they
        // completed the email-OTP step for this exact user (see
        // /api/auth/otp/*). The ticket is single-use, so this can't be
        // replayed. Currently off (OTP_2FA_ENABLED unset) while it's in
        // testing — see the flag's definition above.
        if (OTP_2FA_ENABLED) {
          const ticketOk = await redeemSessionTicket(user._id, credentials.sessionTicket!);
          if (!ticketOk) {
            logger.warn("Login failed: invalid OTP ticket", { email, ip });
            return null;
          }
        }

        logger.info("Login successful", { email, userId: user._id.toString(), role: user.role });
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
