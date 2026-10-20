import { AppShell } from "@/components/app/AppShell";
import { connectDB } from "@/lib/db";
import { getSessionRole, roleCan, ROLE_SETS } from "@/lib/authz";
import Item from "@/models/Item";
import { Card } from "@/components/ui/Card";
import { PAGE_SIZE, parsePage } from "@/components/app/Pagination";
import { ImagesTable, type ImageRow } from "./ImagesTable";

type Scope = "all" | "catalog" | "unverified";
type Status = "all" | "missing" | "none" | "broken" | "complete";

const SCOPES: Scope[] = ["all", "catalog", "unverified"];
const STATUSES: Status[] = ["all", "missing", "none", "broken", "complete"];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const STATUS_MATCH: Record<Exclude<Status, "all">, Record<string, unknown>> = {
  missing: {
    $or: [
      { "imageCompleteness.main": { $ne: true } },
      { "imageCompleteness.sides": { $ne: true } },
      { "imageCompleteness.models": { $ne: true } },
    ],
  },
  none: { "media.0": { $exists: false } },
  broken: { "media.linkStatus": "broken" },
  complete: {
    "imageCompleteness.main": true,
    "imageCompleteness.sides": true,
    "imageCompleteness.models": true,
  },
};

// Images: every item's Main / Sides / Models images at a glance, which
// SharePoint links still work, which are broken and which are missing,
// with upload in place for the photography team.
export default async function ImagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const scope: Scope = SCOPES.includes(sp.scope as Scope) ? (sp.scope as Scope) : "all";
  const status: Status = STATUSES.includes(sp.status as Status) ? (sp.status as Status) : "all";
  const q = (sp.q ?? "").trim().slice(0, 100);
  const sort = sp.sort === "updated" ? "updated" : "sku";
  const page = parsePage(sp.page);

  await connectDB();
  const role = await getSessionRole();
  const canUpload = roleCan(role, ROLE_SETS.media);

  // Items can only hold images once they have a SKU to name the folder by.
  const base: Record<string, unknown> = {
    $and: [
      { $or: [{ itemNumber: { $nin: [null, ""] } }, { sampleSku: { $nin: [null, ""] } }] },
      ...(scope === "catalog" ? [{ inCatalog: true }] : []),
      ...(scope === "unverified" ? [{ inCatalog: { $ne: true }, intakeSource: { $in: ["manual_quote", "monday_pull"] } }] : []),
      ...(q
        ? [
            {
              $or: [
                { itemNumber: new RegExp(escapeRegex(q), "i") },
                { sampleSku: new RegExp(escapeRegex(q), "i") },
                { title: new RegExp(escapeRegex(q), "i") },
              ],
            },
          ]
        : []),
    ],
  };
  const match = status === "all" ? base : { $and: [base, STATUS_MATCH[status]] };

  const [items, total, counts, lastChecked] = await Promise.all([
    Item.find(match)
      .select("itemNumber sampleSku title inCatalog media imageCompleteness updatedAt")
      .sort(sort === "updated" ? { updatedAt: -1 } : { itemNumber: 1, sampleSku: 1 })
      .collation({ locale: "en", numericOrdering: true })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean(),
    Item.countDocuments(match),
    Item.aggregate<Record<string, { n: number }[]>>([
      { $match: base },
      {
        $facet: {
          all: [{ $count: "n" }],
          missing: [{ $match: STATUS_MATCH.missing }, { $count: "n" }],
          none: [{ $match: STATUS_MATCH.none }, { $count: "n" }],
          broken: [{ $match: STATUS_MATCH.broken }, { $count: "n" }],
          complete: [{ $match: STATUS_MATCH.complete }, { $count: "n" }],
        },
      },
    ]),
    Item.aggregate<{ at: Date | null }>([
      { $match: { "media.linkCheckedAt": { $exists: true } } },
      { $project: { at: { $max: "$media.linkCheckedAt" } } },
      { $group: { _id: null, at: { $max: "$at" } } },
    ]),
  ]);

  const c = counts[0] ?? {};
  const statusCounts = Object.fromEntries(STATUSES.map((s) => [s, c[s]?.[0]?.n ?? 0])) as Record<Status, number>;

  const rows: ImageRow[] = items.map((it) => ({
    _id: String(it._id),
    sku: it.itemNumber || it.sampleSku || "",
    isSample: !it.itemNumber,
    title: it.title ?? null,
    inCatalog: !!it.inCatalog,
    media: (it.media ?? []).map((m) => ({
      sharePointItemId: m.sharePointItemId,
      url: m.url,
      name: m.name ?? null,
      subfolder: m.subfolder as "main" | "sides" | "models",
      linkStatus: (m.linkStatus as "ok" | "broken" | undefined) ?? null,
    })),
  }));

  return (
    <AppShell activeHref="/images" eyebrow="Digital assets" title="Images">
      <p className="text-ink-soft max-w-[72ch] mb-5 text-[0.92rem]">
        Every item&apos;s main, side and model images in SharePoint: which links work, which are broken (the file
        is no longer in SharePoint) and which are missing.
        {canUpload ? " Upload straight from here; files are renamed and filed into the right folder for you." : ""}
      </p>

      {total === 0 && statusCounts.all === 0 && !q ? (
        <Card>
          <p className="text-ink-faint m-0 text-[0.88rem]">
            No items with a SKU yet. Items appear here once they have a sample SKU or item number.
          </p>
        </Card>
      ) : (
        <ImagesTable
          rows={rows}
          total={total}
          page={page}
          state={{ scope, status, q, sort }}
          statusCounts={statusCounts}
          canUpload={canUpload}
          lastCheckedAt={lastChecked[0]?.at ? new Date(lastChecked[0].at).toISOString() : null}
        />
      )}
    </AppShell>
  );
}
