// GET    /api/workload-templates/:id — get template
// PUT    /api/workload-templates/:id — update template
// DELETE /api/workload-templates/:id — delete template
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const t = await db.workloadTemplate.findUnique({ where: { id } });
  if (!t) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!t.isPublic && t.createdBy !== user.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({
    ok: true,
    template: {
      ...t,
      envVars: JSON.parse(t.envVars || "{}"),
      ports: JSON.parse(t.ports || "[]"),
      tags: JSON.parse(t.tags || "[]"),
    },
  });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  await db.workloadTemplate.deleteMany({ where: { id, createdBy: user.id } });
  return NextResponse.json({ ok: true });
}
