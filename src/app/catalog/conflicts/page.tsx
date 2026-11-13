import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { connectDB } from "@/lib/db";
import { getSessionRole, roleCan } from "@/lib/authz";
import CatalogConflict from "@/models/CatalogConflict";
import Item from "@/models/Item";
import "@/models/Quotation";
import { Card } from "@/components/ui/Card";
import { getByPath } from "@/lib/catalog/authoritativeFields";
import { isObjectId } from "@/lib/ids";
import { ConflictsList } from "./ConflictsList";

type Params = { itemId?: string };

const LIMIT = 500;

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
  if (itemId && isObjectId(itemId)) query.itemId = itemId;

  const [conflicts, totalPending] = await Promise.all([
    CatalogConflict.find(query)
      .populate("quotationId", "sourceFileName poNumber")
      .sort({ createdAt: -1 })
      .limit(LIMIT)
      .lean(),
    CatalogConflict.countDocuments(query),
  ]);

  // The items as they are now: the value stored when the PI came in may
  // have changed since (an edit, or another conflict resolved first).
  const itemIds = [...new Set(conflicts.map((c) => String(c.itemId)))];
  const paths = [...new Set(conflicts.map((c) => c.field))];
  const items = await Item.find({ _id: { $in: itemIds } })
    .select(["itemNumber", "title", ...paths].join(" "))
    .lean();
  const itemById = new Map(items.map((it) => [String(it._id), it]));

  // Grouped by item: one PI row usually disagrees on 2-4 fields at once.
  type RawConflict = (typeof conflicts)[number] & { currentValue: unknown };
  type GroupedItem = {
    itemId: string;
    itemNumber: string;
    title: string | null;
    // The item was deleted after the conflict was raised. Its conflicts can
    // only be closed ("keep"), but they're listed so they don't linger in
    // the Catalog's "unresolved conflicts" count with nothing to click.
    missing: boolean;
    conflicts: RawConflict[];
  };
  const groups: GroupedItem[] = [];
  const byItem = new Map<string, GroupedItem>();
  for (const c of conflicts) {
    const key = String(c.itemId);
    const it = itemById.get(key);
    let g = byItem.get(key);
    if (!g) {
      g = {
        itemId: key,
        itemNumber: it?.itemNumber ?? "Deleted item",
        title: it?.title ?? null,
        missing: !it,
        conflicts: [],
      };
      byItem.set(key, g);
      groups.push(g);
    }
    g.conflicts.push({ ...c, currentValue: it ? getByPath(it, c.field) : undefined });
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

      {totalPending > conflicts.length && (
        <Card className="mb-4">
          <p className="m-0 text-[0.85rem] text-ink-soft">
            Showing the newest {conflicts.length} of {totalPending.toLocaleString()} conflicts. Resolve these and the
            rest appear.
          </p>
        </Card>
      )}

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
