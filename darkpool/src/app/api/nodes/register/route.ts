// POST /api/nodes/register
// Body: { registrationToken, hostname, architecture, os, kernel, cpuCores, ramBytes, diskBytes, containerRuntime, features, displayName }
// Returns: { ok, nodeId, agentToken }
import { NextRequest, NextResponse } from "next/server";
import { registerNode } from "@/lib/node-manager";

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  if (!body?.registrationToken) return NextResponse.json({ error: "missing registrationToken" }, { status: 400 });
  const res = await registerNode({
    registrationToken: body.registrationToken,
    hostname: body.hostname,
    architecture: body.architecture,
    os: body.os,
    kernel: body.kernel,
    cpuCores: Number(body.cpuCores) || 0,
    ramBytes: Number(body.ramBytes) || 0,
    diskBytes: Number(body.diskBytes) || 0,
    containerRuntime: body.containerRuntime,
    features: body.features,
    displayName: body.displayName,
  });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true, nodeId: res.nodeId, agentToken: res.agentToken });
}
