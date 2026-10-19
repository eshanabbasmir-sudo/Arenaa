// POST /api/nodes/heartbeat
// Auth: Bearer <agentToken> (header also includes X-DarkPool-Node: <nodeId>)
// Body: full telemetry payload from agent
import { NextRequest, NextResponse } from "next/server";
import { authenticateWorker } from "@/lib/auth";
import { processHeartbeat } from "@/lib/node-manager";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const nodeIdHeader = req.headers.get("x-darkpool-node") || "";
  if (!auth.startsWith("Bearer ")) return NextResponse.json({ error: "missing bearer token" }, { status: 401 });
  const token = auth.slice(7);
  const node = await authenticateWorker(nodeIdHeader, token);
  if (!node) return NextResponse.json({ error: "authentication failed" }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  const res = await processHeartbeat({
    nodeId: node.nodeId,
    status: body.status || "online",
    cpuUsagePct: Number(body.cpu_usage ?? body.cpuUsagePct ?? 0),
    ramUsed: Number(body.ram_used ?? body.ramUsed ?? 0),
    ramTotal: Number(body.ram_total ?? body.ramTotal ?? 0),
    ramAvailable: Number(body.ram_available ?? body.ramAvailable ?? body.ram_free ?? 0),
    ramCached: Number(body.ram_cached ?? body.ramCached ?? 0),
    diskFree: Number(body.disk_free ?? body.diskFree ?? 0),
    diskTotal: Number(body.disk_total ?? body.diskTotal ?? 0),
    diskUsed: Number(body.disk_used ?? body.diskUsed ?? 0),
    loadAvg1: Number(body.load_avg1 ?? body.loadAvg1 ?? 0),
    loadAvg5: Number(body.load_avg5 ?? body.loadAvg5 ?? 0),
    loadAvg15: Number(body.load_avg15 ?? body.loadAvg15 ?? 0),
    netRxBytes: Number(body.net_rx ?? body.netRxBytes ?? 0),
    netTxBytes: Number(body.net_tx ?? body.netTxBytes ?? 0),
    netInterface: body.net_interface ?? body.netInterface ?? null,
    filesystem: body.filesystem ?? null,
    mountPoint: body.mount_point ?? body.mountPoint ?? null,
    uptime: Number(body.uptime ?? 0),
    timestamp: Number(body.timestamp ?? Date.now()),
  });

  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true, serverTime: Date.now() });
}
