import ExcelJS from "exceljs";

// Writes an .xlsx buffer for a platform that ships a two-row header
// (display label + machine-readable key), matching Macy's real template.
export async function buildTwoHeaderRowXlsx(
  columns: { display: string; key: string }[],
  dataRows: Record<string, string | number>[]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");

  sheet.addRow(columns.map((c) => c.display));
  sheet.addRow(columns.map((c) => c.key));
  for (const row of dataRows) {
    sheet.addRow(columns.map((c) => row[c.key] ?? ""));
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

// Writes an .xlsx buffer for a platform that ships a single header row of
// column names (no machine-key row) — matching Belk's real template.
export async function buildSingleHeaderRowXlsx(
  columns: string[],
  dataRows: Record<string, string | number>[]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");

  sheet.addRow(columns);
  for (const row of dataRows) {
    sheet.addRow(columns.map((c) => row[c] ?? ""));
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
