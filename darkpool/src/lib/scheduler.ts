// DARKPOOL Scheduler.
// Weighted scoring algorithm — NOT round-robin.
// Atomic allocation via DB transaction with resource snapshot consistency.
//
// Scoring:
//   score = w_cpu * cpuAvailFactor
//         + w_ram * ramAvailFactor
//         + w_disk * diskAvailFactor
//         - w_load * loadFactor
//         - w_running * runningCountFactor
//
// Each factor is normalized to 0..1. Higher score wins.
// Nodes that fail ANY hard constraint (insufficient resources, offline, draining)
// are REJECTED (score = -Infinity).

import { db } from "@/lib/db";
import { config } from "@/lib/config";
import { getPoolSnapshot, type NodePoolSnapshot } from "@/lib/resource-pool";
import { recordEvent } from "@/lib/logger";

export interface SchedRequest {
  cpuCores: number;
  ramMb: number;
  diskMb: number;
  // optional capability filters
  architecture?: string;
  containerRuntime?: string;
  features?: string[];
}

export interface SchedCandidate {
  nodeId: string;
  score: number;
  reason: string;
  accepted: boolean;
}

export interface SchedResult {
  selectedNodeId: string | null;
  selectedNodeDbId?: string;
  candidates: SchedCandidate[];
  rejected: { nodeId: string; reason: string }[];
  snapshot: NodePoolSnapshot | null;
}

// Pure scoring function for a single node.
export function scoreNode(node: NodePoolSnapshot, req: SchedRequest): SchedCandidate {
  const reasons: string[] = [];
  const w = config.schedulerWeights;

  // HARD CONSTRAINTS — reject if any fail
  if (node.status !== "online") {
    return { nodeId: node.nodeId, score: -Infinity, accepted: false, reason: `node status is ${node.status}` };
  }
  if (node.cpuAvailable < req.cpuCores) {
    return { nodeId: node.nodeId, score: -Infinity, accepted: false, reason: `insufficient CPU (need ${req.cpuCores}, have ${node.cpuAvailable})` };
  }
  if (node.ramAvailableEffective < req.ramMb * 1024 * 1024) {
    return { nodeId: node.nodeId, score: -Infinity, accepted: false, reason: `insufficient RAM (need ${req.ramMb}MB, have ${Math.floor(node.ramAvailableEffective / 1024 / 1024)}MB)` };
  }
  if (node.diskAvailableEffective < req.diskMb * 1024 * 1024) {
    return { nodeId: node.nodeId, score: -Infinity, accepted: false, reason: `insufficient disk (need ${req.diskMb}MB, have ${Math.floor(node.diskAvailableEffective / 1024 / 1024)}MB)` };
  }

  // SOFT SCORING — normalized 0..1
  const cpuTotal = Math.max(node.cpuCores, 1);
  const ramTotal = Math.max(node.ramAvailable, 1);
  const diskTotal = Math.max(node.diskAvailable, 1);

  const cpuAvailFactor = Math.min(1, node.cpuAvailable / cpuTotal);
  const ramAvailFactor = Math.min(1, node.ramAvailableEffective / ramTotal);
  const diskAvailFactor = Math.min(1, node.diskAvailableEffective / diskTotal);
  const loadFactor = Math.min(1, node.cpuUsagePct / 100);
  const runningCountFactor = Math.min(1, node.ramAllocated / Math.max(ramTotal, 1));

  const score =
    w.cpu * cpuAvailFactor +
    w.ram * ramAvailFactor +
    w.disk * diskAvailFactor -
    w.load * loadFactor -
    w.running * runningCountFactor;

  return {
    nodeId: node.nodeId,
    score,
    accepted: true,
    reason: `cpu:${cpuAvailFactor.toFixed(2)} ram:${ramAvailFactor.toFixed(2)} disk:${diskAvailFactor.toFixed(2)} load:${loadFactor.toFixed(2)} → score=${score.toFixed(3)}`,
  };
}

// Run the scheduler against current pool snapshot. Does NOT mutate DB.
export async function planSchedule(req: SchedRequest): Promise<SchedResult> {
  const pool = await getPoolSnapshot();
  const candidates: SchedCandidate[] = [];
  const rejected: { nodeId: string; reason: string }[] = [];

  for (const node of pool.nodes) {
    // capability filter (architecture, runtime, features)
    if (req.architecture) {
      const nodeDb = await db.node.findUnique({ where: { nodeId: node.nodeId } });
      if (nodeDb?.architecture && nodeDb.architecture !== req.architecture) {
        rejected.push({ nodeId: node.nodeId, reason: `architecture mismatch (need ${req.architecture}, have ${nodeDb.architecture})` });
        continue;
      }
    }
    const result = scoreNode(node, req);
    if (result.accepted) candidates.push(result);
    else rejected.push({ nodeId: result.nodeId, reason: result.reason });
  }

  candidates.sort((a, b) => b.score - a.score);
  const winner = candidates[0] ?? null;

  return {
    selectedNodeId: winner?.nodeId ?? null,
    candidates,
    rejected,
    snapshot: winner ? pool.nodes.find((n) => n.nodeId === winner.nodeId) ?? null : null,
  };
}

// ATOMIC allocation: re-check inside a DB transaction that the chosen node
// still has the resources, then create the workload + allocation row.
// This prevents race conditions where two concurrent requests pick the same node.
export async function allocateWorkload(opts: {
  workloadId: string;
  name: string;
  image: string;
  command?: string | null;
  cpuCores: number;
  ramMb: number;
  diskMb: number;
  ownerId?: string | null;
  selectedNodeId?: string | null; // pre-selected by planner; if null, plan here
}): Promise<{ ok: true; nodeId: string; nodeDbId: string; workloadDbId: string } | { ok: false; error: string }> {
  const req: SchedRequest = {
    cpuCores: opts.cpuCores,
    ramMb: opts.ramMb,
    diskMb: opts.diskMb,
  };

  let nodeId = opts.selectedNodeId;
  if (!nodeId) {
    const plan = await planSchedule(req);
    nodeId = plan.selectedNodeId;
    if (!nodeId) {
      return { ok: false, error: "no suitable node available" };
    }
  }

  // Atomic transaction: re-check + insert workload + insert allocation.
  try {
    const result = await db.$transaction(async (tx) => {
      const node = await tx.node.findUnique({
        where: { nodeId: nodeId! },
        include: {
          resources: true,
          workloads: { where: { status: "running" } },
        },
      });
      if (!node) throw new Error("node not found");
      if (node.status !== "online") throw new Error(`node ${node.nodeId} is ${node.status}, not online`);

      // recount allocations atomically
      let allocCpu = 0, allocRam = 0, allocDisk = 0;
      for (const w of node.workloads) {
        allocCpu += w.cpuLimit;
        allocRam += w.ramLimitMb * 1024 * 1024;
        allocDisk += w.diskLimitMb * 1024 * 1024;
      }
      const cpuAvail = node.cpuCores - allocCpu - config.cpuReserveCores;
      const ramAvail = Number(node.resources?.ramAvailable ?? node.ramBytes) -
        (config.ramReserveMb * 1024 * 1024) - allocRam;
      const diskAvail = Number(node.resources?.diskAvailable ?? node.diskBytes) -
        (config.diskReserveGb * 1024 ** 3) - allocDisk;

      if (!config.overcommitEnabled) {
        if (cpuAvail < opts.cpuCores) throw new Error(`race: ${node.nodeId} now has ${cpuAvail} CPU free, need ${opts.cpuCores}`);
        if (ramAvail < opts.ramMb * 1024 * 1024) throw new Error(`race: ${node.nodeId} now has insufficient RAM`);
        if (diskAvail < opts.diskMb * 1024 * 1024) throw new Error(`race: ${node.nodeId} now has insufficient disk`);
      }

      const workload = await tx.workload.create({
        data: {
          workloadId: opts.workloadId,
          name: opts.name,
          image: opts.image,
          command: opts.command ?? null,
          cpuLimit: opts.cpuCores,
          ramLimitMb: opts.ramMb,
          diskLimitMb: opts.diskMb,
          status: "scheduling",
          ownerId: opts.ownerId ?? null,
          nodeId: node.id,
          runtime: "auto",
        },
      });
      await tx.resourceAllocation.create({
        data: {
          nodeId: node.id,
          workloadId: workload.id,
          cpuCores: opts.cpuCores,
          ramMb: opts.ramMb,
          diskMb: opts.diskMb,
        },
      });
      return { node, workload };
    });

    await recordEvent({
      type: "workload.assigned",
      nodeId: result.node.id,
      workloadId: result.workload.id,
      message: `workload ${opts.workloadId} assigned to ${result.node.nodeId}`,
      severity: "info",
      meta: { cpu: opts.cpuCores, ramMb: opts.ramMb, diskMb: opts.diskMb },
    });

    return { ok: true, nodeId: result.node.nodeId, nodeDbId: result.node.id, workloadDbId: result.workload.id };
  } catch (e: unknown) {
    const err = e as Error;
    await recordEvent({
      type: "workload.assign_failed",
      message: `failed to allocate ${opts.workloadId}: ${err.message}`,
      severity: "error",
      meta: { workloadId: opts.workloadId, error: err.message },
    });
    return { ok: false, error: err.message };
  }
}
