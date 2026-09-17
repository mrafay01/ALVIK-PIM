"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Power, PowerOff } from "lucide-react";
import { Button } from "@/components/ui/Button";

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
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (!canEdit) return null;

  async function toggle() {
    setBusy(true);
    try {
      const res = await fetch(`/api/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !active }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant={active ? "secondary" : "primary"} size="sm" disabled={busy} onClick={toggle}>
      <span className="flex items-center gap-1.5">
        {active ? <PowerOff size={14} /> : <Power size={14} />}
        {busy ? "…" : active ? "Deactivate" : "Activate"}
      </span>
    </Button>
  );
}
