// Minimal RFC 4180 CSV writer for marketplace export files. Not using a
// library here — the format needed is simple (quote-if-necessary, CRLF
// rows) and every export route already depends on exceljs for the XLSX
// platforms, so a second CSV dependency isn't worth adding for one column
// set (Target).

function escapeCsvCell(value: string | number): string {
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsv(headerRow: (string | number)[], dataRows: (string | number)[][]): string {
  const lines = [headerRow, ...dataRows].map((row) => row.map(escapeCsvCell).join(","));
  return lines.join("\r\n") + "\r\n";
}
