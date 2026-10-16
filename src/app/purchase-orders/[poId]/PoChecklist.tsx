"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle } from "lucide-react";
import {
  IMAGES_CHECKLIST_STATUSES,
  DATA_CHECKLIST_STATUSES,
  PRICING_CHECKLIST_STATUSES,
  JM_UPDATE_STATUSES,
  ON_MASTER_STATUSES,
  DESCRIPTIONS_STATUSES,
} from "@/lib/enums";
import { checklistLabel, isChecklistFieldDone } from "@/lib/statusDisplay";
import { ErrorText } from "@/components/ui/Field";

// The six back-office fields in board order, with the values each may take.
const FIELDS: { field: string; options: readonly string[] }[] = [
  { field: "images", options: IMAGES_CHECKLIST_STATUSES },
  { field: "data", options: DATA_CHECKLIST_STATUSES },
  { field: "pricing", options: PRICING_CHECKLIST_STATUSES },
  { field: "jmUpdate", options: JM_UPDATE_STATUSES },
  { field: "onMaster", options: ON_MASTER_STATUSES },
  { field: "descriptions", options: DESCRIPTIONS_STATUSES },
];

function humanize(v: string): string {
  const t = v.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// Editable back-office checklist. Previously the page only displayed it and
// nothing in the app could change it — so a PO created here could never
// clear the Ready-to-ship gate. Each change saves immediately.
export function PoChecklist({
  poId,
  checklist,
  canEdit,
}: {
  poId: string;
  checklist: Record<string, string>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(checklist ?? {});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function update(field: string, value: string) {
    const prev = values[field];
    setValues((v) => ({ ...v, [field]: value }));
    setSaving(field);
    setError(null);
    try {
      const res = await fetch(`/api/purchase-orders/${poId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backOfficeChecklist: { [field]: value } }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Couldn't save that change.");
      }
      router.refresh();
    } catch (err) {
      setValues((v) => ({ ...v, [field]: prev }));
      setError(err instanceof Error ? err.message : "Couldn't save that change.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-2.5">
        {FIELDS.map(({ field, options }) => {
          const value = values[field] ?? "pending";
          const done = isChecklistFieldDone(field, value);
          return (
            <div
              key={field}
              className={`flex flex-col gap-1.5 rounded-md border px-3 py-2.5 ${
                done ? "border-good-bg bg-good-bg/40" : "border-border"
              }`}
            >
              <span className={`flex items-center gap-1.5 text-[0.8rem] font-semibold ${done ? "text-good" : "text-ink"}`}>
                {done ? <CheckCircle2 size={14} /> : <Circle size={14} className="text-ink-faint" />}
                {checklistLabel(field)}
              </span>
              {canEdit ? (
                <select
                  value={value}
                  disabled={saving === field}
                  onChange={(e) => update(field, e.target.value)}
                  aria-label={`${checklistLabel(field)} status`}
                  className="font-body text-[0.82rem] px-2.5 py-1.5 rounded-sm border border-border-strong bg-surface-sunken text-ink outline-none focus:border-brass disabled:opacity-60"
                >
                  {options.map((o) => (
                    <option key={o} value={o}>
                      {humanize(o)}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-[0.8rem] text-ink-soft">{humanize(value)}</span>
              )}
            </div>
          );
        })}
      </div>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}
