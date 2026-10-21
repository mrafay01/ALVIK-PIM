import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";

export async function GET() {
  try {
    await connectDB();
    return NextResponse.json({ ok: true, db: "connected" });
  } catch {
    // Public endpoint: never echo the driver error (it names cluster hosts).
    return NextResponse.json({ ok: false, db: "unavailable" }, { status: 503 });
  }
}
