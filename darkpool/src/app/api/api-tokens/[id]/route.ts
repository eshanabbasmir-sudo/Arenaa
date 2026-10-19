// DELETE /api/api-tokens/:id — revoke an API token
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordEvent } from "@/lib/logger";

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const token = await db.apiToken.findUnique({ where: { id } });
  if (!token || token.userId !== user.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  await db.apiToken.delete({ where: { id } });
  await recordEvent({ type: "api_token.revoked", message: `API token "${token.name}" revoked`, severity: "warning" });
  return NextResponse.json({ ok: true });
}
