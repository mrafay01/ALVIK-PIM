"use client";

import { useEffect, useState } from "react";
import { MessageCircle, TriangleAlert, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/Card";

interface MondayUpdate {
  id: string;
  text_body: string;
  created_at: string;
  creator: { name: string } | null;
  replies: { id: string; text_body: string; created_at: string; creator: { name: string } | null }[];
}

function timeAgo(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function UpdateRow({ update, isReply = false }: { update: MondayUpdate | MondayUpdate["replies"][number]; isReply?: boolean }) {
  return (
    <div className={`flex gap-2.5 py-2.5 ${isReply ? "ml-6" : "border-t border-border"}`}>
      <span className="w-[26px] h-[26px] rounded-full bg-navy-deep text-brass-soft flex items-center justify-center text-[0.68rem] font-semibold shrink-0 font-mono">
        {(update.creator?.name ?? "?").slice(0, 2).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[0.83rem] font-semibold">{update.creator?.name ?? "Unknown"}</span>
          <span className="text-[0.72rem] text-ink-faint">{timeAgo(update.created_at)}</span>
        </div>
        <p className="text-[0.85rem] text-ink-soft mt-0.5 whitespace-pre-wrap">{update.text_body}</p>
      </div>
    </div>
  );
}

export function MondayUpdates({ mondayItemId }: { mondayItemId: string }) {
  const [updates, setUpdates] = useState<MondayUpdate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/monday/updates/${mondayItemId}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Failed to load (${res.status})`);
      }
      const data = await res.json().catch(() => ({}));
      setUpdates(Array.isArray(data.updates) ? data.updates : []);
    } catch (err) {
      setError(err instanceof TypeError ? "Couldn't reach the server. Try again." : err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mondayItemId]);

  return (
    <Card>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-[0.95rem] flex items-center gap-1.5">
          <MessageCircle size={15} /> Monday.com conversation
        </h2>
        <button
          onClick={load}
          disabled={loading}
          className={`flex items-center gap-1.5 text-[0.75rem] text-ink-faint bg-transparent border-0 px-1.5 py-1 ${
            loading ? "cursor-not-allowed" : "cursor-pointer"
          }`}
        >
          <RefreshCw size={12} /> {loading ? "Loading…" : "Refresh"}
        </button>
      </div>
      <p className="text-[0.8rem] text-ink-faint mb-1.5">Read-only; fetched live from the board, never stored in PIM.</p>

      {error && (
        <div className="flex gap-1.5 items-start text-critical text-[0.83rem] py-2.5">
          <TriangleAlert size={14} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {!error && updates && updates.length === 0 && (
        <p className="text-[0.85rem] text-ink-faint mt-2.5">No updates posted on this PO yet.</p>
      )}

      {!error && updates && updates.length > 0 && (
        <div>
          {updates.map((u) => (
            <div key={u.id}>
              <UpdateRow update={u} />
              {(u.replies ?? []).map((r) => (
                <UpdateRow key={r.id} update={r} isReply />
              ))}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
