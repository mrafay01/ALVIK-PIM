import ImportBatchRow from "@/models/ImportBatchRow";
import { fixRowField } from "@/lib/import/commitRows";

// ".925 Sterling Silver" (how the real Master File writes sterling silver,
// on ~10,000 rows) became an accepted metal on 2026-11-04, with
// "sterling silver 925" stored the same way. Rows imported
// before that still carry an "Unrecognized metal" flag; this re-checks the
// metal of every waiting Master File row with the importer's current rule
// (fixRowField, the same check a fix on Flagged Items uses), so the flag
// clears only where the value is now valid. Other metal issues (typos like
// "Beass") stay flagged. Rows left with no issues show as fixed on Flagged
// Items, ready to commit.
export const name = "2026-11-04-recheck-metal-flags";
export const note = "Import rows: re-check metal flags now that .925 Sterling Silver is accepted";

type Row = {
  _id: unknown;
  coerced?: Record<string, unknown>;
  flags?: { field: string; message: string; rawValue?: unknown }[];
};

export async function up(): Promise<void> {
  const rows = (await ImportBatchRow.find({ committedItemId: null, "flags.field": "specs.metal" })
    .select("coerced flags")
    .lean()) as unknown as Row[];

  const ops = [];
  for (const row of rows) {
    const raw = row.flags?.find((f) => f.field === "specs.metal")?.rawValue;
    const fixed = fixRowField(row, "specs.metal", raw);
    if (fixed.flags.some((f) => f.field === "specs.metal")) continue; // still not a known metal
    ops.push({ updateOne: { filter: { _id: row._id }, update: { $set: { coerced: fixed.coerced, flags: fixed.flags } } } });
  }

  let cleared = 0;
  for (let i = 0; i < ops.length; i += 500) {
    const r = await ImportBatchRow.bulkWrite(ops.slice(i, i + 500) as never, { ordered: false });
    cleared += r.modifiedCount;
  }
  console.log(`  re-checked ${rows.length} row(s) with a metal issue; cleared ${cleared}, ${rows.length - ops.length} still flagged`);
}
