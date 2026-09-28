import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { connectDB } from "@/lib/db";
import { getSessionRole, roleCan, ROLE_SETS } from "@/lib/authz";
import Item from "@/models/Item";
import { ItemEditForm } from "./ItemEditForm";
import type { ItemMeasurements } from "@/lib/measurements/types";

export default async function ItemEditPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  const role = await getSessionRole();
  if (!roleCan(role, ROLE_SETS.items)) redirect("/unauthorized");

  await connectDB();
  const item = await Item.findById(itemId).populate("vendorId", "name").lean();
  if (!item) notFound();

  const specs = (item.specs ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string => (v == null ? "" : String(v));

  return (
    <AppShell
      activeHref={item.inCatalog ? "/catalog" : "/dashboard"}
      backHref={`/items/${itemId}`}
      backLabel="Item detail"
      eyebrow="Edit item"
      title={item.title || item.vendorSku || "Item"}
    >
      <p className="text-ink-soft max-w-[68ch] mb-6 text-[0.92rem]">
        Update any detail on this item. Changes save per section; the master-record completion
        gate recalculates automatically after every save.
      </p>
      <ItemEditForm
        itemId={itemId}
        initialBulletFeatures={item.bulletFeatures ?? []}
        initial={{
          vendorName: (item.vendorId as unknown as { name?: string } | null)?.name ?? "",
          vendorSku: str(item.vendorSku),
          itemNumber: str(item.itemNumber),
          sampleSku: str(item.sampleSku),
          category: str(item.category),
          brand: str(item.brand),
          upc: str(item.upc),
          upc2: str(item.upc2),
          aliasSku: str(item.aliasSku),
          collectionName: str(item.collectionName),
          season: str(item.season),
          boxNumber: str(item.boxNumber),

          title: str(item.title),
          title2: str(item.title2),
          description: str(item.description),
          description2: str(item.description2),

          metal: str(item.specs?.metal),
          plating: str(item.specs?.plating),
          gender: str(item.specs?.gender),
          clasp: str(item.specs?.clasp),
          tcw: str(item.specs?.tcw),
          birthstone: str(item.specs?.birthstone),
          totalWeight: str(item.specs?.weight?.totalG),
          silverWeight: str(item.specs?.weight?.silverG),

          mainStoneInfo: str(specs.mainStoneInfo),
          mainStoneColor: str(specs.mainStoneColor),
          mainStoneType: str(specs.mainStoneType),
          restStoneInfo: str(specs.restStoneInfo),
          restStoneColor: str(specs.restStoneColor),
          restStoneType: str(specs.restStoneType),
          stoneSetting: str(specs.stoneSetting),
          pearlSize: str(specs.pearlSize),
          pearlType: str(specs.pearlType),
          totalCaratWeight: str(specs.totalCaratWeight),

          allSpecs: str(specs.allSpecs),
        }}
        initialMeasurements={(item.measurements as ItemMeasurements | undefined) ?? {}}
      />
    </AppShell>
  );
}
