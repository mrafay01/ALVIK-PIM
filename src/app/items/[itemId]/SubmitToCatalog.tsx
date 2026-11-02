"use client";

import { useState } from "react";
import { BookOpenCheck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useRefreshAfterSave } from "@/lib/hooks/useRefreshAfterSave";

// The step that takes an Un-Verified item into the catalog: once its master
// record is complete, someone with catalog rights submits it, and an admin
// approves it from the Catalog list. Until then this lists what's missing.
export function SubmitToCatalog({
  itemId,
  missing,
  canSubmit,
}: {
  itemId: string;
  missing: string[];
  canSubmit: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { refresh, refreshing } = useRefreshAfterSave();

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/items/${itemId}/submit-to-catalog`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't submit this item.");
        return;
      }
      refresh();
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-[0.95rem] mb-1 flex items-center gap-1.5">
            <BookOpenCheck size={16} /> Add to the catalog
          </h2>
          {missing.length === 0 ? (
            <p className="text-[0.84rem] text-ink-soft m-0">
              The master record is complete. Submit it, and an administrator approves it from the Catalog.
            </p>
          ) : (
            <>
              <p className="text-[0.84rem] text-ink-soft m-0 mb-1.5">Before it can go into the catalog, this item needs:</p>
              <ul className="m-0 pl-5 text-[0.84rem] text-warn">
                {missing.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </>
          )}
          {!canSubmit && missing.length === 0 && (
            <p className="text-[0.8rem] text-ink-faint mt-1.5 mb-0">
              Someone on the marketplace listing team, or an administrator, can submit it.
            </p>
          )}
          {error && <p className="text-[0.82rem] text-critical mt-1.5 mb-0">{error}</p>}
        </div>
        {canSubmit && missing.length === 0 && (
          <Button variant="primary" loading={busy || refreshing} onClick={submit}>
            Submit to catalog
          </Button>
        )}
      </div>
    </Card>
  );
}
