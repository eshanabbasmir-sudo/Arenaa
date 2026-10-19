// POST /api/account/change-email
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, changeUserEmail } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { newEmail, password } = body;
  if (!newEmail || !password) {
    return NextResponse.json({ error: "missing newEmail or password" }, { status: 400 });
  }
  const res = await changeUserEmail(user.id, newEmail, password);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
