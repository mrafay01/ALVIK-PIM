import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { connectDB } from "@/lib/db";
import { getSessionRole, roleCan } from "@/lib/authz";
import CatalogConflict from "@/models/CatalogConflict";
import "@/models/Item";
import "@/models/Quotation";
import { Card } from "@/components/ui/Card";
import { ConflictsList } from "./ConflictsList";

type Params = { itemId?: string };

export default async function CatalogConflictsPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const role = await getSessionRole();
  if (!roleCan(role, ["catalog_manager"])) redirect("/unauthorized");

  const { itemId } = await searchParams;
  await connectDB();

  const query: Record<string, unknown> = { status: "pending" };
  if (itemId && /^[0-9a-fA-F]{24}$/.test(itemId)) query.itemId = itemId;

  const conflicts = await CatalogConflict.find(query)
    .populate("itemId", "itemNumber title baseSku")
    .populate("quotationId", "sourceFileName poNumber")
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();

  // Group by item for the UI — most conflicts land in bursts of 2-4
  // fields per item (one PI row touches weight + silver weight +
  // sometimes vendor SKU), so grouping is more scannable than a flat
  // list.
  type RawConflict = (typeof conflicts)[number];
  type GroupedItem = {
    itemId: string;
    itemNumber: string;
    title: string | null;
    conflicts: RawConflict[];
  };
  const groups: GroupedItem[] = [];
  const byItem = new Map<string, GroupedItem>();
  for (const c of conflicts) {
    const it = c.itemId as unknown as {
      _id?: unknown;
      itemNumber?: string;
      title?: string | null;
    } | null;
    if (!it || !it._id) continue;
    const key = String(it._id);
    let g = byItem.get(key);
    if (!g) {
      g = {
        itemId: key,
        itemNumber: it.itemNumber ?? "—",
        title: it.title ?? null,
        conflicts: [],
      };
      byItem.set(key, g);
      groups.push(g);
    }
    g.conflicts.push(c);
  }

  return (
    <AppShell
      activeHref="/catalog"
      backHref="/catalog"
      backLabel="Catalog"
      eyebrow="Conflict review"
      title="Pending catalog conflicts"
    >
      <p className="text-ink-soft max-w-[72ch] mb-6 text-[0.92rem]">
        A new vendor PI tried to change an authoritative field on an item that&apos;s already in the
        catalog. Pick which value wins for each — the catalog is only updated once a decision is
        recorded. &quot;Keep catalog&quot; leaves the stored value alone and closes the conflict.
      </p>

      {groups.length === 0 ? (
        <Card>
          <p className="text-ink-faint m-0 text-[0.88rem]">
            No pending conflicts{itemId ? " for this item" : ""}. Nothing to do here.
          </p>
        </Card>
      ) : (
        <ConflictsList groups={JSON.parse(JSON.stringify(groups))} />
      )}
    </AppShell>
  );
}
