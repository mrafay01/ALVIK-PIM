import type { Role } from "@/lib/enums";

declare module "next-auth" {
  interface Session {
    user?: {
      id?: string;
      name?: string | null;
      email?: string | null;
      role?: Role;
    };
  }

  interface User {
    id: string;
    role: Role;
    sessionVersion?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: Role;
    // Stamped at sign-in from User.sessionVersion; re-checked against the
    // DB on every subsequent request so "Sign out of all other devices"
    // can actually revoke a stateless JWT — see auth.ts's jwt callback.
    sessionVersion?: number;
    // Set (never stamped at sign-in) once a request-time check finds the
    // token's sessionVersion no longer matches the DB — tells the session
    // callback to report the caller as signed out.
    invalid?: true;
  }
}
