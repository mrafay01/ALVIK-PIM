"use client";

import { useState } from "react";
import { CloudUpload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useRefreshAfterSave } from "@/lib/hooks/useRefreshAfterSave";

type CopyResult = { copied: number; failed: number; skipped: number; remaining: { files: number } };

// Copies this PO's Monday files into its SharePoint folder now, instead of
// waiting for the next bulk copy from the Monday Import screen. Keeps calling
// until nothing is left or a round makes no progress (what's left is failing
// for now and is retried later).
export function CopyPoFilesButton({ poId }: { poId: string }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { refresh, refreshing } = useRefreshAfterSave();

  async function run() {
    setBusy(true);
    setError(null);
    setNote(null);
    const sum = { copied: 0, failed: 0 };
    try {
      for (;;) {
        const res = await fetch(`/api/purchase-orders/${poId}/files`, { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `Copy failed (${res.status})`);
        const r = data as CopyResult;
        sum.copied += r.copied;
        sum.failed += r.failed;
        if (r.remaining.files === 0 || r.copied + r.skipped === 0) break;
      }
      setNote(
        sum.failed > 0
          ? `${sum.copied} copied, ${sum.failed} couldn't be copied. See the reason next to each file.`
          : `${sum.copied} file${sum.copied === 1 ? "" : "s"} copied to SharePoint.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      refresh();
    }
  }

  return (
    <div className="flex items-center gap-2.5 flex-wrap">
      <Button size="sm" variant="primary" loading={busy || refreshing} onClick={run}>
        <span className="flex items-center gap-1.5">
          <CloudUpload size={14} /> Copy to SharePoint
        </span>
      </Button>
      {note && <span className="text-[0.8rem] text-ink-soft">{note}</span>}
      {error && <span className="text-[0.8rem] text-critical">{error}</span>}
    </div>
  );
}
