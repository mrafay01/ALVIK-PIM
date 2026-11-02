// Minimal RFC 4180 CSV writer for marketplace export files. Not using a
// library here — the format needed is simple (quote-if-necessary, CRLF
// rows) and every export route already depends on exceljs for the XLSX
// platforms, so a second CSV dependency isn't worth adding for one column
// set (Target).

// Text that Excel would run as a formula when the file is opened
// ("=HYPERLINK(...)", "+cmd", "@SUM", "-2+3"). Prefixed with an apostrophe,
// the standard defence against CSV formula injection. Plain numbers, including
// negative ones like "-5" or "-1.25", are left alone.
const FORMULA_START = /^[=+@\t\r]/;
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

export function neutralizeFormula(str: string): string {
  if (FORMULA_START.test(str)) return `'${str}`;
  if (str.startsWith("-") && !PLAIN_NUMBER.test(str)) return `'${str}`;
  return str;
}

function escapeCsvCell(value: string | number): string {
  const str = typeof value === "number" ? String(value) : neutralizeFormula(String(value));
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsv(headerRow: (string | number)[], dataRows: (string | number)[][]): string {
  const lines = [headerRow, ...dataRows].map((row) => row.map(escapeCsvCell).join(","));
  return lines.join("\r\n") + "\r\n";
}
