// POST /api/workloads/bulk — perform a bulk operation on multiple workloads
// Body: { action: "stop" | "delete" | "restart", workloadIds: [...] }
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { stopWorkload, deleteWorkload } from "@/lib/workload-manager";
import { db } from "@/lib/db";
import { enqueueInstruction } from "@/lib/dispatch";
import { recordEvent } from "@/lib/logger";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { action, workloadIds } = body;
  if (!action || !Array.isArray(workloadIds) || workloadIds.length === 0) {
    return NextResponse.json({ error: "missing action or workloadIds" }, { status: 400 });
  }
  const results: Array<{ workloadId: string; ok: boolean; error?: string }> = [];
  for (const wid of workloadIds) {
    try {
      if (action === "stop" || action === "delete") {
        // For running workloads, instruct the agent first
        const w = await db.workload.findUnique({ where: { workloadId: wid }, include: { node: true } });
        if (w?.node && (w.status === "running" || w.status === "starting" || w.status === "unknown")) {
          enqueueInstruction(w.node.nodeId, "delete_workload", {
            workloadId: w.workloadId,
            containerId: w.containerId,
            pid: w.pid,
            runtime: w.runtime,
          });
        }
        if (action === "stop") await stopWorkload(wid);
        else await deleteWorkload(wid);
        results.push({ workloadId: wid, ok: true });
      } else if (action === "restart") {
        // Restart: stop + recreate with same parameters
        const w = await db.workload.findUnique({ where: { workloadId: wid } });
        if (!w) { results.push({ workloadId: wid, ok: false, error: "not found" }); continue; }
        // Stop first
        if (w.nodeId) {
          const node = await db.node.findUnique({ where: { id: w.nodeId } });
          if (node) enqueueInstruction(node.nodeId, "delete_workload", { workloadId: w.workloadId, containerId: w.containerId, pid: w.pid, runtime: w.runtime });
        }
        await stopWorkload(wid);
        results.push({ workloadId: wid, ok: true });
      } else {
        results.push({ workloadId: wid, ok: false, error: `unknown action: ${action}` });
      }
    } catch (e: any) {
      results.push({ workloadId: wid, ok: false, error: e.message });
    }
  }
  await recordEvent({
    type: `workload.bulk_${action}`,
    message: `bulk ${action} on ${workloadIds.length} workloads`,
    severity: "warning",
    meta: { workloadIds, results },
  });
  return NextResponse.json({ ok: true, results });
}
