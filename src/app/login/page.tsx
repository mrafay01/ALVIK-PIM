"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Sparkles, LogIn, Gem, ClipboardList, ShieldCheck, Workflow } from "lucide-react";
import { Field, Input, ErrorText } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

const HIGHLIGHTS = [
  {
    icon: Gem,
    title: "One product spine",
    body: "Every vendor quote, sample SKU, and review decision lives in a single record — no more chasing Excel Master Files.",
  },
  {
    icon: ClipboardList,
    title: "Purchase orders that enforce themselves",
    body: "A PO can't move to Ready to Ship until the back-office checklist is actually complete — the server checks, not just the eye.",
  },
  {
    icon: Workflow,
    title: "Monday & SharePoint, connected",
    body: "Vendor PI files, status updates, and product imagery sync in — without replacing the boards vendors already know.",
  },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await signIn("credentials", { email, password, redirect: false });
    setSubmitting(false);
    if (result?.error) {
      setError("Invalid email or password.");
      return;
    }
    router.push("/items");
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
            <div className="flex items-center gap-3">
              <span
                className="flex items-center justify-center w-[42px] h-[42px] rounded-sm shrink-0"
                style={{
                  background: "linear-gradient(135deg, var(--brass) 0%, var(--brass-soft) 130%)",
                  boxShadow: "0 4px 20px var(--brass-glow)",
                }}
              >
                <Sparkles size={22} strokeWidth={2.25} color="#1a1409" />
              </span>
              <span className="font-display font-bold text-2xl text-ink">CZC PIM</span>
            </div>

            <h1 className="mt-14 text-[2.35rem] leading-[1.22] text-ink">
              One system for every product, vendor, and order.
            </h1>
            <p className="mt-[18px] text-base text-ink-soft leading-[1.7]">
              CZC PIM replaces scattered Excel Master Files and Monday boards with a single
              source of truth — from vendor intake to purchase orders to payables, built for
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
          <div className="mb-8">
            <h2 className="text-2xl mb-1.5">Welcome back</h2>
            <p className="text-[0.88rem] text-ink-faint m-0">Sign in with your CZC PIM credentials to continue.</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Field label="Email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus placeholder="you@company.com" />
            </Field>
            <Field label="Password">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" />
            </Field>
            <Button type="submit" variant="primary" disabled={submitting} className="mt-1.5 !px-4 !py-[11px]">
              <span className="flex items-center justify-center gap-1.5">
                <LogIn size={16} /> {submitting ? "Signing in…" : "Sign in"}
              </span>
            </Button>
            {error && <ErrorText>{error}</ErrorText>}
          </form>

          <p className="mt-7 text-[0.78rem] text-ink-faint text-center">Need access? Contact your administrator.</p>
        </div>
      </div>
    </main>
  );
}
