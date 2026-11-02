"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Shield, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { useRefreshAfterSave } from "@/lib/hooks/useRefreshAfterSave";

type Conflict = {
  _id: string;
  field: string;
  fieldLabel: string;
  catalogValue: unknown;
  incomingValue: unknown;
  quotationId: { _id: string; sourceFileName?: string; poNumber?: string } | null;
};

type Group = {
  itemId: string;
  itemNumber: string;
  title: string | null;
  conflicts: Conflict[];
};

export function ConflictsList({ groups }: { groups: Group[] }) {
  const { refresh, refreshing } = useRefreshAfterSave();
  const [busy, setBusy] = useState<string | null>(null);
  const [lastBusy, setLastBusy] = useState<{ id: string; decision: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Any conflict currently showing the "custom value" input. Null means
  // nothing's being customised.
  const [customing, setCustoming] = useState<string | null>(null);
  const [customDraft, setCustomDraft] = useState<string>("");

  async function resolve(
    conflictId: string,
    body: { decision: "keep" | "accept" } | { decision: "custom"; customValue: string }
  ) {
    setBusy(conflictId);
    setLastBusy({ id: conflictId, decision: body.decision });
    setError(null);
    try {
      const res = await fetch(`/api/catalog/conflicts/${conflictId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not save that decision.");
        return;
      }
      setCustoming(null);
      setCustomDraft("");
      refresh();
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <Card className="border-critical">
          <p className="m-0 text-[0.86rem] text-critical">{error}</p>
        </Card>
      )}
      {groups.map((group) => (
        <Card key={group.itemId} padding={0}>
          <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <TriangleAlert size={16} className="text-warn shrink-0" />
              <Link
                href={`/items/${group.itemId}`}
                className="font-mono font-semibold text-[0.9rem] text-navy-deep no-underline"
              >
                {group.itemNumber}
              </Link>
              <span className="text-ink-soft text-[0.86rem] truncate">
                {group.title ?? "—"}
              </span>
            </div>
            <span className="text-[0.78rem] text-ink-faint">
              {group.conflicts.length} field{group.conflicts.length === 1 ? "" : "s"} to decide
            </span>
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["Field", "Catalog (stored)", "Incoming (PI)", "From", "Decide"].map((h) => (
                  <th
                    key={h}
                    className="text-left text-[0.7rem] font-semibold uppercase tracking-wide text-ink-faint bg-surface-sunken px-4 py-2.5 border-b border-border-strong whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {group.conflicts.map((c) => {
                const isCustoming = customing === c._id;
                const isBusy = busy === c._id || (refreshing && lastBusy?.id === c._id);
                const spinning = (d: string) => isBusy && lastBusy?.id === c._id && lastBusy.decision === d;
                return (
                  <tr key={c._id} className="border-b border-border last:border-b-0 align-top">
                    <td className="px-4 py-3 text-[0.86rem] font-semibold">{c.fieldLabel}</td>
                    <td className="px-4 py-3 font-mono text-[0.84rem]">
                      {formatValue(c.catalogValue)}
                    </td>
                    <td className="px-4 py-3 font-mono text-[0.84rem] text-warn">
                      {formatValue(c.incomingValue)}
                    </td>
                    <td className="px-4 py-3 text-[0.8rem] text-ink-soft">
                      {c.quotationId ? (
                        <Link
                          href={`/purchase-orders/quotes/${c.quotationId._id}`}
                          className="text-navy-deep no-underline"
                        >
                          {c.quotationId.sourceFileName ??
                            c.quotationId.poNumber ??
                            "quote"}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isCustoming ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={customDraft}
                            onChange={(e) => setCustomDraft(e.target.value)}
                            placeholder="New value"
                            autoFocus
                            className="!py-1.5 !w-[160px]"
                          />
                          <Button
                            size="sm"
                            variant="primary"
                            disabled={!customDraft.trim() || isBusy}
                            loading={spinning("custom")}
                            onClick={() =>
                              resolve(c._id, {
                                decision: "custom",
                                customValue: customDraft.trim(),
                              })
                            }
                          >
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setCustoming(null);
                              setCustomDraft("");
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div className="flex gap-1.5 flex-wrap">
                          <Button
                            size="sm"
                            disabled={isBusy}
                            loading={spinning("keep")}
                            onClick={() => resolve(c._id, { decision: "keep" })}
                          >
                            <span className="flex items-center gap-1">
                              <Shield size={13} /> Keep catalog
                            </span>
                          </Button>
                          <Button
                            size="sm"
                            variant="primary"
                            disabled={isBusy}
                            loading={spinning("accept")}
                            onClick={() => resolve(c._id, { decision: "accept" })}
                          >
                            <span className="flex items-center gap-1">
                              <CheckCircle2 size={13} /> Accept PI
                            </span>
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={isBusy}
                            onClick={() => {
                              setCustoming(c._id);
                              setCustomDraft(formatValue(c.incomingValue));
                            }}
                          >
                            Custom…
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ))}
    </div>
  );
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}
