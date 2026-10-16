// Converts a legacy .xls (Excel 97-2003, OLE2/BIFF binary format) buffer
// into an equivalent .xlsx buffer in memory. This is the ONLY file in the
// project that imports SheetJS — every parser downstream (parseMasterFile,
// parseQuoteFile) keeps reading exclusively through exceljs, unchanged.
//
// Why this exists: exceljs cannot read .xls at all, and the project
// deliberately avoided SheetJS for years because the version published to
// npm (0.18.5, unmaintained since 2022) carries two disclosed high-severity
// CVEs — prototype pollution (GHSA-4r6h-8v6p-xvw6 / CVE-2023-30533, fixed
// upstream in 0.19.3) and a ReDoS (CVE-2024-22363, fixed in 0.20.2). SheetJS
// stopped publishing patched releases to npm after 0.18.5 and moved
// distribution to their own CDN (cdn.sheetjs.com) instead. This project
// installs 0.20.3 from that CDN directly — past both fix versions — pinned
// in package-lock.json by exact URL + SHA-512 integrity hash, so `npm ci`
// refuses to install anything except those exact bytes. `npm audit` can't
// check a non-registry install against its advisory database, which is why
// this file (not just the install) is the actual justification: keep
// SheetJS's surface to the smallest possible thing — read bytes in, hand
// ordinary JS values out — never pass its output anywhere but the
// convert-to-xlsx path below, never call anything except read/write.
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";

export function isXlsBuffer(data: ArrayBuffer, fileName: string): boolean {
  const head = new Uint8Array(data.slice(0, 4));
  const isOle2 = head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0;
  return isOle2 || fileName.toLowerCase().endsWith(".xls");
}

// Reads with SheetJS only far enough to get plain cell values (numbers,
// strings, Dates, booleans, nulls) per sheet, then writes a fresh workbook
// with exceljs from that plain data — so the bytes exceljs ends up parsing
// are exceljs's own output, not anything SheetJS wrote to disk or a format
// exceljs has to trust structurally.
//
// Every worksheet is carried over, not just the first. Real vendor .xls
// files commonly have multiple sheets (item table + PI + packing list +
// shipping manifest, each on its own tab, e.g. 23146.xls); the item
// table isn't always the first one. The sheet-picker in parseQuoteFile
// decides which worksheet to parse — this bridge just preserves them all
// faithfully so that decision has something to work with.
export async function convertXlsToXlsxBuffer(data: ArrayBuffer): Promise<ArrayBuffer> {
  const wb = XLSX.read(new Uint8Array(data), { type: "array", cellDates: true });
  if (wb.SheetNames.length === 0) {
    throw new Error("The .xls file has no worksheets.");
  }

  const outWb = new ExcelJS.Workbook();
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const matrix: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: true,
      defval: null,
    });
    // Excel caps worksheet names at 31 chars and forbids a few chars
    // (`:\/?*[]`); collapse those to underscore so a legacy sheet name
    // can never make the written file invalid. Collision on truncation
    // is handled by exceljs itself (addWorksheet errors on a dup name),
    // which only matters for pathological inputs — ignored for now.
    const safeName = (sheetName || "Sheet").replace(/[:\\/?*[\]]/g, "_").slice(0, 31) || "Sheet";
    const outSheet = outWb.addWorksheet(safeName);
    for (const row of matrix) {
      // Only primitives cross into the exceljs workbook — numbers and Dates
      // stay typed (parseMasterFile/parseQuoteFile's coercers special-case
      // both), booleans and strings pass through as-is, everything else is
      // stringified rather than dropped.
      outSheet.addRow(
        row.map((cell) => {
          if (cell === null || cell === undefined) return null;
          if (typeof cell === "number" || typeof cell === "boolean" || cell instanceof Date) return cell;
          if (typeof cell === "string") return cell;
          return String(cell);
        })
      );
    }
  }

  const buffer = await outWb.xlsx.writeBuffer();
  return buffer instanceof ArrayBuffer ? buffer : new Uint8Array(buffer).buffer;
}
