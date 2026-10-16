"use client";

import { useState } from "react";
import { Check, TriangleAlert } from "lucide-react";
import { ErrorText } from "@/components/ui/Field";

export type NotificationPrefs = {
  poStatusChanges: boolean;
  mondaySyncErrors: boolean;
  weeklyDigest: boolean;
};

const TOGGLES: { key: keyof NotificationPrefs; label: string; helper: string }[] = [
  {
    key: "poStatusChanges",
    label: "Purchase order status changes",
    helper: "When a PO you're involved with moves to a new stage in the pipeline.",
  },
  {
    key: "mondaySyncErrors",
    label: "Monday.com sync errors",
    helper: "When a push or pull to the Monday board fails or needs review.",
  },
  {
    key: "weeklyDigest",
    label: "Weekly digest",
    helper: "A weekly summary of activity across purchase orders and catalog. Off by default.",
  },
];

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={`relative w-[42px] h-[24px] rounded-full shrink-0 border transition-colors duration-150 ${
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
      } ${checked ? "bg-brass border-brass" : "bg-surface-sunken border-border-strong"}`}
    >
      <span
        className={`absolute top-[2px] w-[18px] h-[18px] rounded-full bg-surface shadow-sm transition-[left] duration-150 ${
          checked ? "left-[21px]" : "left-[2px]"
        }`}
      />
    </button>
  );
}

export function NotificationPrefsForm({ initialPrefs }: { initialPrefs: NotificationPrefs }) {
  const [prefs, setPrefs] = useState(initialPrefs);
  const [saving, setSaving] = useState<keyof NotificationPrefs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  async function toggle(key: keyof NotificationPrefs) {
    const next = !prefs[key];
    setPrefs((p) => ({ ...p, [key]: next }));
    setSaving(key);
    setError(null);
    try {
      const res = await fetch("/api/users/me/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't save that change.");
      setSavedAt(Date.now());
    } catch (err) {
      // Roll back the optimistic flip on failure.
      setPrefs((p) => ({ ...p, [key]: !next }));
      setError(err instanceof Error ? err.message : "Couldn't save that change.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="flex flex-col">
      {TOGGLES.map((t, i) => (
        <div
          key={t.key}
          className={`flex items-center justify-between gap-5 py-3.5 ${
            i < TOGGLES.length - 1 ? "border-b border-border" : ""
          }`}
        >
          <div className="min-w-0">
            <div className="text-[0.88rem] font-semibold text-ink">{t.label}</div>
            <div className="text-[0.78rem] text-ink-faint mt-0.5 max-w-[52ch]">{t.helper}</div>
          </div>
          <Toggle checked={prefs[t.key]} onChange={() => toggle(t.key)} disabled={saving === t.key} />
        </div>
      ))}

      {error && <ErrorText>{error}</ErrorText>}
      {!error && savedAt && (
        <p className="text-good text-[0.78rem] mt-3 flex items-center gap-1.5">
          <Check size={13} /> Saved
        </p>
      )}
      {!error && !savedAt && (
        <p className="text-ink-faint text-[0.76rem] mt-3 flex items-center gap-1.5">
          <TriangleAlert size={12} /> These control who gets notified once the notification jobs are wired up; your
          choice is saved now either way.
        </p>
      )}
    </div>
  );
}
