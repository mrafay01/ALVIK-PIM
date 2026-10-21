import { NextRequest, NextResponse } from "next/server";
import { requireRole, isAuthFail, ROLE_SETS } from "@/lib/authz";
import { mondayRequest, MondayApiError } from "@/lib/monday/client";
import { connectDB } from "@/lib/db";
import PurchaseOrder from "@/models/PurchaseOrder";

interface AssetResult {
  assets: { id: string; name: string; public_url: string | null }[];
}

// Fetch-on-demand link for a vendor PI file that lives on Monday, not in
// PIM. Monday's stored `url` requires a logged-in Monday session, so this
// resolves a fresh short-lived signed S3 link (public_url) on every request
// and redirects to it — nothing is copied or cached in PIM.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ assetId: string }> }) {
  const gate = await requireRole(ROLE_SETS.quotes);
  if (isAuthFail(gate)) return gate.response;

  const { assetId } = await params;

  // assetId is interpolated into a Monday GraphQL query — only ever a
  // numeric asset id. Reject anything else rather than passing arbitrary
  // caller input to the upstream API.
  if (!/^\d+$/.test(assetId)) {
    return NextResponse.json({ error: "Invalid asset id" }, { status: 400 });
  }

  // Only files attached to a PO in this app — the API token can see far
  // more of the Monday account than any one user should be able to open.
  await connectDB();
  if (!(await PurchaseOrder.exists({ "mondayFiles.assetId": assetId }))) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const query = `query ($ids: [ID!]!) { assets(ids: $ids) { id name public_url } }`;

  try {
    const data = await mondayRequest<AssetResult>(query, { ids: [assetId] });
    const asset = data.assets[0];
    if (!asset?.public_url) {
      return NextResponse.json({ error: "File not found or no longer available on Monday" }, { status: 404 });
    }
    return NextResponse.redirect(asset.public_url);
  } catch (err) {
    const message = err instanceof MondayApiError ? err.message : "Failed to resolve file from Monday";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
