"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import Image from "next/image";
import { safeCallbackPath } from "@/lib/safeCallback";
import { LogIn, Gem, ClipboardList, ShieldCheck, Workflow, MailCheck, ArrowLeft } from "lucide-react";
import { Field, Input, ErrorText } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

const HIGHLIGHTS = [
  {
    icon: Gem,
    title: "One product record",
    body: "Quotes, samples and approvals in one place.",
  },
  {
    icon: ClipboardList,
    title: "Guided purchase orders",
    body: "Checklists keep every order on track.",
  },
  {
    icon: Workflow,
    title: "Connected tools",
    body: "Files, images and status updates stay in sync.",
  },
];

type Step = "password" | "otp";

// Mirrors the server-side OTP_2FA_ENABLED flag in src/lib/auth.ts — off
// while 2FA is in testing. Set both NEXT_PUBLIC_OTP_2FA_ENABLED and
// OTP_2FA_ENABLED to "true" together to turn it back on; leaving them out
// of sync makes this page request/verify a code that authorize() then
// ignores (harmless, just a confusing extra step for no reason).
const OTP_2FA_ENABLED = process.env.NEXT_PUBLIC_OTP_2FA_ENABLED === "true";

const RESEND_COOLDOWN_S = 30;

// Turns a NextAuth signIn() result into the message to show. A thrown error
// in authorize() (the rate limit) arrives as its own message; a plain
// "wrong credentials" arrives as the generic "CredentialsSignin" code.
function signInErrorMessage(error: string | null | undefined, fallback: string): string {
  if (error && error.startsWith("Too many")) return error;
  return fallback;
}

// Where to go after sign-in: the page the user was originally heading to
// (set by middleware as ?callbackUrl=), or the dashboard.
function postLoginTarget(): string {
  if (typeof window === "undefined") return "/dashboard";
  return safeCallbackPath(new URLSearchParams(window.location.search).get("callbackUrl")) ?? "/dashboard";
}

export default function LoginPage() {
  const [step, setStep] = useState<Step>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // One countdown, driven by state — the previous setInterval-per-send
  // approach leaked intervals (Back + Continue during a cooldown ran two at
  // once and counted down twice as fast) and kept ticking after unmount.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  // NextAuth's own error redirects (pages.error = /login) arrive as ?error=;
  // a session ended elsewhere (revoked / deactivated) arrives as ?session=expired.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err) setError(err.startsWith("Too many") ? err : "Sign-in failed. Please try again.");
    else if (params.get("session") === "expired") setError("Your session has ended. Please sign in again.");
  }, []);

  const normalizedEmail = () => email.trim().toLowerCase();

  // A full page navigation (not router.push): it guarantees the next request
  // carries the fresh session cookie and that no pre-login page data is
  // reused from the client router cache.
  function finishSignIn() {
    window.location.replace(postLoginTarget());
  }

  async function requestOtp() {
    const res = await fetch("/api/auth/otp/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normalizedEmail(), password }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Couldn't send a verification code. Try again.");
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      if (!OTP_2FA_ENABLED) {
        const result = await signIn("credentials", { email: normalizedEmail(), password, redirect: false });
        if (!result?.ok) {
          throw new Error(signInErrorMessage(result?.error, "Invalid email or password."));
        }
        finishSignIn();
        return;
      }

      await requestOtp();
      setCode("");
      setStep("otp");
      setResendCooldown(RESEND_COOLDOWN_S);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid email or password.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (resendCooldown > 0 || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await requestOtp();
      setCode("");
      setResendCooldown(RESEND_COOLDOWN_S);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't resend the code.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleOtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const verifyRes = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail(), code }),
      });
      const verifyData = await verifyRes.json().catch(() => ({}));
      if (!verifyRes.ok) {
        // A spent code can't be retried — clear it so the next attempt starts fresh.
        if (verifyData.reason === "too_many_attempts" || verifyData.reason === "expired") setCode("");
        throw new Error(verifyData.error || "That code isn't right.");
      }

      const result = await signIn("credentials", {
        email: normalizedEmail(),
        password,
        sessionTicket: verifyData.sessionTicket,
        redirect: false,
      });
      if (!result?.ok) {
        // The code is used up at this point, so staying on this step would
        // be a dead end — go back to the password step to get a new one.
        setStep("password");
        setCode("");
        throw new Error(
          signInErrorMessage(result?.error, "Sign-in couldn't be completed. Enter your password again to get a new code.")
        );
      }
      finishSignIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code isn't right.");
    } finally {
      setSubmitting(false);
    }
  }

  function backToPassword() {
    setStep("password");
    setCode("");
    setError(null);
  }

  return (
    <main className="min-h-[100dvh] grid lg:grid-cols-[1.1fr_1fr] bg-surface-sunken lg:p-3 lg:gap-3">
      {/* Left: brand / storytelling panel — an always-dark graphite plate
          with a soft green glow, like the Alvik site's dark sections.
          Hidden on phones/tablets, where the form shows the logo itself. */}
      <div className="plate-dark relative overflow-hidden hidden lg:flex flex-col items-center rounded-[28px] shadow-lg">
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(700px 420px at 0% 0%, var(--brand-glow), transparent 60%), radial-gradient(600px 400px at 100% 100%, var(--brand-bg), transparent 60%)",
          }}
        />

        <div className="relative w-full max-w-[480px] px-6 py-14 flex flex-col flex-1">
          <div>
            <Image
              src="/logos/Alvik Logo v2 - Dark.png"
              alt="Alvik"
              width={1244}
              height={355}
              priority
              className="h-[46px] w-auto"
            />

            <span className="mt-12 inline-flex items-center gap-2 font-display font-semibold text-[0.85rem] text-brand bg-surface-raised border border-border rounded-full px-3.5 py-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-fill" />
              Alvik PIM
            </span>
            <h1 className="mt-5 text-[2.6rem] leading-[1.12] tracking-tight text-ink">
              One system for every product, vendor, and order.
            </h1>
            <p className="mt-5 text-[1.02rem] text-ink-soft leading-[1.7]">
              Products, vendors and purchase orders in one place.
            </p>
          </div>

          <div className="flex flex-col gap-3 mt-10">
            {HIGHLIGHTS.map((h) => (
              <div
                key={h.title}
                className="flex gap-3.5 items-start rounded-[18px] p-3.5 bg-surface-raised border border-border"
              >
                <span className="flex items-center justify-center w-10 h-10 rounded-[12px] bg-brand-bg shrink-0">
                  <h.icon size={18} color="var(--brand)" strokeWidth={2} />
                </span>
                <div>
                  <div className="text-[0.97rem] font-bold text-ink mb-[3px]">{h.title}</div>
                  <div className="text-[0.87rem] text-ink-faint leading-[1.55]">{h.body}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 text-[0.8rem] text-ink-faint mt-auto pt-6 border-t border-border">
            <ShieldCheck size={14} />
            Secure, role-based access
          </div>
        </div>
      </div>

      {/* Right: sign-in form */}
      <div className="flex items-center justify-center px-5 py-10 sm:p-8">
        <div className="w-full max-w-[380px]">
          {/* Logo above the form where the brand panel is hidden. */}
          <div className="lg:hidden mb-10 flex justify-center">
            <span className="block w-[150px]">
              <Image src="/logos/Alvik Logo v2 - Dark.png" alt="Alvik" width={1244} height={355} priority className="logo-on-dark w-full h-auto" />
              <Image src="/logos/Alvik Logo v2 - Light.png" alt="Alvik" width={1246} height={359} priority className="logo-on-light w-full h-auto" />
            </span>
          </div>
          {step === "password" ? (
            <>
              <div className="mb-8">
                <h2 className="text-[1.75rem] tracking-tight mb-1.5">Welcome back</h2>
                <p className="text-[0.92rem] text-ink-faint m-0">Sign in to continue.</p>
              </div>

              <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-4">
                <Field label="Email">
                  <Input
                    type="email"
                    name="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                    placeholder="you@company.com"
                  />
                </Field>
                <Field label="Password">
                  <Input
                    type="password"
                    name="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                  />
                </Field>
                <Button type="submit" variant="primary" disabled={submitting} className="mt-1.5 !px-4 !py-[11px]">
                  <span className="flex items-center justify-center gap-1.5">
                    <LogIn size={16} />{" "}
                    {submitting ? (OTP_2FA_ENABLED ? "Sending code…" : "Signing in…") : OTP_2FA_ENABLED ? "Continue" : "Sign in"}
                  </span>
                </Button>
                {error && <ErrorText>{error}</ErrorText>}
              </form>

              <p className="mt-7 text-[0.78rem] text-ink-faint text-center">Need access? Contact your administrator.</p>
            </>
          ) : (
            <>
              <div className="mb-8">
                <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-brand-bg text-brand mb-4">
                  <MailCheck size={20} />
                </span>
                <h2 className="text-2xl mb-1.5">Check your email</h2>
                <p className="text-[0.88rem] text-ink-faint m-0">
                  We sent a 6-digit code to <span className="text-ink font-semibold">{normalizedEmail()}</span>. It expires
                  in 10 minutes.
                </p>
              </div>

              <form onSubmit={handleOtpSubmit} className="flex flex-col gap-4">
                <Field label="Verification code">
                  <Input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    required
                    autoFocus
                    placeholder="123456"
                    className="tracking-[0.4em] text-center font-mono text-lg"
                  />
                </Field>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={submitting || code.length !== 6}
                  className="mt-1.5 !px-4 !py-[11px]"
                >
                  <span className="flex items-center justify-center gap-1.5">
                    <LogIn size={16} /> {submitting ? "Verifying…" : "Verify & sign in"}
                  </span>
                </Button>
                {error && <ErrorText>{error}</ErrorText>}
              </form>

              <div className="flex items-center justify-between mt-5">
                <button
                  type="button"
                  onClick={backToPassword}
                  className="inline-flex items-center gap-1.5 text-[0.82rem] text-ink-faint bg-transparent border-none cursor-pointer p-0 hover:text-ink"
                >
                  <ArrowLeft size={13} /> Back
                </button>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendCooldown > 0 || submitting}
                  className="text-[0.82rem] text-brand bg-transparent border-none p-0 disabled:text-ink-faint disabled:cursor-not-allowed cursor-pointer"
                >
                  {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : "Resend code"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
