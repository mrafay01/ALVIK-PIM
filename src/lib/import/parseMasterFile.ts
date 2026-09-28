import ExcelJS from "exceljs";
import { isXlsBuffer, convertXlsToXlsxBuffer } from "@/lib/xlsToXlsx";

// Coercion + validation rules for the Master File import, per the blueprint's
// Data-quality note: treat every legacy cell as untrusted text, coerce with
// a mapping table, and flag anything that fails rather than guessing or
// dropping it silently.
//
// The real Master File header row repeats several labels — "Date" appears
// twice (once next to MSRP, once next to NEW MSRP), and the stone columns
// are two near-identical groups ("main stone info/color/type" vs. the
// general "Stone info/color/type/setting"). Matching by lowercased header
// text alone can't tell those apart, and a later duplicate header would
// silently clobber an earlier one in a plain object. So columns are mapped
// by their fixed position (A, B, C, …) — captured once from the real file —
// with the header-text table kept only as a fallback for sheets whose
// layout drifts from that reference (columns present, order changed).

export type FieldFlag = {
  field: string;
  message: string;
  rawValue: unknown;
};

export type StagedRowInput = {
  rowNumber: number;
  raw: Record<string, unknown>;
  coerced: Record<string, unknown>;
  flags: FieldFlag[];
};

// Known placeholder values the sheet uses for "no data" instead of a real blank.
const N_A_TOKENS = new Set(["/", "n/a", "na", "-", "--", ""]);

function isPlaceholder(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && N_A_TOKENS.has(value.trim().toLowerCase())) return true;
  return false;
}

// Metals seen hand-typed in the wild, mapped to a canonical value. Anything
// not in this table gets flagged for a human to classify rather than passed
// through as freeform text.
const METAL_MAP: Record<string, string> = {
  brass: "Brass",
  "14k gp": "14K GP",
  "14kgp": "14K GP",
  silver: "Silver",
  "925 silver": "Silver",
  "sterling silver": "Silver",
  gold: "Gold",
  "18k gold": "18K Gold",
};

function coerceMetal(raw: unknown, flags: FieldFlag[]): string | null {
  if (isPlaceholder(raw)) return null;
  const str = String(raw).trim();
  const mapped = METAL_MAP[str.toLowerCase()];
  if (mapped) return mapped;
  flags.push({
    field: "specs.metal",
    message: `Unrecognized metal value "${str}"; not in the known mapping table`,
    rawValue: raw,
  });
  return str; // keep the raw text so the reviewer can see and correct it
}

function coerceDate(raw: unknown, field: string, flags: FieldFlag[]): string | null {
  if (isPlaceholder(raw)) return null;

  // exceljs returns real cells already parsed as JS Dates when Excel has
  // the cell formatted as a date.
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10);
  }

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    // Try a few common hand-typed formats before giving up.
    const isoLike = /^\d{4}-\d{2}-\d{2}$/;
    const usLike = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/;
    if (isoLike.test(trimmed)) return trimmed;
    const usMatch = trimmed.match(usLike);
    if (usMatch) {
      const [, m, d, y] = usMatch;
      const year = y.length === 2 ? `20${y}` : y;
      return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    flags.push({
      field,
      message: `Could not parse date "${trimmed}"; needs manual entry`,
      rawValue: raw,
    });
    return null;
  }

  flags.push({ field, message: "Unexpected date cell type", rawValue: raw });
  return null;
}

// Money/weight cells sometimes carry a unit or currency suffix ("12.5g",
// "$42.00"). Strip common markers, then parse.
function coerceNumber(raw: unknown, field: string, flags: FieldFlag[]): number | null {
  if (isPlaceholder(raw)) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string") {
    const cleaned = raw
      .replace(/(?:US\$|USD|[$€£¥])/gi, "")
      .replace(/(grams?|gms?|g)\b/gi, "")
      .replace(/[,\s]/g, "");
    const n = Number(cleaned);
    if (cleaned !== "" && !Number.isNaN(n)) return n;
  }
  flags.push({ field, message: `Non-numeric value "${String(raw)}"`, rawValue: raw });
  return null;
}

function coerceText(raw: unknown): string | null {
  if (isPlaceholder(raw)) return null;
  return String(raw).trim();
}

function coerceBool(raw: unknown): boolean {
  return !isPlaceholder(raw);
}

type ColumnKind = "text" | "number" | "weight" | "date" | "bool" | "metal";

// One entry per real Master File column, in spreadsheet order (A, B, C, …).
// `path` is the dot-path the value lands at on the staged row's `coerced`
// object (pricing.* paths are folded into one pricingHistory entry by the
// commit route's existing buildUpdate — see admin/import-review commit).
// `header` is the exact label from the real file, used for header-text
// fallback matching and shown in the raw-row audit trail.
interface ColumnDef {
  header: string;
  aliases?: string[];
  path: string | null; // null = captured in `raw` only, not written to coerced
  kind: ColumnKind;
}

const COLUMNS: ColumnDef[] = [
  { header: "SKU", aliases: ["itemnumber"], path: "itemNumber", kind: "text" },
  { header: "Date added", path: "specs.dateAdded", kind: "date" },
  { header: "Title", path: "title", kind: "text" },
  { header: "Description", path: "description", kind: "text" },
  { header: "TITLE#2", path: "title2", kind: "text" },
  { header: "descripton # 2", aliases: ["description #2", "descripto"], path: "description2", kind: "text" },
  { header: "Variation sku", path: "specs.variationSku", kind: "text" },
  { header: "variation titles", path: "specs.variationTitle", kind: "text" },
  { header: "variation description", path: "specs.variationDescription", kind: "text" },
  { header: "Total Weight", path: "specs.weight.totalG", kind: "weight" },
  { header: "silver weight", path: "specs.weight.silverG", kind: "weight" },
  { header: "main stone info", path: "specs.mainStoneInfo", kind: "text" },
  { header: "main stone color", path: "specs.mainStoneColor", kind: "text" },
  { header: "main stone type", path: "specs.mainStoneType", kind: "text" },
  { header: "Stone info", path: "specs.restStoneInfo", kind: "text" },
  { header: "stone color", path: "specs.restStoneColor", kind: "text" },
  { header: "stone type", path: "specs.restStoneType", kind: "text" },
  { header: "stone setting", path: "specs.stoneSetting", kind: "text" },
  { header: "Pearl Size (in mm)", path: "specs.pearlSize", kind: "text" },
  { header: "Pearl type", path: "specs.pearlType", kind: "text" },
  { header: "Plating", path: "specs.plating", kind: "text" },
  { header: "All Length+ Extender", aliases: ["all measure"], path: "specs.lengthExtender", kind: "text" },
  { header: "measurements", path: "specs.measurements", kind: "text" },
  { header: "clasp", path: "specs.clasp", kind: "text" },
  { header: "Length of post", aliases: ["length"], path: "specs.postLength", kind: "text" },
  { header: "Push back Size", path: "specs.pushBackSize", kind: "text" },
  { header: "Thickness of chain", aliases: ["thickness"], path: "specs.thickness", kind: "text" },
  { header: "brand", path: "brand", kind: "text" },
  { header: "all specs", path: "specs.allSpecs", kind: "text" },
  { header: "Metal", path: "specs.metal", kind: "metal" },
  // Note: no top-level `discontinued` field exists on Item — the lifecycle
  // already models this via status: "discontinued". Stored under specs so a
  // reviewer can see the sheet's flag and decide whether to change status,
  // rather than being silently dropped by the strict root schema (the same
  // failure mode brand/upc had before those fields were added).
  { header: "Discontinue", aliases: ["discontinued", "discontin "], path: "specs.discontinuedFlag", kind: "bool" },
  { header: "Gender", path: "specs.gender", kind: "text" },
  { header: "tcw", path: "specs.tcw", kind: "text" },
  { header: "Date", path: "pricing.effectiveDate", kind: "date" },
  { header: "MSRP", path: "pricing.msrp", kind: "number" },
  { header: "Date", path: "specs.newMsrpDate", kind: "date" },
  { header: "NEW MSRP", aliases: ["new msrp"], path: "pricing.newMsrp", kind: "number" },
  { header: "Rue Price", aliases: ["rue price"], path: "pricing.ruePrice", kind: "number" },
  { header: "catogry", aliases: ["category"], path: "category", kind: "text" },
  { header: "total carat weight added up already", path: "specs.totalCaratWeight", kind: "text" },
  { header: "upc", path: "upc", kind: "text" },
  { header: "birthstone", path: "specs.birthstone", kind: "text" },
];

// header text (lowercased, trimmed) -> index into COLUMNS, for the
// header-text fallback path. Two columns share the literal label "Date" —
// intentionally not included here since text matching can't disambiguate
// them; those two are only ever resolved by position.
const AMBIGUOUS_HEADERS = new Set(["date"]);
const HEADER_TO_COLUMN: Record<string, number> = {};
COLUMNS.forEach((col, i) => {
  const labels = [col.header, ...(col.aliases ?? [])];
  for (const label of labels) {
    const key = label.trim().toLowerCase();
    if (AMBIGUOUS_HEADERS.has(key)) continue;
    if (!(key in HEADER_TO_COLUMN)) HEADER_TO_COLUMN[key] = i;
  }
});

function coerceByKind(kind: ColumnKind, raw: unknown, field: string, flags: FieldFlag[]): unknown {
  switch (kind) {
    case "text":
      return coerceText(raw);
    case "number":
      return coerceNumber(raw, field, flags);
    case "weight":
      return coerceNumber(raw, field, flags);
    case "date":
      return coerceDate(raw, field, flags);
    case "bool":
      return coerceBool(raw);
    case "metal":
      return coerceMetal(raw, flags);
  }
}

function cellValue(cell: ExcelJS.Cell): unknown {
  const v = cell.value;
  if (v === null || v === undefined) return null;
  // Formula cells: use the computed result, not the formula text.
  if (typeof v === "object" && "result" in v) return (v as { result: unknown }).result;
  // Rich text cells: flatten to plain text.
  if (typeof v === "object" && "richText" in v) {
    return (v as { richText: { text: string }[] }).richText.map((r) => r.text).join("");
  }
  return v;
}

export async function parseMasterFileBuffer(
  data: ArrayBuffer,
  fileName = ""
): Promise<StagedRowInput[]> {
  // Legacy .xls (Excel 97-2003) — exceljs can't read it directly, so it's
  // converted to an equivalent .xlsx buffer first. See
  // src/lib/xlsToXlsx.ts for why this is safe (SheetJS, patched, kept to
  // the smallest possible surface) and src/lib/quote-import/parseQuoteFile.ts
  // for the same pattern used on the quote-intake path.
  const sourceData = isXlsBuffer(data, fileName) ? await convertXlsToXlsxBuffer(data) : data;

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(sourceData);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const headerRow = sheet.getRow(1);
  const headerCells: (string | null)[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headerCells[colNumber] = cell.value ? String(cell.value) : null;
  });

  // Resolve each spreadsheet column (1-based) to a COLUMNS index. Prefer the
  // reference layout (column N -> COLUMNS[N-1]) whenever that column's
  // header is at least recognizable (matches by text or is one of the two
  // ambiguous "Date" columns in its expected slot); otherwise fall back to
  // pure header-text matching so a reordered sheet still imports.
  const colToIndex: (number | null)[] = [];
  for (let c = 1; c < headerCells.length; c++) {
    const header = headerCells[c];
    if (!header) {
      colToIndex[c] = null;
      continue;
    }
    const key = header.trim().toLowerCase();
    const refIndex = c - 1; // COLUMNS is 0-based, sheet columns are 1-based
    const refCol = COLUMNS[refIndex];
    if (refCol) {
      const refLabels = [refCol.header, ...(refCol.aliases ?? [])].map((l) => l.trim().toLowerCase());
      if (refLabels.includes(key)) {
        colToIndex[c] = refIndex;
        continue;
      }
    }
    colToIndex[c] = key in HEADER_TO_COLUMN ? HEADER_TO_COLUMN[key] : null;
  }

  const staged: StagedRowInput[] = [];

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // header row

    const rawRow: Record<string, unknown> = {};
    const flags: FieldFlag[] = [];
    const coerced: Record<string, unknown> = {};

    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const header = headerCells[colNumber];
      const value = cellValue(cell);
      if (header) {
        // A duplicate header ("Date" x2) would collide in a plain object —
        // suffix repeats so the raw audit trail keeps both.
        const rawKey = header in rawRow ? `${header} (${colNumber})` : header;
        rawRow[rawKey] = value;
      }

      const colIndex = colToIndex[colNumber];
      if (colIndex == null) return;
      const col = COLUMNS[colIndex];
      if (!col.path) return;
      const out = coerceByKind(col.kind, value, col.path, flags);
      if (out !== null && out !== undefined && out !== "") {
        coerced[col.path] = out;
      }
    });

    if (Object.values(rawRow).every((v) => v === null || v === undefined || v === "")) {
      return; // fully blank row — skip rather than staging an empty entry
    }

    if (!coerced.itemNumber) {
      flags.push({ field: "itemNumber", message: "Missing SKU; row cannot be imported without one", rawValue: null });
    }

    staged.push({ rowNumber, raw: rawRow, coerced, flags });
  });

  return staged;
}
