"use client";

import { useState } from "react";
import { Power, PowerOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useRefreshAfterSave } from "@/lib/hooks/useRefreshAfterSave";

// Catalog-visibility switch — independent of the lifecycle status. An
// inactive item stays in the catalog and everywhere else in the app, it's
// just excluded from marketplace export (see Item.active).
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

  if (!canEdit) return null;
  const working = busy || refreshing;

  async function toggle() {
    setBusy(true);
    try {
      const res = await fetch(`/api/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !active }),
      });
      if (res.ok) refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant={active ? "secondary" : "primary"} size="sm" loading={working} onClick={toggle}>
      <span className="flex items-center gap-1.5">
        {!working && (active ? <PowerOff size={14} /> : <Power size={14} />)}
        {working ? (active ? "Deactivating…" : "Activating…") : active ? "Deactivate" : "Activate"}
      </span>
    </Button>
  );
}
