import { AppShell } from "@/components/app/AppShell";
import { connectDB } from "@/lib/db";
import PurchaseOrder from "@/models/PurchaseOrder";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { StatCard } from "@/components/ui/StatCard";
import { Pagination, PAGE_SIZE, parsePage } from "@/components/app/Pagination";
import { ClipboardList, Ship, TriangleAlert, DollarSign } from "lucide-react";
import { PO_STATUS_LABEL, PO_STATUS_TONE } from "@/lib/statusDisplay";

const TH_CLASS =
  "text-left text-[0.7rem] font-semibold uppercase tracking-wide text-ink-faint bg-surface-sunken px-4 py-2.5 border-b border-border-strong whitespace-nowrap";
const TD_CLASS = "px-4 py-3 text-[0.85rem]";

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = parsePage(pageParam);
  await connectDB();

  const [pos, total, shippedCount, highPriorityCount, valueAgg] = await Promise.all([
    PurchaseOrder.find({})
      .select("poNumber vendorId status orderPurpose priority poTotal updatedAt")
      .populate("vendorId", "name")
      .sort({ updatedAt: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean(),
    PurchaseOrder.countDocuments({}),
    PurchaseOrder.countDocuments({ status: "shipment_received" }),
    PurchaseOrder.countDocuments({ priority: "high" }),
    PurchaseOrder.aggregate<{ _id: null; total: number }>([
      { $group: { _id: null, total: { $sum: "$poTotal" } } },
    ]),
  ]);

  const totalValue = valueAgg[0]?.total ?? 0;

  return (
    <AppShell activeHref="/purchase-orders" eyebrow="Vendor pipeline" title="Purchase Orders">
      <p className="text-ink-soft max-w-[68ch] mb-6 text-[0.92rem]">
        One collection replaces six separate Monday.com stage boards — each was really a filtered
        view of the same list. Create a PO from an item&apos;s detail page once it has a sample SKU.
      </p>

      <div className="grid grid-cols-4 gap-3.5 mb-7">
        <StatCard label="Total POs" value={total} icon={ClipboardList} tone="brass" />
        <StatCard label="Shipped" value={shippedCount} icon={Ship} tone="good" />
        <StatCard label="High priority" value={highPriorityCount} icon={TriangleAlert} tone="warn" />
        <StatCard label="Pipeline value" value={`$${totalValue.toLocaleString()}`} icon={DollarSign} tone="neutral" />
      </div>

      {total === 0 ? (
        <Card>
          <p className="text-ink-faint m-0 text-[0.88rem]">
            None yet — create one from an item&apos;s detail page once it has a sample SKU.
          </p>
        </Card>
      ) : (
        <Card padding={0}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[760px]">
              <thead>
                <tr>
                  {["PO #", "Vendor", "Purpose", "Priority", "Status", "Total", "Updated"].map((h) => (
                    <th key={h} className={TH_CLASS}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pos.map((po) => (
                  <tr key={String(po._id)} className="czc-row border-b border-border">
                    <td className={TD_CLASS}>
                      <a href={`/purchase-orders/${po._id}`} className="font-mono font-semibold text-[0.85rem] text-navy-deep no-underline">
                        {po.poNumber}
                      </a>
                    </td>
                    <td className={TD_CLASS}>{(po.vendorId as unknown as { name?: string } | null)?.name || "—"}</td>
                    <td className={`${TD_CLASS} text-ink-soft capitalize`}>{po.orderPurpose?.category}</td>
                    <td className={`${TD_CLASS} text-ink-soft capitalize`}>{po.priority}</td>
                    <td className={TD_CLASS}>
                      <Pill tone={PO_STATUS_TONE[po.status as keyof typeof PO_STATUS_TONE]}>
                        {PO_STATUS_LABEL[po.status as keyof typeof PO_STATUS_LABEL]}
                      </Pill>
                    </td>
                    <td className={`${TD_CLASS} font-mono`}>{po.poTotal != null ? `$${po.poTotal.toLocaleString()}` : "—"}</td>
                    <td className={`${TD_CLASS} text-[0.8rem] text-ink-faint`}>
                      {po.updatedAt ? new Date(po.updatedAt).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 pb-3">
            <Pagination page={page} total={total} basePath="/purchase-orders" />
          </div>
        </Card>
      )}
    </AppShell>
  );
}
