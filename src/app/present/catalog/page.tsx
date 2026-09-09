"use client";

import { CheckCircle2, XCircle, ShieldCheck } from "lucide-react";
import { PresentShell } from "@/components/present/PresentShell";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { MOCK_ITEMS } from "@/components/present/mockData";

function GateCheck({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[0.83rem]">
      {ok ? <CheckCircle2 size={15} color="var(--good)" /> : <XCircle size={15} color="var(--ink-faint)" />}
      <span className={ok ? "text-ink" : "text-ink-faint"}>{children}</span>
    </div>
  );
}

export default function CatalogGatePresentPage() {
  const complete = MOCK_ITEMS.filter((i) => i.masterRecordComplete);
  const incomplete = MOCK_ITEMS.filter((i) => !i.masterRecordComplete);

  return (
    <PresentShell eyebrow="Publish gate" title="Catalog Completion Gate">
      <p className="text-ink-soft max-w-[68ch] mb-3 text-[0.92rem]">
        An item can&apos;t be exported to a marketplace until its record is genuinely complete. This
        is a hard rule, recomputed automatically on every edit — not a manual checklist someone can
        forget.
      </p>

      <Card className="mb-7 flex items-center gap-3.5">
        <span className="flex items-center justify-center w-10 h-10 rounded-md bg-brass-bg text-brass shrink-0">
          <ShieldCheck size={20} />
        </span>
        <div>
          <div className="font-semibold text-[0.92rem] mb-1">An item is &quot;complete&quot; only when all five hold true:</div>
          <div className="text-[0.82rem] text-ink-soft">
            Permanent item number assigned · Category set · Metal spec set · At least one MSRP entry ·
            All three image subfolders (main, sides, models) populated
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-6">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-[0.9rem]">Ready for export</h3>
            <Pill tone="good">{complete.length}</Pill>
          </div>
          <div className="flex flex-col gap-2.5">
            {complete.map((item) => (
              <Card key={item.id} padding={16}>
                <div className="font-mono font-semibold text-[0.85rem] mb-2">{item.itemNumber}</div>
                <div className="flex flex-col gap-1.5">
                  <GateCheck ok>Item number assigned</GateCheck>
                  <GateCheck ok>Category: {item.category}</GateCheck>
                  <GateCheck ok>Metal: {item.metal}</GateCheck>
                  <GateCheck ok>MSRP: ${item.msrp}</GateCheck>
                  <GateCheck ok>All images uploaded</GateCheck>
                </div>
              </Card>
            ))}
            {complete.length === 0 && <div className="text-[0.83rem] text-ink-faint">Nothing complete yet.</div>}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-[0.9rem]">Blocked from export</h3>
            <Pill tone="warn">{incomplete.length}</Pill>
          </div>
          <div className="flex flex-col gap-2.5">
            {incomplete.map((item) => {
              const { main, sides, models } = item.imageCompleteness;
              return (
                <Card key={item.id} padding={16}>
                  <div className="font-mono font-semibold text-[0.85rem] mb-2">{item.itemNumber ?? item.sampleSku}</div>
                  <div className="flex flex-col gap-1.5">
                    <GateCheck ok={!!item.itemNumber}>Item number assigned</GateCheck>
                    <GateCheck ok={!!item.category}>Category: {item.category || "missing"}</GateCheck>
                    <GateCheck ok={!!item.metal}>Metal: {item.metal || "missing"}</GateCheck>
                    <GateCheck ok={!!item.msrp}>MSRP {item.msrp ? `$${item.msrp}` : "missing"}</GateCheck>
                    <GateCheck ok={main && sides && models}>
                      Images {main ? "✓" : "✗"} main · {sides ? "✓" : "✗"} sides · {models ? "✓" : "✗"} models
                    </GateCheck>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </PresentShell>
  );
}
