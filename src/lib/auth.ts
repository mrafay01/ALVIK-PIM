import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { connectDB } from "@/lib/db";
import { checkLoginThrottle, recordLoginFailure } from "@/lib/loginThrottle";
import { maskEmail } from "@/lib/logMask";
import { redeemSessionTicket } from "@/lib/otp";
import { verifyCredentials, normalizeEmail } from "@/lib/credentials";
import { clientIp } from "@/lib/clientIp";
import logger from "@/lib/logger";
import User from "@/models/User";
import type { Role } from "@/lib/enums";

// Thrown (not returned null) so its message reaches the client: with
// redirect:false, signIn() resolves to { error: <this message> }. The login
// page recognises it by this exact prefix to show it instead of the generic
// "invalid credentials" text.
export const RATE_LIMIT_MESSAGE = "Too many sign-in attempts. Wait a minute and try again.";

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
  session: {
    strategy: "jwt",
    // 7-day inactivity timeout — if a session cookie goes a week without
    // being used it expires, instead of NextAuth's 30-day default. Short
    // enough that a stolen laptop or a long-abandoned browser session
    // becomes dead weight within a reasonable window, long enough that
    // regular users never meet the login screen in a normal week.
    maxAge: 7 * 24 * 60 * 60,
    // Refresh the cookie every 24h of activity rather than on every
    // request — reduces how often JWTs are reissued without materially
    // changing the inactivity window above.
    updateAge: 24 * 60 * 60,
  },
  pages: {
    signIn: "/login",
    // Any NextAuth error page (e.g. a malformed callback) lands back on the
    // app's own login screen instead of NextAuth's unstyled default.
    error: "/login",
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
          logger.warn("Login attempt with missing credentials", { email: maskEmail(credentials?.email) });
          return null;
        }
        if (OTP_2FA_ENABLED && !credentials?.sessionTicket) {
          logger.warn("Login attempt with missing OTP ticket", { email: maskEmail(credentials.email) });
          return null;
        }

        // Same normalization as the OTP routes — previously this only
        // lowercased, so an email with a stray space (common with mobile
        // autofill) passed the OTP step and then failed here.
        const email = normalizeEmail(credentials.email);

        // Throttle brute force: failed attempts per (email, IP) and per
        // email, plus every attempt per client IP. See lib/loginThrottle.ts
        // for why a good attempt never counts against the account.
        const ip = clientIp(req?.headers as Record<string, string | string[] | undefined> | undefined);
        const throttle = await checkLoginThrottle(email, ip);
        if (throttle.blocked) {
          logger.warn("Login rate limit exceeded", { email: maskEmail(email), ip });
          throw new Error(RATE_LIMIT_MESSAGE);
        }

        const user = await verifyCredentials(email, credentials.password);
        if (!user) {
          await recordLoginFailure(email, ip);
          logger.warn("Login failed: invalid credentials", { email: maskEmail(email), ip });
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
            await recordLoginFailure(email, ip);
            logger.warn("Login failed: invalid OTP ticket", { email: maskEmail(email), ip });
            return null;
          }
        }

        logger.info("Login successful", { email: maskEmail(email), userId: user._id.toString(), role: user.role });
        return {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role as Role,
          sessionVersion: user.sessionVersion ?? 0,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role: Role }).role;
        token.id = user.id;
        token.sessionVersion = (user as { sessionVersion?: number }).sessionVersion ?? 0;
        return token;
      }

      // Runs whenever the server resolves a session (getServerSession in
      // pages and API handlers, /api/auth/session from the client) — not in
      // middleware, which only decodes the cookie. Re-checks the stamped
      // version against the DB: a mismatch means "Sign out of all other
      // devices" was used since this token was minted, or the account was
      // deactivated. token.invalid is then written back into the cookie, so
      // middleware sees it on the next navigation; API handlers already
      // reject it immediately because getServerSession returns no user.
      if (token.invalid) return token;
      if (typeof token.id === "string") {
        await connectDB();
        const current = await User.findById(token.id).select("sessionVersion active").lean();
        if (!current || !current.active || current.sessionVersion !== token.sessionVersion) {
          token.invalid = true;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token.invalid) {
        // Returning an empty object (rather than throwing) is the
        // documented way to signal "no session" from this callback —
        // useSession()/getServerSession() then report the caller as
        // signed out, and middleware's existing "no role -> redirect to
        // /login" path takes it from there.
        return {} as typeof session;
      }
      if (session.user) {
        session.user.role = token.role as Role;
        session.user.id = token.id as string;
      }
      return session;
    },
  },
};
