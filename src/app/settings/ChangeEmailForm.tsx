"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Mail, ArrowLeft, MailCheck } from "lucide-react";
import { Field, Input, ErrorText } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

type Step = "form" | "otp";

export function ChangeEmailForm({ currentEmail }: { currentEmail: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("form");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function reset() {
    setStep("form");
    setCurrentPassword("");
    setNewEmail("");
    setCode("");
    setError(null);
  }

  async function handleRequestSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const normalized = newEmail.trim().toLowerCase();
    if (normalized === currentEmail.toLowerCase()) {
      setError("That's already your current email.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/users/me/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newEmail: normalized }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't start the email change.");
      setStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the email change.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleOtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    setSubmitting(true);
    try {
      const verifyRes = await fetch("/api/auth/otp/verify-generic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose: "change_email", code }),
      });
      const verifyData = await verifyRes.json().catch(() => ({}));
      if (!verifyRes.ok) throw new Error(verifyData.error || "That code isn't right.");

      const applyRes = await fetch("/api/users/me/email", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionTicket: verifyData.sessionTicket }),
      });
      const applyData = await applyRes.json().catch(() => ({}));
      if (!applyRes.ok) throw new Error(applyData.error || "Couldn't change your email.");

      setSuccess(true);
      reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't change your email.");
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "otp") {
    return (
      <form onSubmit={handleOtpSubmit} className="flex flex-col gap-4 max-w-[360px]">
        <div className="flex items-center gap-2 text-[0.83rem] text-ink-soft">
          <MailCheck size={15} className="text-brass shrink-0" />
          We sent a 6-digit code to <span className="font-semibold text-ink">{newEmail}</span> — enter it to prove
          you own that inbox. It expires in 10 minutes.
        </div>
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
            className="tracking-[0.4em] text-center font-mono"
          />
        </Field>
        <div className="flex items-center gap-2">
          <Button type="submit" variant="primary" disabled={submitting || code.length !== 6}>
            <span className="flex items-center gap-1.5">
              <Mail size={14} /> {submitting ? "Verifying…" : "Confirm change"}
            </span>
          </Button>
          <Button type="button" variant="ghost" disabled={submitting} onClick={reset}>
            <span className="flex items-center gap-1.5">
              <ArrowLeft size={13} /> Back
            </span>
          </Button>
        </div>
        {error && <ErrorText>{error}</ErrorText>}
      </form>
    );
  }

  return (
    <form onSubmit={handleRequestSubmit} className="flex flex-col gap-4 max-w-[360px]">
      <Field label="Current password">
        <Input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
          required
          placeholder="••••••••"
        />
      </Field>
      <Field label="New email">
        <Input
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          autoComplete="email"
          required
          placeholder="you@company.com"
        />
      </Field>

      <Button type="submit" variant="primary" disabled={submitting} className="self-start">
        <span className="flex items-center gap-1.5">
          <Mail size={14} /> {submitting ? "Sending code…" : "Send verification code"}
        </span>
      </Button>

      {error && <ErrorText>{error}</ErrorText>}
      {!error && success && (
        <p className="text-good text-[0.82rem] flex items-center gap-1.5 m-0">
          <Check size={14} /> Email changed.
        </p>
      )}
    </form>
  );
}
