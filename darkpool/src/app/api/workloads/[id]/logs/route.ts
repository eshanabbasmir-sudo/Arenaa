// GET /api/workloads/:id/logs — fetch recent events for a workload
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { serializeForJson } from "@/lib/serialize";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const w = await db.workload.findUnique({ where: { workloadId: id } });
  if (!w) return NextResponse.json({ error: "not found" }, { status: 404 });
  const events = await db.event.findMany({
    where: { workloadId: w.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json(serializeForJson({ ok: true, logs: events }));
}
