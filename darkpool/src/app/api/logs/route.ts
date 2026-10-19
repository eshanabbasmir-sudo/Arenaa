// GET /api/logs?limit=100
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getRecentLogs } from "@/lib/logger";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const url = new URL(req.url);
  const limit = Math.min(500, Number(url.searchParams.get("limit") || 100));
  const recent = getRecentLogs(limit);
  return NextResponse.json({ ok: true, logs: recent });
}
