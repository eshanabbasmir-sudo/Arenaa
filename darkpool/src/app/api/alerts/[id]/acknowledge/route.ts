// POST /api/alerts/:id/acknowledge — acknowledge an alert
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { acknowledgeAlert } from "@/lib/alerts";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  await acknowledgeAlert(id, user.id);
  return NextResponse.json({ ok: true });
}
