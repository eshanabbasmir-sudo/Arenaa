// GET /api/audit-logs?limit=100&action=auth.login — list audit logs with optional filter
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { serializeForJson } from "@/lib/serialize";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const url = new URL(req.url);
  const limit = Math.min(500, Number(url.searchParams.get("limit") || 100));
  const action = url.searchParams.get("action");
  const userId = url.searchParams.get("userId");
  const where: any = {};
  if (action) where.action = { contains: action };
  if (userId) where.userId = userId;
  const logs = await db.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { user: { select: { email: true, name: true } } },
  });
  return NextResponse.json(serializeForJson({ ok: true, logs }));
}
