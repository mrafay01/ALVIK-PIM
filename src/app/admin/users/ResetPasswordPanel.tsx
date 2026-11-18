"use client";

import { useState } from "react";
import { Check, X, KeyRound, ArrowLeft, MailCheck } from "lucide-react";
import { Field, Input, ErrorText } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { useRefreshAfterSave } from "@/lib/hooks/useRefreshAfterSave";

type Step = "form" | "otp";

// The admin's own identity gate for resetting a DIFFERENT user's password:
// their own password, then a 2FA code emailed to their own account address
// — never the target's. See /api/admin/users/[userId]/reset-password.
export function ResetPasswordPanel({ targetUserId, onClose }: { targetUserId: string; onClose: () => void }) {
  const { refresh, refreshing } = useRefreshAfterSave();
  const [step, setStep] = useState<Step>("form");
  const [adminPassword, setAdminPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRequestSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 10 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      setError("New password needs at least 10 characters, including a letter and a number.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/users/${targetUserId}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't start the reset.");
      setStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the reset.");
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
        body: JSON.stringify({ purpose: "admin_reset", code }),
      });
      const verifyData = await verifyRes.json().catch(() => ({}));
      if (!verifyRes.ok) throw new Error(verifyData.error || "That code isn't right.");

      const applyRes = await fetch(`/api/admin/users/${targetUserId}/reset-password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionTicket: verifyData.sessionTicket, newPassword }),
      });
      const applyData = await applyRes.json().catch(() => ({}));
      if (!applyRes.ok) throw new Error(applyData.error || "Couldn't reset the password.");

      refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reset the password.");
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "otp") {
    return (
      <form onSubmit={handleOtpSubmit} className="flex flex-col gap-2 items-end">
        <div className="flex items-center gap-1.5 text-[0.76rem] text-ink-soft">
          <MailCheck size={13} className="text-brand shrink-0" />
          Code sent to your own email
        </div>
        <div className="flex items-center gap-1.5">
          <Input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            className="!py-1.5 !px-2 text-[0.8rem] w-[110px] text-center tracking-[0.2em] font-mono"
            autoFocus
          />
          <Button size="sm" variant="primary" type="submit" disabled={code.length !== 6} loading={submitting || refreshing}>
            <Check size={13} />
          </Button>
          <Button size="sm" variant="ghost" type="button" onClick={() => setStep("form")} disabled={submitting}>
            <ArrowLeft size={13} />
          </Button>
          <Button size="sm" variant="ghost" type="button" onClick={onClose} disabled={submitting}>
            <X size={13} />
          </Button>
        </div>
        {error && <ErrorText>{error}</ErrorText>}
      </form>
    );
  }

  return (
    <form onSubmit={handleRequestSubmit} className="flex flex-col gap-2 items-end">
      <Field label="Your password">
        <Input
          type="password"
          value={adminPassword}
          onChange={(e) => setAdminPassword(e.target.value)}
          placeholder="Your account password"
          className="!py-1.5 !px-2 text-[0.8rem] w-[180px]"
          autoComplete="current-password"
          required
        />
      </Field>
      <Field label={`New password for this user`}>
        <div className="flex items-center gap-1.5">
          <Input
            type="text"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password"
            minLength={10}
            className="!py-1.5 !px-2 text-[0.8rem] w-[160px]"
            required
          />
          <Button size="sm" variant="primary" type="submit" loading={submitting}>
            <span className="inline-flex items-center gap-1">
              <KeyRound size={12} /> Send code
            </span>
          </Button>
          <Button size="sm" variant="ghost" type="button" onClick={onClose} disabled={submitting}>
            <X size={13} />
          </Button>
        </div>
      </Field>
      {error && <ErrorText>{error}</ErrorText>}
    </form>
  );
}
