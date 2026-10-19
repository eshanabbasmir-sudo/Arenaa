// DARKPOOL Node Manager.
// Handles registration, heartbeat processing, status transitions, drain, removal.

import { db } from "@/lib/db";
import { config } from "@/lib/config";
import { recordEvent } from "@/lib/logger";
import { generateNodeId, generateToken, hashPassword } from "@/lib/auth";
import { checkNodeAlerts } from "@/lib/alerts";

export interface RegisterInput {
  // caller provides a registration token issued by admin (or MAIN bootstrap token)
  registrationToken: string;
  // advertised capabilities (the agent measures these but we trust+verify via heartbeat later)
  hostname?: string;
  architecture?: string;
  os?: string;
  kernel?: string;
  cpuCores: number;
  ramBytes: number;
  diskBytes: number;
  containerRuntime?: string;
  features?: string[];
  displayName?: string;
}

// Validate a registration token. Returns ok + the token row.
// Supports multi-use tokens: maxUses=-1 means unlimited.
export async function consumeRegistrationToken(token: string): Promise<{ ok: true; multiUse: boolean; maxUses: number; useCount: number } | { ok: false; error: string }> {
  const rt = await db.registrationToken.findUnique({ where: { token } });
  if (!rt) return { ok: false, error: "invalid registration token" };
  if (rt.expiresAt.getTime() < Date.now()) return { ok: false, error: "registration token expired" };
  // Single-use tokens: check if already used
  if (rt.maxUses === 1 && rt.useCount >= 1) return { ok: false, error: "registration token already used" };
  // Multi-use tokens with a cap: check if at limit
  if (rt.maxUses > 1 && rt.useCount >= rt.maxUses) return { ok: false, error: "registration token has reached its use limit" };
  // Unlimited tokens (maxUses === -1) always pass
  return { ok: true, multiUse: rt.maxUses !== 1, maxUses: rt.maxUses, useCount: rt.useCount };
}

export interface RegisterResult {
  ok: boolean;
  nodeId?: string;
  agentToken?: string; // bearer token the agent must use for all subsequent calls
  error?: string;
}

// Register a new supporter node. Issues a per-node agent token.
export async function registerNode(input: RegisterInput): Promise<RegisterResult> {
  // validate token
  const tokenCheck = await consumeRegistrationToken(input.registrationToken);
  if (!tokenCheck.ok) return { ok: false, error: tokenCheck.error };

  const nodeId = generateNodeId();
  const agentToken = generateToken(32);
  const tokenHash = await hashPassword(agentToken);

  try {
    const node = await db.$transaction(async (tx) => {
      const node = await tx.node.create({
        data: {
          nodeId,
          displayName: input.displayName ?? null,
          role: "supporter",
          status: "online",
          cpuCores: input.cpuCores,
          ramBytes: input.ramBytes,
          diskBytes: input.diskBytes,
          architecture: input.architecture ?? null,
          os: input.os ?? null,
          kernel: input.kernel ?? null,
          hostname: input.hostname ?? null,
          containerRuntime: input.containerRuntime ?? null,
          features: JSON.stringify(input.features || []),
          lastHeartbeatAt: new Date(),
        },
      });
      await tx.nodeCredential.create({
        data: { nodeId: node.id, tokenHash },
      });
      await tx.nodeResource.create({
        data: { nodeId: node.id },
      });
      // mark registration token used (increment useCount; for multi-use tokens, just bump the count)
      await tx.registrationToken.update({
        where: { token: input.registrationToken },
        data: {
          usedByNodeId: node.nodeId, // for single-use tokens
          useCount: { increment: 1 },
        },
      });
      return node;
    });

    await recordEvent({
      type: "node.registered",
      nodeId: node.id,
      message: `node ${nodeId} registered (${input.cpuCores}CPU ${Math.round(input.ramBytes / 1024 / 1024 / 1024)}GB RAM ${Math.round(input.diskBytes / 1024 / 1024 / 1024)}GB disk)`,
      severity: "info",
      meta: { architecture: input.architecture, os: input.os, containerRuntime: input.containerRuntime },
    });

    return { ok: true, nodeId, agentToken };
  } catch (e: unknown) {
    const err = e as Error;
    return { ok: false, error: `registration failed: ${err.message}` };
  }
}

export interface HeartbeatInput {
  nodeId: string;
  status: string;
  cpuUsagePct: number;
  ramUsed: number;
  ramTotal: number;
  ramAvailable: number;
  ramCached?: number;
  diskFree: number;
  diskTotal?: number;
  diskUsed?: number;
  loadAvg1?: number;
  loadAvg5?: number;
  loadAvg15?: number;
  netRxBytes?: number;
  netTxBytes?: number;
  netInterface?: string;
  filesystem?: string;
  mountPoint?: string;
  uptime?: number;
  timestamp: number;
}

// Process a heartbeat: update NodeResource, Node status, write Heartbeat row, write metrics.
export async function processHeartbeat(input: HeartbeatInput): Promise<{ ok: boolean; error?: string }> {
  const node = await db.node.findUnique({ where: { nodeId: input.nodeId } });
  if (!node) return { ok: false, error: "unknown node" };
  if (node.status === "removed") return { ok: false, error: "node removed" };

  // determine target status — but don't override drain/disabled (admin actions)
  let newStatus = node.status;
  if (node.status === "pending" || node.status === "unstable" || node.status === "offline") {
    newStatus = "online";
    await recordEvent({
      type: "node.connected",
      nodeId: node.id,
      message: `node ${input.nodeId} is online again`,
      severity: "info",
    });
  }
  if (node.status === "draining" || node.status === "disabled") {
    newStatus = node.status; // preserve
  }

  // recompute effective available — counts current running workloads on this node
  const runningWorkloads = await db.workload.findMany({
    where: { nodeId: node.id, status: "running" },
  });
  let allocCpu = 0, allocRam = 0, allocDisk = 0;
  for (const w of runningWorkloads) {
    allocCpu += w.cpuLimit;
    allocRam += w.ramLimitMb * 1024 * 1024;
    allocDisk += w.diskLimitMb * 1024 * 1024;
  }
  const cpuAvailable = Math.max(0, node.cpuCores - allocCpu - config.cpuReserveCores);
  const ramAvailEff = Math.max(0, (input.ramAvailable || 0) - (config.ramReserveMb * 1024 * 1024) - allocRam);
  const diskAvailEff = Math.max(0, (input.diskFree || 0) - (config.diskReserveGb * 1024 ** 3) - allocDisk);

  await db.$transaction([
    db.node.update({
      where: { id: node.id },
      data: { status: newStatus, lastHeartbeatAt: new Date() },
    }),
    db.nodeResource.upsert({
      where: { nodeId: node.id },
      create: {
        nodeId: node.id,
        cpuUsagePct: input.cpuUsagePct,
        loadAvg1: input.loadAvg1 ?? 0,
        loadAvg5: input.loadAvg5 ?? 0,
        loadAvg15: input.loadAvg15 ?? 0,
        ramTotal: input.ramTotal,
        ramUsed: input.ramUsed,
        ramAvailable: input.ramAvailable,
        ramCached: input.ramCached ?? 0,
        ramAllocated: allocRam,
        diskTotal: input.diskTotal ?? node.diskBytes,
        diskUsed: input.diskUsed ?? 0,
        diskAvailable: input.diskFree,
        diskAllocated: allocDisk,
        filesystem: input.filesystem ?? null,
        mountPoint: input.mountPoint ?? null,
        netRxBytes: input.netRxBytes ?? 0,
        netTxBytes: input.netTxBytes ?? 0,
        netInterface: input.netInterface ?? null,
        uptime: input.uptime ?? 0,
        cpuAvailable,
        ramAvailableEffective: ramAvailEff,
        diskAvailableEffective: diskAvailEff,
      },
      update: {
        cpuUsagePct: input.cpuUsagePct,
        loadAvg1: input.loadAvg1 ?? 0,
        loadAvg5: input.loadAvg5 ?? 0,
        loadAvg15: input.loadAvg15 ?? 0,
        ramTotal: input.ramTotal,
        ramUsed: input.ramUsed,
        ramAvailable: input.ramAvailable,
        ramCached: input.ramCached ?? 0,
        ramAllocated: allocRam,
        diskTotal: input.diskTotal ?? node.diskBytes,
        diskUsed: input.diskUsed ?? 0,
        diskAvailable: input.diskFree,
        diskAllocated: allocDisk,
        filesystem: input.filesystem ?? null,
        mountPoint: input.mountPoint ?? null,
        netRxBytes: input.netRxBytes ?? 0,
        netTxBytes: input.netTxBytes ?? 0,
        netInterface: input.netInterface ?? null,
        uptime: input.uptime ?? 0,
        cpuAvailable,
        ramAvailableEffective: ramAvailEff,
        diskAvailableEffective: diskAvailEff,
      },
    }),
    db.heartbeat.create({
      data: {
        nodeId: node.id,
        status: input.status,
        cpuUsagePct: input.cpuUsagePct,
        ramUsed: input.ramUsed,
        ramTotal: input.ramTotal,
        diskFree: input.diskFree,
        loadAvg1: input.loadAvg1 ?? 0,
      },
    }),
    // also write metric points for time-series charts
    db.metricPoint.create({
      data: { nodeId: node.id, metric: "cpu_usage", value: input.cpuUsagePct },
    }),
    db.metricPoint.create({
      data: { nodeId: node.id, metric: "ram_used", value: input.ramUsed },
    }),
    db.metricPoint.create({
      data: { nodeId: node.id, metric: "disk_used", value: input.diskUsed ?? 0 },
    }),
    db.metricPoint.create({
      data: { nodeId: node.id, metric: "load_avg1", value: input.loadAvg1 ?? 0 },
    }),
  ]);

  // Check alert thresholds (CPU/RAM/disk high, node offline)
  // Fire-and-forget — don't block the heartbeat response
  checkNodeAlerts({ id: node.id, nodeId: node.nodeId, status: newStatus }, {
    cpuUsagePct: input.cpuUsagePct,
    ramTotal: BigInt(input.ramTotal),
    ramUsed: BigInt(input.ramUsed),
    diskTotal: BigInt(input.diskTotal ?? 0),
    diskUsed: BigInt(input.diskUsed ?? 0),
  }).catch(() => {});

  return { ok: true };
}

// Sweep — mark nodes UNSTABLE / OFFLINE based on heartbeat age.
// Call this periodically (cron or on each GET /api/resources).
export async function sweepNodeHealth(): Promise<{ swept: { nodeId: string; from: string; to: string }[] }> {
  const swept: { nodeId: string; from: string; to: string }[] = [];
  const now = Date.now();
  const nodes = await db.node.findMany({
    where: { status: { in: ["online", "unstable", "pending"] } },
  });
  for (const n of nodes) {
    if (!n.lastHeartbeatAt) continue;
    const age = now - n.lastHeartbeatAt.getTime();
    if (age > config.heartbeatOfflineMs && n.status !== "offline") {
      await db.node.update({ where: { id: n.id }, data: { status: "offline" } });
      swept.push({ nodeId: n.nodeId, from: n.status, to: "offline" });
      await recordEvent({
        type: "node.disconnected",
        nodeId: n.id,
        message: `node ${n.nodeId} marked OFFLINE (no heartbeat for ${Math.round(age / 1000)}s)`,
        severity: "warning",
      });
      // mark running workloads as unknown
      await db.workload.updateMany({
        where: { nodeId: n.id, status: "running" },
        data: { status: "unknown" },
      });
    } else if (age > config.heartbeatStaleMs && age <= config.heartbeatOfflineMs && n.status !== "unstable") {
      await db.node.update({ where: { id: n.id }, data: { status: "unstable" } });
      swept.push({ nodeId: n.nodeId, from: n.status, to: "unstable" });
      await recordEvent({
        type: "node.unstable",
        nodeId: n.id,
        message: `node ${n.nodeId} marked UNSTABLE (no heartbeat for ${Math.round(age / 1000)}s)`,
        severity: "warning",
      });
    }
  }
  return { swept };
}

// Admin: drain a node — stop scheduling new workloads there.
export async function drainNode(nodeId: string): Promise<{ ok: boolean; error?: string }> {
  const node = await db.node.findUnique({ where: { nodeId } });
  if (!node) return { ok: false, error: "not found" };
  if (node.status === "removed") return { ok: false, error: "node removed" };
  await db.node.update({ where: { id: node.id }, data: { status: "draining" } });
  await recordEvent({
    type: "node.draining",
    nodeId: node.id,
    message: `node ${nodeId} set to DRAINING — no new workloads will be scheduled`,
    severity: "warning",
  });
  return { ok: true };
}

export async function enableNode(nodeId: string): Promise<{ ok: boolean; error?: string }> {
  const node = await db.node.findUnique({ where: { nodeId } });
  if (!node) return { ok: false, error: "not found" };
  await db.node.update({ where: { id: node.id }, data: { status: "online" } });
  await recordEvent({
    type: "node.enabled",
    nodeId: node.id,
    message: `node ${nodeId} enabled`,
    severity: "info",
  });
  return { ok: true };
}

export async function disableNode(nodeId: string): Promise<{ ok: boolean; error?: string }> {
  const node = await db.node.findUnique({ where: { nodeId } });
  if (!node) return { ok: false, error: "not found" };
  await db.node.update({ where: { id: node.id }, data: { status: "disabled" } });
  await recordEvent({
    type: "node.disabled",
    nodeId: node.id,
    message: `node ${nodeId} disabled`,
    severity: "warning",
  });
  return { ok: true };
}

export async function removeNode(nodeId: string): Promise<{ ok: boolean; error?: string }> {
  const node = await db.node.findUnique({ where: { nodeId } });
  if (!node) return { ok: false, error: "not found" };
  await db.node.update({ where: { id: node.id }, data: { status: "removed" } });
  await recordEvent({
    type: "node.removed",
    nodeId: node.id,
    message: `node ${nodeId} removed`,
    severity: "warning",
  });
  return { ok: true };
}

// Rotate the agent token for a node. Returns new token (only returned once).
export async function rotateNodeToken(nodeId: string): Promise<{ ok: boolean; token?: string; error?: string }> {
  const node = await db.node.findUnique({ where: { nodeId }, include: { credential: true } });
  if (!node) return { ok: false, error: "not found" };
  const newToken = generateToken(32);
  const tokenHash = await hashPassword(newToken);
  if (node.credential) {
    await db.nodeCredential.update({
      where: { nodeId: node.id },
      data: { tokenHash, rotatedAt: new Date() },
    });
  } else {
    await db.nodeCredential.create({ data: { nodeId: node.id, tokenHash } });
  }
  await recordEvent({
    type: "node.token_rotated",
    nodeId: node.id,
    message: `agent token rotated for ${nodeId}`,
    severity: "warning",
  });
  return { ok: true, token: newToken };
}

// ─── Node metadata updates (tags, group, location, notes, displayName) ──────

export async function updateNodeMetadata(
  nodeId: string,
  updates: {
    displayName?: string | null;
    tags?: string[];
    group?: string | null;
    location?: string | null;
    notes?: string | null;
  }
): Promise<{ ok: boolean; error?: string }> {
  const node = await db.node.findUnique({ where: { nodeId } });
  if (!node) return { ok: false, error: "not found" };
  const data: any = {};
  if (updates.displayName !== undefined) data.displayName = updates.displayName;
  if (updates.tags !== undefined) data.tags = JSON.stringify(updates.tags);
  if (updates.group !== undefined) data.group = updates.group;
  if (updates.location !== undefined) data.location = updates.location;
  if (updates.notes !== undefined) data.notes = updates.notes;
  await db.node.update({ where: { id: node.id }, data });
  await recordEvent({
    type: "node.metadata_updated",
    nodeId: node.id,
    message: `metadata updated for ${nodeId}`,
    severity: "info",
    meta: updates,
  });
  return { ok: true };
}

// Set node maintenance mode (different from drain — maintenance marks the node
// explicitly as being serviced, prevents scheduling, and shows a banner in the UI).
export async function setNodeMaintenance(nodeId: string, enabled: boolean): Promise<{ ok: boolean; error?: string }> {
  const node = await db.node.findUnique({ where: { nodeId } });
  if (!node) return { ok: false, error: "not found" };
  await db.node.update({
    where: { id: node.id },
    data: { status: enabled ? "maintenance" : "online" },
  });
  await recordEvent({
    type: enabled ? "node.maintenance_enabled" : "node.maintenance_disabled",
    nodeId: node.id,
    message: `${nodeId} ${enabled ? "entered" : "exited"} maintenance mode`,
    severity: "warning",
  });
  return { ok: true };
}
