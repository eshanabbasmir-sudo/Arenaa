// POST /api/account/change-password
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, changeUserPassword } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { currentPassword, newPassword } = body;
  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "missing currentPassword or newPassword" }, { status: 400 });
  }
  const res = await changeUserPassword(user.id, currentPassword, newPassword);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
