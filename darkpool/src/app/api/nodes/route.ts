// GET /api/nodes — list all nodes (admin only)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { sweepNodeHealth } from "@/lib/node-manager";
import { serializeForJson } from "@/lib/serialize";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  // opportunistic health sweep on every list call
  await sweepNodeHealth();

  const nodes = await db.node.findMany({
    where: { status: { not: "removed" } },
    include: { resources: true, _count: { select: { workloads: true } } },
    orderBy: { registeredAt: "asc" },
  });

  return NextResponse.json(serializeForJson({
    ok: true,
    nodes: nodes.map((n) => ({
      nodeId: n.nodeId,
      displayName: n.displayName,
      role: n.role,
      status: n.status,
      cpuCores: n.cpuCores,
      ramBytes: n.ramBytes,
      diskBytes: n.diskBytes,
      architecture: n.architecture,
      os: n.os,
      kernel: n.kernel,
      hostname: n.hostname,
      containerRuntime: n.containerRuntime,
      features: JSON.parse(n.features || "[]"),
      tags: JSON.parse(n.tags || "[]"),
      group: n.group,
      location: n.location,
      notes: n.notes,
      lastHeartbeatAt: n.lastHeartbeatAt,
      registeredAt: n.registeredAt,
      resources: n.resources,
      workloadCount: n._count.workloads,
    })),
  }));
}
