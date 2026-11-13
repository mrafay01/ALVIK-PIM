import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireRole, isAuthFail, ROLE_SETS } from "@/lib/authz";
import { parseSkuListFile } from "@/lib/catalog/masterFileExport";
import { lookupSkus } from "@/lib/catalog/exportData";

export const maxDuration = 60;

// A list of SKUs is small (10,000 SKUs is ~100 KB), so the file comes
// through the server, well under the hosting platform's 4.5 MB body cap.
const MAX_LIST_BYTES = 4 * 1024 * 1024;

// POST (multipart, field "file"): read an uploaded SKU list ("SKUs" in A1,
// one SKU per row below) and report what each SKU was found as, for the
// person to confirm before exporting. Reads only; writes nothing.
export async function POST(req: NextRequest) {
  const gate = await requireRole(ROLE_SETS.catalogExport);
  if (isAuthFail(gate)) return gate.response;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  if (file.size > MAX_LIST_BYTES) {
    return NextResponse.json({ error: "That file is too large for a SKU list (limit 4 MB)." }, { status: 413 });
  }

  const parsed = await parseSkuListFile(await file.arrayBuffer(), file.name);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  await connectDB();
  const results = await lookupSkus(parsed.skus);
  return NextResponse.json({
    fileName: file.name,
    duplicates: parsed.duplicates,
    blanks: parsed.blanks,
    otherColumns: parsed.otherColumns,
    results,
  });
}
