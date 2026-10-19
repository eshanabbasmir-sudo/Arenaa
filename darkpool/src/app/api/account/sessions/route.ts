// GET  /api/account/sessions — list active sessions for current user
// DELETE /api/account/sessions — revoke all other sessions (force logout everywhere else)
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const sessions = await db.session.findMany({
    where: { userId: user.id, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true, userAgent: true, ipAddress: true, createdAt: true, expiresAt: true,
    },
  });
  return NextResponse.json({ ok: true, sessions });
}

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  // Revoke ALL sessions (current one too — user will need to log in again)
  await db.session.deleteMany({ where: { userId: user.id } });
  return NextResponse.json({ ok: true });
}
