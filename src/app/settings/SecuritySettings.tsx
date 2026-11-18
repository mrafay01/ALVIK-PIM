"use client";

import { useState } from "react";
import { getSession } from "next-auth/react";
import { ShieldCheck, Check } from "lucide-react";
import { ErrorText } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

export function SecuritySettings() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSignOutEverywhere() {
    setError(null);
    setSuccess(false);
    setSubmitting(true);
    try {
      const res = await fetch("/api/users/me/sessions", { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't sign out other devices.");

      // The response already carried a re-issued cookie for this device
      // (see /api/users/me/sessions). Refresh the client-side session copy
      // so useSession() reflects it.
      await getSession();
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't sign out other devices.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 max-w-[420px]">
      <p className="text-[0.8rem] text-ink-faint m-0">
        Signs you out on every other device.
      </p>
      <Button variant="danger" loading={submitting} onClick={handleSignOutEverywhere} className="self-start">
        <span className="flex items-center gap-1.5">
          <ShieldCheck size={14} /> {submitting ? "Signing out…" : "Sign out of all other devices"}
        </span>
      </Button>
      {error && <ErrorText>{error}</ErrorText>}
      {!error && success && (
        <p className="text-good text-[0.82rem] flex items-center gap-1.5 m-0">
          <Check size={14} /> Every other session has been signed out.
        </p>
      )}
    </div>
  );
}
