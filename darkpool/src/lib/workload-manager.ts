// DARKPOOL workload manager.
// Tracks workload lifecycle, talks to worker agents via the dispatch queue.

import { db } from "@/lib/db";
import { recordEvent } from "@/lib/logger";
import { generateWorkloadId } from "@/lib/auth";
import { allocateWorkload, type SchedResult, planSchedule } from "@/lib/scheduler";
import { createWorkloadFailureAlert } from "@/lib/alerts";

export interface CreateWorkloadInput {
  name: string;
  image: string;
  command?: string;
  cpuCores: number;
  ramMb: number;
  diskMb: number;
  ownerId?: string | null;
  // new fields
  tags?: string[];
  envVars?: Record<string, string>;
  ports?: Array<{ host: number; container: number; protocol?: string }>;
  priority?: number;
  notes?: string;
  templateId?: string;
}

export interface CreateWorkloadResult {
  ok: boolean;
  workloadId?: string;
  schedule?: SchedResult;
  error?: string;
}

// Create + schedule. Actual container creation happens async via the dispatch queue
// (worker-agent polls /api/workloads/:id/instructions or receives WS push).
export async function createWorkload(input: CreateWorkloadInput): Promise<CreateWorkloadResult> {
  const workloadId = generateWorkloadId();
  const alloc = await allocateWorkload({
    workloadId,
    name: input.name,
    image: input.image,
    command: input.command,
    cpuCores: input.cpuCores,
    ramMb: input.ramMb,
    diskMb: input.diskMb,
    ownerId: input.ownerId,
  });
  if (!alloc.ok) return { ok: false, error: alloc.error };

  // Save extended metadata
  if (input.tags || input.envVars || input.ports || input.priority !== undefined || input.notes || input.templateId) {
    await db.workload.update({
      where: { id: alloc.workloadDbId },
      data: {
        tags: JSON.stringify(input.tags || []),
        envVars: JSON.stringify(input.envVars || {}),
        ports: JSON.stringify(input.ports || []),
        priority: input.priority ?? 0,
        notes: input.notes ?? null,
        templateId: input.templateId ?? null,
      },
    });
  }

  await recordEvent({
    type: "workload.created",
    nodeId: alloc.nodeDbId,
    workloadId: alloc.workloadDbId,
    message: `workload ${workloadId} created (${input.cpuCores}CPU ${input.ramMb}MB RAM ${input.diskMb}MB disk) → ${alloc.nodeId}`,
    severity: "info",
    meta: { tags: input.tags, priority: input.priority },
  });

  // Plan was implicit in allocate; rebuild a plan summary for the response.
  const schedule = await planSchedule({
    cpuCores: input.cpuCores, ramMb: input.ramMb, diskMb: input.diskMb,
  });

  return { ok: true, workloadId, schedule };
}

// Stop a workload: mark as 'stopping' in DB, agent picks up via instructions endpoint.
export async function stopWorkload(workloadId: string): Promise<{ ok: boolean; error?: string }> {
  const w = await db.workload.findUnique({ where: { workloadId } });
  if (!w) return { ok: false, error: "not found" };
  if (w.status === "stopped") return { ok: true };
  await db.workload.update({
    where: { id: w.id },
    data: { status: "stopping" },
  });
  await recordEvent({
    type: "workload.stop_requested",
    nodeId: w.nodeId ?? undefined,
    workloadId: w.id,
    message: `workload ${workloadId} stop requested`,
    severity: "info",
  });
  return { ok: true };
}

export async function deleteWorkload(workloadId: string): Promise<{ ok: boolean; error?: string }> {
  const w = await db.workload.findUnique({ where: { workloadId } });
  if (!w) return { ok: false, error: "not found" };
  // if running, mark for deletion via stop first
  if (w.status === "running" || w.status === "starting") {
    await db.workload.update({ where: { id: w.id }, data: { status: "stopping" } });
  } else {
    await db.workload.update({
      where: { id: w.id },
      data: { status: "stopped", finishedAt: new Date() },
    });
    await db.resourceAllocation.deleteMany({ where: { workloadId: w.id } });
  }
  await recordEvent({
    type: "workload.deleted",
    nodeId: w.nodeId ?? undefined,
    workloadId: w.id,
    message: `workload ${workloadId} deleted`,
    severity: "warning",
  });
  return { ok: true };
}

// Worker-agent reports workload status after attempting container creation.
export async function reportWorkloadStatus(
  workloadId: string,
  status: string,
  payload: { containerId?: string; pid?: number; ip?: string; error?: string }
): Promise<{ ok: boolean; error?: string }> {
  const w = await db.workload.findUnique({ where: { workloadId } });
  if (!w) return { ok: false, error: "not found" };
  const update: Record<string, unknown> = { status };
  if (payload.containerId) update.containerId = payload.containerId;
  if (payload.pid) update.pid = payload.pid;
  if (payload.ip) update.ip = payload.ip;
  if (payload.error) update.error = payload.error;
  if (status === "running" && !w.startedAt) update.startedAt = new Date();
  if (status === "stopped" || status === "failed") update.finishedAt = new Date();
  await db.workload.update({ where: { id: w.id }, data: update });
  await recordEvent({
    type: `workload.${status}`,
    nodeId: w.nodeId ?? undefined,
    workloadId: w.id,
    message: `workload ${workloadId} → ${status}`,
    severity: status === "failed" ? "error" : "info",
    meta: payload,
  });
  // Trigger failure alert if status is "failed"
  if (status === "failed" && payload.error) {
    await createWorkloadFailureAlert(workloadId, w.name, payload.error, w.nodeId ?? undefined);
  }
  return { ok: true };
}

// Pre-flight scheduler preview for the "Create Workspace" modal.
export async function previewSchedule(input: {
  cpuCores: number; ramMb: number; diskMb: number;
}) {
  return await planSchedule(input);
}
