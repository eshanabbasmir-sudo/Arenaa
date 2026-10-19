// POST /api/workloads/:id/clone — clone an existing workload's config as a new workload
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createWorkload } from "@/lib/workload-manager";
import { db } from "@/lib/db";
import { enqueueInstruction } from "@/lib/dispatch";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const w = await db.workload.findUnique({ where: { workloadId: id } });
  if (!w) return NextResponse.json({ error: "not found" }, { status: 404 });
  const result = await createWorkload({
    name: body.name || `${w.name}-copy`,
    image: w.image,
    command: w.command || undefined,
    cpuCores: w.cpuLimit,
    ramMb: w.ramLimitMb,
    diskMb: w.diskLimitMb,
    ownerId: user.id,
    tags: JSON.parse(w.tags || "[]"),
    envVars: JSON.parse(w.envVars || "{}"),
    ports: JSON.parse(w.ports || "[]"),
    priority: w.priority,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  // Enqueue start instruction
  enqueueInstruction(result.schedule?.selectedNodeId ?? "", "start_workload", {
    workloadId: result.workloadId,
    name: body.name || `${w.name}-copy`,
    image: w.image,
    command: w.command,
    cpuCores: w.cpuLimit,
    ramMb: w.ramLimitMb,
    diskMb: w.diskLimitMb,
    envVars: JSON.parse(w.envVars || "{}"),
  });
  return NextResponse.json({ ok: true, workloadId: result.workloadId });
}
