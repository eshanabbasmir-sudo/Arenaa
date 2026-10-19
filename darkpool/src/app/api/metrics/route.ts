// GET /api/metrics — current per-node metrics
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { serializeForJson } from "@/lib/serialize";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const nodes = await db.node.findMany({
    where: { status: { not: "removed" } },
    include: { resources: true },
  });
  return NextResponse.json(serializeForJson({
    ok: true,
    metrics: nodes.map((n) => ({
      nodeId: n.nodeId,
      status: n.status,
      cpu: { cores: n.cpuCores, usagePct: n.resources?.cpuUsagePct ?? 0, loadAvg1: n.resources?.loadAvg1 ?? 0 },
      ram: {
        total: n.resources?.ramTotal ?? n.ramBytes,
        used: n.resources?.ramUsed ?? 0,
        available: n.resources?.ramAvailable ?? n.ramBytes,
        allocated: n.resources?.ramAllocated ?? 0,
      },
      disk: {
        total: n.resources?.diskTotal ?? n.diskBytes,
        used: n.resources?.diskUsed ?? 0,
        available: n.resources?.diskAvailable ?? n.diskBytes,
        allocated: n.resources?.diskAllocated ?? 0,
      },
      network: {
        rxBytes: n.resources?.netRxBytes ?? 0,
        txBytes: n.resources?.netTxBytes ?? 0,
        interface: n.resources?.netInterface ?? null,
      },
      uptime: n.resources?.uptime ?? 0,
      lastHeartbeatAt: n.lastHeartbeatAt,
    })),
  }));
}
