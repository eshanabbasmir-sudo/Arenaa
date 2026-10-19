// GET  /api/workload-templates — list templates
// POST /api/workload-templates — create a template
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const templates = await db.workloadTemplate.findMany({
    where: {
      OR: [
        { isPublic: true },
        { createdBy: user.id },
      ],
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({
    ok: true,
    templates: templates.map((t) => ({
      ...t,
      envVars: JSON.parse(t.envVars || "{}"),
      ports: JSON.parse(t.ports || "[]"),
      tags: JSON.parse(t.tags || "[]"),
    })),
  });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (!body.name) return NextResponse.json({ error: "missing name" }, { status: 400 });
  const t = await db.workloadTemplate.create({
    data: {
      name: body.name,
      description: body.description || null,
      image: body.image || "ubuntu:22.04",
      command: body.command || null,
      cpuCores: Math.max(1, Number(body.cpuCores) || 1),
      ramMb: Math.max(128, Number(body.ramMb) || 512),
      diskMb: Math.max(512, Number(body.diskMb) || 1024),
      envVars: JSON.stringify(body.envVars || {}),
      ports: JSON.stringify(body.ports || []),
      tags: JSON.stringify(body.tags || []),
      isPublic: body.isPublic !== false,
      createdBy: user.id,
    },
  });
  return NextResponse.json({ ok: true, template: t });
}
