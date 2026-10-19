// GET /api/agent/instructions — agent long-polls for instructions
// Auth: Bearer <agentToken> + X-DarkPool-Node: <nodeId>
import { NextRequest, NextResponse } from "next/server";
import { authenticateWorker } from "@/lib/auth";
import { dequeueInstructions } from "@/lib/dispatch";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const nodeIdHeader = req.headers.get("x-darkpool-node") || "";
  if (!auth.startsWith("Bearer ")) return NextResponse.json({ error: "missing bearer" }, { status: 401 });
  const node = await authenticateWorker(nodeIdHeader, auth.slice(7));
  if (!node) return NextResponse.json({ error: "auth failed" }, { status: 401 });

  const instructions = dequeueInstructions(node.nodeId, 50);

  // Also include any workloads in 'scheduling' state for this node —
  // the agent picks them up as start_workload instructions if the queue was empty.
  if (instructions.length === 0) {
    const pending = await db.workload.findMany({
      where: { nodeId: node.id, status: "scheduling" },
      take: 20,
    });
    for (const w of pending) {
      instructions.push({
        id: `reconcile-${w.id}`,
        type: "start_workload",
        nodeId: node.nodeId,
        payload: {
          workloadId: w.workloadId,
          name: w.name,
          image: w.image,
          command: w.command,
          cpuCores: w.cpuLimit,
          ramMb: w.ramLimitMb,
          diskMb: w.diskLimitMb,
        },
        createdAt: Date.now(),
      });
    }
    // Also include workloads in 'stopping' state -> stop_workload
    const stopping = await db.workload.findMany({
      where: { nodeId: node.id, status: "stopping" },
      take: 20,
    });
    for (const w of stopping) {
      instructions.push({
        id: `reconcile-stop-${w.id}`,
        type: "stop_workload",
        nodeId: node.nodeId,
        payload: {
          workloadId: w.workloadId,
          containerId: w.containerId,
          pid: w.pid,
          runtime: w.runtime,
        },
        createdAt: Date.now(),
      });
    }
  }

  return NextResponse.json({ ok: true, instructions });
}
