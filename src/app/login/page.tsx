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
    title: "One product spine",
    body: "Every vendor quote, sample SKU, and review decision lives in a single record, no more chasing Excel Master Files.",
  },
  {
    icon: ClipboardList,
    title: "Purchase orders that enforce themselves",
    body: "A PO can't move to Ready to Ship until the back-office checklist is actually complete; the server checks, not just the eye.",
  },
  {
    icon: Workflow,
    title: "Monday & SharePoint, connected",
    body: "Vendor PI files, status updates, and product imagery sync in, without replacing the boards vendors already know.",
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
    <main className="min-h-screen grid grid-cols-[1.15fr_1fr] bg-surface-sunken">
      {/* Left: brand / storytelling panel */}
      <div
        className="relative overflow-hidden border-r border-border flex flex-col items-center"
        style={{
          background:
            "radial-gradient(1200px 600px at -10% -10%, rgba(217,176,119,0.14), transparent 60%), radial-gradient(900px 500px at 110% 110%, rgba(183,198,230,0.08), transparent 55%), var(--surface)",
        }}
      >
        {/* Faceted gem-cut line pattern — subtle, jewelry-appropriate texture confined to the margins */}
        <svg
          aria-hidden="true"
          className="absolute inset-0 w-full h-full pointer-events-none"
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            <pattern id="facet-grid" width="120" height="104" patternUnits="userSpaceOnUse">
              {/* hexagonal / kite facet lines, like a brilliant-cut table viewed from above */}
              <path
                d="
                  M60 0 L120 26 L120 78 L60 104 L0 78 L0 26 Z
                  M60 0 L60 104
                  M0 26 L60 52 L120 26
                  M0 78 L60 52 L120 78
                  M60 52 L60 104
                "
                fill="none"
                stroke="var(--brass)"
                strokeWidth="1"
              />
            </pattern>
            {/* Opaque in the side margins, fading to near-invisible behind the centered text column */}
            <linearGradient id="facet-mask" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="white" stopOpacity="0.55" />
              <stop offset="16%" stopColor="white" stopOpacity="0.4" />
              <stop offset="50%" stopColor="white" stopOpacity="0.2" />
              <stop offset="84%" stopColor="white" stopOpacity="0.4" />
              <stop offset="100%" stopColor="white" stopOpacity="0.55" />
            </linearGradient>
            <mask id="facet-visibility">
              <rect width="100%" height="100%" fill="url(#facet-mask)" />
            </mask>
          </defs>
          <rect width="100%" height="100%" fill="url(#facet-grid)" mask="url(#facet-visibility)" />
        </svg>

        <div className="relative w-full max-w-[460px] px-2 py-16 flex flex-col flex-1">
          <div>
            <Image
              src="/logos/PIM-transparent.png"
              alt="CZC PIM"
              width={1254}
              height={1254}
              priority
              className="h-[72px] w-auto object-contain"
            />

            <h1 className="mt-14 text-[2.35rem] leading-[1.22] text-ink">
              One system for every product, vendor, and order.
            </h1>
            <p className="mt-[18px] text-base text-ink-soft leading-[1.7]">
              CZC PIM replaces scattered Excel Master Files and Monday boards with a single
              source of truth, from vendor intake to purchase orders to catalog, built for
              how the wholesale jewelry business actually runs.
            </p>
          </div>

          <div className="flex flex-col gap-[22px] mt-12">
            {HIGHLIGHTS.map((h) => (
              <div
                key={h.title}
                className="flex gap-3.5 items-start rounded-sm px-1.5 py-1"
                style={{ background: "color-mix(in srgb, var(--surface) 72%, transparent)", backdropFilter: "blur(2px)" }}
              >
                <span className="flex items-center justify-center w-[38px] h-[38px] rounded-sm bg-brass-bg border border-[color:var(--brass-glow)] shrink-0">
                  <h.icon size={18} color="var(--brass)" strokeWidth={2} />
                </span>
                <div>
                  <div className="text-[0.95rem] font-bold text-ink mb-[3px]">{h.title}</div>
                  <div className="text-[0.86rem] text-ink-faint leading-[1.55]">{h.body}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 text-[0.78rem] text-ink-faint mt-auto pt-6 border-t border-border">
            <ShieldCheck size={14} />
            Role-based access · SharePoint media storage · Monday.com sync
          </div>
        </div>
      </div>

      {/* Right: sign-in form */}
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-[360px]">
          {step === "password" ? (
            <>
              <div className="mb-8">
                <h2 className="text-2xl mb-1.5">Welcome back</h2>
                <p className="text-[0.88rem] text-ink-faint m-0">Sign in with your CZC PIM credentials to continue.</p>
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
                <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-brass-bg text-brass mb-4">
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
                  className="text-[0.82rem] text-brass bg-transparent border-none p-0 disabled:text-ink-faint disabled:cursor-not-allowed cursor-pointer"
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
