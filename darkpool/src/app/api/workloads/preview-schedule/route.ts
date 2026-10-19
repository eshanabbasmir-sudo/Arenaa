// POST /api/workloads/preview-schedule — pre-flight scheduler preview for the create-workspace modal
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { previewSchedule } from "@/lib/workload-manager";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const result = await previewSchedule({
    cpuCores: Math.max(1, Number(body.cpuCores) || 1),
    ramMb: Math.max(128, Number(body.ramMb) || 512),
    diskMb: Math.max(512, Number(body.diskMb) || 1024),
  });
  return NextResponse.json({ ok: true, schedule: result });
}
