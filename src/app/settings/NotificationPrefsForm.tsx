"use client";

import { useState } from "react";
import { Check, Mail, TriangleAlert } from "lucide-react";
import { ErrorText } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import type { NotificationCategory, NotificationEvent } from "@/lib/notifications/events";

export type NotificationToggle = {
  key: NotificationEvent;
  label: string;
  helper: string;
  category: NotificationCategory;
  enabled: boolean;
  defaultOn: boolean;
};

function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative w-[42px] h-[24px] rounded-full shrink-0 border transition-colors duration-150 ${
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
      } ${checked ? "bg-brand-fill border-brand-fill" : "bg-surface-sunken border-border-strong"}`}
    >
      <span
        className={`absolute top-[2px] w-[18px] h-[18px] rounded-full bg-surface shadow-sm transition-[left] duration-150 ${
          checked ? "left-[21px]" : "left-[2px]"
        }`}
      />
    </button>
  );
}

export function NotificationPrefsForm({
  toggles,
  mailConfigured,
}: {
  toggles: NotificationToggle[];
  mailConfigured: boolean;
}) {
  const [enabled, setEnabled] = useState<Record<string, boolean>>(
    () => Object.fromEntries(toggles.map((t) => [t.key, t.enabled]))
  );
  const [saving, setSaving] = useState<NotificationEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState<"test" | "digest" | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function toggle(key: NotificationEvent) {
    const next = !enabled[key];
    setEnabled((p) => ({ ...p, [key]: next }));
    setSaving(key);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/users/me/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't save that change.");
      setSaved(true);
    } catch (err) {
      // Roll back the optimistic flip on failure.
      setEnabled((p) => ({ ...p, [key]: !next }));
      setError(
        err instanceof TypeError ? "Couldn't reach the server." : err instanceof Error ? err.message : "Couldn't save that change."
      );
    } finally {
      setSaving(null);
    }
  }

  async function sendTest(kind: "test" | "digest") {
    setTesting(kind);
    setTestResult(null);
    try {
      const res = await fetch("/api/users/me/notifications/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "The test email couldn't be sent.");
      setTestResult({
        ok: true,
        message: `${kind === "digest" ? "Summary" : "Test email"} sent to ${data.to}. It can take a minute to arrive; check spam too.`,
      });
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof TypeError ? "Couldn't reach the server." : err instanceof Error ? err.message : "The test email couldn't be sent.",
      });
    } finally {
      setTesting(null);
    }
  }

  const categories = [...new Set(toggles.map((t) => t.category))];

  return (
    <div className="flex flex-col">
      {!mailConfigured && (
        <div className="flex gap-2 items-start text-warn text-[0.82rem] bg-warn-bg rounded-sm px-3 py-2 my-2">
          <TriangleAlert size={14} className="mt-0.5 shrink-0" />
          Email isn&apos;t set up on this server yet, so no notifications are being sent. Your choices are still saved.
        </div>
      )}

      {categories.map((category) => (
        <div key={category} className="mt-3">
          <h3 className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-ink-faint m-0 mb-1">{category}</h3>
          {toggles
            .filter((t) => t.category === category)
            .map((t, i, list) => (
              <div
                key={t.key}
                className={`flex items-center justify-between gap-5 py-3 ${i < list.length - 1 ? "border-b border-border" : ""}`}
              >
                <div className="min-w-0">
                  <div className="text-[0.88rem] font-semibold text-ink">{t.label}</div>
                  <div className="text-[0.78rem] text-ink-faint mt-0.5 max-w-[60ch]">
                    {t.helper}
                    {t.defaultOn ? " On by default for your role." : ""}
                  </div>
                </div>
                <Toggle
                  checked={enabled[t.key]}
                  onChange={() => toggle(t.key)}
                  disabled={saving === t.key}
                  label={t.label}
                />
              </div>
            ))}
        </div>
      ))}

      {error && <ErrorText>{error}</ErrorText>}
      {!error && saved && (
        <p className="text-good text-[0.78rem] mt-3 flex items-center gap-1.5">
          <Check size={13} /> Saved
        </p>
      )}

      <div className="flex items-center gap-3 flex-wrap mt-4 pt-4 border-t border-border">
        <Button
          size="sm"
          loading={testing === "test"}
          disabled={!mailConfigured || testing !== null}
          onClick={() => sendTest("test")}
        >
          <span className="flex items-center gap-1.5">
            {testing !== "test" && <Mail size={13} />} {testing === "test" ? "Sending…" : "Send me a test email"}
          </span>
        </Button>
        <Button
          size="sm"
          loading={testing === "digest"}
          disabled={!mailConfigured || testing !== null}
          onClick={() => sendTest("digest")}
        >
          {testing === "digest" ? "Sending…" : "Send me this week's summary now"}
        </Button>
        {testResult && (
          <span className={`text-[0.8rem] ${testResult.ok ? "text-good" : "text-critical"}`}>{testResult.message}</span>
        )}
      </div>
    </div>
  );
}
