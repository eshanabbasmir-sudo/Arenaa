// GET /api/resources/summary — compact pool summary (for dashboard cards)
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getPoolSnapshot } from "@/lib/resource-pool";
import { serializeForJson } from "@/lib/serialize";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const pool = await getPoolSnapshot();
  return NextResponse.json(serializeForJson({
    ok: true,
    summary: {
      total: pool.total,
      allocated: pool.allocated,
      available: pool.available,
      workers: pool.workers,
      overcommitEnabled: false,
    },
  }));
}
