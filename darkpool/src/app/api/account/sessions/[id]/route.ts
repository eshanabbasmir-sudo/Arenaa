// DELETE /api/account/sessions/:id — revoke a specific session
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  await db.session.deleteMany({ where: { id, userId: user.id } });
  return NextResponse.json({ ok: true });
}
