import ExcelJS from "exceljs";
import { parseCsv } from "./parseCsv";
import {
  QUOTE_FIELDS,
  QUOTE_HEADER_TO_KEY,
  QUOTE_FIELD_BY_KEY,
  IMAGE_PLACEHOLDER_NOTE,
  type QuoteFieldKind,
} from "./fields";

// Parses a vendor quote file (.xlsx or .csv) into staged rows, treating
// every cell as untrusted text and coercing with the same discipline as the
// legacy Master File import (src/lib/import/parseMasterFile.ts): coerce by
// the field's declared kind, flag anything that fails instead of guessing
// or silently dropping it, and keep the raw value so a reviewer can see and
// fix it.
//
// exceljs (not SheetJS/`xlsx`) for reading, matching the project's stack
// decision in PROJECT-REPORT.md §2 — SheetJS on npm carries unpatched
// prototype-pollution and ReDoS CVEs, an unacceptable risk for a handler
// that parses untrusted uploads. exceljs cannot read legacy .xls (Excel
// 97-2003), so those are rejected with a clear "save as .xlsx first"
// message rather than pulling in the vulnerable reader.
export class QuoteParseError extends Error {}

export type FieldFlag = {
  field: string;
  message: string;
  rawValue: unknown;
};

export type StagedQuoteRow = {
  rowNumber: number;
  raw: Record<string, unknown>;
  coerced: Record<string, unknown>;
  flags: FieldFlag[];
};

const N_A_TOKENS = new Set(["/", "n/a", "na", "-", "--", "", "tbd", "n.a."]);

function isPlaceholder(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && N_A_TOKENS.has(value.trim().toLowerCase())) return true;
  return false;
}

function coerceText(raw: unknown): string | null {
  if (isPlaceholder(raw)) return null;
  return String(raw).trim();
}

// Money cells in real vendor sheets carry a currency prefix/suffix:
// "$7.20", "US$86.42", "USD 12", "7.20 USD", "€5", "1,234.50". Strip any
// leading/trailing currency marker and thousands separators, then parse.
function coerceNumber(raw: unknown, field: string, flags: FieldFlag[]): number | null {
  if (isPlaceholder(raw)) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string") {
    const cleaned = raw
      .replace(/(?:US\$|USD|RMB|CNY|EUR|GBP|[$€£¥])/gi, "")
      .replace(/[,\s]/g, "")
      .replace(/USD$/i, "");
    const n = Number(cleaned);
    if (cleaned !== "" && !Number.isNaN(n)) return n;
  }
  flags.push({ field, message: `Non-numeric value "${String(raw)}"`, rawValue: raw });
  return null;
}

// Weight cells are often "12.3g" / "12.3 gram" / "12.3 gms".
function coerceWeight(raw: unknown, field: string, flags: FieldFlag[]): number | null {
  if (isPlaceholder(raw)) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string") {
    const cleaned = raw.replace(/(grams?|gms?|g)\b/gi, "").replace(/[,\s]/g, "");
    const n = Number(cleaned);
    if (!Number.isNaN(n)) return n;
  }
  flags.push({ field, message: `Could not read a weight from "${String(raw)}"`, rawValue: raw });
  return null;
}

// Guard against a well-formed but impossible date like 13/25/2026 or
// 2026-02-30 — new Date() would roll it over silently.
function isRealYmd(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2999) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function coerceDate(raw: unknown, field: string, flags: FieldFlag[]): string | null {
  if (isPlaceholder(raw)) return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10);
  }
  if (typeof raw === "number") {
    // Excel serial date (days since 1899-12-30), when a CSV carries a raw serial.
    const ms = Math.round((raw - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    const isoLike = /^(\d{4})-(\d{2})-(\d{2})$/;
    const usLike = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/;
    const iso = trimmed.match(isoLike);
    if (iso) {
      if (isRealYmd(+iso[1], +iso[2], +iso[3])) return trimmed;
    } else {
      const m = trimmed.match(usLike);
      if (m) {
        const mm = +m[1];
        const dd = +m[2];
        const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
        if (isRealYmd(year, mm, dd)) {
          return `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
        }
      } else {
        const parsed = new Date(trimmed);
        if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
      }
    }
  }
  flags.push({ field, message: `Could not parse date "${String(raw)}" — needs manual entry`, rawValue: raw });
  return null;
}

function coerceByKind(
  kind: QuoteFieldKind,
  raw: unknown,
  fieldKey: string,
  flags: FieldFlag[]
): unknown {
  switch (kind) {
    case "text":
      return coerceText(raw);
    case "number":
      return coerceNumber(raw, fieldKey, flags);
    case "money":
      return coerceNumber(raw, fieldKey, flags);
    case "weight":
      return coerceWeight(raw, fieldKey, flags);
    case "date":
      return coerceDate(raw, fieldKey, flags);
    case "image":
      // Never trusted from the file — directory-select + SharePoint upload
      // is a later feature. Drop a fixed note so the reviewer knows.
      return IMAGE_PLACEHOLDER_NOTE;
  }
}

function normalizeHeader(header: string): string | null {
  return QUOTE_HEADER_TO_KEY[header.trim().toLowerCase()] ?? null;
}

// Key under which a row's unmapped columns are stashed on `coerced` — the
// vendor's exact header -> plain-text value, never coerced. The commit step
// writes these to Item.customFields; the review editor renders them as an
// editable block.
export const CUSTOM_KEY = "__custom";

// Headers that look like a spreadsheet artifact rather than a real column
// (blank, unnamed export placeholders) — don't carry these as custom fields.
function isNoiseHeader(header: string): boolean {
  const h = header.trim().toLowerCase();
  return h === "" || /^(column|unnamed|field|__empty)\d*$/.test(h);
}

// Turn one row's { header -> raw value } map into a staged row.
export function stageRow(
  rowNumber: number,
  rawByHeader: Record<string, unknown>
): StagedQuoteRow {
  const flags: FieldFlag[] = [];
  const byKey: Record<string, unknown> = {};
  const custom: Record<string, string> = {};

  for (const [header, value] of Object.entries(rawByHeader)) {
    const key = normalizeHeader(header);
    if (key) {
      byKey[key] = value;
      continue;
    }
    // Unrecognized column — keep it as a custom field rather than dropping
    // it, since a quote sheet's column set isn't fixed.
    if (isNoiseHeader(header)) continue;
    const text = value === null || value === undefined ? "" : String(value).trim();
    if (text !== "") custom[header.trim()] = text;
  }

  const coerced: Record<string, unknown> = {};
  for (const field of QUOTE_FIELDS) {
    if (!(field.key in byKey) && field.kind !== "image") continue;
    const out = coerceByKind(field.kind, byKey[field.key], field.key, flags);
    if (out !== null && out !== undefined && out !== "") {
      coerced[field.key] = out;
    }
  }
  if (Object.keys(custom).length > 0) coerced[CUSTOM_KEY] = custom;

  // A row needs *some* stable identity to commit. Many vendor quote sheets
  // (23337.xls among them) carry no CZ item number — the CZ number is
  // assigned later — so the vendor's own item number stands in. Only flag
  // when neither is present.
  if (!coerced.itemNumber && !coerced.vendorSku) {
    flags.push({
      field: "itemNumber",
      message: "No CZ item number and no vendor item# — the row needs one of them to be committed",
      rawValue: byKey.itemNumber ?? byKey.vendorSku ?? null,
    });
  }

  return { rowNumber, raw: rawByHeader, coerced, flags };
}

// Some vendor sheets have a blank or title row above the real header
// (the 23337 sheet: row 1 empty, row 2 is "Image / Po number / company
// box# …"). Pick the row, within the first `SCAN_ROWS`, that matches the
// most known column names — that's the header; everything below it is data.
const SCAN_ROWS = 3;

function headerRowScore(cells: unknown[]): number {
  let hits = 0;
  for (const c of cells) {
    if (c === null || c === undefined) continue;
    const key = String(c).trim().toLowerCase();
    if (key && QUOTE_HEADER_TO_KEY[key]) hits++;
  }
  return hits;
}

// Given a matrix of rows (each an array of cell values), find the header
// row and turn every row beneath it into a staged row. Shared by the
// spreadsheet and CSV paths. `rowOffset` is added to the reported
// rowNumber so it lines up 1-based with the source file.
function stageMatrix(matrix: unknown[][], rowOffset = 1): StagedQuoteRow[] {
  if (matrix.length === 0) return [];

  let headerIdx = 0;
  let bestScore = -1;
  for (let i = 0; i < Math.min(SCAN_ROWS, matrix.length); i++) {
    const score = headerRowScore(matrix[i]);
    if (score > bestScore) {
      bestScore = score;
      headerIdx = i;
    }
  }
  if (bestScore <= 0) return []; // no recognizable header in the first rows

  const headers = matrix[headerIdx].map((h) =>
    h === null || h === undefined ? "" : String(h).trim()
  );

  const staged: StagedQuoteRow[] = [];
  for (let r = headerIdx + 1; r < matrix.length; r++) {
    const cells = matrix[r];
    if (cells.every((v) => v === null || v === undefined || String(v).trim() === "")) continue;
    const rawRow: Record<string, unknown> = {};
    headers.forEach((header, idx) => {
      if (header) rawRow[header] = cells[idx] ?? "";
    });
    staged.push(stageRow(r + rowOffset, rawRow));
  }
  return staged;
}

function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("result" in v) return String((v as { result: unknown }).result ?? "");
    if ("richText" in v) return (v as { richText: { text: string }[] }).richText.map((r) => r.text).join("");
    if ("text" in v) return String((v as { text: unknown }).text ?? "");
    return "";
  }
  return String(v);
}

// .xlsx only (see the module header for why not .xls). Flattens the first
// worksheet to a row/column matrix, then shares stageMatrix with the CSV
// path so header-row detection and coercion behave identically.
async function parseXlsx(data: ArrayBuffer): Promise<StagedQuoteRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);
  const sheet = wb.worksheets[0];
  if (!sheet) return [];

  const matrix: unknown[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const cells: unknown[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cells[col - 1] = cellText(cell);
    });
    matrix.push(cells);
  });
  return stageMatrix(matrix, 1);
}

function parseCsvBuffer(data: ArrayBuffer): StagedQuoteRow[] {
  const text = new TextDecoder("utf-8").decode(data);
  const rows = parseCsv(text);
  return stageMatrix(rows, 1);
}

export async function parseQuoteFileBuffer(
  data: ArrayBuffer,
  fileName: string
): Promise<StagedQuoteRow[]> {
  const lower = fileName.toLowerCase();
  const head = new Uint8Array(data.slice(0, 8));
  const isZip = head[0] === 0x50 && head[1] === 0x4b; // .xlsx (ZIP)
  const isOle2 = head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0; // legacy .xls

  if (isOle2 || lower.endsWith(".xls")) {
    throw new QuoteParseError(
      "This looks like a legacy .xls file (Excel 97–2003). Open it in Excel and use " +
        "“Save As” to save a .xlsx or .csv copy, then upload that."
    );
  }
  if (lower.endsWith(".csv")) return parseCsvBuffer(data);
  if (lower.endsWith(".xlsx") || isZip) return parseXlsx(data);
  return parseCsvBuffer(data);
}

// Build coerced values + flags from a manually-entered row (the "new quote"
// page). The person typed each field, so it's already the right shape — but
// run it through the same coercion so numbers/dates land as the correct
// types and an unparseable entry is flagged rather than stored as text.
//
// `values` keys are QUOTE_FIELDS keys for the fixed fields; `customValues`
// keys are the quote-level custom column labels the person defined. Both go
// in as { header -> raw text } so stageRow handles them the same way it
// handles a file's columns.
export function stageManualRow(
  rowNumber: number,
  values: Record<string, string>,
  customValues: Record<string, string> = {}
): StagedQuoteRow {
  const rawByHeader: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(values)) {
    const field = QUOTE_FIELD_BY_KEY[key];
    if (!field) continue;
    rawByHeader[field.label] = val;
  }
  for (const [label, val] of Object.entries(customValues)) {
    const name = label.trim();
    if (name && !QUOTE_HEADER_TO_KEY[name.toLowerCase()]) rawByHeader[name] = val;
  }
  return stageRow(rowNumber, rawByHeader);
}
