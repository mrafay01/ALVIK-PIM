import { AppShell } from "@/components/app/AppShell";
import { connectDB } from "@/lib/db";
import Item from "@/models/Item";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { StatCard } from "@/components/ui/StatCard";
import { Pagination, PAGE_SIZE, parsePage } from "@/components/app/Pagination";
import { Gem, CircleCheck, CircleDashed, ImageOff } from "lucide-react";
import { ITEM_STATUS_LABEL, ITEM_STATUS_TONE } from "@/lib/statusDisplay";

const TH_CLASS =
  "text-left text-[0.7rem] font-semibold uppercase tracking-wide text-ink-faint bg-surface-sunken px-4 py-2.5 border-b border-border-strong whitespace-nowrap";
const TD_CLASS = "px-4 py-3 text-[0.85rem]";

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = parsePage(pageParam);
  await connectDB();

  const [items, total, pendingCount, approvedCount, noSkuCount] = await Promise.all([
    Item.find({})
      .select("status sampleSku itemNumber vendorId vendorSku category updatedAt")
      .populate("vendorId", "name")
      .sort({ updatedAt: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean(),
    Item.countDocuments({}),
    Item.countDocuments({ status: "review_pending" }),
    Item.countDocuments({ status: "approved" }),
    Item.countDocuments({ sampleSku: { $in: [null, undefined] }, itemNumber: { $in: [null, undefined] } }),
  ]);

  return (
    <AppShell activeHref="/items" eyebrow="Product spine" title="Items">
      <p className="text-ink-soft max-w-[68ch] mb-6 text-[0.92rem]">
        Open an item to record a review decision, assign a sample SKU, and create a purchase
        order — the pilot lifecycle, start to finish. New items enter through a vendor quote
        under Purchase Orders.
      </p>

      <div className="grid grid-cols-4 gap-3.5 mb-7">
        <StatCard label="Total items" value={total} icon={Gem} tone="brass" />
        <StatCard label="Pending review" value={pendingCount} icon={CircleDashed} tone="warn" />
        <StatCard label="Approved" value={approvedCount} icon={CircleCheck} tone="good" />
        <StatCard label="No SKU yet" value={noSkuCount} icon={ImageOff} tone="neutral" />
      </div>

      <h2 className="text-[0.95rem] mb-3.5">All items ({total.toLocaleString()})</h2>
      {total === 0 ? (
        <Card>
          <p className="text-ink-faint m-0 text-[0.88rem]">
            No items yet — they enter through a vendor quote under Purchase Orders.
          </p>
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
          <div className="px-4 pb-3">
            <Pagination page={page} total={total} basePath="/items" />
          </div>
        </Card>
      )}
    </AppShell>
  );
}
