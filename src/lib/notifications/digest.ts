import { connectDB } from "@/lib/db";
import Item from "@/models/Item";
import PurchaseOrder from "@/models/PurchaseOrder";
import Quotation from "@/models/Quotation";
import CatalogConflict from "@/models/CatalogConflict";
import ImportBatchRow from "@/models/ImportBatchRow";
import SyncLog from "@/models/SyncLog";
import { ON_FLAGGED_PAGE } from "@/lib/import/reviewQuery";
import { OPEN_PO_CONDITIONS } from "@/lib/purchase-orders/listQuery";
import { IMAGE_ONLY_SUBFOLDERS } from "@/lib/enums";
import type { DigestCounts } from "./digestEmail";

export { digestEmail, isoWeekKey, type DigestCounts } from "./digestEmail";

// The weekly summary email (event "weeklyDigest", off by default): the
// counts are read once, then each role gets the lines that concern its
// work, each one linking to the page that owns it.

const WEEK = 7 * 24 * 60 * 60 * 1000;



function n(facet: { n: number }[] | undefined): number {
  return facet?.[0]?.n ?? 0;
}

export async function loadDigestCounts(now = new Date()): Promise<DigestCounts> {
  await connectDB();
  const weekAgo = new Date(now.getTime() - WEEK);
  const unverifiedMatch = { inCatalog: { $ne: true }, intakeSource: { $in: ["manual_quote", "monday_pull"] } };
  const [po, it, quotesToReview, pendingConflicts, flaggedRows, mondayFailuresThisWeek] = await Promise.all([
    PurchaseOrder.aggregate([
      { $match: { $and: OPEN_PO_CONDITIONS } },
      { $project: { status: 1, requestDate: 1, moved: { $max: { $ifNull: ["$statusHistory.changedAt", []] } } } },
      {
        $facet: {
          total: [{ $count: "n" }],
          moved: [{ $match: { moved: { $gte: weekAgo } } }, { $count: "n" }],
          inTransit: [{ $match: { status: "in_transit" } }, { $count: "n" }],
          readyToShip: [{ $match: { status: "ready_to_ship" } }, { $count: "n" }],
          overdue: [{ $match: { requestDate: { $lt: now } } }, { $count: "n" }],
        },
      },
    ]),
    Item.aggregate([
      {
        $project: {
          inCatalog: 1,
          intakeSource: 1,
          createdAt: 1,
          masterRecordComplete: 1,
          approval: "$catalogApproval.status",
          complete: { $and: ["$imageCompleteness.main", "$imageCompleteness.sides", "$imageCompleteness.models"] },
          images: {
            $size: {
              $filter: {
                input: { $ifNull: ["$media", []] },
                cond: { $in: ["$$this.subfolder", [...IMAGE_ONLY_SUBFOLDERS]] },
              },
            },
          },
          broken: { $in: ["broken", { $ifNull: ["$media.linkStatus", []] }] },
        },
      },
      {
        $facet: {
          catalog: [{ $match: { inCatalog: true } }, { $count: "n" }],
          catalogThisWeek: [{ $match: { inCatalog: true, createdAt: { $gte: weekAgo } } }, { $count: "n" }],
          incomplete: [{ $match: { inCatalog: true, masterRecordComplete: { $ne: true } } }, { $count: "n" }],
          pending: [{ $match: { inCatalog: true, approval: "pending" } }, { $count: "n" }],
          unverified: [{ $match: unverifiedMatch }, { $count: "n" }],
          unverifiedThisWeek: [{ $match: { ...unverifiedMatch, createdAt: { $gte: weekAgo } } }, { $count: "n" }],
          noImages: [{ $match: { images: 0 } }, { $count: "n" }],
          missing: [{ $match: { images: { $gt: 0 }, complete: { $ne: true } } }, { $count: "n" }],
          broken: [{ $match: { broken: true } }, { $count: "n" }],
        },
      },
    ]),
    Quotation.countDocuments({ status: "needs_review" }),
    CatalogConflict.countDocuments({ status: "pending" }),
    ImportBatchRow.countDocuments(ON_FLAGGED_PAGE),
    SyncLog.countDocuments({ createdAt: { $gte: weekAgo }, errored: { $gt: 0 } }),
  ]);
  const p = po[0] ?? {};
  const i = it[0] ?? {};
  return {
    openPos: n(p.total),
    posMovedThisWeek: n(p.moved),
    inTransit: n(p.inTransit),
    readyToShip: n(p.readyToShip),
    overduePos: n(p.overdue),
    quotesToReview,
    unverified: n(i.unverified),
    unverifiedThisWeek: n(i.unverifiedThisWeek),
    catalogItems: n(i.catalog),
    catalogAddedThisWeek: n(i.catalogThisWeek),
    incomplete: n(i.incomplete),
    pendingApproval: n(i.pending),
    pendingConflicts,
    noImages: n(i.noImages),
    missingImages: n(i.missing),
    brokenLinks: n(i.broken),
    flaggedRows,
    mondayFailuresThisWeek,
  };
}

