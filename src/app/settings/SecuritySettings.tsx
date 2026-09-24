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

      // The bump invalidates every JWT stamped with the old sessionVersion
      // — including this browser's own cookie, since NextAuth doesn't
      // rotate a JWT mid-life on its own. getSession() forces exactly that
      // rotation (it hits /api/auth/session, which re-runs the jwt
      // callback), so this device gets a fresh, valid cookie immediately
      // instead of also being logged out on its next request.
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
        Ends every other signed-in session for your account — on any other browser or device. This device stays
        signed in.
      </p>
      <Button variant="danger" disabled={submitting} onClick={handleSignOutEverywhere} className="self-start">
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
