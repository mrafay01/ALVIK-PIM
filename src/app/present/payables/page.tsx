"use client";

import { TriangleAlert } from "lucide-react";
import { PresentShell } from "@/components/present/PresentShell";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { StatTile } from "@/components/ui/StatTile";
import { Wallet, Clock, CircleAlert, CheckCircle2 } from "lucide-react";
import {
  MOCK_PAYMENTS,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_TONE,
} from "@/components/present/mockData";

const TRANCHE_LABEL: Record<string, string> = {
  deposit: "Deposit",
  balance: "Balance",
  prepayment: "Prepayment",
  credit: "Credit",
};

export default function PayablesPresentPage() {
  const open = MOCK_PAYMENTS.filter((p) => p.status === "open" || p.status === "deposit_submitted");
  const overdue = MOCK_PAYMENTS.filter((p) => p.overdue);
  const paid = MOCK_PAYMENTS.filter((p) => p.status === "paid");
  const openTotal = open.reduce((s, p) => s + p.amountDue, 0);

  return (
    <PresentShell eyebrow="Vendor finance" title="Payables">
      <p className="text-ink-soft max-w-[68ch] mb-7 text-[0.92rem]">
        Every PO&apos;s payment is one or more tranches — deposit, balance, prepayment, or credit —
        rather than a single amount, matching how vendors are actually paid in stages.
      </p>

      <div className="grid gap-4 mb-7" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <StatTile label="Open balance" value={`$${openTotal.toLocaleString()}`} icon={Wallet} tone="brass" sub={`${open.length} tranches open`} />
        <StatTile label="Overdue" value={String(overdue.length)} icon={CircleAlert} tone={overdue.length > 0 ? "critical" : "good"} sub={overdue.length > 0 ? "Past due date" : "Nothing overdue"} />
        <StatTile label="Paid this period" value={String(paid.length)} icon={CheckCircle2} tone="good" sub="Recorded with proof of payment" />
        <StatTile label="Awaiting due date" value={String(open.length - overdue.length)} icon={Clock} tone="brass" sub="Auto-calculated from vendor terms" />
      </div>

      <Card padding={0}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[700px]">
            <thead>
              <tr>
                {["PO", "Vendor", "Tranche", "Amount due", "Due date", "Status"].map((h) => (
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
              {MOCK_PAYMENTS.map((p) => (
                <tr key={p.id} className="border-b border-border">
                  <td className="px-4 py-3 font-mono text-[0.82rem] font-semibold">{p.poNumber}</td>
                  <td className="px-4 py-3 text-[0.85rem]">{p.vendorName}</td>
                  <td className="px-4 py-3 text-[0.85rem] text-ink-soft">{TRANCHE_LABEL[p.tranche]}</td>
                  <td className="px-4 py-3 font-mono text-[0.85rem] font-semibold">${p.amountDue.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className={`font-mono text-[0.82rem] ${p.overdue ? "text-critical" : "text-ink-soft"}`}>
                        {p.dueDate}
                      </span>
                      {p.overdue && <TriangleAlert size={13} color="var(--critical)" />}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Pill tone={PAYMENT_STATUS_TONE[p.status]}>{PAYMENT_STATUS_LABEL[p.status]}</Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </PresentShell>
  );
}
