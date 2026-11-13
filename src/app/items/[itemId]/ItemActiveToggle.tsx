"use client";

import { useState } from "react";
import { Power, PowerOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useRefreshAfterSave } from "@/lib/hooks/useRefreshAfterSave";

// Catalog-visibility switch — independent of the lifecycle status. An
// inactive item stays in the catalog and everywhere else in the app, and
// shows on the Catalog's "Inactive" tab (see Item.active).
export function ItemActiveToggle({
  itemId,
  active,
  canEdit,
}: {
  itemId: string;
  active: boolean;
  canEdit: boolean;
}) {
  const { refresh, refreshing } = useRefreshAfterSave();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canEdit) return null;
  const working = busy || refreshing;

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !active }),
      });
      if (res.ok) refresh();
      else setError((await res.json().catch(() => ({}))).error ?? "Couldn't change it");
    } catch {
      setError("Couldn't reach the server");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button variant={active ? "secondary" : "primary"} size="sm" loading={working} onClick={toggle}>
        <span className="flex items-center gap-1.5">
          {!working && (active ? <PowerOff size={14} /> : <Power size={14} />)}
          {working ? (active ? "Deactivating…" : "Activating…") : active ? "Deactivate" : "Activate"}
        </span>
      </Button>
      {error && <span className="text-[0.75rem] text-critical">{error}</span>}
    </span>
  );
}
