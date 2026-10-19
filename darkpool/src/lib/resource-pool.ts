// DARKPOOL Resource Manager.
// Aggregates real telemetry from worker nodes into a virtual resource pool.
// IMPORTANT: this is a SCHEDULING abstraction. We never claim physical RAM/CPU has been merged.

import { db } from "@/lib/db";
import { config } from "@/lib/config";

export interface NodePoolSnapshot {
  nodeId: string;
  displayName?: string | null;
  status: string;
  // advertised capacity (registered at join)
  cpuCores: number;
  ramBytes: number;
  diskBytes: number;
  // current real measurements (from latest heartbeat)
  cpuUsagePct: number;
  ramTotal: number;
  ramUsed: number;
  ramAvailable: number;
  ramAllocated: number; // sum of running workloads on this node
  diskTotal: number;
  diskUsed: number;
  diskAvailable: number;
  diskAllocated: number;
  // effective available (after reserves and allocations)
  cpuAvailable: number;
  ramAvailableEffective: number;
  diskAvailableEffective: number;
  lastHeartbeatAt?: Date | null;
  isStale: boolean;
  netRxBytes?: number;
  netTxBytes?: number;
}

export interface PoolSummary {
  total: {
    cpuCores: number;
    ramBytes: number;
    diskBytes: number;
  };
  allocated: {
    cpuCores: number;
    ramBytes: number;
    diskBytes: number;
  };
  available: {
    cpuCores: number;
    ramBytes: number;
    diskBytes: number;
  };
  workers: {
    online: number;
    offline: number;
    draining: number;
    total: number;
  };
  nodes: NodePoolSnapshot[];
}

// Pull a fresh snapshot from the DB. No caching — caller controls freshness.
export async function getPoolSnapshot(): Promise<PoolSummary> {
  const nodes = await db.node.findMany({
    where: { status: { not: "removed" } },
    include: { resources: true, workloads: { where: { status: "running" } } },
  });

  const snapshots: NodePoolSnapshot[] = [];
  let totalCpu = 0, totalRam = 0, totalDisk = 0;
  let allocatedCpu = 0, allocatedRam = 0, allocatedDisk = 0;

  for (const n of nodes) {
    const r = n.resources;
    const isOnline = n.status === "online";
    const isStale = !n.lastHeartbeatAt ||
      Date.now() - n.lastHeartbeatAt.getTime() > config.heartbeatStaleMs;

    // advertised capacity — BigInt in DB, convert to Number for scheduling math
    const cpuCores = Number(n.cpuCores || 0);
    const ramBytes = Number(n.ramBytes || 0);
    const diskBytes = Number(n.diskBytes || 0);

    // measured (or 0 if no telemetry yet)
    const cpuUsagePct = Number(r?.cpuUsagePct ?? 0);
    const ramTotal = Number(r?.ramTotal ?? ramBytes);
    const ramUsed = Number(r?.ramUsed ?? 0);
    const ramAvailable = Number(r?.ramAvailable ?? ramBytes);
    const diskTotal = Number(r?.diskTotal ?? diskBytes);
    const diskUsed = Number(r?.diskUsed ?? 0);
    const diskAvailable = Number(r?.diskAvailable ?? diskBytes);
    const netRxBytes = Number(r?.netRxBytes ?? 0);
    const netTxBytes = Number(r?.netTxBytes ?? 0);
    const ramAllocated = Number(r?.ramAllocated ?? 0);
    const diskAllocated = Number(r?.diskAllocated ?? 0);

    // running-workload allocations on this node
    let nodeAllocCpu = 0, nodeAllocRam = 0, nodeAllocDisk = 0;
    for (const w of n.workloads) {
      nodeAllocCpu += w.cpuLimit;
      nodeAllocRam += w.ramLimitMb * 1024 * 1024;
      nodeAllocDisk += w.diskLimitMb * 1024 * 1024;
    }

    // effective available (only count online, non-draining nodes)
    const schedulable = isOnline && n.status !== "draining" && n.status !== "disabled";
    const cpuReserveBytes = Math.max(0, config.cpuReserveCores * 1); // in cores
    const cpuAvailable = schedulable
      ? Math.max(0, cpuCores - nodeAllocCpu - cpuReserveBytes)
      : 0;
    const ramAvailableEffective = schedulable
      ? Math.max(0, ramAvailable - (config.ramReserveMb * 1024 * 1024) - nodeAllocRam)
      : 0;
    const diskAvailableEffective = schedulable
      ? Math.max(0, diskAvailable - (config.diskReserveGb * 1024 ** 3) - nodeAllocDisk)
      : 0;

    snapshots.push({
      nodeId: n.nodeId,
      displayName: n.displayName,
      status: n.status,
      cpuCores,
      ramBytes,
      diskBytes,
      cpuUsagePct,
      ramTotal,
      ramUsed,
      ramAvailable,
      ramAllocated: nodeAllocRam,
      diskTotal,
      diskUsed,
      diskAvailable,
      diskAllocated: nodeAllocDisk,
      cpuAvailable,
      ramAvailableEffective,
      diskAvailableEffective,
      lastHeartbeatAt: n.lastHeartbeatAt,
      isStale,
      netRxBytes,
      netTxBytes,
    });

    // pool totals only count non-removed nodes
    if (n.status !== "removed") {
      totalCpu += cpuCores;
      totalRam += ramBytes;
      totalDisk += diskBytes;
      allocatedCpu += nodeAllocCpu;
      allocatedRam += nodeAllocRam;
      allocatedDisk += nodeAllocDisk;
    }
  }

  // available = sum of effective available across schedulable nodes
  let availCpu = 0, availRam = 0, availDisk = 0;
  let online = 0, offline = 0, draining = 0;
  for (const s of snapshots) {
    if (s.status === "online") online++;
    else if (s.status === "offline" || s.status === "unstable") offline++;
    else if (s.status === "draining") draining++;
    if (s.status === "online") {
      availCpu += s.cpuAvailable;
      availRam += s.ramAvailableEffective;
      availDisk += s.diskAvailableEffective;
    }
  }

  return {
    total: { cpuCores: totalCpu, ramBytes: totalRam, diskBytes: totalDisk },
    allocated: { cpuCores: allocatedCpu, ramBytes: allocatedRam, diskBytes: allocatedDisk },
    available: { cpuCores: availCpu, ramBytes: availRam, diskBytes: availDisk },
    workers: { online, offline, draining, total: snapshots.length },
    nodes: snapshots,
  };
}

// Pretty-print helpers (for darkpool df / darkpool-info virtual reporting).
export function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

export function formatUptime(seconds: number): string {
  if (!seconds || seconds < 0) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
