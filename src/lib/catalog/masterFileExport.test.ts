import ExcelJS from "exceljs";
import { MASTER_FILE_COLUMNS, parseMasterFileBuffer } from "@/lib/import/parseMasterFile";
import { buildUpdate } from "@/lib/import/commitRows";
import {
  buildMasterFileWorkbook,
  recordFromItem,
  recordFromStagedRow,
  parseSkuListFile,
  flaggedCellText,
  FLAGGED_HEADER,
  type MasterFileRecord,
} from "./masterFileExport";

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

// A value of the right kind for every Master File column (both "Date"
// columns get different days so a swap would show).
function sampleValues(): MasterFileRecord {
  const out: MasterFileRecord = {};
  MASTER_FILE_COLUMNS.forEach((col, i) => {
    if (!col.path) return;
    const day = String((i % 27) + 1).padStart(2, "0");
    out[col.path] =
      col.kind === "number" || col.kind === "weight"
        ? i + 0.25
        : col.kind === "date"
          ? `2025-0${(i % 8) + 1}-${day}`
          : col.kind === "bool"
            ? true
            : col.kind === "metal"
              ? "14K GP"
              : `${col.header} value ${i}`;
  });
  out.itemNumber = "A1234-GP";
  out.upc = "012345678905"; // must stay text (leading zero)
  return out;
}

// The item a commit of those values produces (prices in pricingHistory).
function itemFrom(values: MasterFileRecord) {
  const { update, pricingEntry } = buildUpdate(values);
  return { ...update, itemNumber: values.itemNumber, pricingHistory: [pricingEntry] } as Record<string, unknown>;
}

async function roundTrip(values: MasterFileRecord, flaggedColumn = false) {
  const buf = await buildMasterFileWorkbook([{ values, flaggedIssues: null }], { flaggedColumn });
  const rows = await parseMasterFileBuffer(toArrayBuffer(buf), "export.xlsx");
  return { rows, buf };
}

describe("catalog export in the Master File layout", () => {
  it("writes the Master File's headers in order, then Flagged", async () => {
    const buf = await buildMasterFileWorkbook([], { flaggedColumn: true });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(toArrayBuffer(buf));
    const header = (wb.worksheets[0].getRow(1).values as unknown[]).slice(1);
    expect(header).toEqual([...MASTER_FILE_COLUMNS.map((c) => c.header), FLAGGED_HEADER]);
  });

  it("round-trips every column of a committed item through the importer", async () => {
    const values = sampleValues();
    const record = recordFromItem(itemFrom(values));
    const { rows } = await roundTrip(record, true);
    expect(rows).toHaveLength(1);
    expect(rows[0].flags).toEqual([]);
    for (const col of MASTER_FILE_COLUMNS) {
      if (!col.path) continue;
      expect([col.header, rows[0].coerced[col.path]]).toEqual([col.header, values[col.path]]);
    }
  });

  it("gives back MSRP and NEW MSRP separately though the item keeps only the current price", () => {
    const item = itemFrom({ itemNumber: "B1", "pricing.msrp": 40, "pricing.newMsrp": 55, "pricing.effectiveDate": "2025-02-03" });
    expect((item.pricingHistory as { msrp: number }[])[0].msrp).toBe(55);
    const rec = recordFromItem(item);
    expect(rec["pricing.msrp"]).toBe(40);
    expect(rec["pricing.newMsrp"]).toBe(55);
    expect(rec["pricing.effectiveDate"]).toBe("2025-02-03");
  });

  it("uses the current price when it was last changed in the app", () => {
    const rec = recordFromItem({
      itemNumber: "C1",
      pricingHistory: [
        { msrp: 10, masterFile: { msrp: 10 } },
        { msrp: 12, ruePrice: 5, effectiveDate: new Date("2026-04-05T15:00:00Z") },
      ],
    });
    expect(rec["pricing.msrp"]).toBe(12);
    expect(rec["pricing.newMsrp"]).toBeUndefined();
    expect(rec["pricing.ruePrice"]).toBe(5);
  });

  it("exports a flagged Master File row with the bad cell as it was", async () => {
    const rec = recordFromStagedRow({
      coerced: { itemNumber: "D1", title: "Ring" },
      flags: [{ field: "pricing.msrp", rawValue: "abc" }],
    });
    const { rows } = await roundTrip(rec);
    expect(rows[0].coerced.title).toBe("Ring");
    expect(rows[0].flags.map((f) => f.field)).toContain("pricing.msrp");
  });

  it("writes the Flagged cell", () => {
    expect(flaggedCellText(null)).toBe("No");
    expect(flaggedCellText([])).toBe("Yes");
    expect(flaggedCellText(["MSRP: Non-numeric value", "Metal: Unrecognized"])).toBe(
      "Yes: MSRP: Non-numeric value; Metal: Unrecognized"
    );
  });
});

describe("commit keeps NEW MSRP as the current price whatever the key order", () => {
  it("prefers NEW MSRP even when MSRP was fixed later", () => {
    const { pricingEntry } = buildUpdate({ "pricing.newMsrp": 70, title: "x", "pricing.msrp": 60 });
    expect(pricingEntry.msrp).toBe(70);
    expect(pricingEntry.masterFile).toEqual({ msrp: 60, newMsrp: 70 });
  });
});

describe("parseSkuListFile", () => {
  async function xlsx(rows: unknown[][]): Promise<ArrayBuffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("S");
    for (const r of rows) ws.addRow(r);
    return toArrayBuffer(Buffer.from(await wb.xlsx.writeBuffer()));
  }

  it("reads SKUs under the heading, dropping repeats and blanks", async () => {
    const r = await parseSkuListFile(await xlsx([["SKUs"], ["A1"], [12345], ["a1"], [null, "x"], ["B2 "]]), "list.xlsx");
    expect(r).toEqual({ ok: true, skus: ["A1", "12345", "B2"], duplicates: 1, blanks: 1, otherColumns: true });
  });

  it("requires the SKUs heading in A1", async () => {
    const r = await parseSkuListFile(await xlsx([["A1"], ["A2"]]), "list.xlsx");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/"SKUs"/);
  });

  it("reads a CSV list", async () => {
    const r = await parseSkuListFile(new TextEncoder().encode("﻿skus\r\nR1-GP-6\r\n\r\nR2\r\n").buffer as ArrayBuffer, "l.csv");
    expect(r).toMatchObject({ ok: true, skus: ["R1-GP-6", "R2"] });
  });
});
