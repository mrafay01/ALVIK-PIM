"use client";

import { useState } from "react";
import { Check, KeyRound, ArrowLeft, MailCheck } from "lucide-react";
import { Field, Input, ErrorText } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

type Step = "form" | "otp";

export function ChangePasswordForm() {
  const [step, setStep] = useState<Step>("form");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function reset() {
    setStep("form");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setCode("");
    setError(null);
  }

  async function handleRequestSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation don't match.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("New password must be different from the current password.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/users/me/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't start the password change.");
      setStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the password change.");
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
        body: JSON.stringify({ purpose: "change_password", code }),
      });
      const verifyData = await verifyRes.json().catch(() => ({}));
      if (!verifyRes.ok) throw new Error(verifyData.error || "That code isn't right.");

      const applyRes = await fetch("/api/users/me/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionTicket: verifyData.sessionTicket, newPassword }),
      });
      const applyData = await applyRes.json().catch(() => ({}));
      if (!applyRes.ok) throw new Error(applyData.error || "Couldn't change your password.");

      setSuccess(true);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't change your password.");
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "otp") {
    return (
      <form onSubmit={handleOtpSubmit} className="flex flex-col gap-4 max-w-[360px]">
        <div className="flex items-center gap-2 text-[0.83rem] text-ink-soft">
          <MailCheck size={15} className="text-brass shrink-0" />
          We sent a 6-digit code to your account email. It expires in 10 minutes.
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
              <KeyRound size={14} /> {submitting ? "Verifying…" : "Confirm change"}
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
      <Field label="New password">
        <Input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
          placeholder="At least 8 characters"
        />
      </Field>
      <Field label="Confirm new password">
        <Input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
          placeholder="Re-enter new password"
        />
      </Field>

      <Button type="submit" variant="primary" disabled={submitting} className="self-start">
        <span className="flex items-center gap-1.5">
          <KeyRound size={14} /> {submitting ? "Sending code…" : "Send verification code"}
        </span>
      </Button>

      {error && <ErrorText>{error}</ErrorText>}
      {!error && success && (
        <p className="text-good text-[0.82rem] flex items-center gap-1.5 m-0">
          <Check size={14} /> Password changed.
        </p>
      )}
    </form>
  );
}
