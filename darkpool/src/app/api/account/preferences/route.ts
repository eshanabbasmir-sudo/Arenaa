// GET /api/account/preferences — read current user preferences
// PUT /api/account/preferences — update user preferences (theme, notifications, etc.)
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getUserPreferences, setUserPreferences } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const prefs = await getUserPreferences(user.id);
  return NextResponse.json({ ok: true, preferences: prefs });
}

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const existing = await getUserPreferences(user.id);
  const merged = { ...existing, ...body };
  await setUserPreferences(user.id, merged);
  return NextResponse.json({ ok: true, preferences: merged });
}
