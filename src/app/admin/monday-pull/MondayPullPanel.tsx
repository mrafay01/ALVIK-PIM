"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, TriangleAlert, CheckCircle2, CloudUpload } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PullPlanReview, type PullPlanRow } from "./PullPlanReview";

interface PullPlan {
  rows: PullPlanRow[];
  toUpdate: number;
  toCreate: number;
  skipped: number;
}

interface PullCommitResult {
  processed: number;
  updated: number;
  created: number;
  skipped: number;
  errored: number;
  errors: { mondayItemId: string; message: string }[];
}

interface ArchiveBatch {
  copied: number;
  failed: number;
  skipped: number;
  remaining: { pos: number; files: number };
}

// Copies the vendor files attached to POs on Monday into each PO's
// SharePoint folder. Runs automatically after an import is applied (and
// can be started by hand); each call copies for ~40s and reports what's
// left, so it keeps calling until done.
function SharePointArchive({ autoStartKey, recheckKey }: { autoStartKey: number; recheckKey: number }) {
  const [remaining, setRemaining] = useState<{ pos: number; files: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [totals, setTotals] = useState({ copied: 0, failed: 0, skipped: 0 });
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/po-files");
      if (res.ok) setRemaining((await res.json()).remaining);
      else setError("Couldn't check how many PO files are left to copy.");
    } catch {
      setError("Couldn't reach the server to check the PO files.");
    }
  }, []);

  const start = useCallback(async () => {
    setRunning(true);
    setError(null);
    stopRef.current = false;
    const sum = { copied: 0, failed: 0, skipped: 0 };
    setTotals(sum);
    try {
      while (!stopRef.current) {
        const res = await fetch("/api/admin/po-files", { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `Copy failed (${res.status})`);
        const batch = data as ArchiveBatch;
        sum.copied += batch.copied;
        sum.failed += batch.failed;
        sum.skipped += batch.skipped;
        setTotals({ ...sum });
        setRemaining(batch.remaining);
        // Done, or nothing could be copied this round (everything left is
        // failing for now; it's retried on the next run).
        if (batch.remaining.files === 0 || batch.copied + batch.skipped === 0) break;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }, []);

  useEffect(() => {
    if (autoStartKey > 0) void start();
  }, [autoStartKey, start]);
  useEffect(() => {
    void refresh();
  }, [recheckKey, refresh]);

  const done = totals.copied + totals.skipped + totals.failed > 0;
  return (
    <Card>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-base mb-1 flex items-center gap-1.5">
            <CloudUpload size={16} /> PO files in SharePoint
          </h2>
          <p className="text-[0.85rem] text-ink-soft m-0 max-w-[620px]">
            The PO files attached on Monday are saved in SharePoint for good, one folder per PO (named after
            the PO), newest POs first. Everyone then opens them from SharePoint in this app. This runs after an
            import when &quot;Also save PO files to SharePoint&quot; is ticked, and you can start it here any time.
            You can close this page; it picks up where it stopped.
          </p>
          <p className="text-[0.85rem] mt-2 mb-0">
            {remaining == null
              ? "Checking…"
              : remaining.files === 0
                ? "All PO files are in SharePoint."
                : `${remaining.files} file${remaining.files === 1 ? "" : "s"} on ${remaining.pos} PO${remaining.pos === 1 ? "" : "s"} still to copy.`}
            {done && (
              <span className="text-ink-faint">
                {" "}
                This run: {totals.copied} copied
                {totals.skipped > 0 && `, ${totals.skipped} no longer on Monday`}
                {totals.failed > 0 && `, ${totals.failed} failed (retried next run, up to 3 times)`}.
              </span>
            )}
          </p>
          {error && <p className="text-[0.82rem] text-critical mt-1.5 mb-0">{error}</p>}
        </div>
        {running ? (
          <Button variant="secondary" onClick={() => (stopRef.current = true)}>
            <span className="flex items-center gap-1.5">
              <RefreshCw size={15} className="spin" /> Copying… (stop)
            </span>
          </Button>
        ) : (
          <Button variant="primary" disabled={!remaining || remaining.files === 0} onClick={() => void start()}>
            <span className="flex items-center gap-1.5">
              <CloudUpload size={15} /> Copy now
            </span>
          </Button>
        )}
      </div>
    </Card>
  );
}


export function MondayPullPanel() {
  const [plan, setPlan] = useState<PullPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<PullCommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [archiveRun, setArchiveRun] = useState(0);
  // Re-reads the "still to copy" count after an import that didn't copy.
  const [archiveCheck, setArchiveCheck] = useState(0);
  const [planVersion, setPlanVersion] = useState(0);

  async function runPreview() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/monday/pull");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Preview failed (${res.status})`);
      }
      setPlan(await res.json());
      setPlanVersion((v) => v + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function commit(mondayItemIds: string[], saveFiles: boolean) {
    if (!plan) return;
    setCommitting(true);
    setError(null);
    try {
      const res = await fetch("/api/monday/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mondayItemIds }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Import failed (${res.status})`);
      }
      setResult(await res.json());
      setPlan(null);
      // "Also save PO files to SharePoint" was ticked: copy them now.
      if (saveFiles) setArchiveRun((n) => n + 1);
      else setArchiveCheck((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCommitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-base mb-1">Pull updates from Monday.com</h2>
            <p className="text-[0.85rem] text-ink-soft m-0 max-w-[560px]">
              Reads every item on the live Purchase Orders board (status, checklist progress, PO totals, dates,
              priority, tracking, and vendor-uploaded PI files) and shows what would change before anything is
              written. Never modifies the Monday board. A vendor name on the board that doesn&apos;t exist in
              PIM yet is created automatically (matched by exact name, so it&apos;s never duplicated). The
              board&apos;s exact status label is always captured, even when it&apos;s a side-lane state (Stuck,
              Canceled, On Hold, …) with no equivalent in this app&apos;s pipeline; only an item with no vendor
              set at all is skipped.
            </p>
          </div>
          <Button variant="primary" disabled={loading} onClick={runPreview}>
            <span className="flex items-center gap-1.5">
              <RefreshCw size={15} className={loading ? "spin" : undefined} />
              {loading ? "Reading board…" : "Preview import"}
            </span>
          </Button>
        </div>
      </Card>

      <SharePointArchive autoStartKey={archiveRun} recheckKey={archiveCheck} />

      {error && (
        <Card className="!border-critical-bg">
          <div className="flex gap-2 items-start text-critical text-[0.85rem]">
            <TriangleAlert size={15} className="mt-0.5 shrink-0" />
            {error}
          </div>
        </Card>
      )}

      {result && (
        <Card className="!border-good-bg">
          <div className={`flex gap-2 items-start text-good text-[0.88rem] ${result.errors.length ? "mb-2.5" : ""}`}>
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
            <span>
              Import complete: {result.updated} PO(s) updated, {result.created} created, {result.skipped} skipped.
            </span>
          </div>
          {result.errors.length > 0 && (
            <div className="flex flex-col gap-1 ml-6">
              {result.errors.map((e, i) => (
                <div key={i} className="text-[0.8rem] text-warn">
                  {e.mondayItemId}: {e.message}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {plan && (
        <PullPlanReview
          // Remount with fresh selections whenever a new preview is loaded.
          key={planVersion}
          rows={plan.rows}
          committing={committing}
          onApply={commit}
        />
      )}
    </div>
  );
}
