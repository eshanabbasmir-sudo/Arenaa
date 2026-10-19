// POST   /api/terminal/:sessionId — browser pushes input bytes / resize / polls output
// Body: { input?: <base64>, resize?: {cols,rows}, close?: boolean }
// Returns: { output?: <base64>, exited?, exitCode? }
// PUT    /api/terminal/:sessionId — open a new terminal session for a workload
// Body: { workloadId }
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  createTerminalChannel,
  getTerminalChannel,
  pushTerminalInput,
  drainTerminalOutput,
  closeTerminalChannel,
} from "@/lib/dispatch";
import { enqueueInstruction } from "@/lib/dispatch";
import { generateToken } from "@/lib/auth";

// POST: open a new session
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const workloadId = body?.workloadId;
  if (!workloadId) return NextResponse.json({ error: "missing workloadId" }, { status: 400 });
  const w = await db.workload.findUnique({ where: { workloadId }, include: { node: true } });
  if (!w || !w.node) return NextResponse.json({ error: "workload not found / no node" }, { status: 404 });
  if (w.status !== "running") return NextResponse.json({ error: `workload is ${w.status}, must be running` }, { status: 400 });

  const sessionId = `term-${generateToken(8)}`;
  createTerminalChannel(sessionId, w.node.nodeId, workloadId);

  // Instruct the agent to spawn a shell attached to this sessionId
  enqueueInstruction(w.node.nodeId, "exec_terminal", {
    sessionId,
    workloadId,
    containerId: w.containerId,
    pid: w.pid,
    runtime: w.runtime,
    image: w.image,
  });

  return NextResponse.json({ ok: true, sessionId });
}

// GET /api/terminal/[sessionId] — poll output
export async function GET(req: NextRequest, ctx: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const ch = getTerminalChannel(sessionId);
  if (!ch) return NextResponse.json({ error: "session not found" }, { status: 404 });
  const out = drainTerminalOutput(sessionId);
  return NextResponse.json({
    ok: true,
    output: out ? Buffer.from(out).toString("base64") : "",
    exited: ch.exited,
    exitCode: ch.exitCode,
  });
}

// PUT /api/terminal/[sessionId] — push input / resize / close
export async function PUT(req: NextRequest, ctx: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const ch = getTerminalChannel(sessionId);
  if (!ch) return NextResponse.json({ error: "session not found" }, { status: 404 });
  if (typeof body.input === "string" && body.input.length > 0) {
    const bytes = Buffer.from(body.input, "base64");
    pushTerminalInput(sessionId, new Uint8Array(bytes));
  }
  if (body.resize && typeof body.resize.cols === "number" && typeof body.resize.rows === "number") {
    ch.resizeQueue.push({ cols: body.resize.cols, rows: body.resize.rows });
  }
  if (body.close) {
    closeTerminalChannel(sessionId);
  }
  return NextResponse.json({ ok: true });
}
