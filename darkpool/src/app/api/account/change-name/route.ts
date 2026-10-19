// POST /api/account/change-name
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordEvent } from "@/lib/logger";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { name } = body;
  if (typeof name !== "string" || name.length > 100) {
    return NextResponse.json({ error: "invalid name" }, { status: 400 });
  }
  await db.user.update({ where: { id: user.id }, data: { name: name || null } });
  await recordEvent({ type: "auth.name_changed", message: `name changed to "${name}"`, severity: "info" });
  return NextResponse.json({ ok: true });
}
