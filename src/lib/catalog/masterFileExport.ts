import ExcelJS from "exceljs";
import { MASTER_FILE_COLUMNS, type ColumnKind } from "@/lib/import/parseMasterFile";
import { isXlsBuffer, convertXlsToXlsxBuffer } from "@/lib/xlsToXlsx";
import { parseCsv } from "@/lib/quote-import/parseCsv";
import { MAX_EXPORT_ITEMS } from "@/lib/catalog/exportLimits";

// Catalog export in the Master File's own layout. The column list is the
// importer's (MASTER_FILE_COLUMNS: same headers, same order, both "Date"
// columns in place), so an exported file reads back through
// parseMasterFileBuffer with every value landing in its own column — the
// round-trip test in masterFileExport.test.ts checks exactly that.
// No database access here; lib/catalog/exportData.ts loads the records.

// One exported row's values, keyed by Master File field path
// ("itemNumber", "specs.weight.totalG", "pricing.msrp", …).
export type MasterFileRecord = Record<string, unknown>;

export type ExportRow = {
  values: MasterFileRecord;
  // null = not flagged; otherwise the issues to list ([] = flagged, no detail).
  flaggedIssues: string[] | null;
};

export const FLAGGED_HEADER = "Flagged";

function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split(".")) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

type PricingEntryLike = {
  msrp?: number | null;
  ruePrice?: number | null;
  effectiveDate?: Date | string | null;
  masterFile?: { msrp?: number | null; newMsrp?: number | null; effectiveDate?: string | null } | null;
};

export type ExportableItem = Record<string, unknown> & { pricingHistory?: PricingEntryLike[] | null };

// A catalog item's current values in Master File terms. Everything but the
// price columns is stored at the column's own path. Prices come from the
// latest pricing entry: when that entry came from a Master File import, the
// sheet's MSRP / NEW MSRP / Date as written; otherwise (a later price
// change in the app) its current MSRP and the date it took effect.
export function recordFromItem(item: ExportableItem): MasterFileRecord {
  const out: MasterFileRecord = {};
  for (const col of MASTER_FILE_COLUMNS) {
    if (!col.path || col.path.startsWith("pricing.")) continue;
    const v = getPath(item, col.path);
    if (v !== null && v !== undefined && v !== "") out[col.path] = v;
  }
  const history = item.pricingHistory ?? [];
  const last = history.length > 0 ? history[history.length - 1] : null;
  if (last) {
    const set = (path: string, v: unknown) => {
      if (v !== null && v !== undefined && v !== "") out[path] = v;
    };
    if (last.masterFile) {
      set("pricing.msrp", last.masterFile.msrp);
      set("pricing.newMsrp", last.masterFile.newMsrp);
      set("pricing.effectiveDate", last.masterFile.effectiveDate);
    } else {
      set("pricing.msrp", last.msrp);
      set("pricing.effectiveDate", last.effectiveDate);
    }
    set("pricing.ruePrice", last.ruePrice);
  }
  return out;
}

// A Master File row that hasn't reached the catalog (in Flagged Items or
// still on its import's review page): its parsed values, and for a value
// that failed its check (so wasn't parsed) the cell as the file had it.
export function recordFromStagedRow(row: {
  coerced?: Record<string, unknown> | null;
  flags?: { field: string; rawValue?: unknown }[] | null;
}): MasterFileRecord {
  const out: MasterFileRecord = {};
  for (const [path, v] of Object.entries(row.coerced ?? {})) {
    if (v !== null && v !== undefined && v !== "") out[path] = v;
  }
  for (const f of row.flags ?? []) {
    if (out[f.field] === undefined && f.rawValue !== null && f.rawValue !== undefined && f.rawValue !== "") {
      out[f.field] = f.rawValue;
    }
  }
  return out;
}

// "No", or "Yes" with the issues ("Yes: MSRP: Non-numeric value …; …").
export function flaggedCellText(issues: string[] | null): string {
  if (issues === null) return "No";
  return issues.length > 0 ? `Yes: ${issues.join("; ")}` : "Yes";
}

// "2026-03-01" or a Date -> that calendar day at UTC midnight, which is how
// the importer reads a date cell back ("YYYY-MM-DD" from toISOString).
function asDay(v: unknown): Date | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
  }
  if (typeof v === "string") {
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim());
    if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
    // US-style dates typed by hand ("2/27/2026"), read the way the importer reads them.
    const us = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/.exec(v.trim());
    if (us) {
      const year = us[3].length === 2 ? 2000 + Number(us[3]) : Number(us[3]);
      return new Date(Date.UTC(year, Number(us[1]) - 1, Number(us[2])));
    }
  }
  return null;
}

// Excel keeps line breaks inside a cell as "\n"; some stored text has
// Windows "\r\n" (from the original sheet), which Excel would show oddly.
// Invisible control characters (seen pasted into descriptions) can't be
// stored in an .xlsx at all, so they're dropped.
function cellText(v: unknown): string {
  return String(v).replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

// The cell for one value. A value that isn't of the column's kind (an
// unparsed flagged cell, say "abc" under MSRP) is written as the text it was.
function cellFor(kind: ColumnKind, v: unknown): ExcelJS.CellValue {
  if (v === null || v === undefined || v === "") return null;
  switch (kind) {
    case "number":
    case "weight":
      return typeof v === "number" ? v : cellText(v);
    case "date":
      return asDay(v) ?? cellText(v);
    case "bool":
      // The importer reads any non-blank cell as "yes".
      return v === true ? "Yes" : v === false ? null : cellText(v);
    default:
      return v instanceof Date ? (asDay(v)?.toISOString().slice(0, 10) ?? null) : cellText(v);
  }
}

const DATE_FORMAT = "m/d/yyyy";

export async function buildMasterFileWorkbook(rows: ExportRow[], opts: { flaggedColumn: boolean }): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Alvik PIM";
  const ws = wb.addWorksheet("Master File", { views: [{ state: "frozen", ySplit: 1 }] });

  const headers = MASTER_FILE_COLUMNS.map((c) => c.header);
  if (opts.flaggedColumn) headers.push(FLAGGED_HEADER);
  const header = ws.addRow(headers);
  header.font = { bold: true };

  MASTER_FILE_COLUMNS.forEach((col, i) => {
    const column = ws.getColumn(i + 1);
    column.width = col.kind === "text" && /description|title|specs/i.test(col.header) ? 32 : 14;
    if (col.kind === "date") column.numFmt = DATE_FORMAT;
  });
  if (opts.flaggedColumn) ws.getColumn(headers.length).width = 40;

  for (const row of rows) {
    const cells: ExcelJS.CellValue[] = MASTER_FILE_COLUMNS.map((col) => (col.path ? cellFor(col.kind, row.values[col.path]) : null));
    if (opts.flaggedColumn) cells.push(flaggedCellText(row.flaggedIssues));
    ws.addRow(cells);
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---------------------------------------------------------------------------
// SKU list upload: one column, "SKUs" in A1, then one SKU per row.

export { MAX_EXPORT_ITEMS };

export type SkuListResult =
  | { ok: true; skus: string[]; duplicates: number; blanks: number; otherColumns: boolean }
  | { ok: false; error: string };

const HEADER_OK = new Set(["skus", "sku"]);

function skuText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if ("result" in v) return skuText((v as { result: unknown }).result);
    if ("richText" in v) return (v as { richText: { text: string }[] }).richText.map((r) => r.text).join("").trim();
    if ("text" in v) return String((v as { text: unknown }).text).trim();
  }
  return String(v).trim();
}

// Reads the uploaded list (.xlsx, .xls or .csv). Duplicates are dropped
// (first one kept, case-insensitively) and blank rows skipped; both are
// counted so the screen can say so.
export async function parseSkuListFile(data: ArrayBuffer, fileName: string): Promise<SkuListResult> {
  let grid: unknown[][];
  try {
    if (/\.csv$/i.test(fileName)) {
      grid = parseCsv(new TextDecoder().decode(data));
    } else {
      const source = isXlsBuffer(data, fileName) ? await convertXlsToXlsxBuffer(data) : data;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(source);
      const ws = wb.worksheets[0];
      if (!ws) return { ok: false, error: "The file has no sheets." };
      grid = [];
      ws.eachRow({ includeEmpty: true }, (row, n) => {
        const values: unknown[] = [];
        row.eachCell({ includeEmpty: false }, (cell, c) => {
          values[c - 1] = cell.value;
        });
        grid[n - 1] = values;
      });
    }
  } catch {
    return { ok: false, error: "Couldn't read the file. Upload an Excel (.xlsx, .xls) or CSV file." };
  }

  const head = skuText(grid[0]?.[0]);
  if (!HEADER_OK.has(head.toLowerCase())) {
    return {
      ok: false,
      error: head
        ? `The first cell (A1) must be the heading "SKUs"; it says "${head.slice(0, 40)}".`
        : 'The first cell (A1) must be the heading "SKUs", with the SKUs below it.',
    };
  }

  const seen = new Set<string>();
  const skus: string[] = [];
  let duplicates = 0;
  let blanks = 0;
  let otherColumns = false;
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    if (row.slice(1).some((v) => skuText(v) !== "")) otherColumns = true;
    const sku = skuText(row[0]);
    if (!sku) {
      if (row.some((v) => skuText(v) !== "")) blanks++;
      continue;
    }
    const key = sku.toLowerCase();
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    skus.push(sku.slice(0, 100));
  }
  if (skus.length === 0) return { ok: false, error: 'No SKUs found under the "SKUs" heading.' };
  if (skus.length > MAX_EXPORT_ITEMS) {
    return { ok: false, error: `The list has ${skus.length.toLocaleString()} SKUs; one export takes up to ${MAX_EXPORT_ITEMS.toLocaleString()}. Split the list.` };
  }
  return { ok: true, skus, duplicates, blanks, otherColumns };
}
