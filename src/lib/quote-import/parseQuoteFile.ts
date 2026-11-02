import ExcelJS from "exceljs";
import { parseCsv } from "./parseCsv";
import { isXlsBuffer, convertXlsToXlsxBuffer } from "@/lib/xlsToXlsx";
import {
  QUOTE_FIELDS,
  QUOTE_HEADER_TO_KEY,
  QUOTE_FIELD_BY_KEY,
  IMAGE_PLACEHOLDER_NOTE,
  type QuoteFieldKind,
} from "./fields";

// Parses a vendor quote file (.xlsx, legacy .xls, or .csv) into staged
// rows. Every cell is treated as untrusted text and coerced with the same
// discipline as the legacy Master File import (src/lib/import/parseMasterFile.ts):
// coerce by the field's declared kind, flag anything that fails instead
// of guessing or silently dropping it, and keep the raw value so a
// reviewer can see and fix it.
//
// What this file handles that a naive "first sheet, first row" reader
// doesn't — all seen in real vendor files under /public:
//
//   - Multi-sheet workbooks (23146.xls has 4 tabs; the item table is on
//     a sheet named "CZ", not the first worksheet by position)
//   - Preamble blocks (19756.xlsx / 20711.xls: 4+ lines of "Performa
//     Invoice / TO / Material" before the real header row)
//   - Headers not on row 1 — can appear anywhere in the top 15 rows,
//     occasionally with blank separator rows between header and data
//     (23146.xls)
//   - Trailing footer rows that look like notes rather than items
//     (22906.xlsx has an "RMB 13.5 Per gram" row below the real data)
//   - PO number buried in a preamble cell instead of a column header
//     ("CZ's PO: 20711 2025FFCZ052" in 20711.xls)
//
// exceljs is used for .xlsx/.csv parsing. exceljs cannot read .xls at
// all, so a .xls upload is first converted in memory via xlsToXlsx.ts.

export class QuoteParseError extends Error {}

// Thrown when a workbook has more than one plausible item sheet and the
// caller needs to re-submit with an explicit `sheetName` chosen. Carries
// the candidate list so the route can hand it to the UI picker.
export class SheetChoiceNeededError extends Error {
  readonly candidates: SheetCandidate[];
  readonly fileToken?: string;
  constructor(candidates: SheetCandidate[], fileToken?: string) {
    super("Multiple sheets look like they could be the item table.");
    this.name = "SheetChoiceNeededError";
    this.candidates = candidates;
    this.fileToken = fileToken;
  }
}

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

export type SheetCandidate = {
  name: string;
  rowCount: number;
  headerScore: number;
  headerRow: number | null;
  dataRows: number;
  sample: string[]; // first few header cells, for the picker UI
};

export type ParseResult = {
  rows: StagedQuoteRow[];
  // Which sheet the parser actually read. Null for CSV uploads.
  sheetName: string | null;
  // All sheets found in the workbook, with their header-match scores —
  // surfaced on the staged quote so a reviewer can see the parser's
  // choice and spot a mis-pick before committing.
  candidates: SheetCandidate[];
  // PO number pulled from preamble cells above the header row, if any
  // (e.g. "CZ's PO: 20711 2025FFCZ052" -> "20711"). The route uses this
  // as a fallback when the user didn't type a PO number into the form.
  preamblePoNumber: string | null;
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
  flags.push({ field, message: `Could not parse date "${String(raw)}"; needs manual entry`, rawValue: raw });
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
      return IMAGE_PLACEHOLDER_NOTE;
  }
}

function normalizeHeader(header: string): string | null {
  // Vendor headers in the wild carry trailing suffixes like "(mm)" /
  // "(QTY)" / " (g)" / "- Per gram" that make an exact alias lookup
  // miss. Strip trailing parenthesized annotations and collapse
  // whitespace before matching; the lookup table is still exact beyond
  // that so we never mis-map two superficially similar headers.
  const key = header
    .replace(/\s*\([^)]*\)\s*$/u, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (QUOTE_HEADER_TO_KEY[key]) return QUOTE_HEADER_TO_KEY[key];
  // Second pass: alias lookup without the parens stripping, in case the
  // declared alias itself has parens (rare but allowed).
  const literal = header.trim().toLowerCase();
  return QUOTE_HEADER_TO_KEY[literal] ?? null;
}

export const CUSTOM_KEY = "__custom";

function isNoiseHeader(header: string): boolean {
  const h = header.trim().toLowerCase();
  return h === "" || /^(column|unnamed|field|__empty)\d*$/.test(h);
}

// A row counts as "data" (not a header, not a trailing note) when it
// looks like it carries an item: has at least one SKU-ish value in a
// known identity column, OR fills enough known columns to be plausible.
//
// Trailing "Total" footer rows and vendor-template filler rows (one
// placeholder character per cell — openpyxl renders them as "�") are
// rejected: these put identical short tokens into every column, which
// is a pattern no real item row produces.
const FOOTER_FIRST_CELL_TOKENS = new Set([
  "total",
  "totals",
  "grand total",
  "subtotal",
  "sum",
]);

function looksLikeFillerRow(cells: unknown[]): boolean {
  // A filler row has every non-blank cell set to the same short token
  // (often a single glyph like "�" or "-"). Real item rows carry
  // genuinely different values across their columns.
  let firstToken: string | null = null;
  let seen = 0;
  for (const c of cells) {
    if (c === null || c === undefined) continue;
    const s = String(c).trim();
    if (!s) continue;
    seen++;
    if (s.length > 3) return false;
    if (firstToken === null) firstToken = s;
    else if (s !== firstToken) return false;
  }
  return seen >= 3;
}

// Short tokens vendors put in a sub-header row to denote the unit of
// the column above (e.g. row 7 of 20711.xls has just "pcs | USD | USD"
// under the money/qty columns). A row made up entirely of these — with
// no identity column populated — is a sub-header, not a line item.
const UNIT_LABEL_TOKENS = new Set([
  "pcs",
  "pc",
  "piece",
  "pieces",
  "usd",
  "us$",
  "rmb",
  "cny",
  "eur",
  "gbp",
  "g",
  "gram",
  "grams",
  "mm",
  "cm",
  "in",
  "qty",
  "ea",
  "each",
]);

function looksLikeDataRow(
  headerKeys: (string | null)[],
  cells: unknown[]
): boolean {
  if (looksLikeFillerRow(cells)) return false;
  // Vendor "Total" footer row: first non-blank cell is a totals label.
  const firstNonBlank = cells.find((c) => c !== null && c !== undefined && String(c).trim() !== "");
  if (
    typeof firstNonBlank === "string" &&
    FOOTER_FIRST_CELL_TOKENS.has(firstNonBlank.trim().toLowerCase())
  ) {
    return false;
  }

  // Repeat-header row: some vendor templates put the same labels on two
  // consecutive rows (header on row 6, unit sub-row on row 7 that reads
  // "LABOR COST PER GRAM / pcs / USD / USD / ..."). A row where more
  // than half of its known-column cells match that column's own header
  // text, or a known header anywhere else in the file, is treated as
  // another header line rather than data.
  let fillCount = 0;
  let hasIdentity = false;
  let headerishCount = 0;
  let unitTokenCount = 0;
  for (let i = 0; i < headerKeys.length; i++) {
    const key = headerKeys[i];
    if (!key) continue;
    const v = cells[i];
    if (v === null || v === undefined || String(v).trim() === "") continue;
    fillCount++;
    if (key === "itemNumber" || key === "vendorSku") hasIdentity = true;
    const s = String(v).trim().toLowerCase();
    if (normalizeHeader(String(v))) headerishCount++;
    if (UNIT_LABEL_TOKENS.has(s)) unitTokenCount++;
  }
  if (fillCount > 0 && headerishCount / fillCount >= 0.5) return false;
  // Unit sub-header row: no identity, and every populated known column
  // is a unit label like "pcs"/"USD".
  if (!hasIdentity && fillCount > 0 && unitTokenCount === fillCount) return false;
  return hasIdentity || fillCount >= 3;
}

// A reviewer's correction to one standard field, put through the same rules
// as the file import, so a fix only clears the flag when the value is valid
// ("abc" in a price field stays flagged instead of failing at commit).
// Returns null for a key that isn't a standard quote field.
export function coerceQuoteValue(key: string, raw: unknown): { value: unknown; flags: FieldFlag[] } | null {
  const field = QUOTE_FIELDS.find((f) => f.key === key);
  if (!field || field.kind === "image") return null;
  if (raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "")) {
    return { value: null, flags: [] };
  }
  const flags: FieldFlag[] = [];
  const out = coerceByKind(field.kind, raw, field.key, flags);
  return { value: out === "" ? null : (out ?? null), flags };
}

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

  if (!coerced.itemNumber && !coerced.vendorSku) {
    flags.push({
      field: "itemNumber",
      message: "No CZ item number and no vendor item#; the row needs one of them to be committed",
      rawValue: byKey.itemNumber ?? byKey.vendorSku ?? null,
    });
  }

  return { rowNumber, raw: rawByHeader, coerced, flags };
}

// How far down to look for the header row — real vendor files have been
// seen with up to 5 lines of "Performa Invoice / TO: … / Material: …"
// preamble before the real column headers (19756.xlsx, 20711.xls). 15
// is comfortably past that without inviting a false positive from a
// repeated label halfway through the data.
const SCAN_ROWS = 15;

// A sheet needs at least this many known headers in a candidate row to
// be considered an item table at all. Anything less and the sheet is
// treated as a non-item sheet (PI document, packing list, cover page,
// etc. — e.g. 23146.xls's PI-HT / SHI / PL sheets score 0 here).
const MIN_HEADER_SCORE = 3;

function headerRowScore(cells: unknown[]): number {
  let hits = 0;
  for (const c of cells) {
    if (c === null || c === undefined) continue;
    const str = String(c).trim();
    if (!str) continue;
    if (normalizeHeader(str)) hits++;
  }
  return hits;
}

// Pick the row (within the first SCAN_ROWS of a matrix) with the highest
// known-header score — that's the real header. Returns `null` if nothing
// scores above the floor, meaning this sheet probably isn't an item
// table (packing list, cover page, etc).
function findHeaderRow(matrix: unknown[][]): { index: number; score: number } | null {
  let bestIdx = -1;
  let bestScore = -1;
  for (let i = 0; i < Math.min(SCAN_ROWS, matrix.length); i++) {
    const s = headerRowScore(matrix[i]);
    if (s > bestScore) {
      bestScore = s;
      bestIdx = i;
    }
  }
  if (bestScore < MIN_HEADER_SCORE) return null;
  return { index: bestIdx, score: bestScore };
}

// Harvest preamble cells (rows above the header) for a PO number. Real
// vendor files have been seen with "CZ's PO: 20711 2025FFCZ052" sitting
// in a merged cell on row 2, nowhere near a labeled column. If one
// matches, pull the first 4-6 digit run — that's the CZ PO number.
function extractPreamblePoNumber(matrix: unknown[][], headerRow: number): string | null {
  const re = /CZ'?s?\s*PO:?\s*#?(\d{4,6})/i;
  for (let r = 0; r < headerRow; r++) {
    for (const cell of matrix[r] ?? []) {
      if (cell === null || cell === undefined) continue;
      const s = String(cell);
      const m = s.match(re);
      if (m) return m[1];
    }
  }
  return null;
}

// Turn one matrix (one sheet or a parsed CSV) into staged rows, given
// its known header row. Blank rows between header and data are skipped;
// trailing rows that don't look like real items (footer notes) are
// skipped rather than being flagged as broken.
function stageAfterHeader(
  matrix: unknown[][],
  headerIdx: number,
  rowOffset: number
): StagedQuoteRow[] {
  const headers = matrix[headerIdx].map((h) =>
    h === null || h === undefined ? "" : String(h).trim()
  );
  const headerKeys = headers.map((h) => (h ? normalizeHeader(h) : null));

  const staged: StagedQuoteRow[] = [];
  for (let r = headerIdx + 1; r < matrix.length; r++) {
    const cells = matrix[r];
    if (cells.every((v) => v === null || v === undefined || String(v).trim() === "")) continue;
    if (!looksLikeDataRow(headerKeys, cells)) continue;
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

function sheetToMatrix(sheet: ExcelJS.Worksheet): unknown[][] {
  const matrix: unknown[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const cells: unknown[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cells[col - 1] = cellText(cell);
    });
    matrix.push(cells);
  });
  return matrix;
}

// Produce a SheetCandidate for every worksheet, so the picker UI can
// show the user all tabs and their match scores. A sheet whose score
// is below MIN_HEADER_SCORE is still listed (so the user sees we
// looked), but is not auto-pickable.
function scoreSheets(wb: ExcelJS.Workbook): SheetCandidate[] {
  return wb.worksheets.map((sheet) => {
    const matrix = sheetToMatrix(sheet);
    const header = findHeaderRow(matrix);
    const sample =
      header && matrix[header.index]
        ? matrix[header.index]
            .slice(0, 6)
            .map((v) => (v == null ? "" : String(v).trim().slice(0, 40)))
            .filter(Boolean)
        : [];
    const dataRows = header ? Math.max(0, matrix.length - header.index - 1) : 0;
    return {
      name: sheet.name,
      rowCount: matrix.length,
      headerScore: header?.score ?? 0,
      headerRow: header?.index ?? null,
      dataRows,
      sample,
    };
  });
}

export type ParseOptions = {
  // Explicit sheet choice from the UI picker. When omitted and the
  // workbook has more than one plausible item sheet, the parser throws
  // SheetChoiceNeededError so the route can prompt.
  sheetName?: string;
};

async function parseXlsx(data: ArrayBuffer, opts: ParseOptions): Promise<ParseResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);
  const candidates = scoreSheets(wb);

  const parseable = candidates.filter((c) => c.headerRow !== null);
  if (parseable.length === 0) {
    throw new QuoteParseError(
      "No sheet in this file has a recognizable item-table header. " +
        "Check the file in Excel and confirm the column names match the quote template (CZ Collections Item no#, Vendor item#, etc.)."
    );
  }

  // Pick the sheet to parse:
  //   1. explicit sheetName from the picker, if provided
  //   2. otherwise: if exactly one sheet is parseable, use it
  //   3. otherwise: throw SheetChoiceNeededError and let the UI pick
  let chosen: SheetCandidate;
  if (opts.sheetName) {
    const match = candidates.find((c) => c.name === opts.sheetName);
    if (!match || match.headerRow === null) {
      throw new QuoteParseError(
        `Sheet "${opts.sheetName}" doesn't have a recognizable item-table header.`
      );
    }
    chosen = match;
  } else if (parseable.length === 1) {
    chosen = parseable[0];
  } else {
    throw new SheetChoiceNeededError(parseable);
  }

  const sheet = wb.getWorksheet(chosen.name);
  if (!sheet) throw new QuoteParseError(`Sheet "${chosen.name}" vanished mid-parse.`);
  const matrix = sheetToMatrix(sheet);
  const headerIdx = chosen.headerRow ?? 0;
  const rows = stageAfterHeader(matrix, headerIdx, 1);
  const preamblePoNumber = extractPreamblePoNumber(matrix, headerIdx);
  return { rows, sheetName: chosen.name, candidates, preamblePoNumber };
}

function parseCsvBuffer(data: ArrayBuffer): ParseResult {
  const text = new TextDecoder("utf-8").decode(data);
  const matrix = parseCsv(text);
  const header = findHeaderRow(matrix);
  if (!header) {
    throw new QuoteParseError(
      "No recognizable item-table header in this CSV. Check that the column names match the quote template."
    );
  }
  return {
    rows: stageAfterHeader(matrix, header.index, 1),
    sheetName: null,
    candidates: [
      {
        name: "(csv)",
        rowCount: matrix.length,
        headerScore: header.score,
        headerRow: header.index,
        dataRows: matrix.length - header.index - 1,
        sample: matrix[header.index]
          .slice(0, 6)
          .map((v) => (v == null ? "" : String(v).trim().slice(0, 40)))
          .filter(Boolean),
      },
    ],
    preamblePoNumber: extractPreamblePoNumber(matrix, header.index),
  };
}

export async function parseQuoteFileBuffer(
  data: ArrayBuffer,
  fileName: string,
  opts: ParseOptions = {}
): Promise<ParseResult> {
  const lower = fileName.toLowerCase();
  const head = new Uint8Array(data.slice(0, 8));
  const isZip = head[0] === 0x50 && head[1] === 0x4b;

  if (isXlsBuffer(data, fileName)) {
    let xlsxData: ArrayBuffer;
    try {
      xlsxData = await convertXlsToXlsxBuffer(data);
    } catch {
      throw new QuoteParseError(
        "Couldn't read this .xls file; it may be corrupted or password-protected. " +
          "Open it in Excel and use “Save As” to save a .xlsx or .csv copy, then upload that."
      );
    }
    return parseXlsx(xlsxData, opts);
  }
  if (lower.endsWith(".csv")) return parseCsvBuffer(data);
  if (lower.endsWith(".xlsx") || isZip) return parseXlsx(data, opts);
  return parseCsvBuffer(data);
}

// Lightweight inspection — returns workbook structure WITHOUT parsing
// every row. Used by the route's two-step upload flow: first POST
// introspects; if multiple sheets are candidates, the UI asks the user
// to pick; the user's choice is sent back and the full parse runs. For
// a CSV or a single-sheet workbook, the route can skip straight to the
// full parse since there's no choice to make.
export async function inspectQuoteFile(
  data: ArrayBuffer,
  fileName: string
): Promise<{ candidates: SheetCandidate[]; preamblePoNumber: string | null; isCsv: boolean }> {
  const lower = fileName.toLowerCase();
  const head = new Uint8Array(data.slice(0, 8));
  const isZip = head[0] === 0x50 && head[1] === 0x4b;

  if (lower.endsWith(".csv") && !isXlsBuffer(data, fileName) && !isZip) {
    const text = new TextDecoder("utf-8").decode(data);
    const matrix = parseCsv(text);
    const header = findHeaderRow(matrix);
    return {
      candidates: header
        ? [
            {
              name: "(csv)",
              rowCount: matrix.length,
              headerScore: header.score,
              headerRow: header.index,
              dataRows: matrix.length - header.index - 1,
              sample: [],
            },
          ]
        : [],
      preamblePoNumber: header ? extractPreamblePoNumber(matrix, header.index) : null,
      isCsv: true,
    };
  }

  const buffer = isXlsBuffer(data, fileName) ? await convertXlsToXlsxBuffer(data) : data;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const candidates = scoreSheets(wb);
  // Preamble PO is taken from the best sheet's own preamble — that's
  // where it realistically lives (same sheet as the item table).
  const best = candidates
    .filter((c) => c.headerRow !== null)
    .sort((a, b) => b.headerScore - a.headerScore)[0];
  let preamblePoNumber: string | null = null;
  if (best) {
    const sheet = wb.getWorksheet(best.name);
    if (sheet) {
      const matrix = sheetToMatrix(sheet);
      preamblePoNumber = extractPreamblePoNumber(matrix, best.headerRow ?? 0);
    }
  }
  return { candidates, preamblePoNumber, isCsv: false };
}

// Build coerced values + flags from a manually-entered row (the "new quote"
// page). The person typed each field, so it's already the right shape — but
// run it through the same coercion so numbers/dates land as the correct
// types and an unparseable entry is flagged rather than stored as text.
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
