// DARKPOOL alerts manager.
// Threshold-based alerting for node CPU/RAM/disk and workload failures.

import { db } from "@/lib/db";
import { recordEvent } from "@/lib/logger";
import { config } from "@/lib/config";

// Default thresholds — can be overridden via env
export const ALERT_THRESHOLDS = {
  cpuHigh: Number(process.env.ALERT_CPU_THRESHOLD || 85),    // % CPU usage
  ramHigh: Number(process.env.ALERT_RAM_THRESHOLD || 85),    // % RAM usage
  diskFull: Number(process.env.ALERT_DISK_THRESHOLD || 90),  // % disk usage
};

// Check node metrics against thresholds and create/resolve alerts.
export async function checkNodeAlerts(node: { id: string; nodeId: string; status: string }, resources: any): Promise<void> {
  if (!resources) return;
  const cpuPct = resources.cpuUsagePct ?? 0;
  const ramPct = resources.ramTotal ? (Number(resources.ramUsed) / Number(resources.ramTotal)) * 100 : 0;
  const diskPct = resources.diskTotal ? (Number(resources.diskUsed) / Number(resources.diskTotal)) * 100 : 0;

  // CPU high
  await upsertThresholdAlert({
    type: "node.cpu_high",
    nodeId: node.id,
    message: `CPU usage on ${node.nodeId} is ${cpuPct.toFixed(1)}% (threshold ${ALERT_THRESHOLDS.cpuHigh}%)`,
    threshold: ALERT_THRESHOLDS.cpuHigh,
    currentValue: cpuPct,
    triggered: cpuPct >= ALERT_THRESHOLDS.cpuHigh,
  });

  // RAM high
  await upsertThresholdAlert({
    type: "node.ram_high",
    nodeId: node.id,
    message: `RAM usage on ${node.nodeId} is ${ramPct.toFixed(1)}% (threshold ${ALERT_THRESHOLDS.ramHigh}%)`,
    threshold: ALERT_THRESHOLDS.ramHigh,
    currentValue: ramPct,
    triggered: ramPct >= ALERT_THRESHOLDS.ramHigh,
  });

  // Disk full
  await upsertThresholdAlert({
    type: "node.disk_full",
    nodeId: node.id,
    message: `Disk usage on ${node.nodeId} is ${diskPct.toFixed(1)}% (threshold ${ALERT_THRESHOLDS.diskFull}%)`,
    threshold: ALERT_THRESHOLDS.diskFull,
    currentValue: diskPct,
    triggered: diskPct >= ALERT_THRESHOLDS.diskFull,
  });

  // Node offline
  await upsertThresholdAlert({
    type: "node.offline",
    nodeId: node.id,
    message: `Node ${node.nodeId} is offline`,
    threshold: 0,
    currentValue: node.status === "offline" ? 1 : 0,
    triggered: node.status === "offline",
  });
}

async function upsertThresholdAlert(opts: {
  type: string;
  nodeId: string;
  message: string;
  threshold: number;
  currentValue: number;
  triggered: boolean;
}) {
  // Find an existing active alert of the same type+node
  const existing = await db.alert.findFirst({
    where: { type: opts.type, nodeId: opts.nodeId, status: "active" },
  });

  if (opts.triggered) {
    if (!existing) {
      // Create new alert
      await db.alert.create({
        data: {
          type: opts.type,
          nodeId: opts.nodeId,
          message: opts.message,
          severity: opts.type === "node.offline" ? "critical" : "warning",
          threshold: opts.threshold,
          currentValue: opts.currentValue,
          status: "active",
        },
      });
      await recordEvent({
        type: `alert.${opts.type}`,
        nodeId: opts.nodeId,
        message: opts.message,
        severity: opts.type === "node.offline" ? "critical" : "warning",
      });
    } else {
      // Update currentValue
      await db.alert.update({
        where: { id: existing.id },
        data: { currentValue: opts.currentValue, message: opts.message },
      });
    }
  } else {
    // Not triggered — resolve existing alert if any
    if (existing) {
      await db.alert.update({
        where: { id: existing.id },
        data: { status: "resolved", resolvedAt: new Date() },
      });
      await recordEvent({
        type: `alert.${opts.type}.resolved`,
        nodeId: opts.nodeId,
        message: `${opts.type} alert resolved on ${opts.nodeId}`,
        severity: "info",
      });
    }
  }
}

// Create a workload failure alert
export async function createWorkloadFailureAlert(workloadId: string, workloadName: string, error: string, nodeId?: string) {
  await db.alert.create({
    data: {
      type: "workload.failed",
      workloadId,
      nodeId: nodeId ?? null,
      message: `Workload ${workloadName} (${workloadId}) failed: ${error}`,
      severity: "error",
      status: "active",
    },
  });
  await recordEvent({
    type: "alert.workload_failed",
    workloadId,
    nodeId,
    message: `Workload ${workloadId} failed: ${error}`,
    severity: "error",
  });
}

// List active alerts
export async function getActiveAlerts(limit = 50) {
  return db.alert.findMany({
    where: { status: "active" },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { node: { select: { nodeId: true, displayName: true } } },
  });
}

// Acknowledge an alert
export async function acknowledgeAlert(alertId: string, userId: string) {
  await db.alert.update({
    where: { id: alertId },
    data: { status: "acknowledged", acknowledgedBy: userId, acknowledgedAt: new Date() },
  });
}

// Get alert statistics for dashboard
export async function getAlertStats() {
  const active = await db.alert.count({ where: { status: "active" } });
  const acknowledged = await db.alert.count({ where: { status: "acknowledged" } });
  const resolved = await db.alert.count({ where: { status: "resolved" } });
  const critical = await db.alert.count({ where: { status: "active", severity: "critical" } });
  return { active, acknowledged, resolved, critical };
}
