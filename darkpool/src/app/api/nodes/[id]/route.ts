// GET /api/nodes/:id — full node detail
// DELETE /api/nodes/:id — remove node (admin)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { removeNode, drainNode, enableNode, disableNode, rotateNodeToken } from "@/lib/node-manager";
import { serializeForJson } from "@/lib/serialize";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const node = await db.node.findUnique({
    where: { nodeId: id },
    include: { resources: true, workloads: { orderBy: { createdAt: "desc" }, take: 100 } },
  });
  if (!node || node.status === "removed") return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(serializeForJson({
    ok: true,
    node: {
      ...node,
      features: JSON.parse(node.features || "[]"),
    },
  }));
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const res = await removeNode(id);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
