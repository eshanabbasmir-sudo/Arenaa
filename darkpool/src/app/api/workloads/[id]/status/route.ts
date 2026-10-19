// POST /api/workloads/:id/status — agent reports workload status (after creating/stopping container)
import { NextRequest, NextResponse } from "next/server";
import { authenticateWorker } from "@/lib/auth";
import { reportWorkloadStatus } from "@/lib/workload-manager";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = req.headers.get("authorization") || "";
  const nodeIdHeader = req.headers.get("x-darkpool-node") || "";
  if (!auth.startsWith("Bearer ")) return NextResponse.json({ error: "missing bearer" }, { status: 401 });
  const token = auth.slice(7);
  const node = await authenticateWorker(nodeIdHeader, token);
  if (!node) return NextResponse.json({ error: "auth failed" }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  const res = await reportWorkloadStatus(id, body?.status || "unknown", {
    containerId: body?.containerId,
    pid: body?.pid,
    ip: body?.ip,
    error: body?.error,
  });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
