import { notFound } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { connectDB } from "@/lib/db";
import { MARKETPLACE_EXPORT_PLATFORMS } from "@/lib/enums";
import { EXPORT_ELIGIBLE } from "@/lib/marketplace-export/eligibility";
import Item from "@/models/Item";
import MarketplaceListing from "@/models/MarketplaceListing";
import { ExportReviewTable } from "./ExportReviewTable";

const PLATFORM_NAMES: Record<string, string> = {
  macys: "Macy's",
  target: "Target",
  belk: "Belk",
  kohls: "Kohl's",
};

// The review table works on one loaded list (selection, inline edits), so it
// shows at most this many; search narrows it down to reach the rest.
const SHOWN_LIMIT = 500;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default async function MarketplaceExportPlatformPage({
  params,
  searchParams,
}: {
  params: Promise<{ platform: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { platform } = await params;
  const q = ((await searchParams).q ?? "").trim().slice(0, 100);
  if (!(MARKETPLACE_EXPORT_PLATFORMS as readonly string[]).includes(platform)) {
    notFound();
  }

  await connectDB();

  // Same eligibility the file generator re-checks (lib/marketplace-export/eligibility).
  const rx = q ? new RegExp(escapeRegex(q), "i") : null;
  const match = rx ? { ...EXPORT_ELIGIBLE, $or: [{ itemNumber: rx }, { title: rx }] } : EXPORT_ELIGIBLE;
  const [items, total] = await Promise.all([
    Item.find(match)
      .select("itemNumber category status specs pricingHistory")
      .sort({ updatedAt: -1 })
      .limit(SHOWN_LIMIT)
      .lean(),
    Item.countDocuments(match),
  ]);

  const listings = await MarketplaceListing.find({
    platform,
    itemId: { $in: items.map((i) => i._id) },
  }).lean();
  const listingByItemId = new Map(listings.map((l) => [String(l.itemId), l]));

  const rows = items.map((item) => ({
    item: JSON.parse(JSON.stringify(item)),
    listing: JSON.parse(JSON.stringify(listingByItemId.get(String(item._id)) ?? null)),
  }));

  return (
    <AppShell
      activeHref="/marketplace-export"
      backHref="/marketplace-export"
      backLabel="Marketplace Export"
      eyebrow="Bulk-import file"
      title={`${PLATFORM_NAMES[platform] ?? platform} Export`}
    >
      <form method="get" className="flex items-center gap-2.5 flex-wrap mb-4">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search SKU or title"
          className="px-3 py-2 rounded-sm border border-border-strong bg-surface-sunken text-ink text-[0.85rem] min-w-[260px]"
        />
        <button
          type="submit"
          className="px-3.5 py-2 rounded-sm border border-border-strong bg-surface text-ink text-[0.85rem] font-semibold cursor-pointer hover:border-brass"
        >
          Search
        </button>
        <span className="text-[0.82rem] text-ink-soft">
          {total > items.length
            ? `Showing the ${items.length.toLocaleString()} most recently updated of ${total.toLocaleString()} ${q ? "matching" : "exportable"} items. Search to find others.`
            : `${total.toLocaleString()} ${q ? "matching" : "exportable"} item${total === 1 ? "" : "s"}.`}
        </span>
      </form>
      <ExportReviewTable platform={platform} rows={rows} />
    </AppShell>
  );
}
