import { AppShell } from "@/components/app/AppShell";
import { connectDB } from "@/lib/db";
import Payment from "@/models/Payment";
import "@/models/Vendor";
import "@/models/PurchaseOrder";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { StatCard } from "@/components/ui/StatCard";
import { TriangleAlert, Wallet, Clock, CheckCircle2 } from "lucide-react";
import { PAYMENT_STATUS_LABEL, PAYMENT_STATUS_TONE } from "@/lib/statusDisplay";
import { PaymentRow } from "./PaymentRow";

const STATUS_TABS = [
  { value: "", label: "All" },
  { value: "open", label: "Open" },
  { value: "deposit_submitted", label: "Deposit submitted" },
  { value: "paid", label: "Paid" },
  { value: "archived", label: "Archived" },
];

const TH_CLASS =
  "text-left text-[0.7rem] font-semibold uppercase tracking-wide text-ink-faint bg-surface-sunken px-4 py-2.5 border-b border-border-strong whitespace-nowrap";
const TD_CLASS = "px-4 py-3 text-[0.85rem]";

export default async function PayablesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  await connectDB();

  const query = status ? { status } : {};
  const payments = await Payment.find(query)
    .populate("vendorId", "name")
    .populate("poId", "poNumber")
    .sort({ updatedAt: -1 })
    .limit(200)
    .lean();

  const now = Date.now();
  const openTotal = payments.filter((p) => p.status === "open").reduce((sum, p) => sum + (p.amountDue ?? 0), 0);
  const overdueCount = payments.filter((p) => p.status === "open" && p.dueDate && new Date(p.dueDate).getTime() < now).length;
  const paidCount = payments.filter((p) => p.status === "paid").length;

  return (
    <AppShell activeHref="/payables" eyebrow="Vendor finance" title="Payables">
      <p className="text-ink-soft max-w-[68ch] mb-5 text-[0.92rem]">
        Every payment tranche — deposit, balance, prepayment, or credit — recorded against its PO,
        with due dates calculated from vendor terms.
      </p>

      <div className="grid grid-cols-3 gap-3.5 mb-6">
        <StatCard label="Open balance" value={`$${openTotal.toLocaleString()}`} icon={Wallet} tone="brass" />
        <StatCard label="Overdue" value={overdueCount} icon={Clock} tone={overdueCount > 0 ? "critical" : "neutral"} />
        <StatCard label="Paid" value={paidCount} icon={CheckCircle2} tone="good" />
      </div>

      <div className="flex gap-1.5 mb-5">
        {STATUS_TABS.map((tab) => {
          const active = (status ?? "") === tab.value;
          return (
            <a
              key={tab.value || "all"}
              href={tab.value ? `/payables?status=${tab.value}` : "/payables"}
              className={`px-3.5 py-1.5 rounded-full text-[0.82rem] no-underline ${
                active ? "font-semibold bg-brass-bg text-brass" : "font-medium bg-transparent text-ink-soft"
              }`}
            >
              {tab.label}
            </a>
          );
        })}
      </div>

      {payments.length === 0 ? (
        <Card>
          <p className="text-ink-faint m-0 text-[0.88rem]">No payments recorded yet.</p>
        </Card>
      ) : (
        <Card padding={0}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[780px]">
              <thead>
                <tr>
                  {["PO", "Vendor", "Tranche", "Amount due", "Due date", "Status", ""].map((h) => (
                    <th key={h} className={TH_CLASS}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => {
                  const overdue = p.status === "open" && p.dueDate ? new Date(p.dueDate).getTime() < now : false;
                  return (
                    <tr key={String(p._id)} className="czc-row border-b border-border">
                      <td className={`${TD_CLASS} font-mono font-semibold`}>
                        {(p.poId as unknown as { poNumber?: string } | null)?.poNumber || "—"}
                      </td>
                      <td className={TD_CLASS}>{(p.vendorId as unknown as { name?: string } | null)?.name || "—"}</td>
                      <td className={`${TD_CLASS} text-ink-soft capitalize`}>{p.tranche}</td>
                      <td className={`${TD_CLASS} font-mono font-semibold`}>
                        {p.amountDue != null ? `$${p.amountDue.toLocaleString()}` : "—"}
                      </td>
                      <td className={TD_CLASS}>
                        <div className="flex items-center gap-1.5">
                          <span className={`font-mono text-[0.82rem] ${overdue ? "text-critical" : "text-ink-soft"}`}>
                            {p.dueDate ? new Date(p.dueDate).toLocaleDateString() : "—"}
                          </span>
                          {overdue && <TriangleAlert size={13} color="var(--critical)" />}
                        </div>
                      </td>
                      <td className={TD_CLASS}>
                        <Pill tone={PAYMENT_STATUS_TONE[p.status as keyof typeof PAYMENT_STATUS_TONE]}>
                          {PAYMENT_STATUS_LABEL[p.status as keyof typeof PAYMENT_STATUS_LABEL]}
                        </Pill>
                      </td>
                      <td className={TD_CLASS}>
                        <PaymentRow paymentId={String(p._id)} status={p.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </AppShell>
  );
}
