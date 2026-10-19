// GET /api/resources — full pool snapshot (admin)
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getPoolSnapshot } from "@/lib/resource-pool";
import { sweepNodeHealth } from "@/lib/node-manager";
import { serializeForJson } from "@/lib/serialize";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  await sweepNodeHealth();
  const pool = await getPoolSnapshot();
  return NextResponse.json(serializeForJson({ ok: true, pool }));
}
