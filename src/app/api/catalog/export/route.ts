import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail, ROLE_SETS } from "@/lib/authz";
import { badRequest } from "@/lib/schemas";
import { loadExportRows, TooManyToExport, type ExportSelection } from "@/lib/catalog/exportData";
import { buildMasterFileWorkbook, MAX_EXPORT_ITEMS } from "@/lib/catalog/masterFileExport";
import logger from "@/lib/logger";

export const maxDuration = 60;

const filterValue = z.string().max(200).optional();
const BodySchema = z
  .object({
    // Add the "Flagged" column after the Master File columns.
    flaggedColumn: z.boolean().default(false),
    // Exactly one of these three says which items:
    itemIds: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).min(1).max(MAX_EXPORT_ITEMS).optional(),
    skus: z.array(z.string().trim().min(1).max(100)).min(1).max(MAX_EXPORT_ITEMS).optional(),
    // The Catalog list's filters: "everything matching", as the list shows it.
    filters: z
      .object({
        filter: filterValue,
        q: filterValue,
        category: filterValue,
        brand: filterValue,
        plating: filterValue,
        minPrice: filterValue,
        maxPrice: filterValue,
      })
      .optional(),
  })
  .refine((b) => [b.itemIds, b.skus, b.filters].filter(Boolean).length === 1, {
    message: "Send exactly one of itemIds, skus or filters",
  });

// POST: the chosen items as an .xlsx in the Master File's exact column
// layout (lib/catalog/masterFileExport.ts), optionally with a Flagged column.
export async function POST(req: NextRequest) {
  const gate = await requireRole(ROLE_SETS.catalogExport);
  if (isAuthFail(gate)) return gate.response;
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const { flaggedColumn, itemIds, skus, filters } = parsed.data;

  const selection: ExportSelection = itemIds
    ? { kind: "items", itemIds }
    : skus
      ? { kind: "skus", skus }
      : { kind: "filters", filters: filters ?? {} };

  await connectDB();
  let rows;
  try {
    ({ rows } = await loadExportRows(selection));
  } catch (err) {
    if (err instanceof TooManyToExport) {
      return NextResponse.json(
        { error: `More than ${MAX_EXPORT_ITEMS.toLocaleString()} items match. Narrow the filters and export in parts.` },
        { status: 413 }
      );
    }
    throw err;
  }
  if (rows.length === 0) {
    return NextResponse.json({ error: "None of these items were found." }, { status: 404 });
  }

  const file = await buildMasterFileWorkbook(rows, { flaggedColumn });
  logger.info("catalog export", { rows: rows.length, kind: selection.kind, bytes: file.length });
  const filename = `catalog-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new NextResponse(new Uint8Array(file), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(file.length),
      "X-Export-Rows": String(rows.length),
    },
  });
}
