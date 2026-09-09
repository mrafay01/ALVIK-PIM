import { AppShell } from "@/components/app/AppShell";
import { connectDB } from "@/lib/db";
import Item from "@/models/Item";
import Vendor from "@/models/Vendor";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { StatCard } from "@/components/ui/StatCard";
import { Gem, CircleCheck, CircleDashed, ImageOff } from "lucide-react";
import { ITEM_STATUS_LABEL, ITEM_STATUS_TONE } from "@/lib/statusDisplay";
import { IntakeForm } from "./IntakeForm";

const TH_CLASS =
  "text-left text-[0.7rem] font-semibold uppercase tracking-wide text-ink-faint bg-surface-sunken px-4 py-2.5 border-b border-border-strong whitespace-nowrap";
const TD_CLASS = "px-4 py-3 text-[0.85rem]";

export default async function ItemsPage() {
  await connectDB();

  const [items, vendors] = await Promise.all([
    Item.find({})
      .select("status sampleSku itemNumber vendorId vendorSku category updatedAt")
      .populate("vendorId", "name")
      .sort({ updatedAt: -1 })
      .limit(200)
      .lean(),
    Vendor.find({}).select("name").sort({ name: 1 }).lean(),
  ]);

  const pendingCount = items.filter((it) => it.status === "review_pending").length;
  const approvedCount = items.filter((it) => it.status === "approved").length;
  const noSkuCount = items.filter((it) => !it.sampleSku && !it.itemNumber).length;

  return (
    <AppShell activeHref="/items" eyebrow="Product spine" title="Items">
      <p className="text-ink-soft max-w-[68ch] mb-6 text-[0.92rem]">
        Intake a vendor quote here, then open an item to record a review decision, assign a
        sample SKU, and create a purchase order — the pilot lifecycle, start to finish.
      </p>

      <div className="grid grid-cols-4 gap-3.5 mb-7">
        <StatCard label="Total items" value={items.length} icon={Gem} tone="brass" />
        <StatCard label="Pending review" value={pendingCount} icon={CircleDashed} tone="warn" />
        <StatCard label="Approved" value={approvedCount} icon={CircleCheck} tone="good" />
        <StatCard label="No SKU yet" value={noSkuCount} icon={ImageOff} tone="neutral" />
      </div>

      <Card className="mb-8">
        <h2 className="text-[0.95rem] mb-3.5">Intake a new quote</h2>
        <IntakeForm vendors={vendors.map((v) => ({ id: String(v._id), name: v.name }))} />
      </Card>

      <h2 className="text-[0.95rem] mb-3.5">All items ({items.length})</h2>
      {items.length === 0 ? (
        <Card>
          <p className="text-ink-faint m-0 text-[0.88rem]">No items yet — intake one above.</p>
        </Card>
      ) : (
        <Card padding={0}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[700px]">
              <thead>
                <tr>
                  {["Vendor SKU", "Item #", "Sample SKU", "Vendor", "Status", "Updated"].map((h) => (
                    <th key={h} className={TH_CLASS}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={String(it._id)} className="czc-row border-b border-border">
                    <td className={TD_CLASS}>
                      <a href={`/items/${it._id}`} className="text-navy-deep font-semibold no-underline">
                        {it.vendorSku || "—"}
                      </a>
                    </td>
                    <td className={`${TD_CLASS} font-mono text-[0.82rem]`}>{it.itemNumber || "—"}</td>
                    <td className={`${TD_CLASS} font-mono text-[0.82rem]`}>{it.sampleSku || "—"}</td>
                    <td className={`${TD_CLASS} text-ink-soft`}>
                      {(it.vendorId as unknown as { name?: string } | null)?.name || "—"}
                    </td>
                    <td className={TD_CLASS}>
                      <Pill tone={ITEM_STATUS_TONE[it.status as keyof typeof ITEM_STATUS_TONE]}>
                        {ITEM_STATUS_LABEL[it.status as keyof typeof ITEM_STATUS_LABEL]}
                      </Pill>
                    </td>
                    <td className={`${TD_CLASS} text-[0.8rem] text-ink-faint`}>
                      {it.updatedAt ? new Date(it.updatedAt).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </AppShell>
  );
}
