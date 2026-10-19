// GET    /api/workloads/:id — detail
// DELETE /api/workloads/:id — stop + delete
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { stopWorkload, deleteWorkload } from "@/lib/workload-manager";
import { enqueueInstruction } from "@/lib/dispatch";
import { serializeForJson } from "@/lib/serialize";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const w = await db.workload.findUnique({
    where: { workloadId: id },
    include: { node: true, owner: true },
  });
  if (!w) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(serializeForJson({
    ok: true,
    workload: {
      ...w,
      owner: w.owner ? { email: w.owner.email } : null,
      node: w.node ? { nodeId: w.node.nodeId, displayName: w.node.displayName } : null,
    },
  }));
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const w = await db.workload.findUnique({ where: { workloadId: id }, include: { node: true } });
  if (!w) return NextResponse.json({ error: "not found" }, { status: 404 });
  // If running, instruct the agent to stop the container first
  if (w.node && (w.status === "running" || w.status === "starting" || w.status === "unknown")) {
    enqueueInstruction(w.node.nodeId, "delete_workload", {
      workloadId: w.workloadId,
      containerId: w.containerId,
      pid: w.pid,
      runtime: w.runtime,
    });
  }
  const res = await deleteWorkload(id);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
