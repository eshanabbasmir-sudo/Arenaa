// GET /api/system/status
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getPoolSnapshot } from "@/lib/resource-pool";
import { config } from "@/lib/config";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const pool = await getPoolSnapshot();
  const workloadCounts = await db.workload.groupBy({ by: ["status"], _count: true });
  const counts: Record<string, number> = {};
  for (const c of workloadCounts) counts[c.status] = c._count;

  return NextResponse.json({
    ok: true,
    status: {
      main: "online",
      uptime: process.uptime(),
      nodeEnv: process.env.NODE_ENV,
      version: "1.0.0",
      config: {
        heartbeatIntervalMs: config.heartbeatIntervalMs,
        heartbeatStaleMs: config.heartbeatStaleMs,
        heartbeatOfflineMs: config.heartbeatOfflineMs,
        gracePeriodMs: config.gracePeriodMs,
        cpuReserveCores: config.cpuReserveCores,
        ramReserveMb: config.ramReserveMb,
        diskReserveGb: config.diskReserveGb,
        overcommitEnabled: config.overcommitEnabled,
      },
      workers: pool.workers,
      workloads: counts,
    },
  });
}
