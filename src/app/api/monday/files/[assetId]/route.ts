import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { mondayRequest, MondayApiError } from "@/lib/monday/client";

interface AssetResult {
  assets: { id: string; name: string; public_url: string | null }[];
}

// Fetch-on-demand link for a vendor PI file that lives on Monday, not in
// PIM. Monday's stored `url` requires a logged-in Monday session, so this
// resolves a fresh short-lived signed S3 link (public_url) on every request
// and redirects to it — nothing is copied or cached in PIM.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ assetId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { assetId } = await params;
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
