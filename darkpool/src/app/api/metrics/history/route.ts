// GET /api/metrics/history?nodeId=&metric=&range=15m
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

const RANGES: Record<string, number> = {
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "6h": 6 * 60 * 60_000,
  "24h": 24 * 60 * 60_000,
  "7d": 7 * 24 * 60 * 60_000,
};

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const url = new URL(req.url);
  const nodeId = url.searchParams.get("nodeId");
  const metric = url.searchParams.get("metric") || "cpu_usage";
  const range = url.searchParams.get("range") || "15m";
  const rangeMs = RANGES[range] ?? RANGES["15m"];
  const since = new Date(Date.now() - rangeMs);

  const where: any = { metric, timestamp: { gte: since } };
  if (nodeId) {
    const node = await db.node.findUnique({ where: { nodeId } });
    if (!node) return NextResponse.json({ error: "node not found" }, { status: 404 });
    where.nodeId = node.id;
  }

  // sample down to ~200 points max
  const points = await db.metricPoint.findMany({
    where,
    orderBy: { timestamp: "asc" },
    take: 5000,
  });

  const step = Math.max(1, Math.floor(points.length / 200));
  const sampled = points.filter((_, i) => i % step === 0).map((p) => ({
    t: p.timestamp.getTime(),
    v: p.value,
  }));

  return NextResponse.json({ ok: true, metric, range, points: sampled });
}
