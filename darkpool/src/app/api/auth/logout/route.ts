// POST /api/auth/logout
import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST() {
  const u = await getCurrentUser();
  if (u) {
    await db.session.deleteMany({ where: { userId: u.id } }).catch(() => {});
  }
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
