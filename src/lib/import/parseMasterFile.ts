import ExcelJS from "exceljs";

// Coercion + validation rules for the Master File import, per the blueprint's
// Data-quality note: treat every legacy cell as untrusted text, coerce with
// a mapping table, and flag anything that fails rather than guessing or
// dropping it silently.

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
    message: `Unrecognized metal value "${str}" — not in the known mapping table`,
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
      message: `Could not parse date "${trimmed}" — needs manual entry`,
      rawValue: raw,
    });
    return null;
  }

  flags.push({ field, message: "Unexpected date cell type", rawValue: raw });
  return null;
}

function coerceNumber(raw: unknown, field: string, flags: FieldFlag[]): number | null {
  if (isPlaceholder(raw)) return null;
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") {
    const cleaned = raw.replace(/[$,\s]/g, "");
    const n = Number(cleaned);
    if (!Number.isNaN(n)) return n;
  }
  flags.push({ field, message: `Non-numeric value "${String(raw)}"`, rawValue: raw });
  return null;
}

function coerceText(raw: unknown): string | null {
  if (isPlaceholder(raw)) return null;
  return String(raw).trim();
}

// Column header aliases seen across sheet exports — headers aren't always
// spelled/capitalized consistently, and some sheets carry stray non-English
// header cells left over from AutoFilter that we skip entirely.
const HEADER_ALIASES: Record<string, string> = {
  sku: "sku",
  itemnumber: "sku",
  plating: "plating",
  metal: "metal",
  pearl: "pearl",
  "all measure": "allMeasure",
  clasp: "clasp",
  length: "length",
  thickness: "thickness",
  brand: "brand",
  category: "category",
  catogry: "category", // real typo seen in the source sheet
  gender: "gender",
  tcw: "tcw",
  birthstone: "birthstone",
  date: "date",
  msrp: "msrp",
  "new msrp": "newMsrp",
  "rue price": "ruePrice",
  upc: "upc",
  discontinued: "discontinued",
  "discontin ": "discontinued",
};

function normalizeHeader(header: string): string | null {
  const key = header.trim().toLowerCase();
  return HEADER_ALIASES[key] ?? null;
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

export async function parseMasterFileBuffer(data: ArrayBuffer): Promise<StagedRowInput[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const headerRow = sheet.getRow(1);
  const headers: (string | null)[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber] = cell.value ? String(cell.value) : null;
  });

  const staged: StagedRowInput[] = [];

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // header row

    const rawRow: Record<string, unknown> = {};
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const header = headers[colNumber];
      if (header) rawRow[header] = cellValue(cell);
    });

    if (Object.values(rawRow).every((v) => v === null || v === undefined || v === "")) {
      return; // fully blank row — skip rather than staging an empty entry
    }

    const flags: FieldFlag[] = [];
    const normalized: Record<string, unknown> = {};

    for (const [header, value] of Object.entries(rawRow)) {
      const key = normalizeHeader(header);
      if (!key) continue; // stray/unrecognized header cell — ignored, not silently mapped
      normalized[key] = value;
    }

    const coerced: Record<string, unknown> = {
      itemNumber: coerceText(normalized.sku),
      "specs.metal": coerceMetal(normalized.metal, flags),
      "specs.plating": coerceText(normalized.plating),
      "specs.pearl": coerceText(normalized.pearl),
      "specs.allMeasure": coerceText(normalized.allMeasure),
      "specs.clasp": coerceText(normalized.clasp),
      "specs.chainLength": coerceText(normalized.length),
      "specs.thickness": coerceText(normalized.thickness),
      brand: coerceText(normalized.brand),
      category: coerceText(normalized.category),
      "specs.gender": coerceText(normalized.gender),
      "specs.tcw": coerceText(normalized.tcw),
      "specs.birthstone": coerceText(normalized.birthstone),
      "pricing.effectiveDate": coerceDate(normalized.date, "pricing.effectiveDate", flags),
      "pricing.msrp": coerceNumber(normalized.msrp, "pricing.msrp", flags),
      "pricing.newMsrp": coerceNumber(normalized.newMsrp, "pricing.newMsrp", flags),
      "pricing.ruePrice": coerceNumber(normalized.ruePrice, "pricing.ruePrice", flags),
      upc: coerceText(normalized.upc),
      discontinued: !isPlaceholder(normalized.discontinued),
    };

    if (!coerced.itemNumber) {
      flags.push({ field: "itemNumber", message: "Missing SKU — row cannot be imported without one", rawValue: normalized.sku });
    }

    staged.push({
      rowNumber, // exceljs row numbers are already 1-based and match the spreadsheet
      raw: rawRow,
      coerced,
      flags,
    });
  });

  return staged;
}
