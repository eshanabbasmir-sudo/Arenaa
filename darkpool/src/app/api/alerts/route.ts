// GET /api/alerts?status=active — list alerts (with optional status filter)
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAlertStats } from "@/lib/alerts";
import { serializeForJson } from "@/lib/serialize";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "active";
  const limit = Math.min(200, Number(url.searchParams.get("limit") || 50));
  const where: any = {};
  if (status !== "all") where.status = status;
  const alerts = await db.alert.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  const stats = await getAlertStats();
  return NextResponse.json(serializeForJson({ ok: true, alerts, stats }));
}
