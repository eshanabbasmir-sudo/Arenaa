// GET /api/export/workloads?format=csv|json — export all workloads
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { serializeForJson } from "@/lib/serialize";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const url = new URL(req.url);
  const format = url.searchParams.get("format") || "json";
  const workloads = await db.workload.findMany({
    include: { node: { select: { nodeId: true, displayName: true } }, owner: { select: { email: true } } },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });
  const rows = workloads.map((w) => ({
    workloadId: w.workloadId,
    name: w.name,
    status: w.status,
    image: w.image,
    cpuLimit: w.cpuLimit,
    ramLimitMb: w.ramLimitMb,
    diskLimitMb: w.diskLimitMb,
    node: w.node?.nodeId ?? "",
    owner: w.owner?.email ?? "",
    tags: w.tags,
    priority: w.priority,
    createdAt: w.createdAt,
    startedAt: w.startedAt,
    finishedAt: w.finishedAt,
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
        "content-disposition": `attachment; filename="darkpool-workloads-${Date.now()}.csv"`,
      },
    });
  }
  return NextResponse.json(serializeForJson({ ok: true, workloads: rows }));
}
