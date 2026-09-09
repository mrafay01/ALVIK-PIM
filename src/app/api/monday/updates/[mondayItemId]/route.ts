import { NextRequest, NextResponse } from "next/server";
import { requireRole, isAuthFail, ROLE_SETS } from "@/lib/authz";
import { mondayRequest, MondayApiError } from "@/lib/monday/client";

interface UpdatesResult {
  items: {
    updates: {
      id: string;
      text_body: string;
      created_at: string;
      creator: { name: string } | null;
      replies: { id: string; text_body: string; created_at: string; creator: { name: string } | null }[];
    }[];
  }[];
}

// Read-only: fetches the live comment/update thread for a Monday item so a
// PO's detail page can show the vendor/staff conversation without it ever
// being copied into PIM's own database — always current, never stale.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ mondayItemId: string }> }) {
  const gate = await requireRole(ROLE_SETS.purchaseOrders);
  if (isAuthFail(gate)) return gate.response;

  const { mondayItemId } = await params;

  if (!/^\d+$/.test(mondayItemId)) {
    return NextResponse.json({ error: "Invalid item id" }, { status: 400 });
  }
  const query = `
    query ($ids: [ID!]!) {
      items(ids: $ids) {
        updates(limit: 50) {
          id
          text_body
          created_at
          creator { name }
          replies { id text_body created_at creator { name } }
        }
      }
    }
  `;

  try {
    const data = await mondayRequest<UpdatesResult>(query, { ids: [mondayItemId] });
    const updates = data.items[0]?.updates ?? [];
    return NextResponse.json({ updates });
  } catch (err) {
    const message = err instanceof MondayApiError ? err.message : "Failed to load updates from Monday";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
