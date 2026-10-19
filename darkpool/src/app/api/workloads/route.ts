// GET  /api/workloads         — list
// POST /api/workloads         — create + schedule
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { createWorkload } from "@/lib/workload-manager";
import { enqueueInstruction } from "@/lib/dispatch";
import { serializeForJson } from "@/lib/serialize";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  // Support optional filters via query params
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const nodeId = url.searchParams.get("nodeId");
  const search = url.searchParams.get("search");
  const where: any = {};
  if (status && status !== "all") where.status = status;
  if (nodeId) {
    const node = await db.node.findUnique({ where: { nodeId } });
    if (node) where.nodeId = node.id;
  }
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { workloadId: { contains: search } },
    ];
  }
  const workloads = await db.workload.findMany({
    where,
    include: { node: true, owner: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json(serializeForJson({
    ok: true,
    workloads: workloads.map((w) => ({
      workloadId: w.workloadId,
      name: w.name,
      status: w.status,
      image: w.image,
      cpuLimit: w.cpuLimit,
      ramLimitMb: w.ramLimitMb,
      diskLimitMb: w.diskLimitMb,
      nodeId: w.node?.nodeId ?? null,
      nodeName: w.node?.displayName ?? w.node?.nodeId,
      containerId: w.containerId,
      pid: w.pid,
      ip: w.ip,
      createdAt: w.createdAt,
      startedAt: w.startedAt,
      owner: w.owner ? { email: w.owner.email } : null,
      error: w.error,
      tags: JSON.parse(w.tags || "[]"),
      envVars: JSON.parse(w.envVars || "{}"),
      ports: JSON.parse(w.ports || "[]"),
      priority: w.priority,
      notes: w.notes,
      templateId: w.templateId,
    })),
  }));
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  if (!body?.name) return NextResponse.json({ error: "missing name" }, { status: 400 });

  // Minimum CPU is 1 core (relaxed from previous min). Cap at 64.
  const cpu = Math.max(1, Math.min(64, Number(body.cpuCores) || 1));
  // Minimum RAM is 128 MB (smallest realistic workload). Cap at 64 GB.
  const ram = Math.max(128, Math.min(64 * 1024, Number(body.ramMb) || 512));
  // Minimum disk is 512 MB. No real upper cap (worker disk limits apply).
  const disk = Math.max(512, Number(body.diskMb) || 1024);
  const image = body.image || "ubuntu:22.04";
  const command = body.command || null;

  // Parse extended fields (tags, envVars, ports, priority, notes, templateId)
  let tags: string[] | undefined;
  if (Array.isArray(body.tags)) {
    tags = body.tags.filter((t: any) => typeof t === "string").slice(0, 20).map((t: string) => t.slice(0, 50));
  }
  let envVars: Record<string, string> | undefined;
  if (body.envVars && typeof body.envVars === "object") {
    envVars = {};
    for (const [k, v] of Object.entries(body.envVars)) {
      if (typeof k === "string" && k.length <= 100 && typeof v === "string" && v.length <= 1000) {
        envVars[k] = v;
      }
    }
  }
  let ports: any[] | undefined;
  if (Array.isArray(body.ports)) {
    ports = body.ports.filter((p: any) =>
      p && typeof p.host === "number" && typeof p.container === "number" &&
      p.host > 0 && p.host < 65536 && p.container > 0 && p.container < 65536
    ).slice(0, 20);
  }
  const priority = Math.max(0, Math.min(2, Number(body.priority) || 0));
  const notes = typeof body.notes === "string" ? body.notes.slice(0, 1000) : undefined;
  const templateId = typeof body.templateId === "string" ? body.templateId : undefined;

  const result = await createWorkload({
    name: body.name,
    image,
    command,
    cpuCores: cpu,
    ramMb: ram,
    diskMb: disk,
    ownerId: user.id,
    tags,
    envVars,
    ports,
    priority,
    notes,
    templateId,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  // Push a 'start_workload' instruction to the agent dispatch queue
  // Include envVars + ports so the agent can pass them to docker run
  enqueueInstruction(result.schedule?.selectedNodeId ?? "", "start_workload", {
    workloadId: result.workloadId,
    name: body.name,
    image,
    command,
    cpuCores: cpu,
    ramMb: ram,
    diskMb: disk,
    envVars: envVars || {},
    ports: ports || [],
    tags: tags || [],
  });

  return NextResponse.json({ ok: true, workloadId: result.workloadId, schedule: result.schedule });
}
