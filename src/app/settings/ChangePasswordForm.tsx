"use client";

import { useState } from "react";
import { Check, KeyRound } from "lucide-react";
import { Field, Input, ErrorText } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
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
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't change your password.");

      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't change your password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-[360px]">
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
          <KeyRound size={14} /> {submitting ? "Changing…" : "Change password"}
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
