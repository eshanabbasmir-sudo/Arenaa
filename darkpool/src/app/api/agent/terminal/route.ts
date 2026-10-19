// POST /api/agent/terminal — agent posts output bytes & reads input bytes (long-poll)
// Auth: Bearer + X-DarkPool-Node
// Body: { sessionId, output?: <base64>, exitCode?: number, started?: boolean }
// Returns: { input?: <base64>, resize?: { cols, rows }, close?: boolean }
import { NextRequest, NextResponse } from "next/server";
import { authenticateWorker } from "@/lib/auth";
import {
  getTerminalChannel,
  pushTerminalOutput,
  drainTerminalInput,
  markTerminalExited,
} from "@/lib/dispatch";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const nodeIdHeader = req.headers.get("x-darkpool-node") || "";
  if (!auth.startsWith("Bearer ")) return NextResponse.json({ error: "missing bearer" }, { status: 401 });
  const node = await authenticateWorker(nodeIdHeader, auth.slice(7));
  if (!node) return NextResponse.json({ error: "auth failed" }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const sessionId = body.sessionId;
  if (!sessionId) return NextResponse.json({ error: "missing sessionId" }, { status: 400 });

  const ch = getTerminalChannel(sessionId);
  if (!ch) return NextResponse.json({ error: "no such terminal session" }, { status: 404 });
  if (ch.nodeId !== node.nodeId) return NextResponse.json({ error: "wrong node" }, { status: 403 });

  // agent pushing output bytes
  if (typeof body.output === "string" && body.output.length > 0) {
    const bytes = Buffer.from(body.output, "base64");
    pushTerminalOutput(sessionId, new Uint8Array(bytes));
  }
  if (typeof body.exitCode === "number") {
    markTerminalExited(sessionId, body.exitCode);
  }

  // agent wants to read input bytes (long-poll up to ~25s)
  const input = drainTerminalInput(sessionId);
  const resize = ch.resizeQueue.shift();
  const close = ch.closed;

  return NextResponse.json({
    ok: true,
    input: input ? Buffer.from(input).toString("base64") : "",
    resize,
    close,
    exited: ch.exited,
  });
}
