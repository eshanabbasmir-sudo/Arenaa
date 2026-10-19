// GET /api/export/nodes?format=csv|json — export all nodes
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { serializeForJson } from "@/lib/serialize";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const url = new URL(req.url);
  const format = url.searchParams.get("format") || "json";
  const nodes = await db.node.findMany({
    where: { status: { not: "removed" } },
    include: { resources: true },
    orderBy: { registeredAt: "asc" },
  });
  const rows = nodes.map((n) => ({
    nodeId: n.nodeId,
    displayName: n.displayName ?? "",
    status: n.status,
    cpuCores: n.cpuCores,
    ramBytes: Number(n.ramBytes),
    diskBytes: Number(n.diskBytes),
    architecture: n.architecture ?? "",
    os: n.os ?? "",
    hostname: n.hostname ?? "",
    containerRuntime: n.containerRuntime ?? "",
    group: n.group ?? "",
    location: n.location ?? "",
    tags: n.tags,
    registeredAt: n.registeredAt,
    lastHeartbeatAt: n.lastHeartbeatAt,
  }));
  if (format === "csv") {
    const headers = Object.keys(rows[0] || {});
    const csv = [
      headers.join(","),
      ...rows.map((r) => headers.map((h) => {
        const v = (r as any)[h];
        if (v instanceof Date) return v.toISOString();
        if (typeof v === "string" && v.includes(",")) return `"${v.replace(/"/g, '""')}"`;
        return v ?? "";
      }).join(",")),
    ].join("\n");
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="darkpool-nodes-${Date.now()}.csv"`,
      },
    });
  }
  return NextResponse.json(serializeForJson({ ok: true, nodes: rows }));
}
